/**
 * «آدرس‌های من» — همگام بین گوشی و کامپیوتر از طریق حساب کاربر
 *
 *  - همیشه فوراً در localStorage همین دستگاه ذخیره می‌شود (آفلاین هم کار می‌کند)
 *  - بعد از ورود: سرور مرجع است؛ تغییری که هنوز به سرور نرسیده (dirty) در همگام‌سازی بعدی برنده است
 *  - اولین همگام‌سازی بعد از ورود، آدرس‌های محلی قبلی را به حساب اضافه می‌کند (چیزی گم نمی‌شود)
 *  - دنبال کردن (اعلان پوش) فقط با ورود ممکن است چون تیک اعلان‌ها روی سرور اجرا می‌شود
 */
import { create } from 'zustand';
import { fetchJson } from '@/repositories/remoteClient';
import { MAX_FOLLOW, MAX_SAVED, mergeSaved, sanitizeSaved, type SavedTrader } from '../domain/follow';
import { isHlAddress } from '../domain/candidates';

export type { SavedTrader } from '../domain/follow';
export { MAX_SAVED, MAX_FOLLOW } from '../domain/follow';

const STORE_KEY = 'darino:traders:saved';
const META_KEY = 'darino:traders:sync';

type SyncState = 'local' | 'syncing' | 'synced' | 'error';
interface Meta { dirty: boolean; syncedAt: number | null }

interface SavedState {
  saved: SavedTrader[];
  sync: SyncState;
  /** با ورود به حساب فراخوانی می‌شود (و هر بار که صفحه دوباره دیده شود) */
  hydrate: (authenticated: boolean) => Promise<void>;
  add: (address: string, label?: string | null) => 'added' | 'exists' | 'invalid' | 'full';
  remove: (address: string) => void;
  setFollow: (address: string, on: boolean, label?: string | null) => 'ok' | 'full' | 'login';
}

function read<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T) ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* خاموش */
  }
}

const op = (name: string) => `/api/integrations?op=${name}`;
let authed = false;
let pushing: Promise<void> | null = null;

export const useSavedTraders = create<SavedState>((set, get) => {
  const meta = (): Meta => read<Meta>(META_KEY, { dirty: false, syncedAt: null });
  const persist = (saved: SavedTrader[], dirty: boolean) => {
    write(STORE_KEY, saved);
    write(META_KEY, { ...meta(), dirty });
    set({ saved });
  };
  const push = async () => {
    if (!authed) return;
    set({ sync: 'syncing' });
    try {
      const r = await fetchJson<{ saved: SavedTrader[] }>(op('traders-put'), { method: 'POST', body: { saved: get().saved }, timeoutMs: 15_000 });
      write(STORE_KEY, r.saved);
      write(META_KEY, { dirty: false, syncedAt: Date.now() });
      set({ saved: r.saved, sync: 'synced' });
    } catch {
      set({ sync: 'error' });
    }
  };
  const change = (saved: SavedTrader[]) => {
    persist(saved, true);
    pushing = push().finally(() => { pushing = null; });
  };

  return {
    saved: sanitizeSaved(read<unknown>(STORE_KEY, [])),
    sync: 'local',
    hydrate: async (authenticated) => {
      authed = authenticated;
      if (!authenticated) return set({ sync: 'local' });
      if (pushing) await pushing;
      set({ sync: 'syncing' });
      try {
        const { saved: server } = await fetchJson<{ saved: SavedTrader[] }>(op('traders-get'), { timeoutMs: 15_000 });
        const m = meta();
        const local = get().saved;
        // تغییر محلی که به سرور نرسیده، یا اولین ورود: ادغام و ارسال؛ وگرنه سرور مرجع است
        if (m.dirty || m.syncedAt === null) {
          const merged = m.dirty ? sanitizeSaved(local) : mergeSaved(sanitizeSaved(server), local);
          persist(merged, true);
          await push();
        } else {
          write(STORE_KEY, server);
          write(META_KEY, { dirty: false, syncedAt: Date.now() });
          set({ saved: sanitizeSaved(server), sync: 'synced' });
        }
      } catch {
        set({ sync: 'error' });
      }
    },
    add: (raw, label = null) => {
      const address = raw.trim().toLowerCase();
      if (!isHlAddress(address)) return 'invalid';
      const { saved } = get();
      if (saved.some((s) => s.address === address)) return 'exists';
      if (saved.length >= MAX_SAVED) return 'full';
      change(sanitizeSaved([{ address, label: label?.trim() || null, addedAt: Date.now(), follow: false }, ...saved]));
      return 'added';
    },
    remove: (address) => change(get().saved.filter((s) => s.address !== address)),
    setFollow: (address, on, label = null) => {
      if (on && !authed) return 'login';
      const { saved } = get();
      if (on && saved.filter((s) => s.follow).length >= MAX_FOLLOW) return 'full';
      const exists = saved.some((s) => s.address === address);
      if (!exists && saved.length >= MAX_SAVED) return 'full';
      const next = exists
        ? saved.map((s) => (s.address === address ? { ...s, follow: on } : s))
        : [{ address, label: label?.trim() || null, addedAt: Date.now(), follow: on }, ...saved];
      change(sanitizeSaved(next));
      return 'ok';
    }
  };
});
