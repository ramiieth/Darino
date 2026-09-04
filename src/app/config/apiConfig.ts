/**
 * پیکربندی API ها
 *
 * آلفا وانتج:
 *  - کلید از متغیر محیطی `VITE_ALPHA_VANTAGE_KEY` یا مقدار پیش‌فرض.
 *  - ⚠️ سیاست فعلی نسخه رایگان (تأییدشده با تست مستقیم API):
 *      «free key rate limit (25 requests per day)» — فقط ۲۵ درخواست در روز.
 *    (محدودیت ۵۰۰/روز در مشخصات اولیه منسوخ شده است.)
 *  - برای همین: سهمیه‌بندی روزانه + پشتیبانی از چند کلید + اولویت‌بندی نمادها.
 *
 * کوین‌گکو:
 *  - یک درخواست دسته‌ای با ids جدا شده با کاما.
 *  - کش با staleTime: ۶۰٬۰۰۰ms در TanStack Query.
 */

export const ALPHA_VANTAGE_KEY: string =
  (import.meta.env.VITE_ALPHA_VANTAGE_KEY as string | undefined) ?? 'WZK7BAKRT8C09M4A';

/** کلیدهای اضافه پیش‌فرض (هر کدام ۲۵ درخواست/روز → مجموع سهمیه ۵×۲۲ = ۱۱۰/روز) */
export const DEFAULT_AV_EXTRA_KEYS: string[] = [
  '3T6JSWK73BBYIY8J',
  'DBGO7D7S2A61J3D3',
  'ZGPOE0M6RWKETD12',
  'JW06RR4GITUFN0FL'
];

export const ALPHA_VANTAGE_BASE = 'https://www.alphavantage.co/query';

/**
 * CoinGecko — همیشه از طریق پروکسی سرور-سمت (same-origin):
 *  - Dev (Vite):   /coingecko-api  ← پروکسی vite.config.ts (کلید سرور-سمت)
 *  - Prod (Vercel): /api/cg        ← Serverless Function (api/cg.ts — کلید سرور-سمت)
 * همه مصرف‌کننده‌ها از این ثابت استفاده می‌کنند؛ در Production هم مثل سندباکس کار می‌کند.
 */
export const COINGECKO_BASE = import.meta.env.PROD ? '/api/cg' : '/coingecko-api';

/** کش قیمت‌های رمزارز (TanStack staleTime) */
export const CRYPTO_STALE_MS = 60_000;
/** فاصله به‌روزرسانی خودکار رمزارزها */
export const CRYPTO_REFETCH_MS = 120_000;
/** اعتبار کش قیمت سهام در IndexedDB */
export const STOCK_STALE_MS = 30 * 60_000; // ۳۰ دقیقه
/** حداقل فاصله بین درخواست‌های آلفا وانتج */
export const STOCK_GAP_MS = 12_000;
export const STOCK_MAX_PER_WINDOW = 5;
export const STOCK_WINDOW_MS = 60_000;
/** سقف روزانه واقعی هر کلید (طبق سیاست فعلی آلفا وانتج) */
export const AV_FREE_DAILY_LIMIT = 25;
/** سهمیه امن مصرفی ما از هر کلید (با احتیاط زیر سقف) */
export const AV_DAILY_BUDGET_PER_KEY = 22;
/** حداکثر تعداد کلید قابل ثبت */
export const AV_MAX_KEYS = 5;
/** فاصله ذخیره‌سازی خاموش (وقتی هیچ کش تازه‌ای نیست) */
export const OFFLINE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // ۲۴ ساعت
