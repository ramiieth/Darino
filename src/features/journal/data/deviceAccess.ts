/**
 * «ژورنال بدون رمز روی این دستگاه» — یک پرچم محلی، فقط برای مسیر /journal
 *
 *   فقط رابط را باز می‌کند؛ سرور قفل می‌ماند (requireSession). پس بدون ورود فقط دادهٔ IndexedDB همین
 *   مرورگر دیده می‌شود، همگام‌سازی نمی‌شود و مسیرهای سروری (لایتر/رابین‌هود) جواب نمی‌دهند.
 *   دستگاه دیگری که این پرچم را ندارد همان صفحهٔ ورود را می‌بیند؛ بقیهٔ صفحه‌های خصوصی دست نمی‌خورند.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'darino-journal-open-device';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setJournalOpenOnDevice(open: boolean): void {
  try {
    if (open) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* ذخیره‌سازی مسدود (پنجرهٔ خصوصی): پرچم ثبت نمی‌شود و ورود لازم می‌ماند */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === KEY && l();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
}

export function useJournalOpenOnDevice(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
