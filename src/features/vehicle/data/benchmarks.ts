/** ============================================================
 * Vehicle Investment — مقایسه بازدهی با سایر دارایی‌ها
 *
 *  منبع قیمت تاریخی: coins.llama.fi (همان فالبک سراسری اپ)
 *   - قیمت در تاریخ شروع: chart (نزدیک‌ترین نقطه روزانه)
 *   - قیمت در تاریخ پایان: chart یا current
 *  نرخ دلار پایان: از Snapshot پایان (یا نرخ فعلی اپ برای «امروز»)
 *
 * ⚠️ داده تاریخی در دسترس نبود → null (N/A) — هرگز حدس/برآورد نمی‌کنیم.
 * ⚠️ نرخ دلار Snapshot خودرو هرگز با نرخ فعلی اپ اشتباه گرفته نمی‌شود.
 * ============================================================ */
import { fetchWithRetry } from '@/shared/lib/fetchWithRetry';
import { cacheBulkGetPrice, cachePutPrice } from '@/shared/lib/db';
import { benchmarkComparison, type BenchmarkAsset, type BenchmarkComparison } from '../domain/engine';

/** کلید llama برای هر دارایی مرجع */
const BENCHMARK_KEYS: Record<Exclude<BenchmarkAsset, 'usd'>, string> = {
  ethereum: 'coingecko:ethereum',
  bitcoin: 'coingecko:bitcoin',
  'tether-gold': 'ethereum:0x68749665FF8D2d112Fa859AA293F07A622782F38',
  tether: 'ethereum:0xdAC17F958D2ee523a2206206994597C13D831ec7'
};

const DAY_MS = 86_400_000;
const PRICE_CACHE_MS = 30 * 60_000;
const CHART_CACHE_MS = 6 * 60 * 60 * 1000;

interface LlamaChartPoint {
  timestamp: number;
  price: number;
}

/** قیمت فعلی (USD) از coins.llama.fi — با کش */
async function currentPriceUsd(key: string): Promise<number | null> {
  const ck = `vehicle:bench:cur:${key}`;
  try {
    const rec = await cacheBulkGetPrice([ck]);
    const r = rec.get(ck);
    if (r && Date.now() - r.fetchedAt < PRICE_CACHE_MS) return r.price as number;
  } catch { /* ادامه */ }
  try {
    const res = await fetchWithRetry(`https://coins.llama.fi/prices/current/${encodeURIComponent(key)}`, {
      retries: 1,
      timeoutMs: 10_000
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { coins?: Record<string, { price?: number }> };
    const price = j.coins?.[key]?.price;
    if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
      try {
        await cachePutPrice(ck, { price, source: 'live', fetchedAt: Date.now() });
      } catch { /* خاموش */ }
      return price;
    }
    return null;
  } catch {
    return null;
  }
}

/** قیمت تاریخی (USD) نزدیک‌ترین نقطه روزانه به تاریخ هدف — با کش */
async function historicalPriceUsd(key: string, targetTs: number): Promise<number | null> {
  const dayKey = Math.floor(targetTs / DAY_MS);
  const ck = `vehicle:bench:hist:${key}:${dayKey}`;
  try {
    const rec = await cacheBulkGetPrice([ck]);
    const r = rec.get(ck);
    if (r && Date.now() - r.fetchedAt < CHART_CACHE_MS) return r.price as number;
  } catch { /* ادامه */ }

  // ۵ روز قبل از هدف شروع می‌کنیم تا نقطه هدف داخل بازه باشد
  const start = targetTs - 5 * DAY_MS;
  try {
    const res = await fetchWithRetry(
      `https://coins.llama.fi/chart/${encodeURIComponent(key)}?start=${Math.floor(start / 1000)}&span=10`,
      { retries: 1, timeoutMs: 12_000 }
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { coins?: Record<string, { prices?: [number, number][] }> };
    const pts: [number, number][] = j.coins?.[key]?.prices ?? [];
    if (pts.length === 0) return null;
    // نزدیک‌ترین نقطه به هدف
    let best: [number, number] | null = null;
    let bestDist = Infinity;
    for (const p of pts) {
      const d = Math.abs(p[0] * 1000 - targetTs);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    if (!best) return null;
    // حداکثر ۴ روز فاصله — بعد از آن N/A (داده معتبر نیست)
    if (bestDist > 4 * DAY_MS) return null;
    const price = best[1];
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null;
    try {
      await cachePutPrice(ck, { price, source: 'snapshot', fetchedAt: Date.now() });
    } catch { /* خاموش */ }
    return price;
  } catch {
    return null;
  }
}

export interface BenchmarkRow extends BenchmarkComparison {
  /** کلید llama — برای UI */
  key: string;
}

/**
 * مقایسه «اگر به‌جای این خودرو X می‌خریدم»:
 *  startTs / endTs: تاریخ‌های بازه
 *  endRate: نرخ دلار پایان (از Snapshot پایان یا نرخ فعلی اپ)
 *  capitalToman: سرمایه اولیه (مثلاً قیمت بازار خودرو در تاریخ شروع)
 *  endIsNow: اگر true، قیمت پایان = قیمت فعلی (و نه تاریخ مشخص)
 */
export async function compareWithBenchmarks(input: {
  startTs: number;
  endTs: number;
  startRate: number;
  endRate: number | null;
  capitalToman: number;
  endIsNow?: boolean;
}): Promise<BenchmarkRow[]> {
  const assets = Object.keys(BENCHMARK_KEYS) as Exclude<BenchmarkAsset, 'usd'>[];
  const rows: BenchmarkRow[] = [];

  for (const asset of assets) {
    const key = BENCHMARK_KEYS[asset];
    const startPrice = await historicalPriceUsd(key, input.startTs);
    const endPrice = input.endIsNow
      ? await currentPriceUsd(key)
      : await historicalPriceUsd(key, input.endTs);
    const cmp = benchmarkComparison(asset, startPrice, endPrice, input.startRate, input.endRate, input.capitalToman);
    rows.push({ ...cmp, key });
  }

  // دلار (USD) — بدون قیمت تاریخی؛ بازدهی دلاری صفر، تومانی = تغییر نرخ
  const usdCmp = benchmarkComparison('usd', 1, 1, input.startRate, input.endRate, input.capitalToman);
  rows.push({ ...usdCmp, key: 'usd' });

  return rows;
}
