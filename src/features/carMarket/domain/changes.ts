/** ============================================================
 * Car Market — تغییر قیمت در دوره‌ها (تومانی و دلاری، خالص و تست‌پذیر)
 *
 *  آخرین Snapshot در برابر Snapshot نزدیک به «N روز پیش» (با حد تحمل).
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

export const CHANGE_PERIODS = [
  { key: '1d', days: 1, label: 'روزانه' },
  { key: '7d', days: 7, label: 'هفتگی' },
  { key: '30d', days: 30, label: 'ماهانه' },
  { key: '90d', days: 90, label: '۳ ماهه' },
  { key: '365d', days: 365, label: 'سالانه' }
] as const;
export type PeriodKey = (typeof CHANGE_PERIODS)[number]['key'];

export function periodDays(key: PeriodKey): number {
  return CHANGE_PERIODS.find((p) => p.key === key)?.days ?? 1;
}

/** قیمت بازار قدیمی‌تر از این (نسبت به Snapshot) → «به‌روز نشده» */
const STALE_PRICE_MS = 21 * DAY_MS;

/** نرخ تتر مؤثر یک Snapshot */
export function snapshotUsdRate(s: CarSnapshot, daily: DailyRates): number | null {
  if (s.usdtRate && s.usdtRate > 0) return s.usdtRate;
  return rateOnDate(daily, s.dateTs);
}

/**
 * Snapshot مبنا برای «N روز پیش».
 * روزانه: نزدیک‌ترین Snapshot بین ۰٫۵ تا ۳ روز قبل (تعطیلی منبع/کاربر)
 * بقیه: فاصله از هدف حداکثر ۲۰٪ دوره (حداقل ۲ روز)
 */
export function findBaseSnapshot(snaps: CarSnapshot[], latest: CarSnapshot, days: number): CarSnapshot | null {
  const target = latest.dateTs - days * DAY_MS;
  let best: CarSnapshot | null = null;
  let bestDist = Infinity;
  for (const s of snaps) {
    const gap = latest.dateTs - s.dateTs;
    if (gap < 0.5 * DAY_MS) continue;
    const ok = days <= 1 ? gap <= 3 * DAY_MS : Math.abs(s.dateTs - target) <= Math.max(2, days * 0.2) * DAY_MS;
    if (!ok) continue;
    const dist = Math.abs(s.dateTs - target);
    if (dist < bestDist) {
      best = s;
      bestDist = dist;
    }
  }
  return best;
}

/** زودترین زمانی که دوره قابل نمایش می‌شود */
export function periodAvailableFrom(snaps: CarSnapshot[], days: number): number | null {
  if (snaps.length === 0) return null;
  const tol = days <= 1 ? 0 : Math.max(2, days * 0.2);
  return snaps[0].dateTs + (days - tol) * DAY_MS;
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
  /** معادل دلاری قیمت بازار با نرخ آخرین Snapshot */
  marketUsd: number | null;
  /** اختلاف بازار با کارخانه (٪) — «حباب» */
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

/** ردیف‌های آخرین Snapshot + تغییر در دوره انتخابی */
export function buildCarViews(snaps: CarSnapshot[], days: number, daily: DailyRates): MarketViews {
  const latest = snaps.length > 0 ? snaps[snaps.length - 1] : null;
  if (!latest) return { latest: null, base: null, latestRate: null, views: [] };
  const latestRate = snapshotUsdRate(latest, daily);
  const base = findBaseSnapshot(snaps, latest, days);
  const baseRate = base ? snapshotUsdRate(base, daily) : null;
  const baseRows = new Map((base?.rows ?? []).map((r) => [r.id, r]));

  const views = latest.rows.map((row): CarView => {
    let change: PriceChange | null = null;
    const b = baseRows.get(row.id);
    if (base && b?.market && row.market) {
      change = priceChange({ toman: b.market, rate: baseRate, ts: base.dateTs }, { toman: row.market, rate: latestRate }, 'snapshot');
    } else if (
      !base &&
      days <= 1 &&
      row.market &&
      row.srcChangePct !== null &&
      row.marketUpdatedAt !== null &&
      latest.dateTs - row.marketUpdatedAt <= 1.5 * DAY_MS
    ) {
      // تغییر اعلامی منبع نسبت به به‌روزرسانی قبلی (حدوداً دیروز)
      const prevTs = row.marketUpdatedAt - DAY_MS;
      const from = row.market / (1 + row.srcChangePct / 100);
      change = priceChange({ toman: from, rate: rateOnDate(daily, prevTs) ?? null, ts: prevTs }, { toman: row.market, rate: latestRate }, 'source');
    }
    return {
      row,
      brandFa: brandInfo(row.brand, latest.brandNames[row.brand]).fa,
      category: categoryOf(row.brand, row.year),
      marketUsd: row.market && latestRate ? row.market / latestRate : null,
      gapPct: row.market && row.dealer ? ((row.market - row.dealer) / row.dealer) * 100 : null,
      stale: row.marketUpdatedAt !== null && latest.dateTs - row.marketUpdatedAt > STALE_PRICE_MS,
      change
    };
  });
  return { latest, base, latestRate, views };
}

export interface TrimPeriodChange {
  key: PeriodKey;
  label: string;
  days: number;
  change: PriceChange | null;
  /** نبود داده → زودترین زمان قابل نمایش */
  availableFrom: number | null;
}

/** تغییر یک تیپ در همه دوره‌ها (جزئیات خودرو) */
export function trimChanges(snaps: CarSnapshot[], id: string, daily: DailyRates): TrimPeriodChange[] {
  return CHANGE_PERIODS.map((p) => {
    const v = buildCarViews(snaps, p.days, daily).views.find((x) => x.row.id === id);
    const change = v?.change ?? null;
    return {
      key: p.key,
      label: p.label,
      days: p.days,
      change,
      availableFrom: change ? null : periodAvailableFrom(snaps, p.days)
    };
  });
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

export interface BrandSummary {
  brand: string;
  brandFa: string;
  count: number;
  /** میانگین ساده درصد تغییر تیپ‌ها */
  tomanPct: number | null;
  usdPct: number | null;
  up: number;
  down: number;
  categories: CarCategory[];
}

const avg = (xs: number[]): number | null => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function brandSummaries(views: CarView[]): BrandSummary[] {
  const map = new Map<string, CarView[]>();
  for (const v of views) {
    if (!map.has(v.row.brand)) map.set(v.row.brand, []);
    map.get(v.row.brand)!.push(v);
  }
  return [...map.entries()].map(([brand, list]) => {
    const ch = list.map((v) => v.change).filter((c): c is PriceChange => c !== null);
    return {
      brand,
      brandFa: list[0].brandFa,
      count: list.length,
      tomanPct: avg(ch.map((c) => c.tomanPct)),
      usdPct: avg(ch.map((c) => c.usdPct).filter((x): x is number => x !== null)),
      up: ch.filter((c) => c.tomanPct > 0.05).length,
      down: ch.filter((c) => c.tomanPct < -0.05).length,
      categories: [...new Set(list.map((v) => v.category))]
    };
  });
}
