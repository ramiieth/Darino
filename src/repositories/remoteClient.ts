/** ============================================================
 * Remote Client — ارتباط مرورگر ↔ Vercel Serverless API
 *
 *  - fetch با Timeout کوتاه (سقوط سریع به حالت محلی)
 *  - تشخیص در دسترس بودن سرور (health — یک بار در نشست)
 *  - در حالت تست (vitest) کاملاً غیرفعال است → تست‌ها محلی می‌مانند
 *  - هیچ Secret ارسال/دریافت نمی‌شود (فقط userId در هدر)
 * ============================================================ */
import { API_BASE, USER_ID, isTestMode } from '@/lib/database/constants';

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

/** درخواست JSON به API سرور (با Timeout و هدر userId) */
export async function fetchJson<T>(
  path: string,
  opts: { method?: 'GET' | 'POST'; body?: unknown; timeoutMs?: number } = {}
): Promise<T> {
  const { method = 'GET', body, timeoutMs = 6000 } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        'content-type': body ? 'application/json' : undefined,
        'x-user-id': USER_ID
      } as Record<string, string>,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
