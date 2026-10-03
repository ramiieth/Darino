/** ============================================================
 * Car Market — نمای «مدل» (هر خودرو یک کارت) + وضعیت تولید
 *
 *  مبنای قیمت هر مدل = آخرین سال ساختی که قیمت بازار دارد (اگر یک سال چند
 *  ردیف دارد: ردیفی که قیمت بازارش تازه‌تر به‌روز شده). سال‌های دیگر در جزئیات.
 *
 *  وضعیت تولید/عرضه (سال جاری از تاریخ Snapshot):
 *   current   — مدل سال جاری دارد، یا کارخانه/نمایندگی قیمت اعلام کرده
 *   no-new    — آخرین مدل سال قبل است (مثلاً ۱۴۰۴) و قیمت کارخانه ندارد
 *   stopped   — آخرین مدل دو سال یا قدیمی‌تر، یا قیمت بازار بیش از ۹۰ روز
 *               به‌روز نشده، یا از فهرست car.ir حذف شده (آخرین قیمت ثبت‌شده)
 *  وارداتی (سال میلادی): مدل سال جاری یا قبل = جاری؛ ۲ سال قبل = no-new
 * ============================================================ */
import { toJalaali } from '../../../shared/utils/jalaliCore.js';
import type { DailyRates } from '../../../shared/fx/usdtHistory.js';
import { buildCarViews, snapshotUsdRate, viewOfRow, type CarView, type ChangePeriod, type PriceChange } from './changes.js';
import type { CarCategory, CarSnapshot } from './types.js';

const DAY_MS = 86_400_000;
/** قیمت بازار بیش از این به‌روز نشده → توقف تولید/عرضه */
const ABANDONED_MS = 90 * DAY_MS;
/** حداکثر عقب‌گرد برای یافتن مدل‌های حذف‌شده از منبع */
const DELISTED_LOOKBACK_MS = 400 * DAY_MS;

export type ProductionStatus = 'current' | 'no-new' | 'stopped';

export interface CarModelView {
  key: string;
  brand: string;
  brandFa: string;
  model: string;
  category: CarCategory;
  /** ردیف مبنای قیمت (آخرین سال ساخت) */
  basis: CarView;
  /** همه سال‌ها/تیپ‌ها — جدیدترین سال اول */
  trims: CarView[];
  latestYear: string;
  status: ProductionStatus;
  /** از فهرست امروز car.ir حذف شده */
  delisted: boolean;
  /** آخرین روزی که در منبع دیده شد (برای حذف‌شده‌ها) */
  lastSeenTs: number | null;
  change: PriceChange | null;
}

const yearNum = (y: string) => (Number.isFinite(Number(y)) ? Number(y) : 0);

/** مرتب‌سازی تیپ‌ها: سال جدیدتر، سپس قیمت تازه‌تر، سپس بدون گزینه */
function trimOrder(a: CarView, b: CarView): number {
  return (
    yearNum(b.row.year) - yearNum(a.row.year) ||
    Number(b.row.market !== null) - Number(a.row.market !== null) ||
    (b.row.marketUpdatedAt ?? 0) - (a.row.marketUpdatedAt ?? 0) ||
    Number(a.row.option !== null) - Number(b.row.option !== null)
  );
}

/**
 * وضعیت تولید از روی همه ردیف‌های مدل:
 *  newest = جدیدترین ردیف (حتی اگر فقط قیمت کارخانه داشته باشد)
 *  priced = ردیف مبنای قیمت بازار (برای تشخیص قیمت رهاشده)
 */
export function productionStatus(newest: CarView, priced: CarView, refTs: number, delisted: boolean, anyDealer = newest.row.dealer !== null): ProductionStatus {
  if (delisted) return 'stopped';
  const y = yearNum(newest.row.year);
  const jalali = y < 1500;
  const d = new Date(refTs);
  const cur = jalali ? toJalaali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()).year : d.getUTCFullYear();
  const age = cur - y;
  const abandoned = priced.row.marketUpdatedAt !== null && refTs - priced.row.marketUpdatedAt > ABANDONED_MS;
  if (abandoned && !anyDealer) return 'stopped';
  if (anyDealer) return 'current';
  if (jalali) return age <= 0 ? 'current' : age === 1 ? 'no-new' : 'stopped';
  return age <= 1 ? 'current' : age === 2 ? 'no-new' : 'stopped';
}

export const STATUS_FA: Record<ProductionStatus, string> = {
  current: 'در حال عرضه',
  'no-new': 'بدون مدل جدید',
  stopped: 'توقف تولید'
};

/** برچسب کوتاه وضعیت با سال (مثلاً «آخرین مدل ۱۴۰۴») */
export function statusLabel(m: Pick<CarModelView, 'status' | 'category'>): string {
  if (m.status === 'stopped') return m.category === 'imported' ? 'توقف واردات' : 'توقف تولید';
  return STATUS_FA[m.status];
}

function makeModel(trims: CarView[], refTs: number, delisted: boolean, lastSeenTs: number | null): CarModelView {
  const sorted = [...trims].sort(trimOrder);
  const newest = sorted[0];
  // مبنای قیمت: آخرین سال ساختی که قیمت بازار دارد (سال جدیدِ فقط‌کارخانه‌ای مبنا نیست)
  const basis = sorted.find((t) => t.row.market !== null) ?? newest;
  const newestYear = newest.row.year;
  const anyDealer = sorted.some((t) => t.row.year === newestYear && t.row.dealer !== null);
  return {
    key: basis.row.modelId,
    brand: basis.row.brand,
    brandFa: basis.brandFa,
    model: basis.row.model,
    category: basis.category,
    basis,
    trims: sorted,
    latestYear: newestYear,
    status: productionStatus(newest, basis, refTs, delisted, anyDealer),
    delisted,
    lastSeenTs,
    change: basis.change
  };
}

export interface ModelMarket {
  latest: CarSnapshot | null;
  base: CarSnapshot | null;
  latestRate: number | null;
  models: CarModelView[];
}

/**
 * همه مدل‌های بازار در دوره انتخابی:
 *  - مدل‌های فهرست امروز (با تغییر دوره)
 *  - مدل‌هایی که از فهرست car.ir حذف شده‌اند → آخرین قیمت ثبت‌شده، «توقف تولید»
 */
export function buildModelMarket(snaps: CarSnapshot[], p: ChangePeriod, daily: DailyRates): ModelMarket {
  const market = buildCarViews(snaps, p, daily);
  const latest = market.latest;
  if (!latest) return { ...market, models: [] };

  const groups = new Map<string, CarView[]>();
  for (const v of market.views) {
    const g = groups.get(v.row.modelId);
    if (g) g.push(v);
    else groups.set(v.row.modelId, [v]);
  }
  const models = [...groups.values()].map((g) => makeModel(g, latest.dateTs, false, null));

  // حذف‌شده‌ها: جدیدترین Snapshotی که مدل در آن بوده
  const seen = new Set(groups.keys());
  for (let i = snaps.length - 2; i >= 0; i--) {
    const s = snaps[i];
    if (latest.dateTs - s.dateTs > DELISTED_LOOKBACK_MS) break;
    const rate = snapshotUsdRate(s, daily);
    const gone = new Map<string, CarView[]>();
    for (const row of s.rows) {
      if (seen.has(row.modelId)) continue;
      const v = viewOfRow(row, s, rate);
      const g = gone.get(row.modelId);
      if (g) g.push(v);
      else gone.set(row.modelId, [v]);
    }
    for (const [id, g] of gone) {
      seen.add(id);
      models.push(makeModel(g, latest.dateTs, true, s.dateTs));
    }
  }
  return { latest, base: market.base, latestRate: market.latestRate, models };
}

export interface BrandSummary {
  brand: string;
  brandFa: string;
  models: number;
  /** میانگین ساده درصد تغییر مدل‌ها (فقط مدل‌های دارای تغییر) */
  tomanPct: number | null;
  usdPct: number | null;
  up: number;
  down: number;
  stopped: number;
  categories: CarCategory[];
  /** ارزان‌ترین و گران‌ترین قیمت بازار مدل‌ها */
  minToman: number | null;
  maxToman: number | null;
}

const avg = (xs: number[]): number | null => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function brandSummaries(models: CarModelView[]): BrandSummary[] {
  const map = new Map<string, CarModelView[]>();
  for (const m of models) {
    const g = map.get(m.brand);
    if (g) g.push(m);
    else map.set(m.brand, [m]);
  }
  return [...map.entries()].map(([brand, list]) => {
    const ch = list.map((m) => m.change).filter((c): c is PriceChange => c !== null);
    const prices = list.map((m) => m.basis.row.market).filter((x): x is number => x !== null);
    return {
      brand,
      brandFa: list[0].brandFa,
      models: list.length,
      tomanPct: avg(ch.map((c) => c.tomanPct)),
      usdPct: avg(ch.map((c) => c.usdPct).filter((x): x is number => x !== null)),
      up: ch.filter((c) => c.tomanPct > 0.05).length,
      down: ch.filter((c) => c.tomanPct < -0.05).length,
      stopped: list.filter((m) => m.status === 'stopped').length,
      categories: [...new Set(list.map((m) => m.category))],
      minToman: prices.length ? Math.min(...prices) : null,
      maxToman: prices.length ? Math.max(...prices) : null
    };
  });
}

export interface MarketSummary {
  models: number;
  withChange: number;
  tomanPct: number | null;
  usdPct: number | null;
  up: number;
  down: number;
  flat: number;
}

/** خلاصه بازار (فقط مدل‌های در حال عرضه/بدون مدل جدید — توقف تولید جدا) */
export function marketSummary(models: CarModelView[]): MarketSummary {
  const live = models.filter((m) => m.status !== 'stopped');
  const ch = live.map((m) => m.change).filter((c): c is PriceChange => c !== null);
  const up = ch.filter((c) => c.tomanPct > 0.05).length;
  const down = ch.filter((c) => c.tomanPct < -0.05).length;
  return {
    models: live.length,
    withChange: ch.length,
    tomanPct: avg(ch.map((c) => c.tomanPct)),
    usdPct: avg(ch.map((c) => c.usdPct).filter((x): x is number => x !== null)),
    up,
    down,
    flat: ch.length - up - down
  };
}
