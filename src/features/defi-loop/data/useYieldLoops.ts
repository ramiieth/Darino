/** استور + بارگذاری پول‌های Yield (سینگلتون) + کش تاریخچه */
import { useEffect } from 'react';
import { create } from 'zustand';
import { useAutoSync } from '@/shared/hooks/useAutoSync';
import { fetchAllYieldPools, fetchPoolChart, type YieldPool, type YieldChartPoint } from './yieldsService';

interface YieldState {
  pools: YieldPool[];
  loading: boolean;
  error: boolean;
  /** پول → تاریخچه (lazy) */
  charts: Record<string, YieldChartPoint[]>;
  loadedAt: number | null;
}

export const useYieldStore = create<YieldState>((set) => ({
  pools: [],
  loading: false,
  error: false,
  charts: {},
  loadedAt: null
}));

let loadPromise: Promise<void> | null = null;

export function loadYieldPools(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const st = useYieldStore.getState();
    if (st.loading) return;
    useYieldStore.setState({ loading: true, error: false });
    try {
      const pools = await fetchAllYieldPools();
      useYieldStore.setState({ pools, loadedAt: Date.now(), loading: false });
    } catch {
      useYieldStore.setState({ error: true, loading: false });
    }
  })().finally(() => { loadPromise = null; });
  return loadPromise;
}

/** پاک‌سازی صف (تست) */
export function resetYieldLoad(): void {
  loadPromise = null;
}

export function useYieldPools() {
  const st = useYieldStore();
  useEffect(() => { void loadYieldPools(); }, []);

  // همگام‌سازی خودکار زنده: هر ۵ دقیقه + هنگام فوکوس (پول‌ها کش ۵ دقیقه‌ای دارند)
  useAutoSync(
    'yield-pools',
    () => {
      const s = useYieldStore.getState();
      if (s.loading) return;
      resetYieldLoad();
      void loadYieldPools();
    },
    { intervalMs: 5 * 60_000, minAgeMs: 3 * 60_000 }
  );

  return st;
}

/** بارگذاری lazy تاریخچه یک پول (برای آمار APY/TVL) */
export async function ensurePoolChart(poolId: string): Promise<YieldChartPoint[] | null> {
  const st = useYieldStore.getState();
  if (st.charts[poolId]) return st.charts[poolId];
  const pts = await fetchPoolChart(poolId);
  if (pts.length > 0) {
    useYieldStore.setState((s) => ({ charts: { ...s.charts, [poolId]: pts } }));
    return pts;
  }
  return null;
}

/** محاسبه آمار یک پول با تاریخچه (lazy) */
export async function getPoolAnalytics(poolId: string): Promise<YieldChartPoint[] | null> {
  return ensurePoolChart(poolId);
}
