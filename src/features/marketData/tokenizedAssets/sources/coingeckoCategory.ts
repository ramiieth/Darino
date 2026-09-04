/** ============================================================
 * CoinGecko Category Source — خواندن تمام صفحات یک دسته (بخش ۴)
 *
 * الگوریتم Pagination:
 *   page = 1
 *   while page exists:
 *       fetch category page
 *       extract all assets
 *       append assets
 *       if no next page: stop
 *       page++
 *
 * ⚠️ تعداد صفحات/دارایی‌ها هرگز فرض نمی‌شود؛ فقط از پاسخ واقعی مشخص می‌شود.
 * تمام درخواست‌ها از دروازه نرخ سراسری عبور می‌کنند (بدون 429 زنجیره‌ای).
 * ============================================================ */
import { cgFetch } from '@/shared/lib/coingeckoGate';
import { COINGECKO_BASE } from '@/app/config/apiConfig';
import { CATEGORY_MAX_PAGES, CATEGORY_PAGE_SIZE } from '../constants';
import type { CoingeckoCategoryRow } from '../types';

/**
 * خواندن تمام صفحات یک دسته رسمی CoinGecko.
 * وقتی پاسخ یک صفحه کمتر از اندازه صفحه باشد → صفحه بعدی وجود ندارد.
 */
export async function fetchCategoryPages(
  category: string
): Promise<CoingeckoCategoryRow[]> {
  const all: CoingeckoCategoryRow[] = [];
  let page = 1;

  while (page <= CATEGORY_MAX_PAGES) {
    const url =
      `${COINGECKO_BASE}/coins/markets?vs_currency=usd&category=${encodeURIComponent(category)}` +
      `&per_page=${CATEGORY_PAGE_SIZE}&page=${page}&order=market_cap_desc`;
    const res = await cgFetch(url, { timeoutMs: 25_000 });
    if (!res.ok) throw new Error(`category HTTP ${res.status}`);
    const rows = (await res.json()) as CoingeckoCategoryRow[];
    if (!Array.isArray(rows) || rows.length === 0) break;

    all.push(...rows);

    // صفحه بعدی وجود ندارد وقتی تعداد ردیف‌ها کمتر از اندازه صفحه باشد
    if (rows.length < CATEGORY_PAGE_SIZE) break;
    page++;
  }

  return all;
}
