/** ============================================================
 * عملکرد و مقایسه سرمایه — تایپ‌های پایه
 *
 *  سابقهٔ ارزش دارایی (ValueRecord) ≠ تراکنش:
 *    تراکنش = یک رویداد مالی در یک لحظه (واریز، سواپ، انتقال…) — در بخش تراکنش‌ها می‌ماند.
 *    سابقهٔ ارزش = مجموع ارزش سرمایه در یک تاریخ — فقط اینجا.
 *  هیچ رکورد پیش‌فرض یا نمونه‌ای وجود ندارد؛ همه‌چیز را کاربر ثبت می‌کند.
 * ⚠️ بدون alias «@/» — طرح‌وارهٔ سرور هم از این فایل import می‌کند.
 * ============================================================ */

/** نقطهٔ سری: [زمان (ms، شروع روز UTC یا تاریخ مرجع)، مقدار] */
export type Pt = [number, number];

/** تفکیک منشأ ارزش لحظه‌ای (پیشنهاد از دارایی‌های متصل) */
export interface ValueBreakdown {
  /** توکن‌های عادی کیف پول‌ها */
  wallets: number | null;
  /** موقعیت‌های دیفای (استیک، وام‌دهی، LP، پندل…) */
  defi: number | null;
  /** ارزش حساب‌های پرپچوال (آرکوس، لایتر، هایپرلیکوئید، …) */
  perps: number | null;
  /** کیف پول‌های بیت‌کوین (در صورت اتصال) */
  bitcoin: number | null;
  /** منبع‌هایی که پاسخ نداده‌اند یا ناقص‌اند */
  partial: boolean;
  capturedAt: number;
}

/** یک سابقهٔ ارزش کل دارایی */
export interface ValueRecord {
  id: string;
  /** تاریخ سابقه (ms؛ ساعت ۱۲ محلی همان روز) — تاریخ شمسی و میلادی از همین ساخته می‌شوند */
  dateTs: number;
  /** ارزش کل به دلار */
  usd: number;
  /** نرخ دلار به تومان همان تاریخ (null = نامعلوم) */
  rateToman: number | null;
  /** منبع نرخ: تاریخچهٔ روزانهٔ تتر اپ، نرخ زندهٔ اپ، یا ورود دستی کاربر */
  rateSource: 'history' | 'live' | 'manual' | null;
  /** ارزش کل به تومان (به‌طور پیش‌فرض usd × rate؛ کاربر می‌تواند خودش وارد کند) */
  toman: number | null;
  note: string;
  /** manual = ورود دستی · live = ثبت Snapshot از ارزش لحظه‌ای با تأیید کاربر */
  origin: 'manual' | 'live';
  breakdown?: ValueBreakdown | null;
  createdAt: number;
  updatedAt: number;
  /** حذف نرم (قاعدهٔ همگام‌سازی prefs) */
  deleted?: boolean;
}

/** جریان نقدی خارجی (واریز از بیرون + / برداشت به بیرون −) — فقط برای محاسبهٔ بازده */
export interface ExternalFlow {
  id: string;
  dateTs: number;
  /** مثبت = واریز به سرمایه از بیرون · منفی = برداشت به بیرون */
  usd: number;
  note: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

/** نقطهٔ شاخص قیمت مصرف‌کنندهٔ ایران که کاربر از منبع رسمی وارد می‌کند */
export interface CpiPoint {
  id: string;
  dateTs: number;
  index: number;
  /** نام منبع (مثلاً «مرکز آمار ایران، پایه ۱۴۰۰») */
  source: string;
}

export interface PerfSettings {
  /** بازارهای فعال در مقایسه */
  enabledMarkets: string[];
  /** ارزهای دیجیتال منتخب اضافه (نماد هایپرلیکوئید) */
  extraCoins: string[];
  /** مدل خودرو (شناسهٔ مدل car.ir) */
  carModelId: string | null;
  /** محله‌های املاک اهواز (کلید محله یا منطقه) */
  neighborhoods: string[];
  /** کاربر تأیید کرده همهٔ واریز/برداشت‌های خارجی ثبت شده‌اند → TWR/XIRR معتبر */
  flowsComplete: boolean;
  /** شاخص رسمی CPI ایران (ورود کاربر، با منبع) */
  iranCpi: CpiPoint[];
}

export type SeriesUnit = 'usd' | 'toman' | 'index';
export type SeriesFrequency = 'daily' | 'monthly' | 'annual' | 'snapshot';

/** سری قیمت/شاخص یک بازار */
export interface Series {
  id: string;
  points: Pt[];
  unit: SeriesUnit;
  frequency: SeriesFrequency;
  source: string;
  sourceUrl?: string;
  fetchedAt: number;
  /** برچسب تکمیلی (مثلاً مدل و سال خودرو) */
  detail?: string;
}

/** پاسخ سرور /api/intel?op=benchmarks */
export interface BenchmarksPayload {
  fetchedAt: number;
  series: Record<string, Series>;
  /** سری‌هایی که منبعشان پاسخ نداد */
  failed: Record<string, string>;
}

/** گزارش ذخیره‌شدهٔ Gemini (فقط متن تحلیلی؛ هیچ داده‌ای را تغییر نمی‌دهد) */
export interface SavedReport {
  id: string;
  createdAt: number;
  periodStart: number;
  periodEnd: number;
  text: string;
  sources: string[];
  model: 'gemini';
  deleted?: boolean;
}
