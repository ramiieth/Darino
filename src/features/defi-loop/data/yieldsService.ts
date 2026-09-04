/** ============================================================
 * DeFiLlama Yields Provider — فقط API رسمی (Data-Driven، بدون Hardcode)
 *  - GET https://yields.llama.fi/pools : همه پول‌ها (کش ۵ دقیقه)
 *  - GET https://yields.llama.fi/chart/{pool} : تاریخچه روزانه APY/TVL (کش ۶ ساعت)
 *  - Retry + Timeout + 429 → Exponential Backoff + Cache Fallback
 * ============================================================ */
import { fetchWithRetry } from '@/shared/lib/fetchWithRetry';
import { cacheBulkGetPrice, cachePutPrice } from '@/shared/lib/db';

export const YIELDS_BASE = 'https://yields.llama.fi';

export interface YieldPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  apyBase7d: number | null;
  apyMean30d: number | null;
  apyPct1D: number | null;
  apyPct7D: number | null;
  apyPct30D: number | null;
  stablecoin: boolean;
  outlier: boolean;
  sigma: number | null;
  exposure: string | null;
  volumeUsd1d: number | null;
  volumeUsd7d: number | null;
  poolMeta: string | null;
  ilRisk: string | null;
  underlyingTokens: string[] | null;
}

export interface YieldChartPoint {
  timestamp: string;
  tvlUsd: number | null;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
}

const POOLS_CACHE_MS = 5 * 60_000;
const CHART_CACHE_MS = 6 * 60 * 60 * 1000;
const POOLS_KEY = 'yields:pools';

/** همه پول‌ها (کش ۵ دقیقه) */
export async function fetchAllYieldPools(): Promise<YieldPool[]> {
  try {
    const rec = await cacheBulkGetPrice([POOLS_KEY]);
    const r = rec.get(POOLS_KEY);
    if (r && Date.now() - r.fetchedAt < POOLS_CACHE_MS) {
      return r.price as unknown as YieldPool[];
    }
  } catch { /* ادامه */ }

  try {
    const res = await fetchWithRetry(`${YIELDS_BASE}/pools`, { retries: 2, timeoutMs: 25_000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { data?: YieldPool[] };
    const data = j.data ?? [];
    try {
      await cachePutPrice(POOLS_KEY, { price: data as unknown as number, source: 'live', fetchedAt: Date.now() });
    } catch { /* خاموش */ }
    return data;
  } catch {
    // فالبک کش کهنه
    try {
      const rec = await cacheBulkGetPrice([POOLS_KEY]);
      const r = rec.get(POOLS_KEY);
      if (r) return r.price as unknown as YieldPool[];
    } catch { /* خاموش */ }
    return [];
  }
}

/** تاریخچه روزانه یک پول (کش ۶ ساعت) */
export async function fetchPoolChart(poolId: string): Promise<YieldChartPoint[]> {
  const ck = `yields:chart:${poolId}`;
  try {
    const rec = await cacheBulkGetPrice([ck]);
    const r = rec.get(ck);
    if (r && Date.now() - r.fetchedAt < CHART_CACHE_MS) {
      return r.price as unknown as YieldChartPoint[];
    }
  } catch { /* ادامه */ }

  try {
    const res = await fetchWithRetry(`${YIELDS_BASE}/chart/${encodeURIComponent(poolId)}`, { retries: 2, timeoutMs: 20_000 });
    if (!res.ok) return [];
    const j = (await res.json()) as { data?: YieldChartPoint[] };
    const pts = j.data ?? [];
    if (pts.length > 0) {
      try {
        await cachePutPrice(ck, { price: pts as unknown as number, source: 'snapshot', fetchedAt: Date.now() });
      } catch { /* خاموش */ }
    }
    return pts;
  } catch {
    return [];
  }
}
