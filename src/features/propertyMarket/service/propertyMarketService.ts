/** ============================================================
 * Property Market Service — تنها مسیر محاسبات بازار → UI (§۲۶)
 *
 *   PropertyMarketService → Market Statistics → FX Conversion
 *     → Scenario Engine → UI
 *
 * ⚠️ هیچ تبدیل تومان/دلار یا محاسبه سناریویی در کامپوننت React نیست.
 * ⚠️ نرخ‌ها از منبع موجود دارینو (fx_rates) می‌آیند — اینجا فقط مصرف.
 * ============================================================ */
import { calculateUsdScenario } from '../domain/scenarioEngine';
import { buildCityStats, buildNeighborhoodStats } from '../domain/stats';
import { changePercent, classifyPosition, relativePercent, tomanToUsd } from '../domain/fx';
import type {
  AreaPriceStats,
  MarketPosition,
  PropertyCity,
  PropertyMarketListing,
  PropertyMarketScenario,
  PropertyMarketSnapshot
} from '../domain/types';
import { neighborhoodDisplayName } from '../data/catalog';

/** ورودی نرخ‌ها — هر دو از منبع موجود دلار در دارینو تغذیه می‌شوند */
export interface FxInput {
  /** نرخ دلار فعلی (تومان بر دلار) — از fx_rates */
  currentUsdRateToman: number | null;
  /** نرخ دلار آینده (تومان بر دلار) — سناریو؛ پیش‌فرض = همان نرخ فعلی */
  futureUsdRateToman: number | null;
  /** فرض اختیاری رشد تومانی قیمت ملک (٪) — سناریو B */
  propertyTomanGrowthPct?: number | null;
}

export interface NeighborhoodMarketRow {
  neighborhoodKey: string;
  displayName: string;
  listingCount: number;
  medianTomanPerM2: number | null;
  meanTomanPerM2: number | null;
  p25TomanPerM2: number | null;
  p75TomanPerM2: number | null;
  currentUsdPerM2: number | null;
  /** قیمت تومانی مؤثر در سناریو آینده (سناریو B ≠ A) */
  futureTomanPerM2: number | null;
  futureUsdPerM2: number | null;
  usdChangePercent: number | null;
  tomanChangePercent: number | null;
  /** موقعیت فعلی نسبت به میانه اهواز (٪) */
  positionVsCityPct: number | null;
  /** موقعیت در سناریو آینده نسبت به میانه اهواز (٪) */
  futurePositionVsCityPct: number | null;
  position: MarketPosition | null;
}

export interface PropertyMarketView {
  city: PropertyCity;
  generatedAt: number;
  lastPropertyUpdate: number | null;
  currentUsdRateToman: number | null;
  futureUsdRateToman: number | null;
  scenarioBasis: 'constant-property' | 'explicit-property';
  propertyTomanGrowthPct: number | null;
  totalListings: number;
  cityStatsToman: AreaPriceStats;
  cityCurrentUsdPerM2: number | null;
  cityFutureUsdPerM2: number | null;
  cityUsdChangePercent: number | null;
  rows: NeighborhoodMarketRow[];
}

export type MarketSortKey =
  | 'toman'
  | 'usd'
  | 'futureUsd'
  | 'usdChange'
  | 'distanceFromMedian';

export const MARKET_SORT_FA: Record<MarketSortKey, string> = {
  toman: 'تومان/متر',
  usd: 'دلار/متر (فعلی)',
  futureUsd: 'دلار/متر (آینده)',
  usdChange: 'تغییر دلاری',
  distanceFromMedian: 'فاصله از میانه اهواز'
};

/** رشد تومانی سناریو → قیمت تومانی آینده (فرض صریح؛ نه پیش‌بینی) */
export function applyPropertyGrowth(currentToman: number, growthPct: number | null | undefined): number {
  if (growthPct === null || growthPct === undefined || !Number.isFinite(growthPct)) return currentToman;
  return currentToman * (1 + growthPct / 100);
}

/** ساخت ویوی بازار از «فهرست آگهی‌های پاک‌سازی‌شده» + نرخ‌ها */
export function buildMarketView(opts: {
  listings: PropertyMarketListing[];
  fx: FxInput;
  city?: PropertyCity;
  lastPropertyUpdate?: number | null;
}): PropertyMarketView {
  const city = opts.city ?? 'ahvaz';
  const listings = opts.listings;
  const cityStats = buildCityStats(listings);
  const growth = opts.fx.propertyTomanGrowthPct ?? null;

  const currentRate = opts.fx.currentUsdRateToman;
  const futureRate = opts.fx.futureUsdRateToman ?? currentRate;

  const cityMedian = cityStats.medianTomanPerM2;
  const cityScenario =
    cityMedian !== null && currentRate !== null && futureRate !== null
      ? safeScenario(cityMedian, currentRate, futureRate, growth)
      : null;

  // محله‌ها
  const keys = [...new Set(listings.map((l) => l.neighborhoodKey).filter((k): k is string => !!k))];
  const rows: NeighborhoodMarketRow[] = keys.map((key) => {
    const stats = buildNeighborhoodStats(listings, key);
    return buildRow(key, stats, currentRate, futureRate, growth, cityMedian);
  });

  rows.sort((a, b) => (b.medianTomanPerM2 ?? -1) - (a.medianTomanPerM2 ?? -1));

  return {
    city,
    generatedAt: Date.now(),
    lastPropertyUpdate: opts.lastPropertyUpdate ?? null,
    currentUsdRateToman: currentRate,
    futureUsdRateToman: futureRate,
    scenarioBasis: growth !== null && growth !== 0 ? 'explicit-property' : 'constant-property',
    propertyTomanGrowthPct: growth,
    totalListings: listings.length,
    cityStatsToman: cityStats,
    cityCurrentUsdPerM2: cityScenario?.currentUsdPrice ?? tomanToUsd(cityMedian, currentRate ?? 0),
    cityFutureUsdPerM2: cityScenario?.futureUsdPrice ?? null,
    cityUsdChangePercent: cityScenario?.usdChangePercent ?? null,
    rows
  };
}

/** ساخت ویوی بازار از Snapshot ذخیره‌شده (آمار تومانی فریزشده) */
export function buildMarketViewFromSnapshot(snapshot: PropertyMarketSnapshot, fx: FxInput): PropertyMarketView {
  const currentRate = fx.currentUsdRateToman;
  const futureRate = fx.futureUsdRateToman ?? currentRate;
  const growth = fx.propertyTomanGrowthPct ?? null;
  const cityMedian = snapshot.cityStats.medianTomanPerM2;
  const cityScenario =
    cityMedian !== null && currentRate !== null && futureRate !== null
      ? safeScenario(cityMedian, currentRate, futureRate, growth)
      : null;

  const rows = snapshot.neighborhoodStats
    .map((ns) => buildRow(ns.neighborhoodKey, ns.stats, currentRate, futureRate, growth, cityMedian))
    .sort((a, b) => (b.medianTomanPerM2 ?? -1) - (a.medianTomanPerM2 ?? -1));

  const totalListings = snapshot.neighborhoodStats.reduce((s, n) => s + n.stats.listingCount, 0);

  return {
    city: snapshot.city,
    generatedAt: Date.now(),
    lastPropertyUpdate: snapshot.dateTs,
    currentUsdRateToman: currentRate,
    futureUsdRateToman: futureRate,
    scenarioBasis: growth !== null && growth !== 0 ? 'explicit-property' : 'constant-property',
    propertyTomanGrowthPct: growth,
    totalListings,
    cityStatsToman: snapshot.cityStats,
    cityCurrentUsdPerM2: cityScenario?.currentUsdPrice ?? null,
    cityFutureUsdPerM2: cityScenario?.futureUsdPrice ?? null,
    cityUsdChangePercent: cityScenario?.usdChangePercent ?? null,
    rows
  };
}

/* ---------------- داخلی ---------------- */

function safeScenario(
  tomanPerM2: number,
  currentRate: number,
  futureRate: number,
  growthPct: number | null
) {
  try {
    const futureToman = applyPropertyGrowth(tomanPerM2, growthPct);
    return calculateUsdScenario({
      currentPropertyPriceTomanPerM2: tomanPerM2,
      currentUsdRate: currentRate,
      futureUsdRate: futureRate,
      futurePropertyPriceTomanPerM2: growthPct !== null && growthPct !== 0 ? futureToman : null
    });
  } catch {
    return null;
  }
}

function buildRow(
  key: string,
  stats: AreaPriceStats,
  currentRate: number | null,
  futureRate: number | null,
  growthPct: number | null,
  cityMedianToman: number | null
): NeighborhoodMarketRow {
  const toman = stats.medianTomanPerM2;
  const currentUsd = tomanToUsd(toman, currentRate ?? 0);
  const futureToman = toman !== null ? applyPropertyGrowth(toman, growthPct) : null;

  const scenario =
    toman !== null && currentRate !== null && futureRate !== null
      ? safeScenario(toman, currentRate, futureRate, growthPct)
      : null;

  // میانه اهواز در سناریو آینده (با همان فرض رشد)
  const cityMedianFutureToman = cityMedianToman !== null ? applyPropertyGrowth(cityMedianToman, growthPct) : null;
  const cityCurrentUsd = tomanToUsd(cityMedianToman, currentRate ?? 0);
  const cityFutureUsd = tomanToUsd(cityMedianFutureToman, futureRate ?? 0);

  const futureUsd = scenario?.futureUsdPrice ?? null;
  const positionVsCity = relativePercent(currentUsd, cityCurrentUsd);
  const futurePosition = relativePercent(futureUsd, cityFutureUsd);

  return {
    neighborhoodKey: key,
    displayName: neighborhoodDisplayName(key),
    listingCount: stats.listingCount,
    medianTomanPerM2: toman,
    meanTomanPerM2: stats.meanTomanPerM2,
    p25TomanPerM2: stats.p25TomanPerM2,
    p75TomanPerM2: stats.p75TomanPerM2,
    currentUsdPerM2: currentUsd,
    futureTomanPerM2: futureToman,
    futureUsdPerM2: futureUsd,
    usdChangePercent: scenario?.usdChangePercent ?? changePercent(currentUsd, futureUsd),
    tomanChangePercent: scenario?.propertyTomanChangePercent ?? null,
    positionVsCityPct: positionVsCity,
    futurePositionVsCityPct: futurePosition,
    position: classifyPosition(positionVsCity)
  };
}

/** مرتب‌سازی/رتبه‌بندی ردیف‌ها (§۱۰ مأموریت) — صعودی/نزولی */
export function sortMarketRows(
  rows: NeighborhoodMarketRow[],
  key: MarketSortKey,
  dir: 'asc' | 'desc' = 'desc'
): NeighborhoodMarketRow[] {
  const val = (r: NeighborhoodMarketRow): number => {
    switch (key) {
      case 'toman': return r.medianTomanPerM2 ?? -Infinity;
      case 'usd': return r.currentUsdPerM2 ?? -Infinity;
      case 'futureUsd': return r.futureUsdPerM2 ?? -Infinity;
      case 'usdChange': return r.usdChangePercent ?? -Infinity;
      case 'distanceFromMedian': return r.positionVsCityPct === null ? -Infinity : Math.abs(r.positionVsCityPct);
    }
  };
  const out = [...rows].sort((a, b) => val(b) - val(a));
  return dir === 'desc' ? out : out.reverse();
}

/** گران‌ترین/ارزان‌ترین مناطق دلاری (پریست رتبه‌بندی) */
export function mostExpensiveUsd(rows: NeighborhoodMarketRow[], n = 3): NeighborhoodMarketRow[] {
  return sortMarketRows(rows.filter((r) => r.currentUsdPerM2 !== null), 'usd', 'desc').slice(0, n);
}

export function mostAffordableUsd(rows: NeighborhoodMarketRow[], n = 3): NeighborhoodMarketRow[] {
  return sortMarketRows(rows.filter((r) => r.currentUsdPerM2 !== null), 'usd', 'asc').slice(0, n);
}

/** سناریوی ذخیره‌شده → ورودی نرخ سرویس */
export function fxInputFromScenario(scenario: PropertyMarketScenario | null, currentRate: number | null): FxInput {
  return {
    currentUsdRateToman: currentRate,
    futureUsdRateToman: scenario?.futureUsdRateToman ?? currentRate,
    propertyTomanGrowthPct: scenario?.propertyTomanGrowthPct ?? null
  };
}
