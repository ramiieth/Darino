/**
 * Boros Data Service — فقط API رسمی Boros (api-boros.pendle.finance/apis/v1)
 *  - GET /markets?isMatured=false&isUiWhitelisted=true&limit=200 : همه بازارهای فعال (+ pagination با resumeToken)
 *  - GET /markets/ohlcv?marketId=&timeFrame=1d&startTimestamp= : تاریخچه نرخ ضمنی
 *  - GET /indicators?select=u : تاریخچه نرخ شناور
 * کش IndexedDB + Retry + همگام‌سازی پیش‌رونده
 */
import { fetchWithRetry } from '@/shared/lib/fetchWithRetry';
import { RateLimitError } from '@/shared/lib/throttler';
import { cacheBulkGetPrice, cachePutPrice } from '@/shared/lib/db';
import { mapLimit } from '@/features/cryptomarkets/data/useTopPerformers';
import type { BorosMarket } from '../domain/types';

/**
 * پایه‌ی URL: اول از پروکسی same-origin (vite dev/preview — بدون CORS) استفاده می‌شود
 * تا در پیش‌نمایش (e2b.app) هم کار کند؛ فالبک: درخواست مستقیم به API رسمی.
 */
// Prod (Vercel): /api/boros (Serverless) — Dev (Vite): /boros-api (پروکسی)
export const BOROS_PROXY = import.meta.env.PROD ? '/api/boros' : '/boros-api';
export const BOROS_DIRECT = 'https://api-boros.pendle.finance/apis/v1';

let cooldownUntil = 0;
/** درخواست با فالبک؛ سهمیه هرگز باعث بازتلاش از میزبان دیگر نمی‌شود. */
async function borosFetch(path: string, init?: Parameters<typeof fetchWithRetry>[1]): Promise<Response> {
  if (Date.now() < cooldownUntil) throw new RateLimitError('Boros cooldown');
  try {
    const res = await fetchWithRetry(`${BOROS_PROXY}${path}`, { ...init, retries: 1 });
    if (res.ok || res.status !== 404) return res;
  } catch (e) {
    if (e instanceof RateLimitError) { cooldownUntil = Date.now() + 60000; throw e; }
  }
  return fetchWithRetry(`${BOROS_DIRECT}${path}`, { ...init, retries: 1 });
}

const MARKETS_CACHE_MS = 3 * 60_000; // ۳ دقیقه
const OHLCV_CACHE_MS = 60 * 60 * 1000; // ۱ ساعت (شمع‌های روزانه — همگام‌سازی خودکار هر ۲ دقیقه آن را تازه نگه می‌دارد)
const marketKey = 'boros:markets:v2';
const ohlcvKey = (id: number, limit: number) => `boros:ohlcv:v2:${id}:${limit}`;

/** تبدیل پاسخ API به مدل داخلی (همه پارامترها از API — بدون Hardcode) */
export function mapMarket(raw: Record<string, any>, snapshotAt?: number): BorosMarket {
  const im = raw.imData ?? {};
  const cfg = raw.config ?? {};
  const ext = raw.extConfig ?? {};
  const md = raw.metadata ?? {};
  const data = raw.data ?? {};
  const platform = raw.platform ?? {};
  const scaled = (v: unknown) => v === null || v === undefined || v === '' ? Number.NaN : Number(v) / 1e18;
  const status = cfg.status;
  const market: BorosMarket = {
    marketId: raw.marketId,
    tokenId: raw.tokenId,
    snapshotAt,
    status: status === 2 || status === 'GOOD' ? 'GOOD' : status === 1 || status === 'CLOSE_ONLY' || status === 'CLO' ? 'CLOSE_ONLY' : status === 0 || status === 'PAUSED' ? 'PAUSED' : 'UNKNOWN',
    ytmFloor: Number(cfg.tThresh) / (365 * 86400),
    name: im.name ?? '',
    symbol: im.symbol ?? '',
    venue: platform.name ?? '',
    asset: md.underlyingSymbol ?? '',
    fundingRateSymbol: md.fundingRateSymbol ?? '',
    maturity: im.maturity ?? 0,
    marginFloor: im.marginFloor ?? Number.NaN,
    tickStep: im.tickStep ?? 2,
    iTickThresh: im.iTickThresh ?? 0,
    maxLeverage: md.maxLeverage ?? 1,
    isUiWhitelisted: md.isUiWhitelisted ?? true,
    kIM: scaled(cfg.kIM),
    kMM: scaled(cfg.kMM),
    takerFee: scaled(cfg.takerFee),
    otcFee: scaled(cfg.otcFee),
    settleFeeRate: scaled(ext.settleFeeRate),
    paymentPeriod: ext.paymentPeriod ?? Number.NaN,
    hardOICap: scaled(cfg.hardOICap),
    softOICap: cfg.softOICap ?? 0,
    maxRateDeviationFactorBase1e4: cfg.maxRateDeviationFactorBase1e4 ?? 0,
    liqBase: cfg.liqSettings?.base ? Number(cfg.liqSettings.base) / 1e18 : 0.25,
    liqSlope: cfg.liqSettings?.slope ? Number(cfg.liqSettings.slope) / 1e18 : 0.5,
    liqFeeRate: cfg.liqSettings?.feeRate ? Number(cfg.liqSettings.feeRate) / 1e18 : 0.0005,
    markApr: data.markApr ?? Number.NaN,
    lastTradedApr: data.lastTradedApr ?? 0,
    midApr: data.midApr ?? 0,
    floatingApr: data.floatingApr ?? Number.NaN,
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
  if (![market.marketId, market.maturity, market.marginFloor, market.ytmFloor, market.kIM, market.kMM, market.takerFee, market.settleFeeRate, market.markApr, market.floatingApr].every(Number.isFinite) || !(market.kIM > 0) || market.marginFloor < 0 || market.takerFee < 0 || market.settleFeeRate < 0 || !(market.paymentPeriod > 0)) throw new Error('invalid boros market configuration');
  return market;
}

/**
 * همه بازارهای فعال (فقط API رسمی — pagination کامل)
 * فالبک مقاوم: کش تازه (۳ دقیقه) ← کش کهنه (هر سنی، برچسب stale) ← خطا
 * → Rate Limit موقت هرگز صفحه را خالی/خطا نمی‌کند
 */
export async function fetchBorosMarkets(): Promise<{ markets: BorosMarket[]; stale: boolean; fetchedAt: number }> {
  let cached: { price: unknown; fetchedAt: number } | null = null;
  try {
    const rec = await cacheBulkGetPrice([marketKey]);
    const r = rec.get(marketKey);
    if (r) {
      cached = { price: r.price, fetchedAt: r.fetchedAt };
      if (Date.now() - r.fetchedAt < MARKETS_CACHE_MS) {
        return { markets: r.price as unknown as BorosMarket[], stale: false, fetchedAt: r.fetchedAt };
      }
    }
  } catch { /* ادامه */ }

  try {
    const out: BorosMarket[] = [];
    let snapshotAt = Date.now();
    const seen = new Set<string>();
    let resumeToken: string | null = null;
    for (let page = 0; page < 10; page++) {
      const res = await borosFetch(`/markets?isMatured=false&isUiWhitelisted=true&limit=200${resumeToken ? `&resumeToken=${encodeURIComponent(resumeToken)}` : ''}`, { retries: 2, timeoutMs: 20_000 });
      if (!res.ok) throw new Error(`boros markets: ${res.status}`);
      const j = (await res.json()) as { results: Record<string, any>[]; resumeToken?: string | null; cursor?: { next?: string; hasMore?: boolean }; syncStatus?: { timestamp?: number } };
      if (!Array.isArray(j.results)) throw new Error('invalid market page');
      const sourceTime = j.syncStatus?.timestamp;
      if (typeof sourceTime === 'number' && Number.isFinite(sourceTime)) snapshotAt = Math.min(snapshotAt, sourceTime * 1000);
      out.push(...j.results.map((raw) => mapMarket(raw, snapshotAt)));
      resumeToken = j.resumeToken ?? (j.cursor?.hasMore ? j.cursor.next ?? null : null);
      if (j.cursor?.hasMore && !resumeToken) throw new Error('missing pagination cursor');
      if (resumeToken && seen.has(resumeToken)) throw new Error('repeated market cursor');
      if (resumeToken) seen.add(resumeToken);
      if (!resumeToken) break;
    }
    if (resumeToken) throw new Error('incomplete market pagination');
    // Resolve collateral by tokenId. Underlying asset price is not a collateral price in every market.
    const assetRes = await borosFetch('/assets', { timeoutMs: 15000, retries: 1 });
    if (!assetRes.ok) throw new Error('collateral prices unavailable');
    const assets = (await assetRes.json()).results;
    if (!Array.isArray(assets)) throw new Error('invalid collateral assets');
    const unique = [...new Map(out.map((m) => [m.marketId, m])).values()];
    for (const m of unique) {
      const asset = assets.find((a: Record<string, any>) => a.tokenId === m.tokenId && a.isCollateral);
      if (asset) {
        m.collateralSymbol = asset.metadata?.proSymbol ?? asset.symbol;
        const price = Number(asset.usdPrice);
        if (Number.isFinite(price) && price > 0) m.collateralPriceUsd = price;
      }
      m.snapshotAt = snapshotAt;
    }
    const stale = Date.now() - snapshotAt > MARKETS_CACHE_MS;
    try { await cachePutPrice(marketKey, { price: unique as unknown as number, source: 'live', fetchedAt: snapshotAt }); } catch { /* cache optional */ }
    return { markets: unique, stale, fetchedAt: snapshotAt };
  } catch {
    // Rate Limit / قطعی شبکه → فالبک کش کهنه (هر سنی) — فقط اگر هیچ کشی نبود خطا
    if (cached) return { markets: cached.price as unknown as BorosMarket[], stale: true, fetchedAt: cached.fetchedAt };
    throw new Error('no boros market data');
  }
}

/** تاریخچه APR روزانه یک بازار (OHLCV — c = APR) */
export async function fetchBorosOhlcv(marketId: number, limit = 45): Promise<{ ts: number; c: number }[]> {
  const ck = ohlcvKey(marketId, limit);
  try {
    const rec = await cacheBulkGetPrice([ck]);
    const r = rec.get(ck);
    if (r && Date.now() - r.fetchedAt < OHLCV_CACHE_MS) {
      return r.price as unknown as { ts: number; c: number }[];
    }
  } catch { /* ادامه */ }
  try {
    const res = await borosFetch(
      `/markets/ohlcv?marketId=${marketId}&timeFrame=1d&startTimestamp=${Math.floor(Date.now() / 1000) - Math.min(200, limit) * 86400}`,
      { retries: 1, timeoutMs: 15_000 }
    );
    if (!res.ok) return [];
    const j = (await res.json()) as { results: { ts: number; c: number }[] };
    const pts = [...new Map((j.results ?? []).filter((p) => Number.isFinite(p.c) && Number.isFinite(p.ts) && p.ts > 0).map((p) => [p.ts, p])).values()].sort((a, b) => a.ts - b.ts);
    try {
      await cachePutPrice(ck, { price: pts as unknown as number, source: 'snapshot', fetchedAt: Date.now() });
    } catch { /* خاموش */ }
    return pts;
  } catch {
    return [];
  }
}

/** Observed oracle APR history. Never substitute implied-price candles for floating rates. */
export async function fetchBorosFundingHistory(marketId: number): Promise<{ ts: number; c: number }[]> {
  const key = `boros:funding:v1:${marketId}`;
  try {
    const rec = (await cacheBulkGetPrice([key])).get(key);
    if (rec && Date.now() - rec.fetchedAt < OHLCV_CACHE_MS) return rec.price as unknown as { ts: number; c: number }[];
    const start = Math.floor(Date.now() / 1000) - 90 * 86400;
    const res = await borosFetch(`/indicators?marketId=${marketId}&timeFrame=1d&select=u&startTimestamp=${start}`, { retries: 1, timeoutMs: 15000 });
    if (!res.ok) return [];
    const data = await res.json();
    const first = data.metadata?.firstDataTimestamp?.u;
    const settled = data.metadata?.uLastSettledTimestamp ?? Math.floor(Date.now() / 86400000) * 86400 - 86400;
    if (!Number.isFinite(first) || !Number.isFinite(settled) || !Array.isArray(data.results)) return [];
    const points = data.results.filter((p: { ts: number; u?: number }) => typeof p.u === 'number' && Number.isFinite(p.u) && p.ts >= first && p.ts <= settled)
      .map((p: { ts: number; u: number }) => ({ ts: p.ts, c: p.u })).sort((a: { ts: number }, b: { ts: number }) => a.ts - b.ts);
    try { await cachePutPrice(key, { price: points as unknown as number, source: 'snapshot', fetchedAt: Date.now() }); } catch { /* optional cache */ }
    return points;
  } catch { return []; }
}

/** همگام‌سازی OHLCV برای همه بازارها (پیش‌رونده، همزمانی ۵) */
export async function syncBorosOhlcv(
  markets: BorosMarket[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  let done = 0;
  await mapLimit(markets, 5, async (m) => {
    const [pts, funding] = await Promise.all([fetchBorosOhlcv(m.marketId), fetchBorosFundingHistory(m.marketId)]);
    m.fundingHistory = funding;
    if (pts.length > 0) m.ohlcv = pts;
    done += 1;
    if (onProgress && done % 5 === 0) onProgress(done, markets.length);
  });
  onProgress?.(markets.length, markets.length);
}
