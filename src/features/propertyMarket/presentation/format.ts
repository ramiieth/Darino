import { toFaDigits } from '@/shared/utils/formatters';
/** ============================================================
 * Property Market — قالب‌بندی قیمت‌ها؛ همه اعداد با ارقام فارسی
 * ============================================================ */

const fa0 = { format: (v: number) => toFaDigits(new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v)) };
const fa1 = { format: (v: number) => toFaDigits(new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(v)) };
const fa2 = { format: (v: number) => toFaDigits(new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v)) };

const ok = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

/** «۲۰۶ میلیون» / «۸۵٫۵ میلیون» — تومان هر متر */
export function fmtMillionToman(v: number | null): string {
  if (!ok(v)) return '—';
  const m = v / 1_000_000;
  return `${(m >= 100 ? fa0 : fa1).format(m)} میلیون`;
}

/** «۳٫۱ میلیارد» / «۸۵۰ میلیون» — قیمت کل */
export function fmtTotalToman(v: number | null): string {
  if (!ok(v)) return '—';
  return v >= 1_000_000_000 ? `${fa2.format(v / 1_000_000_000)} میلیارد` : `${fa0.format(Math.round(v / 1_000_000))} میلیون`;
}

/** «۱٬۲۳۴ دلار» — معادل دلاری تتر */
export function fmtUsdFa(v: number | null): string {
  if (!ok(v)) return '—';
  return `${fa0.format(Math.round(v))} دلار`;
}

/** «+۶٫۷٪» / «−۲٫۱٪» */
export function fmtPctFa(v: number | null): string {
  if (!ok(v)) return '—';
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${fa1.format(Math.abs(v))}٪`;
}
