/**
 * دستگاه‌های قبلاً مجاز ژورنال — فقط پرچم محلی موجود خوانده می‌شود؛ دستگاه تازه هیچ راهی برای گرفتن آن ندارد
 *
 *   مک‌بوک و آیفونی که قبلاً «ژورنال بدون رمز» را روشن کرده بودند همان پرچم را در مرورگر دارند و ژورنال را بدون رمز باز می‌کنند.
 *   فقط رابط باز می‌شود؛ سرور قفل می‌ماند (requireSession): بدون ورود فقط دادهٔ IndexedDB همین مرورگر دیده می‌شود
 *   و همگام‌سازی و تاریخچهٔ سروری (لایتر/رابین‌هود) نیست. هیچ دکمه‌ای پرچم را روشن نمی‌کند؛ فقط «قفل این دستگاه» آن را پاک می‌کند.
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

export function lockJournalOnDevice(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ذخیره‌سازی مسدود */
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
