/**
 * TVL Flow — استور Zustand + بارگذاری سینگلتون
 * داده‌ها: زنجیره‌ها، پروتکل‌ها، تاریخچه هر زنجیره (پیش‌رونده در پس‌زمینه)
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { useAutoSync } from '@/shared/hooks/useAutoSync';
import {
  fetchAllChains,
  fetchAllProtocols,
  syncChainHistories,
  type ChainTvlRow,
  type ProtocolCompact
} from './tvlFlowService';
import {
  computePeriodChanges,
  type PeriodChanges,
  type TvlPoint
} from '@/features/defi/domain/tvlFlow';

export interface ChainFlowRow {
  name: string;
  tvl: number;
  history: TvlPoint[] | null;
  changes: PeriodChanges;
  /** تاریخچه در حال بارگذاری است */
  loadingHist: boolean;
}

interface TvlFlowState {
  chains: ChainFlowRow[];
  protocols: ProtocolCompact[];
  loading: boolean;
  /** پیشرفت همگام‌سازی تاریخچه */
  syncProgress: { done: number; total: number } | null;
  error: boolean;
  loadedAt: number | null;
  setChains: (c: ChainFlowRow[]) => void;
  setProtocols: (p: ProtocolCompact[]) => void;
  setLoading: (v: boolean) => void;
  setSyncProgress: (v: { done: number; total: number } | null) => void;
  setError: (v: boolean) => void;
  setLoadedAt: (v: number | null) => void;
  /** تزریق تاریخچه یک زنجیره (پیش‌رونده) */
  injectHistory: (name: string, points: TvlPoint[]) => void;
  /** افزودن تاریخچه زنجیره‌های دیگر در حین اجرا */
  mergeHistories: (m: Record<string, TvlPoint[]>) => void;
}

export const useTvlFlowStore = create<TvlFlowState>((set) => ({
  chains: [],
  protocols: [],
  loading: false,
  syncProgress: null,
  error: false,
  loadedAt: null,
  setChains: (c) => set({ chains: c }),
  setProtocols: (p) => set({ protocols: p }),
  setLoading: (v) => set({ loading: v }),
  setSyncProgress: (v) => set({ syncProgress: v }),
  setError: (v) => set({ error: v }),
  setLoadedAt: (v) => set({ loadedAt: v }),
  injectHistory: (name, points) =>
    set((s) => ({
      chains: s.chains.map((c) =>
        c.name === name
          ? { ...c, history: points, changes: computePeriodChanges(points), loadingHist: false }
          : c
      )
    })),
  mergeHistories: (m) =>
    set((s) => ({
      chains: s.chains.map((c) => {
        const pts = m[c.name];
        return pts ? { ...c, history: pts, changes: computePeriodChanges(pts), loadingHist: false } : c;
      })
    }))
}));

let loadPromise: Promise<void> | null = null;

/** پاک‌سازی صف (تست) */
export function resetTvlFlowLoad(): void {
  loadPromise = null;
}

/** بارگذاری یک‌بار همه داده‌ها + همگام‌سازی پیش‌رونده تاریخچه زنجیره‌ها */
export function loadTvlFlow(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const st = useTvlFlowStore.getState();
    if (st.loading) return;
    st.setLoading(true);
    st.setError(false);
    try {
      // ۱) لیست زنجیره‌ها + پروتکل‌ها (موازی)
      const [chains, protocols] = await Promise.all([fetchAllChains(), fetchAllProtocols()]);
      st.setProtocols(protocols);
      st.setChains(
        chains
          .filter((c) => c.tvl > 0)
          .sort((a, b) => b.tvl - a.tvl)
          .map((c) => ({
            name: c.name,
            tvl: c.tvl,
            history: null,
            changes: {},
            loadingHist: false
          }))
      );
      st.setLoadedAt(Date.now());

      // ۲) همگام‌سازی تاریخچه زنجیره‌های بزرگ (پیش‌رونده، بدون بلاک UI)
      const flowChains = useTvlFlowStore.getState().chains;
      const hist = await syncChainHistories(
        flowChains.map((c) => ({ name: c.name, tvl: c.tvl })),
        {
          limit: 4,
          sessionCap: 120,
          onProgress: (done, total) => st.setSyncProgress({ done, total })
        }
      );
      st.mergeHistories(hist);
      st.setSyncProgress(null);
    } catch {
      st.setError(true);
    } finally {
      st.setLoading(false);
    }
  })().finally(() => {
    loadPromise = null;
  });
  return loadPromise;
}

/** هوک مصرفی */
export function useTvlFlow() {
  const st = useTvlFlowStore();
  useEffect(() => {
    void loadTvlFlow();
  }, []);

  // همگام‌سازی خودکار زنده: هر ۵ دقیقه + هنگام فوکوس
  // (زنجیره‌ها کش ۵ دقیقه‌ای دارند؛ پروتکل‌ها ۲۴ ساعت؛ تاریخچه‌ها ۱ ساعت → شبکه حداقل می‌ماند)
  useAutoSync(
    'tvl-flow',
    () => {
      const s = useTvlFlowStore.getState();
      if (s.loading) return;
      resetTvlFlowLoad();
      void loadTvlFlow();
    },
    { intervalMs: 5 * 60_000, minAgeMs: 3 * 60_000 }
  );

  return st;
}

/** بارگذاری تاریخچه یک زنجیره به‌صورت موردی (روی کلیک ردیف) */
export async function ensureChainHistory(name: string): Promise<void> {
  const st = useTvlFlowStore.getState();
  const row = st.chains.find((c) => c.name === name);
  if (!row || row.history || row.loadingHist) return;
  st.setChains(st.chains.map((c) => (c.name === name ? { ...c, loadingHist: true } : c)));
  const { fetchChainHistory } = await import('./tvlFlowService');
  const pts = await fetchChainHistory(name);
  if (pts) st.injectHistory(name, pts);
  else st.setChains(st.chains.map((c) => (c.name === name ? { ...c, loadingHist: false } : c)));
}
