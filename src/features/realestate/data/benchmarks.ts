/** ============================================================
 * Real Estate — مقایسه بازدهی با سایر دارایی‌ها
 *
 *  - قیمت تاریخی ETH/BTC/XAUT/USDT از coins.llama.fi (کش‌دار)
 *  - «خودرو»: میانگین بازدهی خودروها از ماژول خودرو (دو Snapshot آخر)
 *  - دلار: بازدهی دلاری صفر + تومانی = تغییر نرخ
 *  - نرخ دلار از Snapshot ملک — هرگز نرخ فعلی با تاریخچه قاطی نمی‌شود
 * ============================================================ */
import { fetchWithRetry } from '@/shared/lib/fetchWithRetry';
import { cacheBulkGetPrice, cachePutPrice } from '@/shared/lib/db';
import { benchmarkComparison, type BenchmarkAsset, type BenchmarkComparison } from '../domain/engine';

const BENCHMARK_KEYS: Record<Exclude<BenchmarkAsset, 'usd' | 'vehicle'>, string> = {
  ethereum: 'coingecko:ethereum',
  bitcoin: 'coingecko:bitcoin',
  'tether-gold': 'ethereum:0x68749665FF8D2d112Fa859AA293F07A622782F38',
  tether: 'ethereum:0xdAC17F958D2ee523a2206206994597C13D831ec7'
};

const DAY_MS = 86_400_000;
const PRICE_CACHE_MS = 30 * 60_000;
const CHART_CACHE_MS = 6 * 60 * 60 * 1000;

async function currentPriceUsd(key: string): Promise<number | null> {
  const ck = `re:bench:cur:${key}`;
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

async function historicalPriceUsd(key: string, targetTs: number): Promise<number | null> {
  const dayKey = Math.floor(targetTs / DAY_MS);
  const ck = `re:bench:hist:${key}:${dayKey}`;
  try {
    const rec = await cacheBulkGetPrice([ck]);
    const r = rec.get(ck);
    if (r && Date.now() - r.fetchedAt < CHART_CACHE_MS) return r.price as number;
  } catch { /* ادامه */ }

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
    let best: [number, number] | null = null;
    let bestDist = Infinity;
    for (const p of pts) {
      const d = Math.abs(p[0] * 1000 - targetTs);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    if (!best || bestDist > 4 * DAY_MS) return null;
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
  key: string;
}

/**
 * مقایسه «اگر به‌جای ملک X می‌خریدم»:
 *  - مالی: ETH/BTC/XAUT/USDT (قیمت تاریخی llama) + دلار
 *  - خودرو: میانگین بازدهی خودروها (از ماژول خودرو — دو Snapshot آخر) — ورودی مستقیم
 *  - vehicleReturn: { tomanPct, usdPct } | null (از ماژول خودرو)
 */
export async function compareWithBenchmarks(input: {
  startTs: number;
  endTs: number;
  startRate: number;
  endRate: number | null;
  capitalToman: number;
  endIsNow?: boolean;
  vehicleReturn?: { tomanPct: number | null; usdPct: number | null } | null;
}): Promise<BenchmarkRow[]> {
  const rows: BenchmarkRow[] = [];

  for (const asset of Object.keys(BENCHMARK_KEYS) as Exclude<BenchmarkAsset, 'usd' | 'vehicle'>[]) {
    const key = BENCHMARK_KEYS[asset];
    const startPrice = await historicalPriceUsd(key, input.startTs);
    const endPrice = input.endIsNow ? await currentPriceUsd(key) : await historicalPriceUsd(key, input.endTs);
    const cmp = benchmarkComparison(asset, startPrice, endPrice, input.startRate, input.endRate, input.capitalToman);
    rows.push({ ...cmp, key });
  }

  // دلار
  const usdCmp = benchmarkComparison('usd', 1, 1, input.startRate, input.endRate, input.capitalToman);
  rows.push({ ...usdCmp, key: 'usd' });

  // خودرو (میانگین بازدهی — داده از ماژول خودرو)
  if (input.vehicleReturn && input.vehicleReturn.tomanPct !== null) {
    const capitalUsd = input.capitalToman / input.startRate;
    const endUsd = capitalUsd * (1 + (input.vehicleReturn.usdPct ?? 0) / 100);
    const cmp = benchmarkComparison('vehicle', capitalUsd, endUsd, input.startRate, input.endRate, input.capitalToman);
    rows.push({ ...cmp, key: 'vehicle' });
  } else {
    rows.push({
      asset: 'vehicle',
      startPriceUsd: null,
      endPriceUsd: null,
      usdPct: null,
      startRate: input.startRate,
      endRate: input.endRate ?? input.startRate,
      tomanPct: null,
      endValueToman: null,
      key: 'vehicle'
    });
  }

  return rows;
}
