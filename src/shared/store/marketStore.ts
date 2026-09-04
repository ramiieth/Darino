/**
 * وضعیت زنده بازار سهام (Alpha Vantage) — یک چرخه به‌روزرسانی واحد در کل اپ.
 * قیمت‌ها پس از دریافت از صف، به‌صورت افزایشی وارد این استور می‌شوند.
 */
import { create } from 'zustand';
import type { PriceQuote, PriceSource } from '@/shared/types';

export interface StockQuoteState extends PriceQuote {
  symbol: string;
}

interface MarketState {
  /** نماد → آخرین قیمت شناخته‌شده (live یا فالبک) */
  quotes: Record<string, StockQuoteState>;
  /** آیا چرخه به‌روزرسانی در جریان است */
  refreshing: boolean;
  done: number;
  total: number;
  lastCycleAt: number | null;
  cycleId: number;
  errorCount: number;
  refreshStart: () => void;
  refreshProgress: (done: number, total: number) => void;
  refreshEnd: (cycleId: number, errorCount: number) => void;
  setQuote: (q: StockQuoteState) => void;
}

export const useMarketStore = create<MarketState>((set, get) => ({
  quotes: {},
  refreshing: false,
  done: 0,
  total: 0,
  lastCycleAt: null,
  cycleId: 0,
  errorCount: 0,

  refreshStart: () =>
    set((s) => ({
      refreshing: true,
      done: 0,
      errorCount: 0,
      cycleId: s.cycleId + 1
    })),

  refreshProgress: (done, total) => set({ done, total }),

  refreshEnd: (cycleId, errorCount) =>
    set((s) =>
      s.cycleId === cycleId
        ? { refreshing: false, lastCycleAt: Date.now(), errorCount }
        : s
    ),

  setQuote: (q) =>
    set((s) => ({
      quotes: { ...s.quotes, [q.symbol]: q }
    }))
}));

/** قیمت فعلی یک نماد از استور — یا null */
export function stockPriceOf(symbol: string): StockQuoteState | null {
  return useMarketStore.getState().quotes[symbol] ?? null;
}

/** قیمت فعلی یک نماد با فالبک اسنپ‌شات */
export function stockPriceResolved(
  symbol: string,
  snapshot: Record<string, number>
): { price: number; source: PriceSource } {
  const q = stockPriceOf(symbol);
  if (q && Number.isFinite(q.price)) {
    return { price: q.price, source: q.source === 'live' ? 'live' : 'snapshot' };
  }
  const snap = snapshot[symbol];
  if (typeof snap === 'number' && Number.isFinite(snap)) {
    return { price: snap, source: 'snapshot' };
  }
  return { price: NaN, source: 'na' };
}
