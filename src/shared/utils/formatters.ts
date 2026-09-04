/**
 * ابزارهای قالب‌بندی — سیاست نمایش (ممیزی §۸/§۱۰):
 *
 *  چیدمان/متن: RTL فارسی
 *  قیمت، ارزش، درصد، سود/زیان، تعداد واحد: ارقام لاتین + ایزوله LTR (.num-ltr)
 *  معادل تومانی: ارقام فارسی (طبق نظر کارفرما: «عدد کنار میلیارد تومان فارسی»)
 *  تعداد ردیف/متن روایی: ارقام فارسی
 */

const faDecimal = new Intl.NumberFormat('fa-IR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const faInt = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });
const faPct = new Intl.NumberFormat('fa-IR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const faCompact = new Intl.NumberFormat('fa-IR', {
  notation: 'compact',
  maximumFractionDigits: 1
});
const enDecimal = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const enInt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const enCompact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
/** قیمت‌های ۰.۰۱ تا ۱ دلار — تا ۶ رقم اعشار (بدون گرد شدن به $0.00) */
const enPriceLow = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6
});
/** قیمت‌های ریز زیر ۰.۰۱ دلار — ۴ رقم معنادار (مثل SHIB/PEPE) */
const enSig4 = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 4 });

/* ---------- ارقام لاتین (داده‌های مالی) ---------- */

/** قیمت/ارزش دلاری: $ + ارقام لاتین (compact برای اعداد بزرگ) */
export function fmtUSD(v: number | null | undefined, compact = false): string {
  if (v === null || v === undefined || Number.isNaN(v)) return 'N/A';
  if (compact) return `$${enCompact.format(v)}`;
  // قیمت‌های زیر ۱ دلار — دقت بیشتر تا هیچ‌وقت $0.00 نمایش داده نشود
  if (v > 0 && v < 1) {
    if (v < 0.01) return `$${enSig4.format(v)}`;
    return `$${enPriceLow.format(v)}`;
  }
  return `$${enDecimal.format(v)}`;
}

/** عدد لاتین با دو رقم اعشار (مثل مقدار ETH) */
export function fmtNumLatin(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return 'N/A';
  return enDecimal.format(v);
}

/** عدد صحیح لاتین (مثل تعداد USDT) */
export function fmtIntLatin(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return 'N/A';
  return enInt.format(v);
}

/** درصد لاتین با علامت صریح: +2.41% / −1.20% */
export function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return 'N/A';
  const sign = v > 0 ? '+' : '';
  return `${sign}${enDecimal.format(v)}%`;
}

/** درصد لاتین بدون علامت (نمودارها) */
export function fmtPctEn(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return 'N/A';
  return `${enDecimal.format(v)}%`;
}

/* ---------- ارقام فارسی (متن روایی / تومان) ---------- */

/** عدد فارسی با دو رقم اعشار */
export function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return 'N/A';
  return faDecimal.format(v);
}

/** عدد صحیح فارسی */
export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return 'N/A';
  return faInt.format(v);
}

/** درصد فارسی (متن روایی) */
export function fmtPctFa(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return 'N/A';
  const sign = v > 0 ? '+' : '';
  return `${sign}${faPct.format(v)}٪`;
}

/* ---------- معادل تومانی (ارقام فارسی طبق دستور کارفرما) ---------- */

const FA_RATE_KEY = 'app:fxRate';

/** نرخ پیش‌فرض دلار به تومان (قابل تغییر توسط ادمین در تنظیمات) */
export const DEFAULT_IRR_RATE = 1_480_000;

/**
 * معادل تومانی یک مبلغ دلاری با ارقام فارسی:
 *  $36,900 × 1.48M → «≈ ۵٫۴۶ میلیارد تومان»
 */
export function fmtToman(usd: number | null | undefined, rate: number): string {
  if (usd === null || usd === undefined || Number.isNaN(usd) || rate <= 0) return 'N/A';
  const toman = (usd * rate) / 10; // IRR → تومان
  if (toman >= 1e9) return `≈ ${faDecimal.format(toman / 1e9)} میلیارد تومان`;
  if (toman >= 1e6) return `≈ ${faDecimal.format(toman / 1e6)} میلیون تومان`;
  if (toman >= 1e3) return `≈ ${faInt.format(toman / 1e3)} هزار تومان`;
  return `≈ ${faDecimal.format(toman)} تومان`;
}

export { FA_RATE_KEY };

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

/** تبدیل ارقام لاتین به فارسی (برای متن روایی/تومان) */
export function toFaDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

/** مبلغ تومانی کامل با جداکننده و ارقام فارسی — «۱۲٬۵۰۰٬۰۰۰٬۰۰۰ تومان» */
export function fmtTomanAmount(toman: number | null | undefined): string {
  if (toman === null || toman === undefined || Number.isNaN(toman)) return '—';
  return `${faInt.format(toman)} تومان`;
}

/** مبلغ دلاری کامل با جداکننده لاتین — «$88,799» */
export function fmtUsdAmount(usd: number | null | undefined): string {
  if (usd === null || usd === undefined || Number.isNaN(usd)) return '—';
  return `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(usd)}`;
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
