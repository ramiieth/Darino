/** ============================================================
 * Property Market Service — تنها مسیر محاسبات بازار → UI
 *
 *  تنها سطح تحلیل «منطقه» است (محله‌های هم‌نام با هم: کیانپارس، پادادشهر…).
 *  ستون‌های جدول‌ها «سال ساخت» است: ۱۴۰۵ (نوساز) … ۱۳۹۸ و «قبل‌تر» — هر آگهی در یک ستون.
 *  شاخص هر خانه = میانگین آگهی‌های همان نوع (بعد از حذف پرت‌ها).
 *  دلار = نرخ زنده تتر (والکس/بیت‌پین).
 *
 * ⚠️ هیچ تبدیل تومان/دلار در کامپوننت React نیست.
 * ============================================================ */
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
import type { PropertyMarketListing, PropertyMarketSnapshot, TypeStats } from '../domain/types';
import { areaGroupOf, areaKeyOf, neighborhoodDisplayName } from '../data/catalog';

/** ردیف‌های «منطقه» یک Snapshot = گروه‌ها + محله‌هایی که عضو هیچ گروهی نیستند */
export function snapshotAreaRecords(snapshot: PropertyMarketSnapshot) {
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

/** میانگین قیمت یک نوع در یک گروه — تومان و دلار تتر */
export interface TypeCell {
  count: number;
  ppmToman: number | null;
  ppmUsd: number | null;
  totalToman: number | null;
  totalUsd: number | null;
}

export type TypeCells = Partial<Record<PriceType, TypeCell>>;

export interface TypeMatrixRow {
  key: string;
  displayName: string;
  /** آگهی‌هایی که سال ساخت معتبر دارند (در یکی از ستون‌ها) */
  count: number;
  /** همه آگهی‌های این ردیف (شامل بدون سال ساخت) */
  total: number;
  cells: TypeCells;
}

function cellOf(count: number, ppm: number | null, total: number | null, rate: number | null): TypeCell {
  return {
    count,
    ppmToman: ppm,
    ppmUsd: tomanToUsd(ppm, rate ?? 0),
    totalToman: total,
    totalUsd: tomanToUsd(total, rate ?? 0)
  };
}

const cellsCount = (cells: TypeCells) => Object.values(cells).reduce((a, c) => a + (c?.count ?? 0), 0);

/** خانه‌های همه انواع برای یک گروه آگهی (نوع بدون آگهی حذف) */
export function typeCellsOf(group: ListingView[], rate: number | null, currentJalaliYear: number): TypeCells {
  const cells: TypeCells = {};
  for (const t of PRICE_TYPES) {
    const g = group.filter((l) => matchesPriceType(l, t.key, currentJalaliYear));
    if (g.length === 0) continue;
    const ppm = mean(g.map((l) => l.pricePerSqmToman).filter((v): v is number => v !== null && v > 0));
    const tot = mean(g.map((l) => l.totalPriceToman).filter((v): v is number => v !== null && v > 0));
    cells[t.key] = cellOf(g.length, ppm, tot, rate);
  }
  return cells;
}

function rowOf(key: string, displayName: string, group: ListingView[], rate: number | null, jy: number): TypeMatrixRow {
  const cells = typeCellsOf(group, rate, jy);
  return { key, displayName, count: cellsCount(cells), total: group.length, cells };
}

/** ماتریس «منطقه × سال ساخت» — همه مناطق، به ترتیب تعداد آگهی */
export function buildAreaTypeMatrix(views: ListingView[], rate: number | null, currentJalaliYear: number): TypeMatrixRow[] {
  const groups = new Map<string, ListingView[]>();
  for (const v of views) {
    const k = areaKeyOf(v.neighborhoodKey);
    if (!k) continue;
    const g = groups.get(k) ?? [];
    g.push(v);
    groups.set(k, g);
  }
  return [...groups.entries()]
    .map(([k, g]) => rowOf(k, neighborhoodDisplayName(k), g, rate, currentJalaliYear))
    .sort((a, b) => b.total - a.total);
}

/** ماتریس «بازه متراژ × سال ساخت» — ترتیب بازه‌ها ثابت، بازه خالی حذف */
export function buildSizeTypeMatrix(views: ListingView[], rate: number | null, currentJalaliYear: number): TypeMatrixRow[] {
  return AREA_BANDS.map((b) => rowOf(b.key, b.label, views.filter((v) => v.areaBand === b.key), rate, currentJalaliYear)).filter(
    (r) => r.total > 0
  );
}

/** همان ماتریس مناطق از Snapshot (وقتی آگهی محلی نیست) — از byType ذخیره‌شده */
export function areaTypeMatrixFromSnapshot(snapshot: PropertyMarketSnapshot, rate: number | null): TypeMatrixRow[] {
  const cellsOf = (byType: Partial<Record<string, TypeStats>> | undefined): TypeCells => {
    const cells: TypeCells = {};
    for (const t of PRICE_TYPES) {
      const st = byType?.[t.key];
      if (st && st.count > 0) cells[t.key] = cellOf(st.count, st.meanPpm, st.meanTotal, rate);
    }
    return cells;
  };
  return snapshotAreaRecords(snapshot)
    .map((r) => {
      const cells = cellsOf(r.stats.byType);
      return { key: r.neighborhoodKey, displayName: r.displayName, count: cellsCount(cells), total: r.stats.listingCount, cells };
    })
    .sort((a, b) => b.total - a.total);
}

/* ---------------- متراژ دقیق (هر متراژی که در آگهی آمده، جداگانه) ---------------- */

export type ExactAreaRange = '90-170' | '171-330' | 'gt330';

export const EXACT_AREA_RANGES: { key: ExactAreaRange; label: string; min: number; max: number }[] = [
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
