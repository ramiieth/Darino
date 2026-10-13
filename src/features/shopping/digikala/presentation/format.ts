import { fmtTomanAmount, toEnDigits, toFaDigits } from '@/shared/utils/formatters';

export const fmtPrice = (toman: number | null) => (toman == null ? 'ناموجود' : fmtTomanAmount(toman));
export const fmtStars = (stars: number | null) => (stars == null ? 'بدون امتیاز' : toFaDigits(stars.toFixed(1)));
export const fmtCount = (n: number) => toFaDigits(new Intl.NumberFormat('en-US').format(n));

/** «۲۵ میلیون» / «25,000,000» → 25000000؛ خالی یا نامعتبر → null */
export function parseToman(input: string): number | null {
  const s = toEnDigits(input).replace(/[,،\s]/g, '');
  if (!s) return null;
  const m = /^(\d+(?:\.\d+)?)(میلیون|م|هزار|ه)?(تومان)?$/.exec(s);
  if (!m) return null;
  const mult = m[2]?.startsWith('م') ? 1_000_000 : m[2]?.startsWith('ه') ? 1_000 : 1;
  const v = Math.round(Number(m[1]) * mult);
  return v > 0 ? v : null;
}
