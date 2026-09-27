/** ============================================================
 * Property Market Service — تنها مسیر محاسبات بازار → UI
 *
 *  محور همه جدول‌ها «نوع قیمت» است: کلید اول و ۱ تا ۷ سال ساخت.
 *  شاخص هر خانه = میانگین آگهی‌های همان نوع (بعد از حذف پرت‌ها).
 *
 * ⚠️ هیچ تبدیل تومان/دلار یا محاسبه سناریویی در کامپوننت React نیست.
 * ============================================================ */
import { calculateUsdScenario } from '../domain/scenarioEngine';
import { mean } from '../domain/stats';
import {
  AREA_BANDS,
  ageBandOf,
  areaBandOf,
  buildingAgeYears,
  matchesPriceType,
  PRICE_TYPES,
  type AgeBand,
  type AreaBand,
  type PriceType
} from '../domain/segments';
import { tomanToUsd } from '../domain/fx';
import type { PropertyMarketListing, PropertyMarketScenario, PropertyMarketSnapshot, TypeStats } from '../domain/types';
import { areaGroupOf, neighborhoodDisplayName } from '../data/catalog';

/** سطح تحلیل: محله رسمی، یا منطقه (گروه محله‌های هم‌نام + محله‌های مستقل) */
export type AreaLevel = 'neighborhood' | 'area';

/** کلید منطقه یک محله: گروه اگر عضو است، وگرنه خود محله */
export function areaKeyOf(neighborhoodKey: string | null): string | null {
  if (!neighborhoodKey) return null;
  return areaGroupOf(neighborhoodKey) ?? neighborhoodKey;
}

/** ورودی نرخ‌ها — نرخ فعلی تتر + سناریوی آینده (فرض صریح) */
export interface FxInput {
  /** نرخ دلار فعلی (تومان بر دلار) */
  currentUsdRateToman: number | null;
  /** نرخ دلار آینده (تومان بر دلار) — سناریو؛ پیش‌فرض = همان نرخ فعلی */
  futureUsdRateToman: number | null;
  /** فرض اختیاری رشد تومانی قیمت ملک (٪) */
  propertyTomanGrowthPct?: number | null;
}

/** رشد تومانی سناریو → قیمت تومانی آینده (فرض صریح؛ نه پیش‌بینی) */
export function applyPropertyGrowth(currentToman: number, growthPct: number | null | undefined): number {
  if (growthPct === null || growthPct === undefined || !Number.isFinite(growthPct)) return currentToman;
  return currentToman * (1 + growthPct / 100);
}

/** سناریوی ذخیره‌شده → ورودی نرخ سرویس */
export function fxInputFromScenario(scenario: PropertyMarketScenario | null, currentRate: number | null): FxInput {
  return {
    currentUsdRateToman: currentRate,
    futureUsdRateToman: scenario?.futureUsdRateToman ?? currentRate,
    propertyTomanGrowthPct: scenario?.propertyTomanGrowthPct ?? null
  };
}

/** آیا سناریو با وضع فعلی فرق دارد؟ (فقط آن‌وقت ستون «سناریو» معنا دارد) */
export function scenarioActive(fx: FxInput): boolean {
  const growth = fx.propertyTomanGrowthPct ?? 0;
  return growth !== 0 || (fx.futureUsdRateToman !== null && fx.futureUsdRateToman !== fx.currentUsdRateToman);
}

/** قیمت دلاری آینده هر متر در سناریو (null وقتی نرخ نیست) */
export function futureUsdOf(tomanPerM2: number | null, fx: FxInput): number | null {
  const current = fx.currentUsdRateToman;
  const future = fx.futureUsdRateToman ?? current;
  if (tomanPerM2 === null || current === null || future === null) return null;
  const growth = fx.propertyTomanGrowthPct ?? null;
  try {
    return calculateUsdScenario({
      currentPropertyPriceTomanPerM2: tomanPerM2,
      currentUsdRate: current,
      futureUsdRate: future,
      futurePropertyPriceTomanPerM2: growth ? applyPropertyGrowth(tomanPerM2, growth) : null
    }).futureUsdPrice;
  } catch {
    return null;
  }
}

/** ردیف‌های آماری Snapshot در سطح خواسته‌شده */
export function snapshotAreaRecords(snapshot: PropertyMarketSnapshot, level: AreaLevel = 'neighborhood') {
  if (level === 'neighborhood') return snapshot.neighborhoodStats;
  // منطقه = گروه‌ها + محله‌هایی که عضو هیچ گروهی نیستند
  return [
    ...(snapshot.groupStats ?? []),
    ...snapshot.neighborhoodStats.filter((n) => !areaGroupOf(n.neighborhoodKey))
  ];
}

/* ---------------- آگهی + مقادیر مشتق ---------------- */

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

/* ---------------- خانه «نوع قیمت» ---------------- */

/** میانگین قیمت یک نوع در یک گروه — تومان، دلار تتر و سناریو */
export interface TypeCell {
  count: number;
  ppmToman: number | null;
  ppmUsd: number | null;
  totalToman: number | null;
  totalUsd: number | null;
  /** هر متر به دلار در سناریوی آینده */
  futurePpmUsd: number | null;
}

export type TypeCells = Partial<Record<PriceType, TypeCell>>;

export interface TypeMatrixRow {
  key: string;
  displayName: string;
  count: number;
  cells: TypeCells;
}

export const CITY_ROW_KEY = '__city__';

function cellOf(count: number, ppm: number | null, total: number | null, fx: FxInput): TypeCell {
  const rate = fx.currentUsdRateToman ?? 0;
  return {
    count,
    ppmToman: ppm,
    ppmUsd: tomanToUsd(ppm, rate),
    totalToman: total,
    totalUsd: tomanToUsd(total, rate),
    futurePpmUsd: futureUsdOf(ppm, fx)
  };
}

/** خانه‌های همه انواع برای یک گروه آگهی (نوع بدون آگهی حذف) */
export function typeCellsOf(group: ListingView[], fx: FxInput, currentJalaliYear: number): TypeCells {
  const cells: TypeCells = {};
  for (const t of PRICE_TYPES) {
    const g = group.filter((l) => matchesPriceType(l, t.key, currentJalaliYear));
    if (g.length === 0) continue;
    const ppm = mean(g.map((l) => l.pricePerSqmToman).filter((v): v is number => v !== null && v > 0));
    const tot = mean(g.map((l) => l.totalPriceToman).filter((v): v is number => v !== null && v > 0));
    cells[t.key] = cellOf(g.length, ppm, tot, fx);
  }
  return cells;
}

/** ماتریس «منطقه/محله × نوع قیمت» — ردیف اول «کل اهواز»، بقیه به ترتیب تعداد آگهی */
export function buildAreaTypeMatrix(
  views: ListingView[],
  level: AreaLevel,
  fx: FxInput,
  currentJalaliYear: number
): TypeMatrixRow[] {
  const keyOf = (l: ListingView) => (level === 'area' ? areaKeyOf(l.neighborhoodKey) : l.neighborhoodKey);
  const groups = new Map<string, ListingView[]>();
  for (const v of views) {
    const k = keyOf(v);
    if (!k) continue;
    const g = groups.get(k) ?? [];
    g.push(v);
    groups.set(k, g);
  }
  const rows = [...groups.entries()]
    .map(([k, g]) => ({ key: k, displayName: neighborhoodDisplayName(k), count: g.length, cells: typeCellsOf(g, fx, currentJalaliYear) }))
    .sort((a, b) => b.count - a.count);
  return [{ key: CITY_ROW_KEY, displayName: 'کل اهواز', count: views.length, cells: typeCellsOf(views, fx, currentJalaliYear) }, ...rows];
}

/** ماتریس «بازه متراژ × نوع قیمت» — ترتیب بازه‌ها ثابت، بازه خالی حذف */
export function buildSizeTypeMatrix(views: ListingView[], fx: FxInput, currentJalaliYear: number): TypeMatrixRow[] {
  return AREA_BANDS.map((b) => {
    const g = views.filter((v) => v.areaBand === b.key);
    return { key: b.key, displayName: b.label, count: g.length, cells: typeCellsOf(g, fx, currentJalaliYear) };
  }).filter((r) => r.count > 0);
}

/** همان ماتریس مناطق از Snapshot (وقتی آگهی محلی نیست) — از byType ذخیره‌شده */
export function areaTypeMatrixFromSnapshot(snapshot: PropertyMarketSnapshot, level: AreaLevel, fx: FxInput): TypeMatrixRow[] {
  const cellsOf = (byType: Partial<Record<string, TypeStats>> | undefined): TypeCells => {
    const cells: TypeCells = {};
    for (const t of PRICE_TYPES) {
      const s = byType?.[t.key];
      if (s && s.count > 0) cells[t.key] = cellOf(s.count, s.meanPpm, s.meanTotal, fx);
    }
    return cells;
  };
  const rows = snapshotAreaRecords(snapshot, level)
    .map((r) => ({ key: r.neighborhoodKey, displayName: r.displayName, count: r.stats.listingCount, cells: cellsOf(r.stats.byType) }))
    .sort((a, b) => b.count - a.count);
  return [
    { key: CITY_ROW_KEY, displayName: 'کل اهواز', count: snapshot.cityStats.listingCount, cells: cellsOf(snapshot.cityStats.byType) },
    ...rows
  ];
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
  ppmToman: number | null;
  ppmUsd: number | null;
  totalToman: number | null;
  totalUsd: number | null;
}

export function exactAreaRangeOf(area: number): ExactAreaRange {
  return EXACT_AREA_RANGES.find((r) => area >= r.min && area <= r.max)?.key ?? 'gt330';
}

/** یک ردیف برای هر متراژ دقیق موجود در آگهی‌ها (صعودی) — میانگین قیمت‌ها */
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
      const ppm = mean(g.map((l) => l.pricePerSqmToman).filter((x): x is number => x !== null && x > 0));
      const tot = mean(g.map((l) => l.totalPriceToman).filter((x): x is number => x !== null && x > 0));
      return {
        areaSqm,
        range: exactAreaRangeOf(areaSqm),
        count: g.length,
        ppmToman: ppm,
        ppmUsd: tomanToUsd(ppm, rate),
        totalToman: tot,
        totalUsd: tomanToUsd(tot, rate)
      };
    });
}
