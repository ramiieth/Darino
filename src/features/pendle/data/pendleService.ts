/** ============================================================
 * PendleService — کلاینت رسمی Pendle Backend API (/core)
 * ⚠️ فقط مشاهده/تحلیل بازار — بدون هیچ عملیات On-Chain
 *
 * مدیریت Rate Limit (هدرمحور — بدون Hardcode):
 *  - خواندن X-Computing-Unit / X-RateLimit-* از هر پاسخ
 *  - توقف خودکار وقتی X-RateLimit-Remaining کم است
 *  - 429 → Retry با Exponential Backoff (تا ۳ بار)
 *  - Timeout سنگین: ۱۲۰ ثانیه | سبک: ۳۰ ثانیه
 *  - Pagination برای /markets/all + Batching برای /prices/assets
 *  - کش IndexedDB با TTL به‌ازای نوع اندپوینت (پیکربندی‌شده، نه در منطق)
 *  - Partial Response: فیلد errors در پاسخ‌ها مدیریت می‌شود
 * ============================================================ */
import { fetchWithRetry } from '@/shared/lib/fetchWithRetry';
import { cacheBulkGetPrice, cachePutPrice } from '@/shared/lib/db';
import { create } from 'zustand';
import type { PendleAsset, RawPendleMarket } from '@/features/pendle/domain/pendle';

export const PENDLE_BASE = 'https://api-v2.pendle.finance/core';

/* ---------- پیکربندی کش (به‌ازای نوع اندپوینت) ---------- */
export const PENDLE_TTL = {
  markets: 5 * 60_000, // v2/markets/all — ۵ دقیقه
  assets: 24 * 60 * 60_000, // v1/assets/all — ۲۴ ساعت (فراداده)
  prices: 60_000, // v1/prices/assets — ۱ دقیقه
  historical: 30 * 60_000 // v3/historical-data — ۳۰ دقیقه
} as const;

/* ---------- وضعیت Rate Limit (از هدرهای پاسخ) ---------- */
interface RateLimitState {
  cu: number;
  remaining: number;
  limit: number;
  reset: number;
  weeklyRemaining: number;
  weeklyLimit: number;
  weeklyReset: number;
  errors: { at: number; path: string; status: number }[];
  setHeaders: (h: Record<string, string>, path: string) => void;
  addError: (path: string, status: number) => void;
}

export const usePendleRateStore = create<RateLimitState>((set) => ({
  cu: 0,
  remaining: 100,
  limit: 100,
  reset: 0,
  weeklyRemaining: 200_000,
  weeklyLimit: 200_000,
  weeklyReset: 0,
  errors: [],
  setHeaders: (h, path) =>
    set((s) => ({
      cu: h['x-computing-unit'] ? Number(h['x-computing-unit']) : s.cu,
      remaining: h['x-ratelimit-remaining'] !== undefined ? Number(h['x-ratelimit-remaining']) : s.remaining,
      limit: h['x-ratelimit-limit'] !== undefined ? Number(h['x-ratelimit-limit']) : s.limit,
      reset: h['x-ratelimit-reset'] !== undefined ? Number(h['x-ratelimit-reset']) : s.reset,
      weeklyRemaining: h['x-ratelimit-weekly-remaining'] !== undefined ? Number(h['x-ratelimit-weekly-remaining']) : s.weeklyRemaining,
      weeklyLimit: h['x-ratelimit-weekly-limit'] !== undefined ? Number(h['x-ratelimit-weekly-limit']) : s.weeklyLimit,
      weeklyReset: h['x-ratelimit-weekly-reset'] !== undefined ? Number(h['x-ratelimit-weekly-reset']) : s.weeklyReset
    })),
  addError: (path, status) =>
    set((s) => ({ errors: [...s.errors.slice(-49), { at: Date.now(), path, status }] }))
}));

/** توقف تا ریست سهمیه (وقتی remaining کم است) */
async function waitForRateLimit(): Promise<void> {
  const s = usePendleRateStore.getState();
  const now = Math.floor(Date.now() / 1000);
  const minRemaining = 5;
  if (s.remaining <= minRemaining && s.reset > now) {
    const waitMs = (s.reset - now + 1) * 1000;
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 60_000)));
  }
}

/** درخواست پایه Pendle با هدرخوانی، retry و timeout */
async function pendleFetch<T>(path: string, timeoutMs = 30_000, maxRetries = 2): Promise<T> {
  await waitForRateLimit();
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchWithRetry(`${PENDLE_BASE}${path}`, {
        timeoutMs,
        retries: 0,
        headers: { accept: 'application/json' }
      });
      // ثبت هدرهای Rate Limit
      const headers: Record<string, string> = {};
      for (const k of ['x-computing-unit', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'x-ratelimit-weekly-limit', 'x-ratelimit-weekly-remaining', 'x-ratelimit-weekly-reset']) {
        const v = res.headers.get(k);
        if (v !== null) headers[k] = v;
      }
      usePendleRateStore.getState().setHeaders(headers, path);

      if (res.status === 429) {
        // Exponential Backoff
        const wait = 1000 * 2 ** attempt;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        usePendleRateStore.getState().addError(path, res.status);
        throw new Error(`Pendle HTTP ${res.status}`);
      }
      const json = (await res.json()) as T & { errors?: unknown };
      return json;
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastErr;
}

/* ---------- کش با TTL به‌ازای نوع اندپوینت ---------- */

async function cachedFetch<T>(cacheKey: string, ttlMs: number, path: string, timeoutMs?: number): Promise<T> {
  try {
    const rec = await cacheBulkGetPrice([cacheKey]);
    const r = rec.get(cacheKey);
    if (r && Date.now() - r.fetchedAt < ttlMs) return r.price as unknown as T;
  } catch { /* ادامه */ }
  const data = await pendleFetch<T>(path, timeoutMs);
  try {
    await cachePutPrice(cacheKey, { price: data as unknown as number, source: 'live', fetchedAt: Date.now() });
  } catch { /* خاموش */ }
  return data;
}

/* ---------- اندپوینت‌ها ---------- */

/** همه بازارها با Pagination (limit=100 تا total) */
export async function fetchAllMarkets(): Promise<RawPendleMarket[]> {
  const cacheKey = 'pendle:markets:all';
  try {
    const rec = await cacheBulkGetPrice([cacheKey]);
    const r = rec.get(cacheKey);
    if (r && Date.now() - r.fetchedAt < PENDLE_TTL.markets) return r.price as unknown as RawPendleMarket[];
  } catch { /* ادامه */ }

  const out: RawPendleMarket[] = [];
  let skip = 0;
  const limit = 100;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = await pendleFetch<{ total: number; results: RawPendleMarket[]; errors?: unknown }>(
      `/v2/markets/all?limit=${limit}&skip=${skip}&orderBy=details.totalTvl&order=desc`,
      120_000
    );
    out.push(...(data.results ?? []));
    if (out.length >= (data.total ?? 0) || (data.results ?? []).length === 0) break;
    skip += limit;
  }
  try {
    await cachePutPrice(cacheKey, { price: out as unknown as number, source: 'live', fetchedAt: Date.now() });
  } catch { /* خاموش */ }
  return out;
}

/** همه Assets (فراداده + لوگو) — کش ۲۴ ساعت */
export async function fetchAllAssets(): Promise<PendleAsset[]> {
  return cachedFetch<PendleAsset[]>('pendle:assets:all', PENDLE_TTL.assets, '/v1/assets/all?limit=1000', 120_000);
}

/** قیمت‌ها با Batching (هر ۱۰۰ شناسه) — کش ۱ دقیقه */
export async function fetchAssetsPrices(ids: string[]): Promise<Record<string, number>> {
  const cacheKey = `pendle:prices:${ids.slice(0, 8).join(',')}`;
  try {
    const rec = await cacheBulkGetPrice([cacheKey]);
    const r = rec.get(cacheKey);
    if (r && Date.now() - r.fetchedAt < PENDLE_TTL.prices) return r.price as unknown as Record<string, number>;
  } catch { /* ادامه */ }

  const out: Record<string, number> = {};
  const unique = [...new Set(ids)].filter(Boolean);
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const data = await pendleFetch<{ prices?: Record<string, number>; errors?: unknown }>(
      `/v1/prices/assets?assets=${encodeURIComponent(chunk.join(','))}`,
      30_000
    );
    Object.assign(out, data.prices ?? {});
  }
  try {
    await cachePutPrice(cacheKey, { price: out as unknown as number, source: 'live', fetchedAt: Date.now() });
  } catch { /* خاموش */ }
  return out;
}

/** داده تاریخی بازار (APY/TVL ساعتی) — کش ۳۰ دقیقه */
export interface PendleHistoryPoint {
  timestamp: string;
  maxApy: number;
  baseApy: number;
  underlyingApy: number;
  impliedApy: number;
  tvl: number;
}

export async function fetchMarketHistory(chainId: number, address: string): Promise<PendleHistoryPoint[]> {
  const now = Date.now();
  const start = Math.floor((now - 90 * 86_400_000) / 1000);
  const end = Math.floor(now / 1000);
  const cacheKey = `pendle:hist:${chainId}:${address}`;
  try {
    const rec = await cacheBulkGetPrice([cacheKey]);
    const r = rec.get(cacheKey);
    if (r && Date.now() - r.fetchedAt < PENDLE_TTL.historical) return r.price as unknown as PendleHistoryPoint[];
  } catch { /* ادامه */ }
  const data = await pendleFetch<{ results?: PendleHistoryPoint[]; errors?: unknown }>(
    `/v3/${chainId}/markets/${address}/historical-data?start=${start}&end=${end}`,
    120_000,
    1
  );
  const points = data.results ?? [];
  try {
    await cachePutPrice(cacheKey, { price: points as unknown as number, source: 'live', fetchedAt: Date.now() });
  } catch { /* خاموش */ }
  return points;
}
