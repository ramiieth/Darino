/** ============================================================
 * Database — ثابت‌های مرکزی (سمت Client امن — هیچ Secret اینجا نیست)
 *
 * USER_ID: تک‌کاربره (طبق تصمیم — بدون Auth).
 * برای Auth آینده: این مقدار از Session/Login خوانده می‌شود؛
 * بقیه کد (repositories/API) بدون تغییر userId را ارسال می‌کنند.
 * ============================================================ */

/** شناسه ثابت کاربر — فقط همین‌جا تعریف شده (Hardcode پراکنده ممنوع) */
export const USER_ID = 'local-user';

/** مسیر پایه API (Vercel Functions) — نسبی تا روی دامنه جاری کار کند */
export const API_BASE = '/api';

/** آیا در حالت تست هستیم؟ (repositories در تست کاملاً محلی می‌مانند) */
export function isTestMode(): boolean {
  return import.meta.env.MODE === 'test';
}
