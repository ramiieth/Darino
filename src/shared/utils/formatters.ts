/**
 * ابزارهای قالب‌بندی — سیاست نمایش اعداد در کل اپ (درخواست کارفرما ۲۰۲۶-۱۰):
 *
 *  • ارقام همیشه فارسی (۰–۹ فارسی) — هیچ رقم انگلیسی.
 *  • جداکنندهٔ هزارگان «,» و اعشار «.» (نه «٬» و «٫»): ۱,۲۳۴.۲۳
 *  • دلار: بدون «$»؛ واژهٔ «دلار» پس از عدد (در کامپوننت‌ها با قلم کوچک — MoneyValue).
 *  • درصد: «٪» · مقدار نامعتبر: «—»
 *  • اعداد بزرگ (compact): «هزار / میلیون / میلیارد / تریلیون» (نه K/M/B/T)
 *  • فونت «Vazirmatn FD» هم هر رقم لاتینِ باقی‌مانده را فارسی رسم می‌کند (لایهٔ دوم اطمینان).
 */

const NA = '—';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** تبدیل ارقام لاتین به فارسی — بقیهٔ نویسه‌ها (از جمله , و .) دست نمی‌خورند */
export function toFaDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

const nf = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat('en-US', opts);
const dec2 = nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int0 = nf({ maximumFractionDigits: 0 });
const compact1 = nf({ minimumFractionDigits: 0, maximumFractionDigits: 1 });
/** قیمت‌های ۰.۰۱ تا ۱ دلار — تا ۶ رقم اعشار */
const priceLow = nf({ minimumFractionDigits: 2, maximumFractionDigits: 6 });
/** قیمت‌های ریز زیر ۰.۰۱ دلار — ۴ رقم معنادار */
const sig4 = nf({ maximumSignificantDigits: 4 });

const bad = (v: number | null | undefined): v is null | undefined => v === null || v === undefined || Number.isNaN(v);

/** عدد فارسی با «,» و «.» — هستهٔ مشترک همهٔ قالب‌ها */
export function faNumber(v: number, opts: Intl.NumberFormatOptions = { maximumFractionDigits: 2 }): string {
  return toFaDigits(nf(opts).format(v));
}

/** «۱.۳ تریلیون» · «۷۲.۱ میلیون» · «۴.۵ هزار» */
export function fmtCompactFa(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const units: [number, string][] = [
    [1e12, 'تریلیون'],
    [1e9, 'میلیارد'],
    [1e6, 'میلیون'],
    [1e3, 'هزار']
  ];
  for (const [n, w] of units) if (a >= n) return `${sign}${toFaDigits(compact1.format(a / n))} ${w}`;
  return `${sign}${toFaDigits(compact1.format(a))}`;
}

/* ---------- دلار ---------- */

/** فقط بخش عددی مبلغ دلاری (بدون واژهٔ «دلار») — برای کامپوننت‌هایی که واحد را کوچک نشان می‌دهند */
export function fmtUsdNumber(v: number, compact = false): string {
  if (v < 0) return `-${fmtUsdNumber(-v, compact)}`;
  if (compact) return fmtCompactFa(v);
  // قیمت‌های زیر ۱ دلار — دقت بیشتر تا هرگز «۰.۰۰» نمایش داده نشود
  if (v > 0 && v < 1) return toFaDigits((v < 0.01 ? sig4 : priceLow).format(v));
  return toFaDigits(dec2.format(v));
}

/** مبلغ دلاری: «۱,۲۳۴.۲۳ دلار» (compact برای اعداد بزرگ) */
export function fmtUSD(v: number | null | undefined, compact = false): string {
  if (bad(v)) return NA;
  return `${fmtUsdNumber(v, compact)} دلار`;
}

/** مبلغ دلاری با علامت صریح برای سود/زیان: «+۱۲.۵۰ دلار» / «-۱۲.۵۰ دلار» / «۰.۰۰ دلار» */
export function fmtUsdSigned(v: number | null | undefined, compact = false): string {
  if (bad(v)) return NA;
  // مبالغ (سود/زیان، جریان) همیشه ۲ رقم اعشار؛ دقت بیشتر فقط برای قیمت واحد است
  const abs = Math.abs(v);
  const body = `${compact ? fmtCompactFa(abs) : toFaDigits(dec2.format(abs))} دلار`;
  return v > 0 ? `+${body}` : v < 0 ? `-${body}` : body;
}

/** مبلغ دلاری کامل بدون اعشار — «۸۸,۷۹۹ دلار» */
export function fmtUsdAmount(usd: number | null | undefined): string {
  if (bad(usd)) return NA;
  return `${toFaDigits(int0.format(usd))} دلار`;
}

/**
 * مبلغ دلاری در متن روان (گزارش، ژورنال، اعلان) — «۲۳,۶۰۵.۰۰ دلار» / «-۱۲.۵۰ دلار» / «+۷.۰۰ دلار»
 *   همیشه دقیقاً دو رقم اعشار (مثل fmtUSD) تا «,» هزارگان با اعشار اشتباه نشود؛ compact: «۱.۲ میلیون دلار». هرگز «$».
 */
export function usdText(v: number | null | undefined, opts: { signed?: boolean; compact?: boolean; plain?: boolean } = {}): string {
  if (bad(v) || !Number.isFinite(v)) return NA;
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : opts.signed && v > 0 ? '+' : '';
  const body = opts.compact && a >= 1e3 ? fmtCompactFa(a) : toFaDigits(dec2.format(a));
  if (opts.plain) return `${sign}${body} دلار`;
  // جدا کردن جهت: عبارت راست‌به‌چپ، عدد (با علامت) چپ‌به‌راست؛ داخل ظرف ltr (num-ltr) هم «دلار» برعکس نمی‌شود
  const [num, ...scale] = body.split(' ');
  return `${RLI}${LRI}${sign}${num}${PDI}${scale.length ? ` ${scale.join(' ')}` : ''} دلار${PDI}`;
}

/** نشانه‌های نامرئی جداسازی جهت یونیکد (RLI / LRI / PDI) */
const RLI = '\u2067';
const LRI = '\u2066';
const PDI = '\u2069';
/** حذف نشانه‌های جهت (برای مقایسه و متن ساده) */
export const stripBidi = (t: string) => t.replace(/[\u2066-\u2069]/g, '');

/* ---------- عدد و درصد ---------- */

/** عدد با دو رقم اعشار (مثل مقدار اتر) — نام تاریخی؛ ارقام فارسی */
export function fmtNumLatin(v: number | null | undefined): string {
  if (bad(v)) return NA;
  return toFaDigits(dec2.format(v));
}

/** عدد صحیح — نام تاریخی؛ ارقام فارسی */
export function fmtIntLatin(v: number | null | undefined): string {
  if (bad(v)) return NA;
  return toFaDigits(int0.format(v));
}

/** درصد با علامت صریح: «+۲.۴۱٪» / «-۱.۲۰٪» */
export function fmtPct(v: number | null | undefined): string {
  if (bad(v)) return NA;
  const sign = v > 0 ? '+' : '';
  return `${sign}${toFaDigits(dec2.format(v))}٪`;
}

/** درصد بدون علامت (نمودارها) */
export function fmtPctEn(v: number | null | undefined): string {
  if (bad(v)) return NA;
  return `${toFaDigits(dec2.format(v))}٪`;
}

/** عدد با دو رقم اعشار */
export function fmtNum(v: number | null | undefined): string {
  if (bad(v)) return NA;
  return toFaDigits(dec2.format(v));
}

/** عدد صحیح */
export function fmtInt(v: number | null | undefined): string {
  if (bad(v)) return NA;
  return toFaDigits(int0.format(v));
}

/** درصد (متن روایی) */
export function fmtPctFa(v: number | null | undefined): string {
  return fmtPct(v);
}

/* ---------- معادل تومانی ---------- */

/**
 * معادل تومانی یک مبلغ دلاری با نرخ زنده تتر (تومان بر دلار):
 *  ۳۶,۹۰۰ دلار × ۱۴۸,۰۰۰ → «≈ ۵.۴۶ میلیارد تومان»
 * نرخ نامشخص → «—» (هرگز نرخ فرضی)
 */
export function fmtToman(usd: number | null | undefined, rateToman: number | null | undefined): string {
  if (bad(usd)) return NA;
  if (!rateToman || !(rateToman > 0)) return NA;
  const toman = usd * rateToman;
  if (toman >= 1e9) return `≈ ${toFaDigits(dec2.format(toman / 1e9))} میلیارد تومان`;
  if (toman >= 1e6) return `≈ ${toFaDigits(dec2.format(toman / 1e6))} میلیون تومان`;
  if (toman >= 1e3) return `≈ ${toFaDigits(int0.format(toman / 1e3))} هزار تومان`;
  return `≈ ${toFaDigits(dec2.format(toman))} تومان`;
}

/** تبدیل ارقام فارسی/عربی به لاتین — برای جستجو */
export function toEnDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/** نرمال‌سازی برای جستجو */
export function normalizeForSearch(input: string): string {
  return toEnDigits(input).toLowerCase().trim();
}

/** کلاس رنگ برای مقادیر مثبت/منفی/خنثی */
export function pnlClass(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v) || v === 0) return 'text-ink';
  return v > 0 ? 'text-positive' : 'text-negative';
}

/** فلش جهت برای حالت‌های مثبت/منفی (نیازمند کوررنگی) */
export function pnlArrow(v: number | null | undefined): '▲' | '▼' | '' {
  if (v === null || v === undefined || Number.isNaN(v) || v === 0) return '';
  return v > 0 ? '▲' : '▼';
}

export function fmtTime(ts: number): string {
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(ts));
  } catch {
    return '';
  }
}

export function fmtDateTime(ts: number): string {
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(ts));
  } catch {
    return '';
  }
}

/** مبلغ تومانی کامل — «۱۲,۵۰۰,۰۰۰,۰۰۰ تومان» */
export function fmtTomanAmount(toman: number | null | undefined): string {
  if (bad(toman)) return NA;
  return `${toFaDigits(int0.format(toman))} تومان`;
}

/** سن نسبی داده — «همین الان»، «۴۵ ثانیه پیش»، «۳ دقیقه پیش»… (ارقام فارسی) */
export function fmtRelativeAge(ts: number | null | undefined, now = Date.now()): string {
  if (!ts || !Number.isFinite(ts)) return '—';
  const diff = Math.max(0, now - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return 'همین الان';
  if (sec < 60) return `${toFaDigits(sec)} ثانیه پیش`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${toFaDigits(min)} دقیقه پیش`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${toFaDigits(hr)} ساعت پیش`;
  const day = Math.floor(hr / 24);
  return `${toFaDigits(day)} روز پیش`;
}
