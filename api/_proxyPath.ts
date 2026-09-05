/** ============================================================
 * _proxyPath — استخراج مسیر upstream از درخواست پروکسی‌شده
 *
 * چرا لازم است؟
 *   Vercel وقتی rewrite با destination ثابت (`/api/cg`) انجام می‌دهد،
 *   زیرمسیر درخواست (`/coins/markets`) از `req.url` حذف می‌شود و
 *   handler به ریشه API بالادست درخواست می‌زند → پاسخ نامعتبر →
 *   UI به «اسنپ‌شات آفلاین» سقوط می‌کند.
 *
 *   راه‌حل: rewrite زیرمسیر را در query `__p` می‌فرستد و اینجا
 *   بازسازی می‌شود. هر دو حالت (زیرمسیر مستقیم در URL — مثل dev/preview —
 *   و `__p` — مثل Vercel) پشتیبانی می‌شوند.
 * ============================================================ */

/** نام پارامتر داخلی حامل زیرمسیر (هرگز به upstream ارسال نمی‌شود) */
export const PATH_PARAM = '__p';

export interface ProxyTarget {
  /** زیرمسیر upstream — همیشه با `/` شروع می‌شود */
  path: string;
  /** پارامترهای query که باید به upstream ارسال شوند (بدون `__p`) */
  search: URLSearchParams;
}

/**
 * مسیر و query مقصد را از URL درخواست استخراج می‌کند.
 * @param reqUrl مقدار `req.url`
 * @param prefix پیشوند تابع (مثلاً `/api/cg`)
 */
export function resolveProxyTarget(reqUrl: string | undefined, prefix: string): ProxyTarget {
  const url = new URL(reqUrl ?? '/', 'http://internal');
  const search = new URLSearchParams(url.searchParams);

  // ۱) زیرمسیر باقی‌مانده در خود مسیر (dev/preview یا rewrite با :path*)
  let path = url.pathname;
  if (path === prefix) path = '';
  else if (path.startsWith(prefix + '/')) path = path.slice(prefix.length);

  // ۲) اگر مسیر خالی بود، از پارامتر `__p` بازسازی کن (rewrite ثابت Vercel)
  if (!path || path === '/') {
    const fromQuery = search.get(PATH_PARAM);
    if (fromQuery) path = fromQuery;
  }
  search.delete(PATH_PARAM);

  if (!path) path = '/';
  if (!path.startsWith('/')) path = '/' + path;

  return { path, search };
}
