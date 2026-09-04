/** ============================================================
 * CoinGecko Global Gate — دروازه نرخ سراسری (همه ماژول‌ها)
 *
 * مشکل: در بارگذاری صفحه، چند ماژول (بازار جدید + Top200 قدیمی +
 * توکنایز + لوگوها + جستجوها) هم‌زمان به CoinGecko درخواست می‌دهند و
 * سهمیه لحظه‌ای IP را همان ثانیه اول تمام می‌کنند → 429 زنجیره‌ای.
 *
 * راه‌حل: یک صف سراسری واحد که همه درخواست‌ها را با فاصله امن
 * (محافظه‌کارانه برای IPهای دیتاسنتر) سریال می‌کند + مدارشکن 429.
 *
 * ⚠️ همه ماژول‌های جدید باید از همین دروازه عبور کنند؛ هیچ‌کس مستقیم
 * به کوین‌گکو نمی‌زند (قانون ۳۴/۳۹: Rate Limit احترام گذاشته می‌شود).
 * ============================================================ */
import { RateLimitedQueue, RateLimitError } from '@/shared/lib/throttler';
import { fetchWithRetry } from '@/shared/lib/fetchWithRetry';

/**
 * CoinGecko با کلید اختصاصی (سرور-سمت): ~۳۰ درخواست/دقیقه.
 * دروازه محافظه‌کارانه: حداکثر ۲۰ درخواست/دقیقه + فاصله ۲ ثانیه‌ای.
 * هنگام 429 (کلید نامعتبر/سقف ماهانه): کول‌داون ۱ دقیقه‌ای (مدارشکن).
 */
export const cgGate = new RateLimitedQueue(2_000, 20, 60_000, 60_000);

export interface CgGateOptions {
  timeoutMs?: number;
}

/** درخواست کوین‌گکو با عبور از دروازه سراسری (same-origin پروکسی) */
export async function cgFetch(url: string, opts: CgGateOptions = {}): Promise<Response> {
  return cgGate.enqueue(async () => {
    const res = await fetchWithRetry(url, {
      retries: 0,
      timeoutMs: opts.timeoutMs ?? 20_000,
      headers: { accept: 'application/json' }
    });
    if (res.status === 429) {
      throw new RateLimitError('coingecko 429');
    }
    return res;
  });
}

export { RateLimitError };
