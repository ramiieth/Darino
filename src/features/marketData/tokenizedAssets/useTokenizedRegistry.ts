/** ============================================================
 * Tokenized Registry — Store + Hooks
 *
 *  - خواندن Registry از دیتابیس (هرگز مستقیم CoinGecko در Render)
 *  - همگام‌سازی خودکار فقط وقتی آخرین اجرای موفق کهنه است (بخش ۱۷)
 *  - جستجو/فیلتر/گروه‌بندی — همه Pure
 * ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { registryAll, lastSuccessfulRun, syncRunsAll } from './db';
import { syncProvider } from './sync';
import { TOKENIZED_SYNC_INTERVAL_MS } from './constants';
import type { TokenizedAssetRecord, TokenizedProvider, TokenizedSyncRun, UnderlyingAssetGroup } from './types';

interface RegistryState {
  records: TokenizedAssetRecord[];
  runs: TokenizedSyncRun[];
  loading: boolean;
  syncing: boolean;
  lastSyncAt: number | null;
  error: string | null;
  setRecords: (records: TokenizedAssetRecord[]) => void;
  setRuns: (runs: TokenizedSyncRun[]) => void;
  setSyncing: (v: boolean) => void;
  setError: (e: string | null) => void;
  touch: () => void;
}

export const useRegistryStore = create<RegistryState>((set) => ({
  records: [],
  runs: [],
  loading: false,
  syncing: false,
  lastSyncAt: null,
  error: null,
  setRecords: (records) => set({ records, loading: false }),
  setRuns: (runs) => set({ runs }),
  setSyncing: (v) => set({ syncing: v }),
  setError: (e) => set({ error: e }),
  touch: () => set({ lastSyncAt: Date.now() })
}));

/** یک بار خواندن Registry از دیتابیس */
export async function loadRegistryFromDb(): Promise<void> {
  const [records, runs] = await Promise.all([registryAll(), syncRunsAll()]);
  useRegistryStore.getState().setRecords(records);
  useRegistryStore.getState().setRuns(runs);
}

/** همگام‌سازی دستی (dedupe در موتور) */
export async function refreshRegistry(): Promise<void> {
  const st = useRegistryStore.getState();
  if (st.syncing) return;
  st.setSyncing(true);
  st.setError(null);
  try {
    await syncProvider('backedfi');
    await syncProvider('ondo');
    await loadRegistryFromDb();
    st.touch();
  } catch (e) {
    st.setError(e instanceof Error ? e.message : String(e));
  } finally {
    useRegistryStore.getState().setSyncing(false);
  }
}

/**
 * هوک مصرفی — همگام‌سازی خودکار فقط وقتی لازم باشد:
 *  - اولین بازدید: اگر آخرین اجرای موفق > ۶ ساعت پیش → sync
 *  - هرگز در هر Render درخواست ارسال نمی‌شود
 */
export function useTokenizedRegistry() {
  const st = useRegistryStore();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadRegistryFromDb();
      if (cancelled) return;
      setHydrated(true);

      // همگام‌سازی خودکار (dedupe): فقط وقتی کهنه است
      const backedfi = await lastSuccessfulRun('backedfi');
      const ondo = await lastSuccessfulRun('ondo');
      const stale =
        !backedfi || Date.now() - backedfi.startedAt > TOKENIZED_SYNC_INTERVAL_MS ||
        !ondo || Date.now() - ondo.startedAt > TOKENIZED_SYNC_INTERVAL_MS;
      if (stale && !useRegistryStore.getState().syncing) {
        void refreshRegistry();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    records: st.records,
    runs: st.runs,
    loading: st.loading,
    syncing: st.syncing,
    lastSyncAt: st.lastSyncAt,
    error: st.error,
    refresh: refreshRegistry
  };
}

/* ================= Pure Helpers (تست‌پذیر) ================= */

export interface RegistryFilters {
  query: string;
  provider: 'all' | TokenizedProvider;
  assetType: 'all' | string;
  status: 'all' | 'active' | 'inactive';
}

export const DEFAULT_FILTERS: RegistryFilters = {
  query: '',
  provider: 'all',
  assetType: 'all',
  status: 'active'
};

/** جستجو: نام پایه / نماد پایه / نماد توکن / Provider (بخش ۲۳) */
export function filterRegistry(
  records: TokenizedAssetRecord[],
  f: RegistryFilters
): TokenizedAssetRecord[] {
  const q = f.query.trim().toLowerCase();
  return records.filter((r) => {
    if (f.provider !== 'all' && r.provider !== f.provider) return false;
    if (f.assetType !== 'all' && r.assetType !== f.assetType) return false;
    if (f.status !== 'all' && r.status !== f.status) return false;
    if (!q) return true;
    const hay = [
      r.underlyingName ?? '',
      r.underlyingSymbol ?? '',
      r.tokenSymbol,
      r.tokenName,
      r.provider
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

/** گروه‌بندی زیر دارایی پایه (بخش ۹/۲۲) — ترتیب: حروف الفبا */
export function groupByUnderlyingAssets(
  records: TokenizedAssetRecord[]
): UnderlyingAssetGroup[] {
  const map = new Map<string, UnderlyingAssetGroup>();
  for (const r of records) {
    const symbol = r.underlyingSymbol?.toUpperCase() ?? null;
    const name = r.underlyingName ?? r.tokenName;
    // شناسه پایدار: نماد پایه، وگرنه fallback نام شرکت (موردهای خصوصی)
    const id = symbol ?? `name:${name.toLowerCase()}`;
    const existing = map.get(id);
    if (existing) {
      existing.tokens.push(r);
    } else {
      map.set(id, {
        underlyingId: id,
        underlyingName: name,
        underlyingSymbol: symbol,
        tokens: [r]
      });
    }
  }
  return [...map.values()].sort((a, b) => a.underlyingName.localeCompare(b.underlyingName));
}

/** آمار خلاصه (بخش ۲۶/۳۱) */
export function registryStats(records: TokenizedAssetRecord[]) {
  const active = records.filter((r) => r.status === 'active');
  const byProvider = { backedfi: 0, ondo: 0 } as Record<TokenizedProvider, number>;
  const byType = new Map<string, number>();
  for (const r of active) {
    byProvider[r.provider]++;
    byType.set(r.assetType, (byType.get(r.assetType) ?? 0) + 1);
  }
  const uniqueUnderlying = new Set(
    active.map((r) => r.underlyingSymbol?.toUpperCase() ?? `name:${(r.underlyingName ?? '').toLowerCase()}`)
  ).size;
  return {
    total: records.length,
    active: active.length,
    inactive: records.length - active.length,
    byProvider,
    byType,
    uniqueUnderlying
  };
}
