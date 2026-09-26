/** ============================================================
 * تاریخچه روزانه تتر (USDT/تومان) — برای تبدیل دلاری Snapshotهای گذشته
 *
 *  - بیت‌پین: GET https://api.bitpin.ir/v1/mkt/tv/get_bars/?symbol=USDT_IRT&res=1D&from&to
 *             → [{close, time(ms، شروع روز به وقت تهران)}] — CORS آزاد (مرورگر مستقیم)
 *  - والکس:   GET https://api.wallex.ir/v1/udf/history?symbol=USDTTMN&resolution=1D&from&to
 *             → {s:"ok", t:[sec], c:[close]} — CORS فقط wallex.ir (از مسیر سرور)
 *  کلید روز = تاریخ میلادی به وقت تهران (YYYY-MM-DD).
 * ⚠️ بدون alias «@/» — در فانکشن سرور هم import می‌شود.
 * ============================================================ */
import { isSaneUsdtPrice, type UsdtSource } from './usdtRate.js';

const TEHRAN_OFFSET_MS = 3.5 * 3600_000;
const DAY_MS = 86_400_000;

/** کلید روز به وقت تهران */
export function tehranDayKey(ts: number): string {
  return new Date(ts + TEHRAN_OFFSET_MS).toISOString().slice(0, 10);
}

export type DailyRates = Record<string, number>;

export function bitpinBarsUrl(fromSec: number, toSec: number): string {
  return `https://api.bitpin.ir/v1/mkt/tv/get_bars/?symbol=USDT_IRT&res=1D&from=${fromSec}&to=${toSec}`;
}

export function wallexHistoryUrl(fromSec: number, toSec: number): string {
  return `https://api.wallex.ir/v1/udf/history?symbol=USDTTMN&resolution=1D&from=${fromSec}&to=${toSec}`;
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function parseBitpinBars(json: unknown): DailyRates {
  const out: DailyRates = {};
  if (!Array.isArray(json)) return out;
  for (const b of json) {
    const r = b as { close?: unknown; time?: unknown; ts?: unknown };
    const close = num(r.close);
    const time = num(r.time) ?? (num(r.ts) !== null ? (num(r.ts) as number) * 1000 : null);
    if (time === null || !isSaneUsdtPrice(close)) continue;
    out[tehranDayKey(time)] = Math.round(close);
  }
  return out;
}

export function parseWallexHistory(json: unknown): DailyRates {
  const out: DailyRates = {};
  const r = json as { s?: unknown; t?: unknown; c?: unknown } | null;
  if (!r || r.s !== 'ok' || !Array.isArray(r.t) || !Array.isArray(r.c)) return out;
  for (let i = 0; i < r.t.length; i++) {
    const t = num(r.t[i]);
    const c = num(r.c[i]);
    if (t === null || !isSaneUsdtPrice(c)) continue;
    // والکس: شروع روز UTC → همان روز تقویمی
    out[new Date(t * 1000).toISOString().slice(0, 10)] = Math.round(c);
  }
  return out;
}

export function parseDailyRates(source: UsdtSource, json: unknown): DailyRates {
  return source === 'bitpin' ? parseBitpinBars(json) : parseWallexHistory(json);
}

/** نرخ روز مشخص؛ نبود داده آن روز (تعطیلی/خلأ) → نزدیک‌ترین روز قبل تا ۵ روز */
export function rateOnDate(rates: DailyRates, ts: number, maxBackDays = 5): number | null {
  for (let d = 0; d <= maxBackDays; d++) {
    const v = rates[tehranDayKey(ts - d * DAY_MS)];
    if (v !== undefined && isSaneUsdtPrice(v)) return v;
  }
  return null;
}

/** اولین/آخرین روز پوشش‌داده‌شده */
export function ratesCoverage(rates: DailyRates): { first: string | null; last: string | null; days: number } {
  const keys = Object.keys(rates).sort();
  return { first: keys[0] ?? null, last: keys[keys.length - 1] ?? null, days: keys.length };
}

/** واکشی مستقیم (سرور، یا مرورگر برای بیت‌پین) */
export async function fetchDailyRatesDirect(
  source: UsdtSource,
  fromTs: number,
  toTs: number,
  fetcher: (url: string, init?: RequestInit) => Promise<Response> = (u, i) => fetch(u, i),
  timeoutMs = 15_000
): Promise<DailyRates> {
  const from = Math.floor(fromTs / 1000);
  const to = Math.ceil(toTs / 1000);
  const url = source === 'bitpin' ? bitpinBarsUrl(from, to) : wallexHistoryUrl(from, to);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetcher(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rates = parseDailyRates(source, await res.json());
    if (Object.keys(rates).length === 0) throw new Error('empty history');
    return rates;
  } finally {
    clearTimeout(timer);
  }
}
