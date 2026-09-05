/** ============================================================
 * assetDisplayName — تنها منبع حقیقت برای «نام نمایشی» دارایی‌ها
 *
 * ⚠️ فقط Presentation Layer:
 *   - Symbol واقعی هرگز تغییر نمی‌کند (BTC همان BTC می‌ماند)
 *   - هیچ داده بازار / API / DB / محاسبه‌ای اینجا دست نمی‌خورد
 *   - نگاشت فقط برای دارایی‌های شناخته‌شده است؛ برای نماد ناشناخته
 *     نام فعلی (یا خود Ticker) حفظ می‌شود — هرگز حدس زده نمی‌شود.
 * ============================================================ */

/** نگاشت نماد → نام فارسی رایج (فقط موارد قطعی و شناخته‌شده) */
export const ASSET_NAME_FA: Record<string, string> = {
  /* ---------- لایه ۱ / لایه ۲ و رمزارزهای اصلی ---------- */
  BTC: 'بیت‌کوین',
  WBTC: 'بیت‌کوین رپد',
  ETH: 'اتریوم',
  WETH: 'اتریوم رپد',
  STETH: 'استیک‌شده اتریوم',
  WSTETH: 'اتریوم استیک‌شده رپد',
  SOL: 'سولانا',
  BNB: 'بایننس کوین',
  XRP: 'ریپل',
  ADA: 'کاردانو',
  DOGE: 'دوج‌کوین',
  AVAX: 'آوالانچ',
  LINK: 'چین‌لینک',
  DOT: 'پولکادات',
  TRX: 'ترون',
  TON: 'گرام',
  MATIC: 'پالیگان',
  POL: 'پالیگان',
  LTC: 'لایت‌کوین',
  BCH: 'بیت‌کوین کش',
  XLM: 'استلار',
  XMR: 'مونرو',
  ZEC: 'زدکش',
  ETC: 'اتریوم کلاسیک',
  NEAR: 'نیر',
  ATOM: 'کازموس',
  APT: 'آپتوس',
  SUI: 'سویی',
  SEI: 'سی‌آی',
  ICP: 'اینترنت کامپیوتر',
  FIL: 'فایل‌کوین',
  ALGO: 'الگورند',
  HBAR: 'هدرا',
  VET: 'وی‌چین',
  KAS: 'کاسپا',
  TIA: 'سلستیا',
  INJ: 'اینجکتیو',
  OP: 'اپتیمیزم',
  ARB: 'آربیتروم',
  STX: 'استکس',
  RENDER: 'رندر',
  RNDR: 'رندر',
  IMX: 'ایمیوتبل ایکس',

  /* ---------- دیفای ---------- */
  UNI: 'یونی‌سواپ',
  AAVE: 'آوه',
  MKR: 'میکر',
  SKY: 'اسکای',
  CRV: 'کرو',
  LDO: 'لیدو',
  PENDLE: 'پندل',
  ONDO: 'اندو',
  MORPHO: 'مورفو',
  ENA: 'اتنا',
  HYPE: 'هایپرلیکوئید',
  ETHFI: 'اتر‌فای',
  MNT: 'منتل',
  SNX: 'سینتتیکس',
  COMP: 'کامپاند',
  SUSHI: 'سوشی‌سواپ',
  GRT: 'گراف',
  RUNE: 'ثورچین',
  CAKE: 'پنکیک‌سواپ',
  JUP: 'ژوپیتر',
  RAY: 'ریدیوم',

  /* ---------- استیبل‌کوین ---------- */
  USDT: 'تتر',
  USDC: 'یو‌اس‌دی‌سی',
  DAI: 'دای',
  USDE: 'یو‌اس‌دی‌ای',
  SUSDE: 'اس‌یو‌اس‌دی‌ای',
  FDUSD: 'اف‌دی‌یو‌اس‌دی',
  TUSD: 'تروو یو‌اس‌دی',
  PYUSD: 'پی‌پال یو‌اس‌دی',
  USDS: 'یو‌اس‌دی‌اس',
  BUSD: 'بایننس یو‌اس‌دی',

  /* ---------- طلا / کالای توکن‌ایز ---------- */
  XAUT: 'تتر گلد',
  PAXG: 'پکس گلد',
  XAU: 'طلا',
  XAG: 'نقره',

  /* ---------- میم‌کوین‌های شناخته‌شده ---------- */
  SHIB: 'شیبا اینو',
  PEPE: 'پپه',
  BONK: 'بانک',
  WIF: 'داگ‌ویف‌هت',
  FLOKI: 'فلوکی'
};

export interface AssetDisplayName {
  /** نام اصلی نمایشی (فارسی در صورت وجود نگاشت، وگرنه نام فعلی/Ticker) */
  name: string;
  /** Ticker رسمی بازار — همیشه حفظ می‌شود */
  ticker: string;
  /** آیا نام فارسی شناخته‌شده‌ای پیدا شد؟ */
  mapped: boolean;
  /** نام فارسی برای RTL است؟ (برای dir صحیح در UI) */
  rtl: boolean;
}

/** آیا رشته حداقل یک حرف فارسی/عربی دارد؟ */
function hasPersian(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

/**
 * نام نمایشی یک دارایی.
 * @param symbol نماد رسمی بازار (بدون تغییر بازگردانده می‌شود)
 * @param fallbackName نام فعلی موجود در سیستم (مثلاً nameFa منابع دیگر)
 */
export function assetDisplayName(symbol: string, fallbackName?: string | null): AssetDisplayName {
  const ticker = (symbol ?? '').trim();
  const key = ticker.toUpperCase();
  const fa = ASSET_NAME_FA[key];
  if (fa) return { name: fa, ticker, mapped: true, rtl: true };

  const fallback = (fallbackName ?? '').trim();
  if (fallback && fallback.toUpperCase() !== key) {
    return { name: fallback, ticker, mapped: false, rtl: hasPersian(fallback) };
  }
  // ناشناخته → فقط Ticker (هیچ حدسی زده نمی‌شود)
  return { name: ticker, ticker, mapped: false, rtl: false };
}

/** آیا برای این نماد نام فارسی شناخته‌شده وجود دارد؟ */
export function hasAssetNameFa(symbol: string): boolean {
  return Boolean(ASSET_NAME_FA[(symbol ?? '').trim().toUpperCase()]);
}

/** متن قابل جستجو (نماد + نام فعلی + نام فارسی) — فقط Client-side */
export function assetSearchText(symbol: string, fallbackName?: string | null): string {
  const d = assetDisplayName(symbol, fallbackName);
  return `${d.ticker} ${d.name} ${fallbackName ?? ''}`.toLowerCase();
}
