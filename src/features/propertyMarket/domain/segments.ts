/** ============================================================
 * Property Market — دسته‌بندی آگهی‌ها (سن بنا / متراژ) — خالص
 *
 *  سن بنا = سال شمسی جاری − سال ساخت («ساخت» در آگهی دیوار)
 *  آگهی بدون سال ساخت/متراژ → دسته «نامشخص» (هرگز حدس زده نمی‌شود)
 * ============================================================ */

/** سن بنا: y0 = سال جاری (نوساز) … y7 = ۷ سال، y8+ = ۸ سال و بیشتر */
export type AgeBand = 'y0' | 'y1' | 'y2' | 'y3' | 'y4' | 'y5' | 'y6' | 'y7' | 'y8+' | 'unknown';
export type AreaBand = 'a90-100' | 'a100-120' | 'a120-150' | 'a150-200' | 'a200+' | 'unknown';

export interface BandDef<T extends string> {
  key: T;
  label: string;
  /** شامل */
  min: number;
  /** شامل */
  max: number;
}

export const AGE_BANDS: BandDef<Exclude<AgeBand, 'unknown'>>[] = [
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({ key: `y${n}` as Exclude<AgeBand, 'unknown'>, label: '', min: n, max: n })),
  { key: 'y8+', label: '', min: 8, max: Infinity }
];

export const AREA_BANDS: BandDef<Exclude<AreaBand, 'unknown'>>[] = [
  { key: 'a90-100', label: '۹۰ تا ۱۰۰ متر', min: 90, max: 99.999 },
  { key: 'a100-120', label: '۱۰۰ تا ۱۲۰ متر', min: 100, max: 119.999 },
  { key: 'a120-150', label: '۱۲۰ تا ۱۵۰ متر', min: 120, max: 149.999 },
  { key: 'a150-200', label: '۱۵۰ تا ۲۰۰ متر', min: 150, max: 199.999 },
  { key: 'a200+', label: '۲۰۰ متر و بیشتر', min: 200, max: Infinity }
];

export const UNKNOWN_BAND_LABEL = 'نامشخص';

/** سن بنا (سال) = سال جاری − سال ساخت؛ سال ساخت آینده (هنوز ساخته نشده) یا نامعتبر → null */
export function buildingAgeYears(yearBuilt: number | null, currentJalaliYear: number): number | null {
  if (yearBuilt === null || !Number.isFinite(yearBuilt) || yearBuilt < 1300 || yearBuilt > currentJalaliYear) return null;
  return currentJalaliYear - yearBuilt;
}

export function ageBandOf(age: number | null): AgeBand {
  if (age === null || !Number.isFinite(age) || age < 0) return 'unknown';
  return AGE_BANDS.find((b) => age >= b.min && age <= b.max)?.key ?? 'unknown';
}

export function areaBandOf(area: number | null): AreaBand {
  if (area === null || !Number.isFinite(area) || area <= 0) return 'unknown';
  return AREA_BANDS.find((b) => area >= b.min && area <= b.max)?.key ?? 'unknown';
}

/** برچسب سال ساخت یک دسته سن: «۱۴۰۵» … «۱۳۹۷ و قبل‌تر» */
export function ageBandLabel(k: AgeBand, currentJalaliYear: number): string {
  if (k === 'unknown') return UNKNOWN_BAND_LABEL;
  if (k === 'y8+') return `${faYear(currentJalaliYear - 8)} و قبل‌تر`;
  return faYear(currentJalaliYear - Number(k.slice(1)));
}

/** «نوساز» / «۱ سال» / «۸ سال به بالا» */
export function ageBandSub(k: AgeBand): string {
  if (k === 'unknown') return '';
  if (k === 'y0') return 'نوساز';
  if (k === 'y8+') return '۸ سال به بالا';
  return `${faYear(Number(k.slice(1)))} سال`;
}

const faYear = (n: number) => new Intl.NumberFormat('fa-IR', { useGrouping: false }).format(n);

export function areaBandLabel(k: AreaBand): string {
  return AREA_BANDS.find((b) => b.key === k)?.label ?? UNKNOWN_BAND_LABEL;
}

/** سال شمسی یک لحظه — تقویم persian مرورگر/نود؛ فالبک تقریبی نوروز */
export function jalaliYearOf(ts: number): number {
  try {
    const s = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric' }).format(new Date(ts));
    const y = Number(s.replace(/[^\d]/g, ''));
    if (y > 1300 && y < 1500) return y;
  } catch {
    /* فالبک */
  }
  const d = new Date(ts);
  const afterNowruz = d.getUTCMonth() > 2 || (d.getUTCMonth() === 2 && d.getUTCDate() >= 21);
  return d.getUTCFullYear() - (afterNowruz ? 621 : 622);
}

/* ---------------- «نوع قیمت» = سال ساخت — محور اصلی ماژول ---------------- */

/**
 * ستون‌های جدول‌ها فقط بر اساس «سال ساخت» آگهی (نه متن آگهی):
 *   b0 = سال جاری (۱۴۰۵، نوساز)، b1 = ۱۴۰۴ (۱ سال) … b7 = ۱۳۹۸ (۷ سال)، old = ۱۳۹۷ و قبل‌تر
 * «کلید اول» نوشته‌شده در آگهی مبنا نیست — آگهی ۱۴۰۴ با عبارت «کلید اول» همان «۱ سال» است.
 * هر آگهی دقیقاً در یک ستون؛ بدون سال ساخت یا سال ساخت آینده → در هیچ ستونی نیست.
 */
export type PriceType = 'b0' | 'b1' | 'b2' | 'b3' | 'b4' | 'b5' | 'b6' | 'b7' | 'old';

export const PRICE_TYPES: { key: PriceType; band: Exclude<AgeBand, 'unknown'> }[] = [
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({ key: `b${n}` as PriceType, band: `y${n}` as Exclude<AgeBand, 'unknown'> })),
  { key: 'old', band: 'y8+' }
];

/** آیا آگهی (با سال ساخت) در این ستون می‌گنجد؟ */
export function matchesPriceType(l: { yearBuilt: number | null }, type: PriceType, currentJalaliYear: number): boolean {
  const age = buildingAgeYears(l.yearBuilt, currentJalaliYear);
  if (age === null) return false;
  return type === 'old' ? age >= 8 : age === Number(type.slice(1));
}

/** سرستون: سال ساخت («۱۴۰۴») */
export function priceTypeYear(t: PriceType, currentJalaliYear: number): string {
  return ageBandLabel(bandOfType(t), currentJalaliYear);
}

/** زیرنویس سرستون: «نوساز» / «۱ سال» / «۸ سال به بالا» */
export function priceTypeSub(t: PriceType): string {
  return ageBandSub(bandOfType(t));
}

/** متن کامل: «ساخت ۱۴۰۴ (۱ سال)» */
export function priceTypeLabel(t: PriceType, currentJalaliYear: number): string {
  return `ساخت ${priceTypeYear(t, currentJalaliYear)} (${priceTypeSub(t)})`;
}

/** ستون → فیلتر سن بنای فهرست آگهی‌ها */
export function bandOfType(t: PriceType): Exclude<AgeBand, 'unknown'> {
  return PRICE_TYPES.find((p) => p.key === t)!.band;
}
