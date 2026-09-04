/**
 * Boros — استور Zustand + بارگذاری سینگلتون
 * بازارها + تاریخچه APR (پیش‌رونده در پس‌زمینه)
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { fetchBorosMarkets, syncBorosOhlcv, simulateBorosOrder } from './borosService';
import { useAutoSync } from '@/shared/hooks/useAutoSync';
import type { BorosMarket, BorosSimResult } from '../domain/types';

interface BorosState {
  markets: BorosMarket[];
  loading: boolean;
  error: boolean;
  /** داده از کش کهنه است (API در دسترس نبود) */
  stale: boolean;
  syncProgress: { done: number; total: number } | null;
  loadedAt: number | null;
  setMarkets: (m: BorosMarket[]) => void;
  setLoading: (v: boolean) => void;
  setError: (v: boolean) => void;
  setStale: (v: boolean) => void;
  setSyncProgress: (v: { done: number; total: number } | null) => void;
  setLoadedAt: (v: number | null) => void;
}

export const useBorosStore = create<BorosState>((set) => ({
  markets: [],
  loading: false,
  error: false,
  stale: false,
  syncProgress: null,
  loadedAt: null,
  setMarkets: (m) => set({ markets: m }),
  setLoading: (v) => set({ loading: v }),
  setError: (v) => set({ error: v }),
  setStale: (v) => set({ stale: v }),
  setSyncProgress: (v) => set({ syncProgress: v }),
  setLoadedAt: (v) => set({ loadedAt: v })
}));

let loadPromise: Promise<void> | null = null;

/** پاک‌سازی صف (تست) */
export function resetBorosLoad(): void {
  loadPromise = null;
}

/** بارگذاری بازارها + همگام‌سازی OHLCV */
export function loadBoros(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const st = useBorosStore.getState();
    if (st.loading) return;
    st.setLoading(true);
    st.setError(false);
    try {
      const { markets, stale } = await fetchBorosMarkets();
      st.setMarkets(markets);
      st.setStale(stale);
      st.setLoadedAt(Date.now());
      // همگام‌سازی تاریخچه APR (پیش‌رونده — بدون بلاک UI)
      await syncBorosOhlcv(markets, (done, total) => st.setSyncProgress({ done, total }));
      st.setSyncProgress(null);
    } catch {
      // اگر داده قبلی داریم، خطا نمایش نده (داده قبلی باقی می‌ماند)
      if (useBorosStore.getState().markets.length === 0) {
        st.setError(true);
      }
    } finally {
      st.setLoading(false);
    }
  })().finally(() => {
    loadPromise = null;
  });
  return loadPromise;
}

/** تلاش مجدد پس از خطا (تأخیر تصاعدی — Rate Limit موقت) */
export function retryBorosSoon(delayMs = 15_000): void {
  setTimeout(() => {
    if (useBorosStore.getState().error) {
      resetBorosLoad();
      void loadBoros();
    }
  }, delayMs);
}

/** هوک مصرفی */
export function useBoros() {
  const st = useBorosStore();
  useEffect(() => {
    void loadBoros();
  }, []);

  // همگام‌سازی خودکار زنده: هر ۲ دقیقه + هنگام فوکوس
  // (اگر خطا/Rate Limit است، تلاش مجدد خودکار با تأخیر تصاعدی در retryBorosSoon — اینجا فقط حالت سالم رفرش می‌شود)
  useAutoSync(
    'boros-markets',
    () => {
      const s = useBorosStore.getState();
      if (s.error || s.loading) return;
      resetBorosLoad();
      void loadBoros();
    },
    { intervalMs: 2 * 60_000, minAgeMs: 2 * 60_000 }
  );

  return st;
}

/** شبیه‌سازی سفارش (همان API) */
export async function runBorosSim(
  marketId: number,
  side: 0 | 1,
  size: number,
  rate: number
): Promise<BorosSimResult | null> {
  return simulateBorosOrder(marketId, side, size, rate);
}
