/**
 * لایه ذخیره‌سازی امن: در محیط‌هایی که localStorage مسدود است
 * (مثل iframe سندباکس یا حالت خصوصی iOS) به حافظه داخلی برمی‌گردد.
 */

const memory = new Map<string, string>();

function storageAvailable(): boolean {
  try {
    const k = '__probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

const ok = typeof window !== 'undefined' && storageAvailable();

export const storage = {
  get(key: string): string | null {
    try {
      if (ok) return window.localStorage.getItem(key);
      return memory.get(key) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  },
  set(key: string, value: string): void {
    try {
      if (ok) window.localStorage.setItem(key, value);
      else memory.set(key, value);
    } catch {
      memory.set(key, value);
    }
  },
  remove(key: string): void {
    try {
      if (ok) window.localStorage.removeItem(key);
      else memory.delete(key);
    } catch {
      memory.delete(key);
    }
  },
  /** آیا localStorage واقعاً در دسترس است؟ */
  get persistent(): boolean {
    return ok;
  }
};

/** ذخیره JSON امن */
export function jsonGet<T>(key: string, fallback: T): T {
  try {
    const raw = storage.get(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function jsonSet(key: string, value: unknown): void {
  try {
    storage.set(key, JSON.stringify(value));
  } catch {
    /* خاموش */
  }
}
