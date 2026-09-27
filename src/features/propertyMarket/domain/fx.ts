/** ============================================================
 * Property Market — تبدیل ارزی (کمکی/خالص)
 *
 *    منبع نرخ: نرخ زنده تتر (والکس/بیت‌پین) — واحد: تومان بر دلار.
 * ============================================================ */

/** تومان → دلار؛ داده نامعتبر → null (هرگز ۰/حدس) */
export function tomanToUsd(toman: number | null | undefined, usdRateToman: number): number | null {
  if (toman === null || toman === undefined || !Number.isFinite(toman)) return null;
  if (!(usdRateToman > 0) || !Number.isFinite(usdRateToman)) return null;
  return toman / usdRateToman;
}
