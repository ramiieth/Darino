/**
 * ============================================================
 *  موتور محاسبات مالی (Backend خالص — بدون هیچ وابستگی UI)
 * ============================================================
 *  - همه محاسبات با decimal.js (دقت ۲۰ رقم) — هرگز Float خام
 *  - همه توابع Pure و بدون Side Effect
 *  - دقت داخلی: ۱۲+ رقم اعشار؛ نمایش: ۲-۴ رقم (در UI)
 *  - جلوگیری از تقسیم بر صفر (خروجی null)
 */
import Decimal from 'decimal.js';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

/** ساخت Decimal امن */
export function D(v: number | string | null | undefined): Decimal {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return new Decimal(0);
  return new Decimal(v);
}

/** گردکردن داخلی به ۱۲ رقم اعشار */
export function round12(v: Decimal | number): number {
  return Number(new Decimal(v).toDecimalPlaces(12));
}

/** تقسیم امن — اگر مقسوم‌علیه صفر باشد null برمی‌گردد */
export function safeDiv(a: Decimal, b: Decimal): Decimal | null {
  if (b.isZero()) return null;
  return a.div(b);
}

/** اعتبارسنجی ورودی‌های عددی (Pure) */
export function validateNum(v: unknown, opts: { min?: number; positive?: boolean; allowZero?: boolean } = {}): string | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return 'مقدار عددی معتبر وارد کنید';
  if (opts.positive && n <= 0) return 'باید بزرگ‌تر از صفر باشد';
  if (opts.min !== undefined && n < opts.min) return `حداقل ${opts.min}`;
  if (!opts.allowZero && n === 0) return 'صفر مجاز نیست';
  return null;
}

/** تعداد روز بین دو تاریخ (سال ۳۶۵.۲۵ روزه) */
export function daysBetween(startTs: number, endTs: number): number {
  return (endTs - startTs) / 86_400_000;
}

/** سال بین دو تاریخ (برای CAGR) */
export function yearsBetween(startTs: number, endTs: number): number {
  return daysBetween(startTs, endTs) / 365.25;
}

/** تبدیل تاریخ میلادی (input date) به timestamp — بدون Zone دردسر */
export function dateToTs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export { Decimal };
