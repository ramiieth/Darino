/** ============================================================
 * Property Market — استور داده (IndexedDB + سرور Neon)
 *
 *  - pmListings / pmSnapshots در Dexie (آفلاین-فرست)
 *  - سناریوی دلار آینده در جدول settings (هیچ جدول ارزی جدیدی نیست)
 *  - مهاجرت یک‌باره داده تاریخی ماژول قبلی (حذف داده ممنوع)
 *  - کلکشن دیوار فقط از مسیر سرور (/api/propertyMarket) — مرورگر
 *    نمی‌تواند مستقیم به دیوار بزند (CORS).
 * ============================================================ */
import { useEffect } from 'react';
import { create } from 'zustand';
import { getDb, settingGet, settingSet } from '@/shared/lib/db';
import { fetchJson, isRemoteAllowed, isRemoteReady } from '@/repositories/remoteClient';
import type {
  PropertyMarketListing,
  PropertyMarketScenario,
  PropertyMarketSnapshot
} from '../domain/types';
import { migrateLegacySnapshot, LEGACY_MIGRATION_FLAG } from './legacyMigration';
import type { CollectCursor } from '../collector/run';

/* ---------------- رابط داینامیک جداول (الگوی سایر ماژول‌ها) ---------------- */

interface LegacyRealAssetRow {
  id: string;
  propertyType: string;
  city: string;
  neighborhoodId: string;
  buildingCondition: string;
  ownershipDateJalali: string;
  purchasePriceToman: number;
  purchasePriceUsd: number;
  currentValueToman: number;
  currentValueUsd: number;
  createdAt: number;
}

interface LegacySnapshotRow {
  id: string;
  dateTs: number;
  dateLabel: string;
  usdRate: number;
  records: {
    neighborhoodId: string;
    propertyType: string;
    buildingCondition: string;
    averagePricePerSqmToman: number;
    averagePricePerSqmUsd: number;
  }[];
  createdAt: number;
}

interface PropertyMarketDb {
  pmListings: {
    toArray(): Promise<PropertyMarketListing[]>;
    put(v: PropertyMarketListing): Promise<unknown>;
    bulkPut(v: PropertyMarketListing[]): Promise<unknown>;
  };
  pmSnapshots: {
    toArray(): Promise<PropertyMarketSnapshot[]>;
    put(v: PropertyMarketSnapshot): Promise<unknown>;
    get(id: string): Promise<PropertyMarketSnapshot | undefined>;
  };
  realAssets: { toArray(): Promise<LegacyRealAssetRow[]> };
  realEstateSnapshots: { toArray(): Promise<LegacySnapshotRow[]> };
}

/* ---------------- وضعیت کلکشن ---------------- */

export type CollectStatus = 'idle' | 'running' | 'finalizing' | 'done' | 'error' | 'unavailable';

export interface CollectState {
  status: CollectStatus;
  message: string | null;
  chunks: number;
  listingsAdded: number;
  detailsFetched: number;
  cursor: CollectCursor | null;
  /** آیا سرور/دیتابیس در دسترس نیست؟ */
  serverUnavailable: boolean;
}

const SCENARIO_KEY = 'pmScenarioV1';

/** پاسخ سرور برای هر تکه کلکشن */
interface CollectChunkResponse {
  ok: boolean;
  done?: boolean;
  cursor?: CollectCursor;
  added?: number;
  fetchedDetails?: number;
  failedDetails?: number;
  error?: string;
}

interface PropertyMarketState {
  listings: PropertyMarketListing[];
  snapshots: PropertyMarketSnapshot[];
  scenario: PropertyMarketScenario;
  legacyAssets: LegacyRealAssetRow[];
  loading: boolean;
  hydrated: boolean;
  remoteConnected: boolean;
  collect: CollectState;
  hydrate: () => Promise<void>;
  setScenario: (patch: Partial<Omit<PropertyMarketScenario, 'updatedAt'>>) => Promise<void>;
  resetScenario: () => Promise<void>;
  startCollection: () => Promise<void>;
}

const DEFAULT_SCENARIO: PropertyMarketScenario = {
  futureUsdRateToman: null,
  propertyTomanGrowthPct: null,
  updatedAt: 0
};

let hydratePromise: Promise<void> | null = null;

/* ---------------- محلی (Dexie) ---------------- */

async function localPutListings(listings: PropertyMarketListing[]): Promise<void> {
  if (listings.length === 0) return;
  const db = (await getDb()) as unknown as PropertyMarketDb | null;
  if (db) {
    try {
      await db.pmListings.bulkPut(listings);
    } catch {
      /* خاموش */
    }
  }
}

async function localPutSnapshot(snap: PropertyMarketSnapshot): Promise<void> {
  const db = (await getDb()) as unknown as PropertyMarketDb | null;
  if (db) {
    try {
      await db.pmSnapshots.put(snap);
    } catch {
      /* خاموش */
    }
  }
}

/** مهاجرت یک‌باره داده تاریخی ماژول قبلی → مدل جدید (داده قدیمی حذف نمی‌شود) */
async function migrateLegacyIfNeeded(db: PropertyMarketDb, currentSnapshots: PropertyMarketSnapshot[]): Promise<PropertyMarketSnapshot[]> {
  const flag = await settingGet<boolean>(LEGACY_MIGRATION_FLAG, false);
  if (flag) return currentSnapshots;
  try {
    const legacySnaps = await db.realEstateSnapshots.toArray();
    const added: PropertyMarketSnapshot[] = [];
    if (legacySnaps.length > 0) {
      const existingIds = new Set(currentSnapshots.map((s) => s.id));
      for (const ls of legacySnaps) {
        const migrated = migrateLegacySnapshot(ls);
        if (migrated && !existingIds.has(migrated.id)) {
          await db.pmSnapshots.put(migrated);
          added.push(migrated);
        }
      }
    }
    await settingSet(LEGACY_MIGRATION_FLAG, true);
    if (added.length > 0) {
      return [...currentSnapshots, ...added].sort((a, b) => a.dateTs - b.dateTs);
    }
  } catch {
    /* مهاجرت ناموفق → بعداً دوباره تلاش می‌شود (فلگ تنظیم نشد) */
  }
  return currentSnapshots;
}

/* ---------------- استور ---------------- */

export const usePropertyMarketStore = create<PropertyMarketState>((set, get) => ({
  listings: [],
  snapshots: [],
  scenario: DEFAULT_SCENARIO,
  legacyAssets: [],
  loading: false,
  hydrated: false,
  remoteConnected: false,
  collect: {
    status: 'idle',
    message: null,
    chunks: 0,
    listingsAdded: 0,
    detailsFetched: 0,
    cursor: null,
    serverUnavailable: false
  },

  hydrate: async () => {
    if (get().hydrated) return;
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      set({ loading: true });
      let listings: PropertyMarketListing[] = [];
      let snapshots: PropertyMarketSnapshot[] = [];
      let legacyAssets: LegacyRealAssetRow[] = [];
      let remoteConnected = false;

      const db = (await getDb()) as unknown as PropertyMarketDb | null;
      if (db) {
        try {
          listings = await db.pmListings.toArray();
          snapshots = (await db.pmSnapshots.toArray()).sort((a, b) => a.dateTs - b.dateTs);
          legacyAssets = await db.realAssets.toArray();
          snapshots = await migrateLegacyIfNeeded(db, snapshots);
        } catch {
          /* فالبک */
        }
      }

      // سناریو از settings (منبع موجود — بدون جدول جدید ارزی)
      const scenario = await settingGet<PropertyMarketScenario>(SCENARIO_KEY, DEFAULT_SCENARIO);

      // اتصال سرور → داده‌های مشترک (Neon SSOT وقتی متصل است)
      if (isRemoteAllowed() && (await isRemoteReady())) {
        try {
          const res = await fetchJson<{
            listings?: PropertyMarketListing[];
            snapshots?: PropertyMarketSnapshot[];
          }>('/api/propertyMarket', { timeoutMs: 8000 });
          if (Array.isArray(res.listings) && res.listings.length > 0) listings = res.listings;
          if (Array.isArray(res.snapshots) && res.snapshots.length > 0) {
            snapshots = [...snapshots, ...res.snapshots.filter(
              (rs) => !snapshots.some((s) => s.id === rs.id)
            )].sort((a, b) => a.dateTs - b.dateTs);
          }
          remoteConnected = true;
          // همگام‌سازی محلی برای آفلاین
          if (db) {
            try {
              if (Array.isArray(res.listings)) await db.pmListings.bulkPut(res.listings);
            } catch {
              /* خاموش */
            }
          }
        } catch {
          /* محلی ادامه می‌دهد */
        }
      }

      set({ listings, snapshots, scenario, legacyAssets, loading: false, hydrated: true, remoteConnected });
      hydratePromise = null;
    })();
    return hydratePromise;
  },

  setScenario: async (patch) => {
    const next: PropertyMarketScenario = { ...get().scenario, ...patch, updatedAt: Date.now() };
    set({ scenario: next });
    await settingSet(SCENARIO_KEY, next);
  },

  resetScenario: async () => {
    set({ scenario: DEFAULT_SCENARIO });
    await settingSet(SCENARIO_KEY, DEFAULT_SCENARIO);
  },

  startCollection: async () => {
    const st = get();
    if (st.collect.status === 'running' || st.collect.status === 'finalizing') return;

    if (!isRemoteAllowed() || !(await isRemoteReady(true))) {
      set({
        collect: {
          status: 'unavailable',
          message: 'سرور/دیتابیس در دسترس نیست — کلکشن دیوار فقط از مسیر سرور انجام می‌شود.',
          chunks: 0,
          listingsAdded: 0,
          detailsFetched: 0,
          cursor: null,
          serverUnavailable: true
        }
      });
      return;
    }

    set({
      collect: {
        status: 'running',
        message: 'شروع کلکشن از دیوار…',
        chunks: 0,
        listingsAdded: 0,
        detailsFetched: 0,
        cursor: null,
        serverUnavailable: false
      }
    });

    let cursor: CollectCursor | null = null;
    try {
      let done = false;
      let guard = 0;
      while (!done && guard < 40) {
        guard += 1;
        const res: CollectChunkResponse = await fetchJson<CollectChunkResponse>(
          '/api/propertyMarket',
          {
            method: 'POST',
            body: { action: 'collectChunk', city: 'ahvaz', cursor },
            timeoutMs: 90_000
          }
        );
        if (!res.ok) throw new Error(res.error ?? 'collect failed');
        cursor = res.cursor ?? cursor;
        const c = get().collect;
        set({
          collect: {
            ...c,
            chunks: c.chunks + 1,
            listingsAdded: c.listingsAdded + (res.added ?? 0),
            detailsFetched: c.detailsFetched + (res.fetchedDetails ?? 0),
            cursor,
            message: `در حال کلکشن… (تکه ${c.chunks + 1})`
          }
        });
        done = res.done === true;
      }

      // ثبت Snapshot جدید (هرگز overwrite نمی‌شود)
      set({ collect: { ...get().collect, status: 'finalizing', message: 'ساخت Snapshot بازار…' } });
      const fin = await fetchJson<{ ok: boolean; snapshot?: PropertyMarketSnapshot; error?: string }>(
        '/api/propertyMarket',
        { method: 'POST', body: { action: 'finalize' }, timeoutMs: 60_000 }
      );
      if (!fin.ok || !fin.snapshot) throw new Error(fin.error ?? 'finalize failed');
      await localPutSnapshot(fin.snapshot);
      // دریافت فهرست آگهی‌های به‌روز برای ویوی محلی
      let listings = get().listings;
      try {
        const fresh = await fetchJson<{ listings?: PropertyMarketListing[] }>('/api/propertyMarket', {
          timeoutMs: 15_000
        });
        if (Array.isArray(fresh.listings) && fresh.listings.length > 0) {
          listings = fresh.listings;
          await localPutListings(fresh.listings);
        }
      } catch {
        /* محلی ادامه می‌دهد */
      }
      const snapshots = [...get().snapshots.filter((s) => s.id !== fin.snapshot!.id), fin.snapshot!].sort(
        (a, b) => a.dateTs - b.dateTs
      );
      set({
        listings,
        snapshots,
        collect: {
          ...get().collect,
          status: 'done',
          message: `Snapshot ثبت شد — ${fin.snapshot.cleaning.market} آگهی معتبر`
        }
      });
    } catch (e) {
      set({
        collect: {
          ...get().collect,
          status: 'error',
          message: e instanceof Error ? e.message.slice(0, 160) : 'خطای کلکشن'
        }
      });
    }
  }
}));

/** هوک مصرفی */
export function usePropertyMarket() {
  const st = usePropertyMarketStore();
  useEffect(() => {
    void st.hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return st;
}

export type { LegacyRealAssetRow };
