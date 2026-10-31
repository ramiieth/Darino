/** بازارهای Stable Carry — پول‌های Yield (استور مشترک) + بازارهای وام DeFiLlama */
import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { useAutoSync } from '@/shared/hooks/useAutoSync';
import { buildCarryMarkets, type CarryMarket, type LendBorrowRow } from '@/features/defi-loop/domain/carry';
import { fetchLendBorrow } from './yieldsService';
import { useYieldPools } from './useYieldLoops';

interface LendBorrowState {
  rows: LendBorrowRow[];
  loading: boolean;
  loadedAt: number | null;
}

const useLendBorrowStore = create<LendBorrowState>(() => ({ rows: [], loading: false, loadedAt: null }));

let loadPromise: Promise<void> | null = null;

function loadLendBorrow(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    useLendBorrowStore.setState({ loading: true });
    const rows = await fetchLendBorrow();
    useLendBorrowStore.setState({ rows, loading: false, loadedAt: Date.now() });
  })().finally(() => { loadPromise = null; });
  return loadPromise;
}

export interface StableCarryState {
  markets: CarryMarket[];
  loading: boolean;
  /** هر دو منبع پاسخ دادند ولی بازاری نساخت (یا یکی خالی برگشت) */
  empty: boolean;
  loadedAt: number | null;
  refresh: () => void;
}

export function useStableCarry(): StableCarryState {
  const yields = useYieldPools();
  const lb = useLendBorrowStore();
  useEffect(() => { void loadLendBorrow(); }, []);

  useAutoSync(
    'lend-borrow',
    () => {
      if (!useLendBorrowStore.getState().loading) void loadLendBorrow();
    },
    { intervalMs: 5 * 60_000, minAgeMs: 3 * 60_000 }
  );

  const markets = useMemo(
    () => (yields.pools.length > 0 && lb.rows.length > 0 ? buildCarryMarkets(yields.pools, lb.rows) : []),
    [yields.pools, lb.rows]
  );
  const loading = (yields.loading || lb.loading) && markets.length === 0;
  return {
    markets,
    loading,
    empty: !loading && markets.length === 0,
    loadedAt: lb.loadedAt && yields.loadedAt ? Math.min(lb.loadedAt, yields.loadedAt) : null,
    refresh: () => { void loadLendBorrow(); }
  };
}
