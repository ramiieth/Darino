/** ============================================================
 * Real Estate — استور داده (IndexedDB + کاتالوگ)
 *
 *  - کاتالوگ (شهر/محله/نوع/وضعیت): از پیش‌تعریف‌شده — بدون ورودی دستی
 *  - realAssets: دارایی‌های ملک کاربر (قیمت خرید/ارزش فعلی دستی؛ بقیه اتوماتیک)
 *  - realEstateSnapshots: Snapshotهای تاریخی قیمت محله (Immutable)
 *  - addNeighborhoodSnapshot: Snapshot جدید؛ اگر تاریخ تکراری باشد رکوردها merge
 *    می‌شوند (رکوردهای قبلی دست‌نخورده — Immutable حفظ می‌شود)
 * ============================================================ */
import { useEffect } from 'react';
import { create } from 'zustand';
import { getDb } from '@/shared/lib/db';
import { buildRealAsset, buildSnapshot } from '../domain/engine';
import type {
  NewNeighborhoodPriceInput,
  NewRealAssetInput,
  RealAsset,
  RealEstateSnapshot
} from '../domain/types';
import { NEIGHBORHOODS, CITIES, PROPERTY_TYPES, BUILDING_CONDITIONS } from './catalog';

/** رابط داینامیک جداول (همان الگوی حسابداری/خودرو) */
interface RealEstateDb {
  realAssets: { toArray(): Promise<RealAsset[]>; put(v: RealAsset): Promise<unknown>; clear(): Promise<unknown> };
  realEstateSnapshots: {
    toArray(): Promise<RealEstateSnapshot[]>;
    count(): Promise<number>;
    put(v: RealEstateSnapshot): Promise<unknown>;
    get(id: string): Promise<RealEstateSnapshot | undefined>;
    clear(): Promise<unknown>;
  };
}

interface RealEstateState {
  assets: RealAsset[];
  snapshots: RealEstateSnapshot[];
  loading: boolean;
  error: boolean;
  hydrate: () => Promise<void>;
  addAsset: (input: NewRealAssetInput) => Promise<RealAsset | null>;
  addNeighborhoodSnapshot: (input: NewNeighborhoodPriceInput) => Promise<RealEstateSnapshot | null>;
  reset: () => Promise<void>;
}

let hydratePromise: Promise<void> | null = null;

export const useRealEstateStore = create<RealEstateState>((set, get) => ({
  assets: [],
  snapshots: [],
  loading: false,
  error: false,

  hydrate: async () => {
    if (get().assets.length > 0 || get().snapshots.length > 0) return;
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      set({ loading: true, error: false });
      try {
        const db = (await getDb()) as unknown as RealEstateDb | null;
        if (!db) {
          set({ loading: false });
          return;
        }
        const assets = await db.realAssets.toArray();
        const snapshots = (await db.realEstateSnapshots.toArray()).sort((a, b) => a.dateTs - b.dateTs);
        set({ assets, snapshots, loading: false });
      } catch {
        set({ error: true, loading: false });
      } finally {
        hydratePromise = null;
      }
    })();
    return hydratePromise;
  },

  addAsset: async (input) => {
    const asset = buildRealAsset(input);
    try {
      const db = (await getDb()) as unknown as RealEstateDb | null;
      if (db) await db.realAssets.put(asset);
    } catch {
      /* فقط حافظه */
    }
    set((st) => ({ assets: [...st.assets, asset] }));
    return asset;
  },

  addNeighborhoodSnapshot: async (input) => {
    const snap = buildSnapshot(input);
    try {
      const db = (await getDb()) as unknown as RealEstateDb | null;
      if (db) {
        // اگر Snapshot با همان تاریخ موجود است → رکوردهای جدید merge (قدیمی‌ها دست‌نخورده)
        const existing = await db.realEstateSnapshots.get(snap.id);
        if (existing) {
          const merged: RealEstateSnapshot = {
            ...existing,
            records: [...existing.records, ...snap.records]
          };
          await db.realEstateSnapshots.put(merged);
          const snapshots = (await db.realEstateSnapshots.toArray()).sort((a, b) => a.dateTs - b.dateTs);
          set({ snapshots });
          return merged;
        }
        await db.realEstateSnapshots.put(snap);
      }
    } catch {
      /* فقط حافظه */
    }
    const snapshots = [...get().snapshots, snap].sort((a, b) => a.dateTs - b.dateTs);
    set({ snapshots });
    return snap;
  },

  reset: async () => {
    try {
      const db = (await getDb()) as unknown as RealEstateDb | null;
      if (db) {
        await db.realAssets.clear();
        await db.realEstateSnapshots.clear();
      }
    } catch {
      /* خاموش */
    }
    set({ assets: [], snapshots: [] });
    hydratePromise = null;
  }
}));

/** هوک مصرفی */
export function useRealEstate() {
  const st = useRealEstateStore();
  useEffect(() => {
    void st.hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return st;
}

export function resetRealEstateHydrate(): void {
  hydratePromise = null;
}

export { NEIGHBORHOODS, CITIES, PROPERTY_TYPES, BUILDING_CONDITIONS };
