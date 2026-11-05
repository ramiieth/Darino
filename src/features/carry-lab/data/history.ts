/**
 * دادهٔ آزمایشگاه کری — فقط اندپوینت عمومی Info هایپرلیکوئید (بدون کیف پول/کلید/امضا)
 *
 *   fundingHistory {coin, startTime, endTime}   فاندینگ تسویه‌شدهٔ ساعتی، حداکثر ۵۰۰ ردیف در هر پاسخ → صفحه‌بندی
 *   candleSnapshot {coin, interval: '4h'}        فقط ۵۰۰۰ کندل اخیر (۴ ساعته ≈ ۸۳۳ روز) — برای لیکوئید و ریبالانس
 *   meta                                         حداکثر اهرم → مارجین نگهداری = ۱ ÷ (۲ × حداکثر اهرم)
 *
 * فاندینگ تسویه‌شده تغییر نمی‌کند → کش افزایشی در IndexedDB؛ بار دوم فقط ساعت‌های تازه دریافت می‌شود.
 * سقف وزنی هایپرلیکوئید برای هر IP است → صفحه‌ها پشت‌سرهم با مکث و در صورت ۴۲۹ صبر و تلاش دوباره.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { settingGet, settingSet } from '@/shared/lib/db';
import { hyperliquidInfo, parseHyperliquidFundings } from '@/features/calculators/data/hyperliquidMarkets';
import { cleanFunding, DAY_MS, HOUR_MS, type FundingPoint, type PriceBar } from '../domain/engine';

const PAGE = 500;
const PAGE_PAUSE_MS = 350;
const CANDLE_MS = 4 * HOUR_MS;
/** فقط بازارهای اصلی (meta بدون dex) */
export const COIN_RE = /^[A-Za-z0-9]{1,16}$/;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rows = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []);
const fin = (v: unknown) => {
  const n = typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

async function infoWithBackoff(body: Record<string, unknown>): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await hyperliquidInfo(body, 20_000);
    } catch (e) {
      if (attempt >= 3 || !/429|abort/i.test(String(e))) throw e;
      await sleep(3_000 * (attempt + 1));
    }
  }
}

export function parseCandles(body: unknown): PriceBar[] {
  return rows(body).flatMap((c) => {
    const t = fin(c.t);
    const high = fin(c.h);
    const low = fin(c.l);
    const close = fin(c.c);
    return t === null || high === null || close === null || close <= 0 ? [] : [{ end: t + CANDLE_MS, high, low: low ?? close, close }];
  });
}

/** حداکثر اهرم بازار اصلی از meta */
export function parseMaxLeverage(body: unknown, coin: string): number | null {
  const u = rows((body as { universe?: unknown } | null)?.universe).find((x) => x.name === coin);
  const v = fin(u?.maxLeverage);
  return v && v > 0 ? v : null;
}

interface FundingCache {
  /** شروع بازه‌ای که تا حالا درخواست شده (ممکن است قبل از راه‌اندازی بازار باشد) */
  from: number;
  pts: [number, number][];
}

const cacheKey = (coin: string) => `carrylab:funding:${coin}`;

async function fetchRange(coin: string, start: number, end: number, onPage: () => void): Promise<FundingPoint[]> {
  const out: FundingPoint[] = [];
  let cursor = start;
  while (cursor < end) {
    const list = rows(await infoWithBackoff({ type: 'fundingHistory', coin, startTime: cursor, endTime: end }));
    onPage();
    out.push(...parseHyperliquidFundings(list));
    const last = fin(list[list.length - 1]?.time);
    if (list.length < PAGE || last === null || last < cursor) break;
    cursor = last + 1;
    await sleep(PAGE_PAUSE_MS);
  }
  return out;
}

export interface Progress {
  pages: number;
  estimate: number;
}

export async function fetchFunding(coin: string, since: number, now: number, onProgress: (p: Progress) => void): Promise<FundingPoint[]> {
  const cached = await settingGet<FundingCache | null>(cacheKey(coin), null);
  const have = cleanFunding((cached?.pts ?? []).map(([hour, rate]) => ({ hour, rate })));
  const segments: [number, number][] = [];
  if (!cached || !have.length) segments.push([since, now]);
  else {
    if (since < cached.from) segments.push([since, cached.from]);
    segments.push([have[have.length - 1].hour + 1, now]);
  }
  const estimate = Math.max(1, segments.reduce((s, [a, b]) => s + Math.ceil((b - a) / HOUR_MS / PAGE), 0));
  let pages = 0;
  onProgress({ pages, estimate });
  const fresh: FundingPoint[] = [];
  for (const [a, b] of segments) {
    if (b - a < HOUR_MS) continue;
    fresh.push(...(await fetchRange(coin, a, b, () => onProgress({ pages: ++pages, estimate: Math.max(estimate, pages) }))));
  }
  const all = cleanFunding([...have, ...fresh]);
  await settingSet(cacheKey(coin), { from: Math.min(since, cached?.from ?? since), pts: all.map((p) => [p.hour, p.rate]) } satisfies FundingCache);
  return all.filter((p) => p.hour >= since);
}

export async function fetchCandles(coin: string, since: number, now: number): Promise<PriceBar[]> {
  return parseCandles(await infoWithBackoff({ type: 'candleSnapshot', req: { coin, interval: '4h', startTime: since - CANDLE_MS, endTime: now } }));
}

export interface CarryData {
  funding: FundingPoint[];
  prices: PriceBar[];
  maxLeverage: number | null;
  fetchedAt: number;
}

export function useCarryData(coin: string, days: number) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const query = useQuery({
    queryKey: ['carry-lab', coin, days],
    enabled: COIN_RE.test(coin),
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
    queryFn: async (): Promise<CarryData> => {
      const now = Date.now();
      const since = Math.floor((now - days * DAY_MS) / HOUR_MS) * HOUR_MS;
      const [meta, prices] = await Promise.all([infoWithBackoff({ type: 'meta' }), fetchCandles(coin, since, now)]);
      if (!prices.length) throw new Error('no-market');
      const funding = await fetchFunding(coin, since, now, setProgress);
      return { funding, prices, maxLeverage: parseMaxLeverage(meta, coin), fetchedAt: now };
    }
  });
  return { ...query, progress };
}

/* ---------------- شمارندهٔ آزمون‌ها (برای DSR) ---------------- */

const TRIALS_KEY = 'carrylab:trials';
type TrialBook = Record<string, { count: number; keys: string[] }>;

/** آزمون‌های قبلیِ همین دارایی بدون مطالعهٔ فعلی؛ مطالعهٔ تازه با gridSize پیکربندی ثبت می‌شود */
export async function recordTrials(coin: string, studyKey: string, gridSize: number): Promise<{ prior: number; total: number }> {
  const book = await settingGet<TrialBook>(TRIALS_KEY, {});
  const cur = book[coin] ?? { count: 0, keys: [] };
  if (cur.keys.includes(studyKey)) return { prior: cur.count - gridSize, total: cur.count };
  const next = { count: cur.count + gridSize, keys: [...cur.keys, studyKey].slice(-200) };
  await settingSet(TRIALS_KEY, { ...book, [coin]: next });
  return { prior: cur.count, total: next.count };
}

export async function resetTrials(coin: string): Promise<void> {
  const book = await settingGet<TrialBook>(TRIALS_KEY, {});
  delete book[coin];
  await settingSet(TRIALS_KEY, book);
}
