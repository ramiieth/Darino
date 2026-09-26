/** ============================================================
 * Property Market — دسته‌بندی آگهی‌ها (سن بنا / متراژ) — خالص
 *
 *  سن بنا = سال شمسی جاری − سال ساخت (دیوار: «ساخت»؛ شیپور: از «سن بنا»)
 *  آگهی بدون سال ساخت/متراژ → دسته «نامشخص» (هرگز حدس زده نمی‌شود)
 * ============================================================ */

export type AgeBand = 'y0-1' | 'y2' | 'y3' | 'y4' | 'y5-10' | 'y11-20' | 'y21+' | 'unknown';
export type AreaBand = 'a0-60' | 'a60-80' | 'a80-100' | 'a100-120' | 'a120-150' | 'a150-200' | 'a200+' | 'unknown';

export interface BandDef<T extends string> {
  key: T;
  label: string;
  /** شامل */
  min: number;
  /** شامل */
  max: number;
}

export const AGE_BANDS: BandDef<Exclude<AgeBand, 'unknown'>>[] = [
  { key: 'y0-1', label: 'نوساز تا ۱ سال', min: 0, max: 1 },
  { key: 'y2', label: '۲ سال', min: 2, max: 2 },
  { key: 'y3', label: '۳ سال', min: 3, max: 3 },
  { key: 'y4', label: '۴ سال', min: 4, max: 4 },
  { key: 'y5-10', label: '۵ تا ۱۰ سال', min: 5, max: 10 },
  { key: 'y11-20', label: '۱۱ تا ۲۰ سال', min: 11, max: 20 },
  { key: 'y21+', label: 'بیش از ۲۰ سال', min: 21, max: Infinity }
];

export const AREA_BANDS: BandDef<Exclude<AreaBand, 'unknown'>>[] = [
  { key: 'a0-60', label: 'کمتر از ۶۰ متر', min: 0, max: 59.999 },
  { key: 'a60-80', label: '۶۰ تا ۸۰ متر', min: 60, max: 79.999 },
  { key: 'a80-100', label: '۸۰ تا ۱۰۰ متر', min: 80, max: 99.999 },
  { key: 'a100-120', label: '۱۰۰ تا ۱۲۰ متر', min: 100, max: 119.999 },
  { key: 'a120-150', label: '۱۲۰ تا ۱۵۰ متر', min: 120, max: 149.999 },
  { key: 'a150-200', label: '۱۵۰ تا ۲۰۰ متر', min: 150, max: 199.999 },
  { key: 'a200+', label: '۲۰۰ متر و بیشتر', min: 200, max: Infinity }
];

export const UNKNOWN_BAND_LABEL = 'نامشخص';

/** سن بنا (سال) از سال ساخت شمسی؛ سال آینده (پیش‌فروش) → ۰ */
export function buildingAgeYears(yearBuilt: number | null, currentJalaliYear: number): number | null {
  if (yearBuilt === null || !Number.isFinite(yearBuilt) || yearBuilt < 1300) return null;
  return Math.max(0, currentJalaliYear - yearBuilt);
}

export function ageBandOf(age: number | null): AgeBand {
  if (age === null || !Number.isFinite(age) || age < 0) return 'unknown';
  return AGE_BANDS.find((b) => age >= b.min && age <= b.max)?.key ?? 'unknown';
}

export function areaBandOf(area: number | null): AreaBand {
  if (area === null || !Number.isFinite(area) || area <= 0) return 'unknown';
  return AREA_BANDS.find((b) => area >= b.min && area <= b.max)?.key ?? 'unknown';
}

export function ageBandLabel(k: AgeBand): string {
  return AGE_BANDS.find((b) => b.key === k)?.label ?? UNKNOWN_BAND_LABEL;
}

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
