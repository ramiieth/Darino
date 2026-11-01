/**
 * دسترسی بدون رمز روی دستگاه‌های خود کاربر (همهٔ صفحه‌های شخصی) — دستگاه تازه همیشه رمز و کد ۶ رقمی لازم دارد
 *
 *   پرچم محلی: '1' = مجاز، '0' = قفل‌شده با دست کاربر، نبودن = تصمیم از دادهٔ همین دستگاه:
 *   دستگاهی که دادهٔ ژورنال یا دارایی خودش را دارد (یعنی قبلاً استفاده شده و «خروج» آن را پاک نکرده) مجاز است و پرچم '1' می‌گیرد؛
 *   دستگاه تازه داده‌ای ندارد → صفحهٔ ورود. خروج (signOut) دادهٔ محلی را پاک می‌کند، پس دستگاه خارج‌شده هم رمز می‌خواهد.
 *   فقط رابط باز می‌شود؛ سرور قفل می‌ماند (requireSession): بدون ورود فقط دادهٔ همین دستگاه دیده می‌شود.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { loadCustody, useCustodyStore } from '@/features/custody/data/repository';

// نام کلید از زمانی مانده که فقط ژورنال بود؛ عوض نشود تا دستگاه‌های مجاز فعلی مجاز بمانند
const KEY = 'darino-journal-open-device';
const listeners = new Set<() => void>();

type Flag = '1' | '0' | null;

function read(): Flag {
  try {
    const v = localStorage.getItem(KEY);
    return v === '1' || v === '0' ? v : null;
  } catch {
    return null;
  }
}

function write(v: '1' | '0'): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* ذخیره‌سازی مسدود */
  }
  listeners.forEach((l) => l());
}

/** «قفل این دستگاه»: از این به بعد این دستگاه رمز می‌خواهد (برگشت‌پذیر روی همین دستگاه) */
export const lockDevice = () => write('0');
/** برگرداندن دسترسی بدون رمز روی دستگاهی که خود کاربر قفل کرده بود */
export const unlockDevice = () => write('1');

function subscribe(l: () => void): () => void {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === KEY && l();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
}

export type DeviceAccess = 'checking' | 'open' | 'locked' | 'new';

export function useDeviceAccess(): DeviceAccess {
  const flag = useSyncExternalStore(subscribe, read, () => null);
  const store = useCustodyStore();
  useEffect(() => {
    if (flag === null) void loadCustody();
  }, [flag]);
  const used = store.prefs.some((p) => p.id === 'journal-settings' || /^j[nprmt]:/.test(p.id)) || store.holdings.length > 0 || store.operations.length > 0;
  // دستگاه استفاده‌شده بدون پرچم (مثلاً پرچم پاک شده بود) → دوباره مجاز و ماندگار
  useEffect(() => {
    if (flag === null && store.loaded && used) write('1');
  }, [flag, store.loaded, used]);
  if (flag === '1') return 'open';
  if (flag === '0') return 'locked';
  if (!store.loaded) return 'checking';
  return used ? 'open' : 'new';
}
