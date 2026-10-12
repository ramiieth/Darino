import { toEnDigits } from '@/shared/utils/formatters';

/** ورودی متنی (ارقام فارسی/لاتین، جداکنندهٔ هزارگان) → عدد؛ نامعتبر = NaN */
export function parseNum(s: string): number {
  const t = toEnDigits(s ?? '').replace(/[,\s٬]/g, '').replace('٫', '.');
  if (t === '' || t === '-' || t === '.') return NaN;
  return Number(t);
}

/** مثل parseNum ولی نامعتبر = fallback */
export function numOr(s: string, fallback = 0): number {
  const n = parseNum(s);
  return Number.isFinite(n) ? n : fallback;
}

/** نمایش ورودی قیمت بدون نماد علمی و با دقت مناسب */
export function priceInput(p: number | null | undefined): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return '';
  const digits = p >= 1000 ? 2 : p >= 1 ? 4 : p >= 0.01 ? 6 : 8;
  return String(Number(p.toFixed(digits)));
}
