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

/** وضعیت سرور (کش‌شده — یک بار در نشست) */
let serverStatus: 'unknown' | 'ready' | 'local' = 'unknown';

/** آیا سرور و دیتابیس (Neon) در دسترس‌اند؟ */
export async function isRemoteReady(force = false): Promise<boolean> {
  if (!isRemoteAllowed()) return false;
  if (!force && serverStatus !== 'unknown') return serverStatus === 'ready';
  try {
    const res = await fetchJson<{ ok: boolean; database: string }>('/api/health', { timeoutMs: 3000 });
    serverStatus = res?.database === 'connected' ? 'ready' : 'local';
  } catch {
    serverStatus = 'local';
  }
  return serverStatus === 'ready';
}

/** ریست (برای تست‌ها) */
export function resetRemoteStatus(): void {
  serverStatus = 'unknown';
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
