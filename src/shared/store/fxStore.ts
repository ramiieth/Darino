/**
 * نرخ ارز (دلار→تومان) — جدول fx_rates در IndexedDB
 * با تاریخچه ۲۴ ساعت؛ قابل آپدیت دستی توسط ادمین (تنظیمات)
 */
import { create } from 'zustand';
import { fxGet, fxPut, type FxRateRecord } from '@/shared/lib/db';
import { DEFAULT_IRR_RATE } from '@/shared/utils/formatters';

const DAY_MS = 24 * 60 * 60 * 1000;

interface FxState {
  rate: number;
  history: { t: number; rate: number }[];
  updatedAt: number | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** ثبت نرخ جدید توسط ادمین (با افزودن به تاریخچه و prune ۲۴ساعته) */
  setRate: (rate: number) => Promise<void>;
}

export const useFxStore = create<FxState>((set, get) => ({
  rate: DEFAULT_IRR_RATE,
  history: [],
  updatedAt: null,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const rec = await fxGet();
      if (rec) {
        set({
          rate: rec.rate,
          history: rec.history ?? [],
          updatedAt: rec.updatedAt,
          hydrated: true
        });
        return;
      }
    } catch {
      /* فالبک */
    }
    set({ hydrated: true });
  },

  setRate: async (rate) => {
    if (!Number.isFinite(rate) || rate <= 0) return;
    const now = Date.now();
    const s = get();
    const history = [...s.history, { t: now, rate }].filter((h) => now - h.t < DAY_MS);
    const rec: FxRateRecord = { id: 'usd-irr', rate, updatedAt: now, history };
    set({ rate, history, updatedAt: now });
    await fxPut(rec);
  }
}));
