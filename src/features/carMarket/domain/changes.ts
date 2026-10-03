/** ============================================================
 * Car Market — تغییر قیمت در دوره‌ها (تومانی و دلاری، خالص و تست‌پذیر)
 *
 *  دوره‌ها: روزانه، هفتگی، و ۱ تا ۷۲ ماهه (ماه تقویمی).
 *  آخرین Snapshot در برابر Snapshot نزدیک به «آغاز دوره» (با حد تحمل).
 *  هر Snapshot با نرخ تتر همان روز به دلار تبدیل می‌شود:
 *    ۱) نرخ زنده ثبت‌شده هنگام واکشی  ۲) نبود → نرخ روزانه تاریخچه تتر
 *  دوره «روزانه» تا وقتی Snapshot دیروز نداریم از درصد تغییر خود منبع
 *  (car.ir) ساخته می‌شود و با basis='source' علامت می‌خورد.
 * ⚠️ هیچ قیمت گذشته‌ای حدس زده نمی‌شود.
 * ============================================================ */
import { rateOnDate, type DailyRates } from '../../../shared/fx/usdtHistory.js';
import { brandInfo, categoryOf } from './brands.js';
import type { CarCategory, CarPriceRow, CarSnapshot } from './types.js';

const DAY_MS = 86_400_000;
const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n: number) => String(n).replace(/\d/g, (d) => FA[Number(d)]);

export interface ChangePeriod {
  key: string;
  label: string;
  /** دوره روزی (روزانه/هفتگی) */
  days?: number;
  /** دوره ماه تقویمی */
  months?: number;
}

export const CHANGE_MONTHS = [1, 3, 6, 9, 12, 15, 18, 21, 24, 30, 36, 42, 48, 54, 60, 66, 72] as const;

export const CHANGE_PERIODS: readonly ChangePeriod[] = [
  { key: '1d', label: 'روزانه', days: 1 },
  { key: '7d', label: 'هفتگی', days: 7 },
  ...CHANGE_MONTHS.map((m) => ({ key: `${m}m`, label: `${fa(m)} ماهه`, months: m }))
];
export type PeriodKey = string;

export function periodOf(key: PeriodKey): ChangePeriod {
  return CHANGE_PERIODS.find((p) => p.key === key) ?? CHANGE_PERIODS[0];
}

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

/** زمان «آغاز دوره» نسبت به ts */
export function periodStart(ts: number, p: ChangePeriod): number {
  return p.months ? monthsBefore(ts, p.months) : ts - (p.days ?? 1) * DAY_MS;
}

/** حد تحمل فاصله Snapshot مبنا از آغاز دوره */
export function periodTolerance(p: ChangePeriod): number {
  if (p.months) return Math.min(45, Math.max(4, p.months * 30 * 0.2)) * DAY_MS;
  return Math.max(2, (p.days ?? 1) * 0.2) * DAY_MS;
}

/** قیمت بازار قدیمی‌تر از این (نسبت به Snapshot) → «به‌روز نشده» */
export const STALE_PRICE_MS = 21 * DAY_MS;

/** نرخ تتر مؤثر یک Snapshot */
export function snapshotUsdRate(s: CarSnapshot, daily: DailyRates): number | null {
  if (s.usdtRate && s.usdtRate > 0) return s.usdtRate;
  return rateOnDate(daily, s.dateTs);
}

/**
 * Snapshot مبنا برای دوره.
 * روزانه: نزدیک‌ترین Snapshot بین ۰٫۵ تا ۳ روز قبل (تعطیلی منبع/کاربر)
 * بقیه: نزدیک‌ترین به آغاز دوره، در حد تحمل
 */
export function findBaseSnapshot(snaps: CarSnapshot[], latest: CarSnapshot, p: ChangePeriod): CarSnapshot | null {
  const target = periodStart(latest.dateTs, p);
  const daily = !p.months && (p.days ?? 1) <= 1;
  const tol = periodTolerance(p);
  let best: CarSnapshot | null = null;
  let bestDist = Infinity;
  for (const s of snaps) {
    const gap = latest.dateTs - s.dateTs;
    if (gap < 0.5 * DAY_MS) continue;
    const ok = daily ? gap <= 3 * DAY_MS : Math.abs(s.dateTs - target) <= tol;
    if (!ok) continue;
    const dist = Math.abs(s.dateTs - target);
    if (dist < bestDist) {
      best = s;
      bestDist = dist;
    }
  }
  return best;
}

/** زودترین زمانی که دوره قابل نمایش می‌شود (بر اساس اولین Snapshot) */
export function periodAvailableFrom(snaps: CarSnapshot[], p: ChangePeriod): number | null {
  if (snaps.length === 0) return null;
  const first = snaps[0].dateTs;
  if (!p.months && (p.days ?? 1) <= 1) return first + DAY_MS;
  // کوچک‌ترین ts که آغاز دوره‌اش به اولین Snapshot (منهای تحمل) برسد
  const span = (p.months ? p.months * 30.44 : (p.days ?? 1)) * DAY_MS;
  return first + span - periodTolerance(p);
}

export interface PriceChange {
  baseTs: number;
  /** snapshot = مقایسه دو Snapshot خودمان · source = درصد تغییر اعلامی منبع */
  basis: 'snapshot' | 'source';
  fromToman: number;
  toToman: number;
  tomanAbs: number;
  tomanPct: number;
  fromUsd: number | null;
  toUsd: number | null;
  usdAbs: number | null;
  usdPct: number | null;
}

export function priceChange(
  from: { toman: number; rate: number | null; ts: number },
  to: { toman: number; rate: number | null },
  basis: PriceChange['basis']
): PriceChange {
  const fromUsd = from.rate ? from.toman / from.rate : null;
  const toUsd = to.rate ? to.toman / to.rate : null;
  return {
    baseTs: from.ts,
    basis,
    fromToman: from.toman,
    toToman: to.toman,
    tomanAbs: to.toman - from.toman,
    tomanPct: ((to.toman - from.toman) / from.toman) * 100,
    fromUsd,
    toUsd,
    usdAbs: fromUsd !== null && toUsd !== null ? toUsd - fromUsd : null,
    usdPct: fromUsd !== null && toUsd !== null ? ((toUsd - fromUsd) / fromUsd) * 100 : null
  };
}

export interface CarView {
  row: CarPriceRow;
  brandFa: string;
  category: CarCategory;
  /** معادل دلاری قیمت بازار با نرخ Snapshot مرجع */
  marketUsd: number | null;
  /** اختلاف بازار با کارخانه (٪) */
  gapPct: number | null;
  /** قیمت بازار بیش از ۳ هفته در منبع به‌روز نشده */
  stale: boolean;
  change: PriceChange | null;
}

export interface MarketViews {
  latest: CarSnapshot | null;
  base: CarSnapshot | null;
  latestRate: number | null;
  views: CarView[];
}

/** ساخت نمای یک ردیف (بدون تغییر) */
export function viewOfRow(row: CarPriceRow, snap: CarSnapshot, rate: number | null): CarView {
  return {
    row,
    brandFa: brandInfo(row.brand, snap.brandNames[row.brand]).fa,
    category: categoryOf(row.brand, row.year),
    marketUsd: row.market && rate ? row.market / rate : null,
    gapPct: row.market && row.dealer ? ((row.market - row.dealer) / row.dealer) * 100 : null,
    stale: row.marketUpdatedAt !== null && snap.dateTs - row.marketUpdatedAt > STALE_PRICE_MS,
    change: null
  };
}

/** ردیف‌های آخرین Snapshot + تغییر در دوره انتخابی */
export function buildCarViews(snaps: CarSnapshot[], p: ChangePeriod, daily: DailyRates): MarketViews {
  const latest = snaps.length > 0 ? snaps[snaps.length - 1] : null;
  if (!latest) return { latest: null, base: null, latestRate: null, views: [] };
  const latestRate = snapshotUsdRate(latest, daily);
  const base = findBaseSnapshot(snaps, latest, p);
  const baseRate = base ? snapshotUsdRate(base, daily) : null;
  const baseRows = new Map((base?.rows ?? []).map((r) => [r.id, r]));
  const isDaily = !p.months && (p.days ?? 1) <= 1;

  const views = latest.rows.map((row): CarView => {
    const v = viewOfRow(row, latest, latestRate);
    const b = baseRows.get(row.id);
    if (base && b?.market && row.market) {
      v.change = priceChange({ toman: b.market, rate: baseRate, ts: base.dateTs }, { toman: row.market, rate: latestRate }, 'snapshot');
    } else if (
      !base &&
      isDaily &&
      row.market &&
      row.srcChangePct !== null &&
      row.marketUpdatedAt !== null &&
      latest.dateTs - row.marketUpdatedAt <= 1.5 * DAY_MS
    ) {
      // تغییر اعلامی منبع نسبت به به‌روزرسانی قبلی (حدوداً دیروز)
      const prevTs = row.marketUpdatedAt - DAY_MS;
      const from = row.market / (1 + row.srcChangePct / 100);
      v.change = priceChange({ toman: from, rate: rateOnDate(daily, prevTs) ?? null, ts: prevTs }, { toman: row.market, rate: latestRate }, 'source');
    }
    return v;
  });
  return { latest, base, latestRate, views };
}

export interface SeriesPoint {
  ts: number;
  toman: number;
  usd: number | null;
}

/** روند قیمت بازار یک تیپ در همه Snapshotها */
export function priceSeries(snaps: CarSnapshot[], id: string, daily: DailyRates): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (const s of snaps) {
    const r = s.rows.find((x) => x.id === id);
    if (!r?.market) continue;
    const rate = snapshotUsdRate(s, daily);
    out.push({ ts: s.dateTs, toman: r.market, usd: rate ? r.market / rate : null });
  }
  return out;
}

export interface TrimPeriodChange {
  period: ChangePeriod;
  change: PriceChange | null;
  /** نبود داده → زودترین زمان قابل نمایش */
  availableFrom: number | null;
}

/** تغییر یک تیپ در همه دوره‌ها (جزئیات خودرو) */
export function trimChanges(snaps: CarSnapshot[], id: string, daily: DailyRates): TrimPeriodChange[] {
  return CHANGE_PERIODS.map((p) => {
    const v = buildCarViews(snaps, p, daily).views.find((x) => x.row.id === id);
    const change = v?.change ?? null;
    return { period: p, change, availableFrom: change ? null : periodAvailableFrom(snaps, p) };
  });
}

/** روند همه تیپ‌ها در یک گذر (برای نمودارک کارت‌ها) */
export function seriesIndex(snaps: CarSnapshot[], daily: DailyRates): Map<string, SeriesPoint[]> {
  const out = new Map<string, SeriesPoint[]>();
  for (const s of snaps) {
    const rate = snapshotUsdRate(s, daily);
    for (const r of s.rows) {
      if (!r.market) continue;
      const p = { ts: s.dateTs, toman: r.market, usd: rate ? r.market / rate : null };
      const list = out.get(r.id);
      if (list) list.push(p);
      else out.set(r.id, [p]);
    }
  }
  return out;
}
