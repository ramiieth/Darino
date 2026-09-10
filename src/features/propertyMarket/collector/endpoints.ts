/** ============================================================
 * Property Market — endpointهای عمومی دیوار
 *
 * مرجع فنی: `mobin-torabi/divar-house-scraper` (بررسی‌شده — کپی نشده).
 * این‌ها endpointهای عمومی وب دیوار هستند (بدون لاگین/کلید):
 *   - فهرست شهرها:   GET  /v8/places/cities
 *   - فهرست مناطق:   GET  /v8/places/cities/{city_id}/districts
 *   - جستجوی آگهی:   POST /v8/postlist/w/search  (صفحه‌بندی با pagination_data)
 *   - جزئیات آگهی:   GET  /v8/posts-v2/web/{token}
 * ⚠️ ساختار پاسخ دیوار ممکن است تغییر کند — پارسر دفاعی نوشته شده است.
 * ============================================================ */

export const DIVAR_BASE = 'https://api.divar.ir';
export const DIVAR_CITIES_URL = `${DIVAR_BASE}/v8/places/cities`;
export const DIVAR_DISTRICTS_URL = (cityId: string) =>
  `${DIVAR_BASE}/v8/places/cities/${encodeURIComponent(cityId)}/districts`;
export const DIVAR_POSTLIST_URL = `${DIVAR_BASE}/v8/postlist/w/search`;
export const DIVAR_DETAIL_URL = (token: string) =>
  `${DIVAR_BASE}/v8/posts-v2/web/${encodeURIComponent(token)}`;
export const DIVAR_POST_PAGE_URL = (token: string) => `https://divar.ir/v/${token}`;

/** دسته‌های مربوط به فروش مسکونی — نسخه فعلی فقط آپارتمان (§ مأموریت: Apartment sale) */
export const DIVAR_CATEGORY_APARTMENT_SALE = 'apartment-sell';

/** فاصله مؤدبانه بین درخواست‌ها (مطابق مرجع: ~۱ ثانیه) */
export const REQUEST_PAUSE_MS = 1000;
export const REQUEST_TIMEOUT_MS = 30_000;
export const REQUEST_RETRIES = 2;

export const DIVAR_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0',
  'Content-Type': 'application/json'
};

/** ساخت بدنه درخواست فهرست آگهی‌ها (مطابق مرجع) */
export function buildPostListBody(opts: {
  cityId: string;
  category?: string;
  districtIds?: string[];
  paginationData?: unknown;
}): Record<string, unknown> {
  const data: Record<string, unknown> = {
    category: { str: { value: opts.category ?? DIVAR_CATEGORY_APARTMENT_SALE } }
  };
  if (opts.districtIds && opts.districtIds.length > 0) {
    data.districts = { repeated_string: { value: opts.districtIds.map(String) } };
  }
  const body: Record<string, unknown> = {
    city_ids: [String(opts.cityId)],
    search_data: { form_data: { data } }
  };
  if (opts.paginationData) body.pagination_data = opts.paginationData;
  return body;
}
