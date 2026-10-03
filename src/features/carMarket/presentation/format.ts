/** ============================================================
 * Car Market — قالب‌بندی (همه اعداد با ارقام فارسی)
 * ============================================================ */
import { toFaDigits } from '@/shared/utils/formatters';
import { CATEGORY_FA } from '../domain/brands';
import type { CarPriceRow } from '../domain/types';

const nf = (d: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: d });
const ok = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

/** «۲٫۵۵ میلیارد» / «۸۵۰ میلیون» تومان */
export function fmtCarToman(v: number | null | undefined): string {
  if (!ok(v)) return '—';
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1_000_000_000) return `${sign}${toFaDigits(nf(a >= 10_000_000_000 ? 1 : 2).format(a / 1_000_000_000))} میلیارد`;
  if (a >= 1_000_000) return `${sign}${toFaDigits(nf(0).format(a / 1_000_000))} میلیون`;
  return `${sign}${toFaDigits(nf(0).format(a))}`;
}

/** تغییر علامت‌دار تومانی: «+۱۲۰ میلیون» */
export function fmtCarTomanSigned(v: number | null | undefined): string {
  if (!ok(v)) return '—';
  if (Math.abs(v) < 1_000_000) return '';
  return `${v > 0 ? '+' : ''}${fmtCarToman(v)}`;
}

/** «۱۲٬۳۴۵ دلار» */
export function fmtCarUsd(v: number | null | undefined): string {
  if (!ok(v)) return '—';
  return `${toFaDigits(nf(0).format(Math.round(v)))} دلار`;
}

export function fmtCarUsdSigned(v: number | null | undefined): string {
  if (!ok(v)) return '—';
  const r = Math.round(v);
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${toFaDigits(nf(0).format(Math.abs(r)))} دلار`;
}

/** «+۲٫۴٪» / «−۱٫۹٪» */
export function fmtCarPct(v: number | null | undefined): string {
  if (!ok(v)) return '—';
  const sign = v > 0.049 ? '+' : v < -0.049 ? '−' : '';
  return `${sign}${toFaDigits(nf(1).format(Math.abs(v)))}٪`;
}

/** «۱۴۰۵» / «۲۰۲۵ · دو دیفرانسیل» */
export function trimLabel(r: Pick<CarPriceRow, 'year' | 'option'>): string {
  return [toFaDigits(r.year), r.option].filter(Boolean).join(' · ');
}

export { CATEGORY_FA };

/** نرمال‌سازی جستجوی فارسی/انگلیسی (ي/ك عربی، نیم‌فاصله، ارقام) */
export function normalizeQuery(s: string): string {
  return s
    .replace(/[ي]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[\s‌\-_.]/g, '')
    .toLowerCase();
}
