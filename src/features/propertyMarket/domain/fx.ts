/** ============================================================
 * Property Market — تبدیل ارزی (کمکی/خالص)
 *
 * ⚠️ این ماژول «سیستم جدید دلار» نیست — فقط توابع تبدیل خالص.
 *    منبع نرخ: همان منبع موجود دارینو (جدول fx_rates — useFxStore).
 *    واحد نرخ در سراسر اپ: تومان بر دلار.
 * ============================================================ */

/** تومان → دلار؛ داده نامعتبر → null (هرگز ۰/حدس) */
export function tomanToUsd(toman: number | null | undefined, usdRateToman: number): number | null {
  if (toman === null || toman === undefined || !Number.isFinite(toman)) return null;
  if (!(usdRateToman > 0) || !Number.isFinite(usdRateToman)) return null;
  return toman / usdRateToman;
}

/** درصد تغییر (نسبت به پایه) — پایه نامعتبر → null */
export function changePercent(from: number | null, to: number | null): number | null {
  if (from === null || to === null || !Number.isFinite(from) || !Number.isFinite(to)) return null;
  if (from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

/**
 * اختلاف نسبی نسبت به مرجع (درصد):
 * (value − reference) ÷ reference × 100
 */
export function relativePercent(value: number | null, reference: number | null): number | null {
  if (value === null || reference === null) return null;
  if (!Number.isFinite(value) || !Number.isFinite(reference) || reference === 0) return null;
  return ((value - reference) / Math.abs(reference)) * 100;
}

/** طبقه‌بندی موقعیت نسبت به بازار (بالا/نزدیک/پایین) — بدون ادعای سرمایه‌گذاری */
export function classifyPosition(
  relativePct: number | null,
  nearBandPct = 5
): 'above' | 'near' | 'below' | null {
  if (relativePct === null || !Number.isFinite(relativePct)) return null;
  if (relativePct > nearBandPct) return 'above';
  if (relativePct < -nearBandPct) return 'below';
  return 'near';
}
