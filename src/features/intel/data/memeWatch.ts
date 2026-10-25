/**
 * فهرست انتظار میم‌کوین — همیشه فوراً روی همین دستگاه؛ بعد از ورود با حساب همگام می‌شود
 * تا تیک سرور وقتی کوینی «آماده» شد اعلان بفرستد (اعلان فقط با ورود).
 * ادغام ساده: اجتماع فهرست محلی و سرور؛ حذف روی دستگاهی که حذف شده فوراً به سرور می‌رود.
 */
import { create } from 'zustand';
import { fetchJson } from '@/repositories/remoteClient';
import { MAX_WATCH, sanitizeWatch } from '../domain/memeWatch';

const STORE_KEY = 'darino:memes:watch';
const op = (name: string) => `/api/integrations?op=${name}`;
let authed = false;

function read(): string[] {
  try {
    return sanitizeWatch(JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]'));
  } catch {
    return [];
  }
}
function write(ids: string[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(ids));
  } catch {
    /* خاموش */
  }
}

interface WatchState {
  ids: string[];
  synced: boolean;
  hydrate: (authenticated: boolean) => Promise<void>;
  toggle: (id: string) => 'added' | 'removed' | 'full';
}

export const useMemeWatch = create<WatchState>((set, get) => {
  const push = async (ids: string[]) => {
    if (!authed) return;
    try {
      const r = await fetchJson<{ ids: string[] }>(op('memes-watch-put'), { method: 'POST', body: { ids }, timeoutMs: 15_000 });
      set({ synced: true });
      write(r.ids);
    } catch {
      set({ synced: false });
    }
  };
  return {
    ids: read(),
    synced: false,
    hydrate: async (authenticated) => {
      authed = authenticated;
      if (!authenticated) return set({ synced: false });
      try {
        const { ids: server } = await fetchJson<{ ids: string[] }>(op('memes-watch-get'), { timeoutMs: 15_000 });
        const merged = sanitizeWatch([...get().ids, ...server]);
        write(merged);
        set({ ids: merged });
        if (merged.length !== server.length) await push(merged);
        else set({ synced: true });
      } catch {
        set({ synced: false });
      }
    },
    toggle: (id) => {
      const ids = get().ids;
      const on = !ids.includes(id);
      if (on && ids.length >= MAX_WATCH) return 'full';
      const next = on ? [id, ...ids] : ids.filter((x) => x !== id);
      write(next);
      set({ ids: next });
      void push(next);
      return on ? 'added' : 'removed';
    }
  };
});
