/** ============================================================
 * Market Pipeline Store — استور مرکزی + Dedup + Refresh مرکزی
 *
 *  - همه Universeها در یک استور (نه چند استور جدا)
 *  - Request Deduplication: چند Consumer همزمان → یک Fetch (بخش ۱۹)
 *  - Refresh مرکزی: یک تایمر سراسری برای همه (بخش ۲۵) — نه چند Polling
 *  - داده قدیمی معتبر تا دریافت جدید حفظ می‌شود (هرگز خالی نمی‌شود)
 * ============================================================ */
import { create } from 'zustand';
import { cacheGetUniverse, cachePutUniverse, UNIVERSE_TTL_MS } from './cache';
import { fetchUniverseAssets } from './fetch';
import { isValidTokenized } from './normalize';
import type { MarketAsset, MarketUniverse } from './types';

interface MarketsState {
  /** Universe → لیست DTO مینیمال */
  data: Record<MarketUniverse, MarketAsset[]>;
  loading: Record<MarketUniverse, boolean>;
  lastSyncAt: Record<MarketUniverse, number | null>;
  error: Record<MarketUniverse, string | null>;
  set: (u: MarketUniverse, assets: MarketAsset[], error: string | null) => void;
  setLoading: (u: MarketUniverse, v: boolean) => void;
}

export const useMarketsStore = create<MarketsState>((set) => ({
  data: { crypto_top_200: [], ondo_tokenized: [], xstocks: [] },
  loading: { crypto_top_200: false, ondo_tokenized: false, xstocks: false },
  lastSyncAt: { crypto_top_200: null, ondo_tokenized: null, xstocks: null },
  error: { crypto_top_200: null, ondo_tokenized: null, xstocks: null },
  set: (u, assets, error) =>
    set((s) => ({
      data: { ...s.data, [u]: assets },
      lastSyncAt: { ...s.lastSyncAt, [u]: Date.now() },
      loading: { ...s.loading, [u]: false },
      error: { ...s.error, [u]: error }
    })),
  setLoading: (u, v) => set((s) => ({ loading: { ...s.loading, [u]: v } }))
}));

/** درخواست‌های در جریان (Dedup — بخش ۱۹) */
const inFlight = new Map<MarketUniverse, Promise<void>>();

/**
 * همگام‌سازی یک Universe (مرکزی):
 *  کش تازه ← fetch (dedup) ← normalize/validate ← cache ← store
 */
export async function syncUniverse(u: MarketUniverse): Promise<void> {
  const st = useMarketsStore.getState();
  if (st.loading[u]) return;

  // ۱) کش تازه؟ (بدون شبکه)
  const cached = await cacheGetUniverse(u);
  if (cached && cached.length > 0) {
    st.set(u, cached, null);
    return;
  }

  // ۲) Dedup: فقط یک fetch برای مصرف‌کننده‌های هم‌زمان
  const existing = inFlight.get(u);
  if (existing) {
    await existing;
    return;
  }

  st.setLoading(u, true);
  const p = (async () => {
    try {
      const assets = await fetchUniverseAssets(u);
      // فیلتر اعتبار: Tokenized فقط MCap معتبر (بخش ۸/۹) — Crypto همه
      const filtered =
        u === 'crypto_top_200' ? assets : assets.filter(isValidTokenized);
      await cachePutUniverse(u, filtered);
      useMarketsStore.getState().set(u, filtered, null);
    } catch (e) {
      // شکست → داده قبلی حفظ می‌شود (هرگز خالی/جعلی — بخش ۲۹)
      useMarketsStore.getState().set(u, useMarketsStore.getState().data[u], e instanceof Error ? e.message : String(e));
    } finally {
      useMarketsStore.getState().setLoading(u, false);
      inFlight.delete(u);
    }
  })();
  inFlight.set(u, p);
  return p;
}

/** Refresh مرکزی همه Universeها (یک فراخوانی — نه چند تایمر) */
export function refreshAllMarkets(): void {
  void syncUniverse('crypto_top_200');
  void syncUniverse('ondo_tokenized');
  void syncUniverse('xstocks');
}

/** خواندن یک Universe از استور (همراه با ترکیب از کش) */
export async function hydrateUniverse(u: MarketUniverse): Promise<MarketAsset[]> {
  const st = useMarketsStore.getState();
  if (st.data[u].length > 0) return st.data[u];
  // کش کهنه → حفظ (برچسب «کش» در UI)
  const cached = await cacheGetUniverse(u);
  if (cached && cached.length > 0) {
    st.set(u, cached, null);
    return cached;
  }
  return [];
}
