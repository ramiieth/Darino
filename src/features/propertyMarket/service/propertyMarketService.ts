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
import { buildAreaStats, buildCityStats, buildNeighborhoodStats, mean, median } from '../domain/stats';
import {
  AGE_BANDS,
  AREA_BANDS,
  UNKNOWN_BAND_LABEL,
  ageBandOf,
  areaBandOf,
  buildingAgeYears,
  matchesPriceType,
  PRICE_TYPES,
  type AgeBand,
  type AreaBand,
  type PriceType
} from '../domain/segments';
import { changePercent, classifyPosition, relativePercent, tomanToUsd } from '../domain/fx';
import type {
  AreaPriceStats,
  MarketPosition,
  PropertyCity,
  PropertyMarketListing,
  PropertyMarketScenario,
  PropertyMarketSnapshot
} from '../domain/types';
import { areaGroupOf, neighborhoodDisplayName } from '../data/catalog';

/** سطح تحلیل: محله رسمی، یا منطقه (گروه محله‌های هم‌نام + محله‌های مستقل) */
export type AreaLevel = 'neighborhood' | 'area';

/** کلید منطقه یک محله: گروه اگر عضو است، وگرنه خود محله */
export function areaKeyOf(neighborhoodKey: string | null): string | null {
  if (!neighborhoodKey) return null;
  return areaGroupOf(neighborhoodKey) ?? neighborhoodKey;
}

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
  level?: AreaLevel;
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
  const keyOf = (l: PropertyMarketListing) => (opts.level === 'area' ? areaKeyOf(l.neighborhoodKey) : l.neighborhoodKey);
  const keys = [...new Set(listings.map(keyOf).filter((k): k is string => !!k))];
  const rows: NeighborhoodMarketRow[] = keys.map((key) => {
    const stats =
      opts.level === 'area'
        ? buildAreaStats(
            listings
              .filter((l) => keyOf(l) === key)
              .map((l) => l.pricePerSqmToman)
              .filter((v): v is number => v !== null && Number.isFinite(v) && v > 0)
          )
        : buildNeighborhoodStats(listings, key);
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
/** ردیف‌های آماری Snapshot در سطح خواسته‌شده */
export function snapshotAreaRecords(snapshot: PropertyMarketSnapshot, level: AreaLevel = 'neighborhood') {
  if (level === 'neighborhood') return snapshot.neighborhoodStats;
  // منطقه = گروه‌ها + محله‌هایی که عضو هیچ گروهی نیستند
  return [
    ...(snapshot.groupStats ?? []),
    ...snapshot.neighborhoodStats.filter((n) => !areaGroupOf(n.neighborhoodKey))
  ];
}

export function buildMarketViewFromSnapshot(
  snapshot: PropertyMarketSnapshot,
  fx: FxInput,
  level: AreaLevel = 'neighborhood'
): PropertyMarketView {
  const currentRate = fx.currentUsdRateToman;
  const futureRate = fx.futureUsdRateToman ?? currentRate;
  const growth = fx.propertyTomanGrowthPct ?? null;
  const cityMedian = snapshot.cityStats.medianTomanPerM2;
  const cityScenario =
    cityMedian !== null && currentRate !== null && futureRate !== null
      ? safeScenario(cityMedian, currentRate, futureRate, growth)
      : null;

  const rows = snapshotAreaRecords(snapshot, level)
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

/* ---------------- دسته‌بندی سن بنا / متراژ + معادل دلاری هر آگهی ---------------- */

/** آگهی + مقادیر مشتق (سن، دسته‌ها، معادل دلاری) — فقط برای نمایش */
export interface ListingView extends PropertyMarketListing {
  ageYears: number | null;
  ageBand: AgeBand;
  areaBand: AreaBand;
  pricePerSqmUsd: number | null;
  totalPriceUsd: number | null;
}

export function toListingViews(
  listings: PropertyMarketListing[],
  usdRateToman: number | null,
  currentJalaliYear: number
): ListingView[] {
  const rate = usdRateToman ?? 0;
  return listings.map((l) => {
    const ageYears = buildingAgeYears(l.yearBuilt, currentJalaliYear);
    return {
      ...l,
      ageYears,
      ageBand: ageBandOf(ageYears),
      areaBand: areaBandOf(l.areaSqm),
      pricePerSqmUsd: tomanToUsd(l.pricePerSqmToman, rate),
      totalPriceUsd: tomanToUsd(l.totalPriceToman, rate)
    };
  });
}

export type SegmentDim = 'age' | 'area' | 'exact';

export interface SegmentRow {
  key: string;
  label: string;
  count: number;
  medianPpmToman: number | null;
  medianPpmUsd: number | null;
  medianTotalToman: number | null;
  medianTotalUsd: number | null;
  medianArea: number | null;
  /** سهم از کل آگهی‌ها (٪) */
  sharePct: number;
}

/** آمار هر دسته (میانه‌ها) — ترتیب دسته‌ها ثابت، «نامشخص» آخر، دسته خالی حذف */
export function buildSegmentRows(views: ListingView[], dim: SegmentDim, usdRateToman: number | null): SegmentRow[] {
  const rate = usdRateToman ?? 0;
  const defs: { key: string; label: string }[] = [
    ...(dim === 'age' ? AGE_BANDS : AREA_BANDS).map((b) => ({ key: b.key as string, label: b.label })),
    { key: 'unknown', label: UNKNOWN_BAND_LABEL }
  ];
  const total = views.length;
  const rows: SegmentRow[] = [];
  // «کلید اول» (متن صریح) — ردیف جدا بالای دسته‌های سن بنا (هم‌پوشان با «نوساز»)
  const allDefs = dim === 'age' ? [{ key: 'first-key', label: 'کلید اول' }, ...defs] : defs;
  for (const d of allDefs) {
    const group =
      d.key === 'first-key'
        ? views.filter((v) => v.firstKey === true)
        : views.filter((v) => (dim === 'age' ? v.ageBand : v.areaBand) === d.key);
    if (group.length === 0) continue;
    const ppm = median(group.map((v) => v.pricePerSqmToman).filter((x): x is number => x !== null));
    const tot = median(group.map((v) => v.totalPriceToman).filter((x): x is number => x !== null));
    rows.push({
      key: d.key,
      label: d.label,
      count: group.length,
      medianPpmToman: ppm,
      medianPpmUsd: tomanToUsd(ppm, rate),
      medianTotalToman: tot,
      medianTotalUsd: tomanToUsd(tot, rate),
      medianArea: median(group.map((v) => v.areaSqm).filter((x): x is number => x !== null)),
      sharePct: total > 0 ? (group.length / total) * 100 : 0
    });
  }
  return rows;
}

/* ---------------- ماتریس «منطقه × نوع قیمت» (کلید اول، ۱ تا ۷ سال ساخت) ---------------- */

export interface TypeCell {
  count: number;
  medianPpmToman: number | null;
  meanPpmToman: number | null;
  medianTotalToman: number | null;
  meanTotalToman: number | null;
  medianPpmUsd: number | null;
  meanPpmUsd: number | null;
  medianTotalUsd: number | null;
  meanTotalUsd: number | null;
}

export interface TypeMatrixRow {
  key: string;
  displayName: string;
  count: number;
  cells: Partial<Record<PriceType, TypeCell>>;
}

function typeCell(group: ListingView[], rate: number): TypeCell {
  const ppm = group.map((l) => l.pricePerSqmToman).filter((v): v is number => v !== null && v > 0);
  const tot = group.map((l) => l.totalPriceToman).filter((v): v is number => v !== null && v > 0);
  const mPpm = median(ppm);
  const aPpm = mean(ppm);
  const mTot = median(tot);
  const aTot = mean(tot);
  return {
    count: group.length,
    medianPpmToman: mPpm,
    meanPpmToman: aPpm,
    medianTotalToman: mTot,
    meanTotalToman: aTot,
    medianPpmUsd: tomanToUsd(mPpm, rate),
    meanPpmUsd: tomanToUsd(aPpm, rate),
    medianTotalUsd: tomanToUsd(mTot, rate),
    meanTotalUsd: tomanToUsd(aTot, rate)
  };
}

/** ماتریس قیمت هر منطقه/محله به تفکیک نوع — ردیف اول «کل اهواز» */
export function buildTypeMatrix(
  views: ListingView[],
  level: AreaLevel,
  usdRateToman: number | null,
  currentJalaliYear: number
): TypeMatrixRow[] {
  const rate = usdRateToman ?? 0;
  const keyOf = (l: ListingView) => (level === 'area' ? areaKeyOf(l.neighborhoodKey) : l.neighborhoodKey);
  const rowFor = (key: string, name: string, group: ListingView[]): TypeMatrixRow => {
    const cells: Partial<Record<PriceType, TypeCell>> = {};
    for (const t of PRICE_TYPES) {
      const g = group.filter((l) => matchesPriceType(l, t.key, currentJalaliYear));
      if (g.length > 0) cells[t.key] = typeCell(g, rate);
    }
    return { key, displayName: name, count: group.length, cells };
  };
  const keys = [...new Set(views.map(keyOf).filter((k): k is string => !!k))];
  const rows = keys
    .map((k) => rowFor(k, neighborhoodDisplayName(k), views.filter((l) => keyOf(l) === k)))
    .sort((a, b) => b.count - a.count);
  return [rowFor('__city__', 'کل اهواز', views), ...rows];
}

/* ---------------- متراژ دقیق (هر متراژی که در آگهی آمده، جداگانه) ---------------- */

export type ExactAreaRange = 'lt90' | '90-170' | '171-330' | 'gt330';

export const EXACT_AREA_RANGES: { key: ExactAreaRange; label: string; min: number; max: number }[] = [
  { key: 'lt90', label: 'کمتر از ۹۰ متر', min: 0, max: 89 },
  { key: '90-170', label: '۹۰ تا ۱۷۰ متر', min: 90, max: 170 },
  { key: '171-330', label: '۱۷۱ تا ۳۳۰ متر', min: 171, max: 330 },
  { key: 'gt330', label: 'بیش از ۳۳۰ متر', min: 331, max: Infinity }
];

export interface ExactAreaRow {
  /** متراژ دقیق آگهی (گرد به متر) */
  areaSqm: number;
  range: ExactAreaRange;
  count: number;
  medianPpmToman: number | null;
  medianPpmUsd: number | null;
  medianTotalToman: number | null;
  medianTotalUsd: number | null;
}

export function exactAreaRangeOf(area: number): ExactAreaRange {
  return EXACT_AREA_RANGES.find((r) => area >= r.min && area <= r.max)?.key ?? 'gt330';
}

/** یک ردیف برای هر متراژ دقیق موجود در آگهی‌ها (صعودی) */
export function buildExactAreaRows(views: ListingView[], usdRateToman: number | null): ExactAreaRow[] {
  const rate = usdRateToman ?? 0;
  const groups = new Map<number, ListingView[]>();
  for (const v of views) {
    if (v.areaSqm === null || !(v.areaSqm > 0)) continue;
    const a = Math.round(v.areaSqm);
    const g = groups.get(a) ?? [];
    g.push(v);
    groups.set(a, g);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([areaSqm, g]) => {
      const ppm = median(g.map((l) => l.pricePerSqmToman).filter((x): x is number => x !== null && x > 0));
      const tot = median(g.map((l) => l.totalPriceToman).filter((x): x is number => x !== null && x > 0));
      return {
        areaSqm,
        range: exactAreaRangeOf(areaSqm),
        count: g.length,
        medianPpmToman: ppm,
        medianPpmUsd: tomanToUsd(ppm, rate),
        medianTotalToman: tot,
        medianTotalUsd: tomanToUsd(tot, rate)
      };
    });
}
