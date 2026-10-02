/** ============================================================
 * مقدار دقیق — همه محاسبات مالی این ماژول با decimal.js
 * ورودی کاربر (ارقام فارسی/عربی، جداکننده هزارگان) نرمال می‌شود؛
 * گرد کردن فقط در لایهٔ نمایش انجام می‌شود.
 * ============================================================ */
import Decimal from 'decimal.js';

// دقت کافی برای مقدارهای ۱۸ رقمی اعشار + بخش صحیح بزرگ
const D = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_EVEN, toExpNeg: -40, toExpPos: 60 });

export type Dec = InstanceType<typeof D>;

const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';

/** تبدیل ارقام فارسی/عربی و جداکننده‌ها به قالب لاتین */
export function normalizeNumericInput(raw: string): string {
  let s = '';
  for (const ch of raw.trim()) {
    const fa = FA.indexOf(ch);
    const ar = AR.indexOf(ch);
    if (fa >= 0) s += String(fa);
    else if (ar >= 0) s += String(ar);
    else if (ch === '٫') s += '.'; // جداکنندهٔ اعشار فارسی
    else if (ch === ',' || ch === '٬' || ch === '_' || ch === ' ') continue; // هزارگان
    else s += ch;
  }
  return s;
}

export type AmountCheck =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * اعتبارسنجی مقدار مثبت با دقت مجاز.
 * @param decimals decimals تأییدشدهٔ دارایی؛ null یعنی محدودیت دقت اعمال نمی‌شود
 */
export function parsePositiveAmount(raw: string, decimals: number | null): AmountCheck {
  const s = normalizeNumericInput(raw);
  if (s === '') return { ok: false, error: 'مقدار را وارد کنید' };
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, error: 'فقط عدد مثبت (با نقطهٔ اعشار) مجاز است' };
  const v = new D(s);
  if (v.lte(0)) return { ok: false, error: 'مقدار باید بزرگ‌تر از صفر باشد' };
  const frac = s.includes('.') ? s.split('.')[1].length : 0;
  if (decimals !== null && frac > decimals) {
    return { ok: false, error: `این دارایی حداکثر ${decimals} رقم اعشار دارد` };
  }
  return { ok: true, value: v.toFixed() };
}

export function dec(v: string | number | Dec): Dec {
  return new D(v);
}

export function add(a: string, b: string): string {
  return new D(a).plus(b).toFixed();
}

export function sub(a: string, b: string): string {
  return new D(a).minus(b).toFixed();
}

export function neg(a: string): string {
  return new D(a).neg().toFixed();
}

export function isZero(a: string): boolean {
  return new D(a).isZero();
}

export function cmp(a: string, b: string): number {
  return new D(a).cmp(b);
}

export function mul(a: string, b: string | number): string {
  return new D(a).times(b).toFixed();
}

const faDigits = (x: string) => x.replace(/[0-9]/g, (d) => FA[Number(d)]);

/**
 * نمایش مقدار بدون گرد کردن مخرب (ارقام فارسی، «,» هزارگان، «.» اعشار):
 * تا `maxFrac` رقم اعشار نشان می‌دهد و اگر رقم معنادار بیشتری باشد «…» اضافه می‌کند
 * (مقدار کامل در title/جزئیات در دسترس است).
 */
export function formatAmount(v: string | null | undefined, maxFrac = 8): string {
  if (v === null || v === undefined || v === '') return '—';
  let d: Dec;
  try {
    d = new D(v);
  } catch {
    return v;
  }
  const full = d.toFixed();
  const [int, frac = ''] = full.replace('-', '').split('.');
  const intGrouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = d.isNeg() && !d.isZero() ? '-' : '';
  if (!frac) return faDigits(sign + intGrouped);
  const shown = frac.slice(0, maxFrac).replace(/0+$/, '');
  const truncated = frac.length > maxFrac && /[1-9]/.test(frac.slice(maxFrac));
  return faDigits(sign + intGrouped + (shown ? '.' + shown : '') + (truncated ? '…' : ''));
}

/** بخش عددی مبلغ دلاری (۲ رقم، فقط برای نمایش) — «۱,۲۳۴.۲۳» / «-۱۲.۵۰» */
export function formatUsdNumber(v: string): string {
  const d = new D(v);
  const abs = d.abs().toFixed(2);
  const [i, f] = abs.split('.');
  return faDigits((d.isNeg() && !d.abs().lt(0.005) ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + f);
}

/** مبلغ دلاری متنی — «۱,۲۳۴.۲۳ دلار» (بدون «$») */
export function formatUsd(v: string | null | undefined): string {
  if (v === null || v === undefined) return 'نامشخص';
  return `${formatUsdNumber(v)} دلار`;
}
