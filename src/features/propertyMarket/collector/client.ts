/** ============================================================
 * Property Market — کلاینت شبکه دیوار (بدون وابستگی به DOM/Node)
 *
 *  - فقط از `fetch` سراسری استفاده می‌کند (سرور/مرورگر/تست یکسان).
 *  - تلاش مجدد + تایم‌اوت + فاصله مؤدبانه بین درخواست‌ها.
 *  - ورودی `fetcher` قابل تزریق است (برای تست و پروکسی).
 * ============================================================ */
import {
  DIVAR_CITIES_URL,
  DIVAR_DETAIL_URL,
  DIVAR_DISTRICTS_URL,
  DIVAR_HEADERS,
  DIVAR_POSTLIST_URL,
  REQUEST_RETRIES,
  REQUEST_TIMEOUT_MS,
  buildPostListBody
} from './endpoints.js';

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const defaultFetcher: Fetcher = (url, init) => fetch(url, init);

/** sleep بدون وابستگی خارجی */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** آیا در مرورگر اجرا می‌شویم؟ (تست‌ها / محیط jsdom) */
function inBrowser(): boolean {
  const g = globalThis as { window?: unknown; document?: unknown };
  return g.window !== undefined && g.document !== undefined;
}

/**
 * هدرهای امن برای هر محیط:
 * در مرورگر `User-Agent` ارسال نمی‌شود — هدر غیرساده باعث preflight می‌شود و
 * دیوار فقط `content-type` را مجاز کرده است (درخواست رد می‌شد).
 */
export function safeHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (!inBrowser()) h['User-Agent'] = DIVAR_HEADERS['User-Agent'];
  return h;
}

/** خطای HTTP با کد وضعیت (برای تصمیم تلاش مجدد) */
export class HttpError extends Error {
  constructor(public status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
  }
}

/**
 * درخواست JSON با تایم‌اوت + تلاش مجدد.
 * ۴xx (به‌جز ۴۲۹) تلاش مجدد نمی‌شود — پاسخ قطعی است.
 */
export async function requestJson<T>(
  fetcher: Fetcher | undefined,
  url: string,
  init?: RequestInit,
  opts: { retries?: number; timeoutMs?: number } = {}
): Promise<T> {
  const f = fetcher ?? defaultFetcher;
  const retries = opts.retries ?? REQUEST_RETRIES;
  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await f(url, { ...init, signal: controller.signal });
      if (!res.ok) throw new HttpError(res.status, url);
      return (await res.json()) as T;
    } catch (e) {
      lastError = e;
      const status = e instanceof HttpError ? e.status : 0;
      if (status >= 400 && status < 500 && status !== 429) break;
      if (attempt < retries) await sleep((status === 429 ? 4000 : 1200) * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('request failed');
}

/* ---------------- شهرها / مناطق ---------------- */

export interface DivarCity {
  id: number | string;
  slug?: string;
  name?: string;
  persian_name?: string;
}

/** دریافت فهرست شهرهای دیوار */
export function fetchCities(fetcher?: Fetcher): Promise<DivarCity[]> {
  return requestJson<{ cities?: DivarCity[] }>(fetcher, DIVAR_CITIES_URL, {
    headers: safeHeaders()
  }).then((j) => j.cities ?? []);
}

/**
 * resolve شهر بر اساس نام/اسلاگ — مشابه مرجع:
 * تطبیق اسلاگ انگلیسی یا نام فارسی (نرمال‌شده).
 */
export function matchCity(
  cities: DivarCity[],
  hints: string[]
): DivarCity | null {
  const norm = (s: string) => s.replace(/[\s\u200c]/g, '').toLowerCase();
  const wanted = hints.map(norm);
  for (const c of cities) {
    const slug = norm(String(c.slug ?? ''));
    const name = norm(String(c.name ?? c.persian_name ?? ''));
    if (wanted.some((w) => slug === w || name === w)) return c;
  }
  // فالبک: شامل بودن (مثلاً «اهواز» داخل عنوان‌های طولانی‌تر)
  for (const c of cities) {
    const slug = norm(String(c.slug ?? ''));
    const name = norm(String(c.name ?? c.persian_name ?? ''));
    if (wanted.some((w) => slug.includes(w) || name.includes(w))) return c;
  }
  return null;
}

export interface DivarDistrict {
  id: number | string;
  name?: string;
  persian_name?: string;
}

export function fetchDistricts(
  cityId: string,
  fetcher?: Fetcher
): Promise<DivarDistrict[]> {
  return requestJson<{ districts?: DivarDistrict[] }>(fetcher, DIVAR_DISTRICTS_URL(cityId), {
    headers: safeHeaders()
  }).then((j) => j.districts ?? []);
}

/* ---------------- فهرست آگهی‌ها (صفحه‌بندی) ---------------- */

export interface PostListResponse {
  list_widgets?: unknown[];
  pagination?: { has_next_page?: boolean; data?: unknown };
}

/** یک صفحه از فهرست آگهی‌ها — با پشتیبانی از کرسر صفحه‌بندی */
export function fetchListPage(opts: {
  cityId: string;
  category?: string;
  districtIds?: string[];
  paginationData?: unknown;
  fetcher?: Fetcher;
}): Promise<PostListResponse> {
  const body = buildPostListBody(opts);
  return requestJson<PostListResponse>(opts.fetcher, DIVAR_POSTLIST_URL, {
    method: 'POST',
    headers: safeHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body)
  });
}

/* ---------------- جزئیات آگهی ---------------- */

export function fetchDetail(
  token: string,
  fetcher?: Fetcher
): Promise<Record<string, unknown>> {
  return requestJson<Record<string, unknown>>(fetcher, DIVAR_DETAIL_URL(token), {
    headers: safeHeaders()
  });
}
