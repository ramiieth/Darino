/** ============================================================
 * Property Market — تغییر قیمت دلاری در طول زمان (خالص، تست‌پذیر)
 *
 *  هر Snapshot با نرخ تتر «همان تاریخ» به دلار تبدیل می‌شود:
 *    ۱) نرخ زنده ثبت‌شده در لحظه ساخت Snapshot (والکس/بیت‌پین)
 *    ۲) نبود → نرخ روزانه تاریخچه تتر همان روز
 *    (نرخ دستی هرگز استفاده نمی‌شود)
 *  مقایسه: آخرین Snapshot در برابر Snapshot نزدیک به «N ماه پیش»
 *  (با حد تحمل)؛ نبود داده کافی → «در انتظار» + تاریخ در دسترس شدن.
 * ⚠️ هیچ داده گذشته‌ای ساخته/حدس زده نمی‌شود.
 * ============================================================ */
import type { AreaPriceStats, PropertyMarketSnapshot } from './types';
import { rateOnDate, type DailyRates } from '@/shared/fx/usdtHistory';
import { areaGroupOf } from '../data/catalog';
import type { PriceType } from './segments';

export const CHANGE_PERIODS_MONTHS = [1, 3, 6, 9, 12, 16, 24, 32, 36, 48, 60] as const;
export type ChangePeriod = (typeof CHANGE_PERIODS_MONTHS)[number];

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

export type RateSource = 'snapshot' | 'history';

export interface SnapshotRate {
  rate: number;
  source: RateSource;
}

/** نرخ تتر مؤثر یک Snapshot */
export function snapshotRate(s: PropertyMarketSnapshot, daily: DailyRates): SnapshotRate | null {
  const stored = s.fxRateAtSnapshotToman;
  if (stored && stored > 0 && s.fxSource !== 'manual-legacy') return { rate: stored, source: 'snapshot' };
  const hist = rateOnDate(daily, s.dateTs);
  return hist ? { rate: hist, source: 'history' } : null;
}

/** آمار یک منطقه در Snapshot — گروه، یا محله مستقل (Snapshotهای قدیمی کلید ادغامی را در neighborhoodStats داشتند) */
export function areaStatsOf(s: PropertyMarketSnapshot, key: string): AreaPriceStats | null {
  return (
    s.groupStats?.find((n) => n.neighborhoodKey === key)?.stats ??
    s.neighborhoodStats.find((n) => n.neighborhoodKey === key)?.stats ??
    null
  );
}

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

/** میانگین قیمت یک سال ساخت در یک منطقه — مقایسه فقط هم‌سال ساخت */
export function pointOf(
  s: PropertyMarketSnapshot,
  key: string,
  daily: DailyRates,
  type: PriceType
): PointValues | null {
  const ts = areaStatsOf(s, key)?.byType?.[type];
  const r = snapshotRate(s, daily);
  if (!ts || !r || ts.meanPpm === null) return null;
  return {
    snapshotId: s.id,
    dateTs: s.dateTs,
    rate: r.rate,
    rateSource: r.source,
    count: ts.count,
    ppmToman: ts.meanPpm,
    ppmUsd: ts.meanPpm / r.rate,
    totalToman: ts.meanTotal,
    totalUsd: ts.meanTotal !== null ? ts.meanTotal / r.rate : null
  };
}

function pct(from: number | null, to: number | null): number | null {
  if (from === null || to === null || !Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

export type ChangeStatus = 'ok' | 'pending' | 'no-area' | 'no-type' | 'no-rate' | 'no-data';

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

/** چرا نقطه‌ای در دسترس نیست: ناحیه/نوع ثبت نشده، یا نرخ تتر آن تاریخ */
function missingReason(s: PropertyMarketSnapshot, key: string, daily: DailyRates): ChangeStatus {
  if (!areaStatsOf(s, key)) return 'no-area';
  if (!snapshotRate(s, daily)) return 'no-rate';
  return 'no-type'; // ناحیه هست ولی این نوع قیمت آگهی نداشت (یا Snapshot قدیمی تفکیک نوع ندارد)
}

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
  type: PriceType
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
  const now = pointOf(current, key, daily, type);
  if (!now) {
    return { ...empty, status: missingReason(current, key, daily) };
  }
  const baseSnap = findBaseSnapshot(snaps, current, months);
  if (!baseSnap) {
    // هنوز داده آن‌قدر قدیمی نداریم → از چه تاریخی قابل نمایش است
    const first = snaps[0];
    const availableFrom = monthsAfter(first.dateTs, months);
    const tooEarly = monthsBefore(current.dateTs, months) < first.dateTs - toleranceMs(months);
    return { ...empty, now, status: tooEarly ? 'pending' : 'no-data', availableFrom: tooEarly ? availableFrom : null };
  }
  const base = pointOf(baseSnap, key, daily, type);
  if (!base) {
    return { ...empty, now, status: missingReason(baseSnap, key, daily) };
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
  type: PriceType
): ChangeRow[] {
  return CHANGE_PERIODS_MONTHS.map((m) => computeChange(snaps, key, m, daily, type));
}

export interface AreaChangeRow {
  key: string;
  displayName: string;
  change: ChangeRow;
}

/** رتبه‌بندی همه مناطق در یک دوره (رشد دلاری هر متر، نزولی) */
export function areaChanges(
  snapsIn: PropertyMarketSnapshot[],
  months: number,
  daily: DailyRates,
  type: PriceType
): AreaChangeRow[] {
  const snaps = ordered(snapsIn);
  const current = snaps[snaps.length - 1];
  if (!current) return [];
  const list = [...(current.groupStats ?? []), ...current.neighborhoodStats.filter((n) => !areaGroupOf(n.neighborhoodKey))];
  const rows = list.map((n) => ({
    key: n.neighborhoodKey,
    displayName: n.displayName,
    change: computeChange(snaps, n.neighborhoodKey, months, daily, type)
  }));
  rows.sort((a, b) => (b.change.ppmUsdPct ?? -Infinity) - (a.change.ppmUsdPct ?? -Infinity));
  return rows;
}

/** سری زمانی دلاری یک ناحیه (برای نمودار) */
export function usdSeries(
  snapsIn: PropertyMarketSnapshot[],
  key: string,
  daily: DailyRates,
  type: PriceType
): PointValues[] {
  return ordered(snapsIn)
    .map((s) => pointOf(s, key, daily, type))
    .filter((p): p is PointValues => p !== null);
}

/** قدیمی‌ترین تاریخی که نرخ تاریخچه برایش لازم است */
export function earliestSnapshotTs(snaps: PropertyMarketSnapshot[]): number | null {
  return snaps.length === 0 ? null : Math.min(...snaps.map((s) => s.dateTs));
}
