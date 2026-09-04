/**
 * Boros Data Service — فقط API رسمی Boros (api-boros.pendle.finance/apis/v1)
 *  - GET /markets?isMatured=false&limit=200 : همه بازارهای فعال (+ pagination با resumeToken)
 *  - GET /markets/ohlcv?marketId=&timeFrame=1d&limit=45 : تاریخچه APR روزانه
 *  - POST /simulations/place-order-anonymous : پیش‌نمایش سفارش (margin/fees/priceImpact)
 * کش IndexedDB + Retry + همگام‌سازی پیش‌رونده
 */
import { fetchJson, fetchWithRetry } from '@/shared/lib/fetchWithRetry';
import { cacheBulkGetPrice, cachePutPrice } from '@/shared/lib/db';
import { mapLimit } from '@/features/cryptomarkets/data/useTopPerformers';
import type { BorosMarket, BorosSimResult } from '../domain/types';

/**
 * پایه‌ی URL: اول از پروکسی same-origin (vite dev/preview — بدون CORS) استفاده می‌شود
 * تا در پیش‌نمایش (e2b.app) هم کار کند؛ فالبک: درخواست مستقیم به API رسمی.
 */
// Prod (Vercel): /api/boros (Serverless) — Dev (Vite): /boros-api (پروکسی)
export const BOROS_PROXY = import.meta.env.PROD ? '/api/boros' : '/boros-api';
export const BOROS_DIRECT = 'https://api-boros.pendle.finance/apis/v1';

/** درخواست با فالبک: پروکسی ← مستقیم */
async function borosFetch(path: string, init?: Parameters<typeof fetchWithRetry>[1]): Promise<Response> {
  try {
    const res = await fetchWithRetry(`${BOROS_PROXY}${path}`, { ...init, retries: 1 });
    if (res.ok) return res;
  } catch { /* فالبک */ }
  return fetchWithRetry(`${BOROS_DIRECT}${path}`, { ...init, retries: 1 });
}

const MARKETS_CACHE_MS = 3 * 60_000; // ۳ دقیقه
const OHLCV_CACHE_MS = 60 * 60 * 1000; // ۱ ساعت (شمع‌های روزانه — همگام‌سازی خودکار هر ۲ دقیقه آن را تازه نگه می‌دارد)
const marketKey = 'boros:markets';
const ohlcvKey = (id: number) => `boros:ohlcv:${id}`;

/** تبدیل پاسخ API به مدل داخلی (همه پارامترها از API — بدون Hardcode) */
function mapMarket(raw: Record<string, any>): BorosMarket {
  const im = raw.imData ?? {};
  const cfg = raw.config ?? {};
  const ext = raw.extConfig ?? {};
  const md = raw.metadata ?? {};
  const data = raw.data ?? {};
  const platform = raw.platform ?? {};
  return {
    marketId: raw.marketId,
    name: im.name ?? '',
    symbol: im.symbol ?? '',
    venue: platform.name ?? '',
    asset: md.underlyingSymbol ?? '',
    fundingRateSymbol: md.fundingRateSymbol ?? '',
    maturity: im.maturity ?? 0,
    marginFloor: im.marginFloor ?? 0,
    tickStep: im.tickStep ?? 2,
    iTickThresh: im.iTickThresh ?? 0,
    maxLeverage: md.maxLeverage ?? 1,
    isUiWhitelisted: md.isUiWhitelisted ?? true,
    kIM: cfg.kIM ? Number(cfg.kIM) / 1e18 : 0.5,
    kMM: cfg.kMM ? Number(cfg.kMM) / 1e18 : 0.25,
    takerFee: cfg.takerFee ? Number(cfg.takerFee) / 1e18 : 0.0005,
    otcFee: cfg.otcFee ? Number(cfg.otcFee) / 1e18 : 0.0005,
    settleFeeRate: ext.settleFeeRate ? Number(ext.settleFeeRate) / 1e18 : 0.001,
    paymentPeriod: ext.paymentPeriod ?? 28800,
    hardOICap: cfg.hardOICap ? Number(cfg.hardOICap) / 1e18 : 0,
    softOICap: cfg.softOICap ?? 0,
    maxRateDeviationFactorBase1e4: cfg.maxRateDeviationFactorBase1e4 ?? 0,
    liqBase: cfg.liqSettings?.base ? Number(cfg.liqSettings.base) / 1e18 : 0.25,
    liqSlope: cfg.liqSettings?.slope ? Number(cfg.liqSettings.slope) / 1e18 : 0.5,
    liqFeeRate: cfg.liqSettings?.feeRate ? Number(cfg.liqSettings.feeRate) / 1e18 : 0.0005,
    markApr: data.markApr ?? 0,
    lastTradedApr: data.lastTradedApr ?? 0,
    midApr: data.midApr ?? 0,
    floatingApr: data.floatingApr ?? 0,
    longYieldApr: data.longYieldApr ?? 0,
    notionalOI: data.notionalOI ?? 0,
    volume24h: data.volume24h ?? 0,
    nextSettlementTime: data.nextSettlementTime ?? 0,
    settlementsToMaturity: data.settlementsToMaturity ?? 0,
    rateSensitivity: data.rateSensitivity ?? 0,
    dailyVolatility: data.dailyVolatility ?? null,
    bestBid: data.bestBid ?? 0,
    bestAsk: data.bestAsk ?? 0,
    assetMarkPrice: data.assetMarkPrice ?? 0,
    ohlcv: []
  };
}

/**
 * همه بازارهای فعال (فقط API رسمی — pagination کامل)
 * فالبک مقاوم: کش تازه (۳ دقیقه) ← کش کهنه (هر سنی، برچسب stale) ← خطا
 * → Rate Limit موقت هرگز صفحه را خالی/خطا نمی‌کند
 */
export async function fetchBorosMarkets(): Promise<{ markets: BorosMarket[]; stale: boolean }> {
  let cached: { price: unknown; fetchedAt: number } | null = null;
  try {
    const rec = await cacheBulkGetPrice([marketKey]);
    const r = rec.get(marketKey);
    if (r) {
      cached = { price: r.price, fetchedAt: r.fetchedAt };
      if (Date.now() - r.fetchedAt < MARKETS_CACHE_MS) {
        return { markets: r.price as unknown as BorosMarket[], stale: false };
      }
    }
  } catch { /* ادامه */ }

  try {
    const out: BorosMarket[] = [];
    let resumeToken: string | null = null;
    for (let page = 0; page < 10; page++) {
      const res = await borosFetch(`/markets?isMatured=false&limit=200${resumeToken ? `&resumeToken=${encodeURIComponent(resumeToken)}` : ''}`, { retries: 2, timeoutMs: 20_000 });
      if (!res.ok) break;
      const j = (await res.json()) as { results: Record<string, any>[]; resumeToken?: string | null };
      out.push(...j.results.map(mapMarket));
      resumeToken = j.resumeToken ?? null;
      if (!resumeToken) break;
    }
    if (out.length > 0) {
      try {
        await cachePutPrice(marketKey, { price: out as unknown as number, source: 'live', fetchedAt: Date.now() });
      } catch { /* خاموش */ }
      return { markets: out, stale: false };
    }
    // پاسخ خالی → به کش کهنه برگرد
    if (cached) return { markets: cached.price as unknown as BorosMarket[], stale: true };
    throw new Error('empty markets');
  } catch {
    // Rate Limit / قطعی شبکه → فالبک کش کهنه (هر سنی) — فقط اگر هیچ کشی نبود خطا
    if (cached) return { markets: cached.price as unknown as BorosMarket[], stale: true };
    throw new Error('no boros market data');
  }
}

/** تاریخچه APR روزانه یک بازار (OHLCV — c = APR) */
export async function fetchBorosOhlcv(marketId: number, limit = 45): Promise<{ ts: number; c: number }[]> {
  const ck = ohlcvKey(marketId);
  try {
    const rec = await cacheBulkGetPrice([ck]);
    const r = rec.get(ck);
    if (r && Date.now() - r.fetchedAt < OHLCV_CACHE_MS) {
      return r.price as unknown as { ts: number; c: number }[];
    }
  } catch { /* ادامه */ }
  try {
    const res = await borosFetch(
      `/markets/ohlcv?marketId=${marketId}&timeFrame=1d&limit=${limit}`,
      { retries: 1, timeoutMs: 15_000 }
    );
    if (!res.ok) return [];
    const j = (await res.json()) as { results: { ts: number; c: number }[] };
    const pts = (j.results ?? []).filter((p) => p.c > 0);
    try {
      await cachePutPrice(ck, { price: pts as unknown as number, source: 'snapshot', fetchedAt: Date.now() });
    } catch { /* خاموش */ }
    return pts;
  } catch {
    return [];
  }
}

/** همگام‌سازی OHLCV برای همه بازارها (پیش‌رونده، همزمانی ۵) */
export async function syncBorosOhlcv(
  markets: BorosMarket[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  let done = 0;
  await mapLimit(markets, 5, async (m) => {
    const pts = await fetchBorosOhlcv(m.marketId);
    if (pts.length > 0) m.ohlcv = pts;
    done += 1;
    if (onProgress && done % 5 === 0) onProgress(done, markets.length);
  });
  onProgress?.(markets.length, markets.length);
}

/** پیش‌نمایش سفارش (anonymous — بدون نیاز به کیف پول): margin/fees/priceImpact */
export async function simulateBorosOrder(
  marketId: number,
  side: 0 | 1,
  size: number,
  rate: number
): Promise<BorosSimResult | null> {
  try {
    const res = await borosFetch('/simulations/place-order-anonymous', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ marketId, side, tif: 0, orderType: 'limit', size, rate }),
      retries: 1,
      timeoutMs: 20_000
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      matched?: { size?: string; cost?: string; rate?: number };
      marginRequired?: string;
      priceImpact?: number;
      feeBreakdown?: { takerOtcFee?: string };
      resolved?: { actualRate?: number };
    };
    return {
      size: j.matched?.size ?? String(size),
      cost: j.matched?.cost ?? '0',
      rate: j.matched?.rate ?? rate,
      marginRequired: j.marginRequired ?? '0',
      priceImpact: j.priceImpact ?? 0,
      takerOtcFee: j.feeBreakdown?.takerOtcFee ?? '0',
      actualRate: j.resolved?.actualRate ?? rate
    };
  } catch {
    return null;
  }
}
