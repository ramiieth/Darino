/** ============================================================
 * Remote Client — ارتباط مرورگر ↔ Vercel Serverless API
 *
 *  - fetch با Timeout کوتاه (سقوط سریع به حالت محلی)
 *  - تشخیص در دسترس بودن سرور (health — یک بار در نشست)
 *  - در حالت تست (vitest) کاملاً غیرفعال است → تست‌ها محلی می‌مانند
 *  - هویت فقط با کوکی نشست HttpOnly (Passkey) — هیچ userId/Secret در هدر نیست
 *  - هدر x-darino-csrf برای همهٔ درخواست‌ها (سرور درخواست تغییردهنده بدون آن را رد می‌کند)
 *  - پاسخ 401 → رویداد «darino:unauthenticated» تا رابط صفحهٔ ورود را نشان دهد
 * ============================================================ */
import { API_BASE, isTestMode } from '@/lib/database/constants';

/** آیا Remote مجاز است؟ (در تست و آفلاین خیر) */
export function isRemoteAllowed(): boolean {
  if (isTestMode()) return false;
  if (typeof window === 'undefined') return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  return true;
}

/** نتیجه probe سلامت سرور (کش‌شده — یک بار در نشست) */
interface HealthProbe {
  /** فانکشن سرورلس پاسخ ok:true داد (فارغ از وضعیت دیتابیس) */
  serverUp: boolean;
  /** دیتابیس (Neon) هم متصل است */
  dbConnected: boolean;
}

let health: HealthProbe | null = null;

/** probe سلامت با کش (با force دوباره صدا می‌خورد) */
async function probeHealth(force: boolean): Promise<HealthProbe> {
  if (!force && health) return health;
  try {
    const res = await fetchJson<{ ok: boolean; database?: string }>('/api/health', {
      timeoutMs: 3000
    });
    health = { serverUp: res?.ok === true, dbConnected: res?.database === 'connected' };
  } catch {
    health = { serverUp: false, dbConnected: false };
  }
  return health;
}

/** آیا سرور و دیتابیس (Neon) در دسترس‌اند؟ */
export async function isRemoteReady(force = false): Promise<boolean> {
  if (!isRemoteAllowed()) return false;
  const h = await probeHealth(force);
  return h.serverUp && h.dbConnected;
}

/**
 * آیا خودِ سرور (فانکشن سرورلس) در دسترس است — فارغ از دیتابیس؟
 * جریان‌هایی مثل کلکشن دیوار از مسیر `/api/propertyMarket` انجام می‌شوند و
 * برای اصلِ کلکشن نیازی به Neon ندارند؛ پس اتصال دیتابیس نباید آن‌ها را
 * مسدود کند (نتیجه سمت کلاینت در IndexedDB ذخیره می‌شود).
 */
export async function isServerReachable(force = false): Promise<boolean> {
  if (!isRemoteAllowed()) return false;
  const h = await probeHealth(force);
  return h.serverUp;
}

/** ریست (برای تست‌ها) */
export function resetRemoteStatus(): void {
  health = null;
}

/**
 * مسیر کامل API — همه فراخواننده‌ها مسیر را با «/api/…» می‌دهند؛ قبلاً
 * API_BASE دوباره اضافه می‌شد («/api/api/health» → ۴۰۴) و در نتیجه سرور
 * همیشه «در دسترس نیست» دیده می‌شد. پیشوند فقط اگر نبود اضافه می‌شود.
 */
export function apiUrl(path: string): string {
  if (path === API_BASE || path.startsWith(`${API_BASE}/`)) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** خطای HTTP با کد وضعیت (برای تشخیص 401/403) */
export class HttpError extends Error {
  constructor(public status: number, public code: string | null, public retryAfter = 0) {
    super(`HTTP ${status}`);
    this.name = 'HttpError';
  }
}

export const UNAUTHENTICATED_EVENT = 'darino:unauthenticated';

/** درخواست JSON به API سرور (با Timeout، کوکی نشست و هدر CSRF) */
export async function fetchJson<T>(
  path: string,
  opts: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; timeoutMs?: number } = {}
): Promise<T> {
  const { method = 'GET', body, timeoutMs = 6000 } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(apiUrl(path), {
      method,
      headers: {
        accept: 'application/json',
        'content-type': body ? 'application/json' : undefined,
        'x-darino-csrf': '1'
      } as Record<string, string>,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      credentials: 'same-origin',
      cache: 'no-store'
    });
    if (!res.ok) {
      let code: string | null = null;
      try {
        code = ((await res.json()) as { error?: string }).error ?? null;
      } catch {
        /* بدنهٔ غیر JSON */
      }
      if (res.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
      throw new HttpError(res.status, code, Number(res.headers.get('Retry-After')) || 0);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
