/** ============================================================
 * Property Market — آمار بازار (خالص، تست‌پذیر)
 *
 *  شاخص اصلی هر منطقه: میانه قیمت هر مترمربع (§۱۹ مأموریت).
 *  سپس: میانگین، P25، P75، تعداد آگهی.
 *  میانه کل اهواز: روی «همه آگهی‌های معتبر» (وزن آگهی) — نه میانگین محله‌ها.
 * ============================================================ */
import type { AreaPriceStats, PropertyMarketListing } from './types.js';

/** میانه (داده خالی → null) */
export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** میانگین (داده خالی → null) */
export function mean(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length === 0) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

/** صدک (خطی/درون‌یابی) — 0..100؛ داده خالی → null */
export function percentile(values: number[], p: number): number | null {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length === 0) return null;
  if (v.length === 1) return v[0];
  const s = [...v].sort((a, b) => a - b);
  const rank = (Math.min(100, Math.max(0, p)) / 100) * (s.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (rank - lo);
}

/** ساخت آمار حوزه از فهرست قیمت‌های هر مترمربع */
export function buildAreaStats(pricePerSqmValues: number[]): AreaPriceStats {
  return {
    medianTomanPerM2: median(pricePerSqmValues),
    meanTomanPerM2: mean(pricePerSqmValues),
    p25TomanPerM2: percentile(pricePerSqmValues, 25),
    p75TomanPerM2: percentile(pricePerSqmValues, 75),
    listingCount: pricePerSqmValues.filter((x) => Number.isFinite(x)).length
  };
}

/** آمار کل شهر — روی همه آگهی‌های معتبر (بدون فیلتر محله) */
export function buildCityStats(listings: PropertyMarketListing[]): AreaPriceStats {
  return buildAreaStats(
    listings
      .map((l) => l.pricePerSqmToman)
      .filter((v): v is number => v !== null && Number.isFinite(v) && v > 0)
  );
}

/** آمار یک محله — فقط آگهی‌های همان محله */
export function buildNeighborhoodStats(
  listings: PropertyMarketListing[],
  neighborhoodKey: string
): AreaPriceStats {
  return buildAreaStats(
    listings
      .filter((l) => l.neighborhoodKey === neighborhoodKey)
      .map((l) => l.pricePerSqmToman)
      .filter((v): v is number => v !== null && Number.isFinite(v) && v > 0)
  );
}
