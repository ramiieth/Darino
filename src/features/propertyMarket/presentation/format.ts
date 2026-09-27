/** ============================================================
 * Property Market — قالب‌بندی فشرده قیمت‌ها (ارقام فارسی)
 * ============================================================ */

/** «۵۰M» — تومان هر متر، فشرده به میلیون */
export function fmtMillionToman(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  const fa = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });
  return `${fa.format(v / 1_000_000)}M`;
}

/** «۳٫۱ میلیارد» / «۸۵۰ میلیون» — قیمت کل فشرده */
export function fmtTotalToman(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  const fa = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 });
  return v >= 1_000_000_000 ? `${fa.format(v / 1_000_000_000)} میلیارد` : `${fa.format(Math.round(v / 1_000_000))} میلیون`;
}
