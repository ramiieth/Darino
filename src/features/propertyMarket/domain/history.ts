/** ============================================================
 * Property Market — تغییر قیمت دلاری در طول زمان (خالص، تست‌پذیر)
 *
 *  هر Snapshot با نرخ تتر «همان تاریخ» به دلار تبدیل می‌شود:
 *    ۱) نرخ زنده ثبت‌شده در لحظه ساخت Snapshot (والکس/بیت‌پین)
 *    ۲) نبود → نرخ روزانه تاریخچه تتر همان روز
 *    ۳) نبود → نرخ دستی ماژول قدیمی (برچسب‌دار)
 *  مقایسه: آخرین Snapshot در برابر Snapshot نزدیک به «N ماه پیش»
 *  (با حد تحمل)؛ نبود داده کافی → «در انتظار» + تاریخ در دسترس شدن.
 * ⚠️ هیچ داده گذشته‌ای ساخته/حدس زده نمی‌شود.
 * ============================================================ */
import type { AreaPriceStats, PropertyMarketSnapshot } from './types';
import { rateOnDate, type DailyRates } from '@/shared/fx/usdtHistory';
import { areaGroupOf } from '../data/catalog';

export const CHANGE_PERIODS_MONTHS = [1, 3, 6, 9, 12, 16, 24, 32, 36] as const;
export type ChangePeriod = (typeof CHANGE_PERIODS_MONTHS)[number];

/** کلید «کل اهواز» */
export const CITY_KEY = '__city__';

const DAY_MS = 86_400_000;

/** N ماه تقویمی قبل (روز ماه حفظ می‌شود؛ ۳۱ → آخر ماه) */
export function monthsBefore(ts: number, months: number): number {
  const d = new Date(ts);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.getTime();
}

export function monthsAfter(ts: number, months: number): number {
  return monthsBefore(ts, -months);
}

/** حد تحمل فاصله Snapshot مبنا از هدف: ۲۰٪ دوره، بین ۷ تا ۴۵ روز */
export function toleranceMs(months: number): number {
  return Math.min(45, Math.max(7, months * 30 * 0.2)) * DAY_MS;
}

export type RateSource = 'snapshot' | 'history' | 'legacy';

export interface SnapshotRate {
  rate: number;
  source: RateSource;
}

/** نرخ تتر مؤثر یک Snapshot */
export function snapshotRate(s: PropertyMarketSnapshot, daily: DailyRates): SnapshotRate | null {
  const stored = s.fxRateAtSnapshotToman;
  if (stored && stored > 0 && s.fxSource !== 'manual-legacy') return { rate: stored, source: 'snapshot' };
  const hist = rateOnDate(daily, s.dateTs);
  if (hist) return { rate: hist, source: 'history' };
  if (stored && stored > 0) return { rate: stored, source: 'legacy' };
  return null;
}

/** آمار یک ناحیه در Snapshot (کل اهواز یا یک محله) */
export function areaStatsOf(s: PropertyMarketSnapshot, key: string): AreaPriceStats | null {
  if (key === CITY_KEY) return s.cityStats;
  // محله → سپس منطقه (Snapshotهای قدیمی کلید ادغامی را در neighborhoodStats داشتند)
  return (
    s.neighborhoodStats.find((n) => n.neighborhoodKey === key)?.stats ??
    s.groupStats?.find((n) => n.neighborhoodKey === key)?.stats ??
    null
  );
}

/** شاخص قیمت: میانه (مقاوم در برابر آگهی‌های استثنایی) یا میانگین */
export type PriceMetric = 'median' | 'mean';

export interface PointValues {
  snapshotId: string;
  dateTs: number;
  rate: number;
  rateSource: RateSource;
  count: number;
  ppmToman: number | null;
  ppmUsd: number | null;
  totalToman: number | null;
  totalUsd: number | null;
}

export function pointOf(
  s: PropertyMarketSnapshot,
  key: string,
  daily: DailyRates,
  metric: PriceMetric = 'median'
): PointValues | null {
  const st = areaStatsOf(s, key);
  const r = snapshotRate(s, daily);
  const ppm = st ? (metric === 'mean' ? st.meanTomanPerM2 : st.medianTomanPerM2) : null;
  if (!st || !r || ppm === null) return null;
  const total = (metric === 'mean' ? st.meanTotalToman : st.medianTotalToman) ?? null;
  return {
    snapshotId: s.id,
    dateTs: s.dateTs,
    rate: r.rate,
    rateSource: r.source,
    count: st.listingCount,
    ppmToman: ppm,
    ppmUsd: ppm / r.rate,
    totalToman: total,
    totalUsd: total !== null ? total / r.rate : null
  };
}

function pct(from: number | null, to: number | null): number | null {
  if (from === null || to === null || !Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

export type ChangeStatus = 'ok' | 'pending' | 'no-area' | 'no-rate' | 'no-data';

export interface ChangeRow {
  months: number;
  status: ChangeStatus;
  /** وقتی pending: از چه تاریخی قابل نمایش می‌شود */
  availableFrom: number | null;
  base: PointValues | null;
  now: PointValues | null;
  ppmUsdPct: number | null;
  totalUsdPct: number | null;
  ppmTomanPct: number | null;
  totalTomanPct: number | null;
  ratePct: number | null;
  /** نمونه کم در یکی از دو سر (کمتر از ۳ آگهی) */
  lowSample: boolean;
}

export const MIN_SAMPLE_FOR_CHANGE = 3;

/** Snapshotهای قابل مقایسه (مرتب قدیم→جدید) */
function ordered(snaps: PropertyMarketSnapshot[]): PropertyMarketSnapshot[] {
  return [...snaps].filter((s) => Number.isFinite(s.dateTs)).sort((a, b) => a.dateTs - b.dateTs);
}

/** Snapshot مبنا برای «N ماه پیش» نسبت به Snapshot فعلی */
export function findBaseSnapshot(
  snaps: PropertyMarketSnapshot[],
  current: PropertyMarketSnapshot,
  months: number
): PropertyMarketSnapshot | null {
  const target = monthsBefore(current.dateTs, months);
  const tol = toleranceMs(months);
  let best: PropertyMarketSnapshot | null = null;
  for (const s of snaps) {
    if (s.id === current.id) continue;
    // مبنا باید حداقل نیمی از دوره قدیمی‌تر از Snapshot فعلی باشد
    if (current.dateTs - s.dateTs < (months * 30 * DAY_MS) / 2) continue;
    const d = Math.abs(s.dateTs - target);
    if (d > tol) continue;
    if (!best || d < Math.abs(best.dateTs - target)) best = s;
  }
  return best;
}

/** تغییر یک ناحیه در یک دوره */
export function computeChange(
  snapsIn: PropertyMarketSnapshot[],
  key: string,
  months: number,
  daily: DailyRates,
  metric: PriceMetric = 'median'
): ChangeRow {
  const snaps = ordered(snapsIn);
  const empty: ChangeRow = {
    months,
    status: 'no-data',
    availableFrom: null,
    base: null,
    now: null,
    ppmUsdPct: null,
    totalUsdPct: null,
    ppmTomanPct: null,
    totalTomanPct: null,
    ratePct: null,
    lowSample: false
  };
  const current = snaps[snaps.length - 1];
  if (!current) return empty;
  const now = pointOf(current, key, daily, metric);
  if (!now) {
    return { ...empty, status: areaStatsOf(current, key) ? 'no-rate' : 'no-area' };
  }
  const baseSnap = findBaseSnapshot(snaps, current, months);
  if (!baseSnap) {
    // هنوز داده آن‌قدر قدیمی نداریم → از چه تاریخی قابل نمایش است
    const first = snaps[0];
    const availableFrom = monthsAfter(first.dateTs, months);
    const tooEarly = monthsBefore(current.dateTs, months) < first.dateTs - toleranceMs(months);
    return { ...empty, now, status: tooEarly ? 'pending' : 'no-data', availableFrom: tooEarly ? availableFrom : null };
  }
  const base = pointOf(baseSnap, key, daily, metric);
  if (!base) {
    return { ...empty, now, status: areaStatsOf(baseSnap, key) ? 'no-rate' : 'no-area' };
  }
  return {
    months,
    status: 'ok',
    availableFrom: null,
    base,
    now,
    ppmUsdPct: pct(base.ppmUsd, now.ppmUsd),
    totalUsdPct: pct(base.totalUsd, now.totalUsd),
    ppmTomanPct: pct(base.ppmToman, now.ppmToman),
    totalTomanPct: pct(base.totalToman, now.totalToman),
    ratePct: pct(base.rate, now.rate),
    lowSample: base.count < MIN_SAMPLE_FOR_CHANGE || now.count < MIN_SAMPLE_FOR_CHANGE
  };
}

/** همه دوره‌ها برای یک ناحیه */
export function changeTable(
  snaps: PropertyMarketSnapshot[],
  key: string,
  daily: DailyRates,
  metric: PriceMetric = 'median'
): ChangeRow[] {
  return CHANGE_PERIODS_MONTHS.map((m) => computeChange(snaps, key, m, daily, metric));
}

export interface NeighborhoodChangeRow {
  key: string;
  displayName: string;
  change: ChangeRow;
  /** اختلاف رشد دلاری هر متر محله با کل اهواز (واحد درصد) */
  vsCityPp: number | null;
}

/** رتبه‌بندی همه محله‌ها در یک دوره (+ مقایسه با کل اهواز) */
export function neighborhoodChanges(
  snapsIn: PropertyMarketSnapshot[],
  months: number,
  daily: DailyRates,
  opts: { level?: 'neighborhood' | 'group'; metric?: PriceMetric } = {}
): { city: ChangeRow; rows: NeighborhoodChangeRow[] } {
  const metric = opts.metric ?? 'median';
  const snaps = ordered(snapsIn);
  const city = computeChange(snaps, CITY_KEY, months, daily, metric);
  const current = snaps[snaps.length - 1];
  if (!current) return { city, rows: [] };
  // منطقه = گروه‌ها + محله‌های مستقل (مثل گلستان) — کل اهواز پوشش داده می‌شود
  const list =
    opts.level === 'group'
      ? [...(current.groupStats ?? []), ...current.neighborhoodStats.filter((n) => !areaGroupOf(n.neighborhoodKey))]
      : current.neighborhoodStats;
  const rows = list.map((n) => {
    const change = computeChange(snaps, n.neighborhoodKey, months, daily, metric);
    const vsCityPp =
      change.ppmUsdPct !== null && city.ppmUsdPct !== null ? change.ppmUsdPct - city.ppmUsdPct : null;
    return { key: n.neighborhoodKey, displayName: n.displayName, change, vsCityPp };
  });
  rows.sort((a, b) => (b.change.ppmUsdPct ?? -Infinity) - (a.change.ppmUsdPct ?? -Infinity));
  return { city, rows };
}

/** سری زمانی دلاری یک ناحیه (برای نمودار) */
export function usdSeries(
  snapsIn: PropertyMarketSnapshot[],
  key: string,
  daily: DailyRates,
  metric: PriceMetric = 'median'
): PointValues[] {
  return ordered(snapsIn)
    .map((s) => pointOf(s, key, daily, metric))
    .filter((p): p is PointValues => p !== null);
}

/** قدیمی‌ترین تاریخی که نرخ تاریخچه برایش لازم است */
export function earliestSnapshotTs(snaps: PropertyMarketSnapshot[]): number | null {
  return snaps.length === 0 ? null : Math.min(...snaps.map((s) => s.dateTs));
}
