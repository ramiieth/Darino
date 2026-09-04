/** لیست پیگیری (Watchlist) — جدول watchlist در IndexedDB */
import { create } from 'zustand';
import { watchAll, watchDelete, watchPut, type WatchItemRecord } from '@/shared/lib/db';

interface WatchState {
  items: Record<string, number>; // symbol → addedAt
  hydrated: boolean;
  hydrate: () => Promise<void>;
  toggle: (symbol: string) => Promise<void>;
  remove: (symbol: string) => Promise<void>;
}

export const useWatchlistStore = create<WatchState>((set, get) => ({
  items: {},
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const rows = await watchAll();
      const items: Record<string, number> = {};
      rows.forEach((r) => (items[r.symbol] = r.addedAt));
      set({ items, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  toggle: async (symbol) => {
    const s = get();
    if (s.items[symbol] !== undefined) {
      const items = { ...s.items };
      delete items[symbol];
      set({ items });
      await watchDelete(symbol);
    } else {
      const item: WatchItemRecord = { symbol, addedAt: Date.now() };
      set({ items: { ...s.items, [symbol]: item.addedAt } });
      await watchPut(item);
    }
  },

  remove: async (symbol) => {
    const s = get();
    if (s.items[symbol] === undefined) return;
    const items = { ...s.items };
    delete items[symbol];
    set({ items });
    await watchDelete(symbol);
  }
}));
