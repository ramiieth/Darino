import { HttpError, fetchJson } from '@/repositories/remoteClient';
import type { ShopAnswer } from '../domain/types';

const HOME_KEY = 'darino.shop.home';

/** «شهر من» فقط در همین مرورگر می‌ماند (مبدأ پیش‌فرض سفر و شهر جستجو) */
export function loadHome(): string {
  try { return localStorage.getItem(HOME_KEY) || 'ahvaz'; } catch { return 'ahvaz'; }
}

export function saveHome(slug: string): void {
  try { localStorage.setItem(HOME_KEY, slug); } catch { /* حالت خصوصی مرورگر */ }
}

export function askShop(q: string, home: string): Promise<ShopAnswer> {
  return fetchJson<ShopAnswer>(`/api/integrations?op=shop-ask&q=${encodeURIComponent(q)}&home=${encodeURIComponent(home)}`, { timeoutMs: 60_000 });
}

export function errorText(e: unknown): string {
  if (e instanceof HttpError) {
    if (e.status === 401) return 'برای استفاده از این بخش وارد حساب شوید';
    if (e.status === 429) return e.code ?? 'درخواست‌ها زیاد شد؛ یک دقیقه بعد تلاش کنید';
    return e.code ?? 'دستیار خرید پاسخ نداد';
  }
  if (e instanceof DOMException && e.name === 'AbortError') return 'پاسخ طول کشید؛ دوباره تلاش کنید';
  return 'ارتباط با سرور برقرار نشد';
}
