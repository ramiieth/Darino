/** ============================================================
 * Vehicle Investment — استور داده (IndexedDB + سید خودترمیم)
 *
 *  - جدول vehicles: فراداده خودروها
 *  - جدول vehicleSnapshots: Snapshotهای تاریخی (Immutable)
 *  - در اولین بار، Snapshot اول (۱۸ مرداد ۱۴۰۵) سید می‌شود.
 *  - هر Snapshot جدید فقط اضافه می‌شود؛ هرگز Snapshot قبلی تغییر نمی‌کند.
 * ============================================================ */
import { useEffect } from 'react';
import { create } from 'zustand';
import { getDb } from '@/shared/lib/db';
import { buildSnapshot } from '../domain/engine';
import type { NewSnapshotInput, Vehicle, VehicleSnapshot } from '../domain/types';
import {
  VEHICLES,
  SNAPSHOT1_TS,
  SNAPSHOT1_USD_RATE,
  SNAPSHOT1_JALALI,
  SNAPSHOT1_SOURCE,
  snapshot1Prices
} from './dataset';

/** رابط داینامیک جداول خودرو (همان الگوی حسابداری — cast روی Dexie) */
interface VehicleDb {
  vehicles: { toArray(): Promise<Vehicle[]>; count(): Promise<number>; bulkPut(v: Vehicle[]): Promise<unknown>; put(v: Vehicle): Promise<unknown>; clear(): Promise<unknown> };
  vehicleSnapshots: {
    toArray(): Promise<VehicleSnapshot[]>;
    count(): Promise<number>;
    put(v: VehicleSnapshot): Promise<unknown>;
    get(id: string): Promise<VehicleSnapshot | undefined>;
    clear(): Promise<unknown>;
  };
}

interface VehicleState {
  vehicles: Vehicle[];
  snapshots: VehicleSnapshot[];
  loading: boolean;
  error: boolean;
  /** Snapshot اول سید شده است؟ */
  seeded: boolean;
  hydrate: () => Promise<void>;
  /** افزودن Snapshot جدید (Immutable) */
  addSnapshot: (input: NewSnapshotInput) => Promise<VehicleSnapshot | null>;
  /** افزودن خودرو جدید (فقط وقتی در سیستم نیست) — false اگر تکراری باشد */
  addVehicle: (v: Vehicle) => Promise<boolean>;
  /** حذف همه (تست/بازنشانی) */
  reset: () => Promise<void>;
}

let hydratePromise: Promise<void> | null = null;

export const useVehicleStore = create<VehicleState>((set, get) => ({
  vehicles: [],
  snapshots: [],
  loading: false,
  error: false,
  seeded: false,

  hydrate: async () => {
    if (get().vehicles.length > 0 && get().snapshots.length > 0) return;
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      set({ loading: true, error: false });
      try {
        const db = (await getDb()) as unknown as VehicleDb | null;
        // فالبک: حتی بدون IndexedDB، حداقل Dataset در حافظه
        if (!db) {
          const { marketPrices, dealerPrices } = snapshot1Prices();
          const snap1 = buildSnapshot(VEHICLES, {
            dateTs: SNAPSHOT1_TS,
            dateLabel: SNAPSHOT1_JALALI,
            usdRate: SNAPSHOT1_USD_RATE,
            priceSource: SNAPSHOT1_SOURCE,
            marketPrices,
            dealerPrices
          });
          set({ vehicles: VEHICLES, snapshots: [snap1], loading: false, seeded: true });
          return;
        }

        // فراداده خودروها
        const existing = await db.vehicles.count();
        if (existing === 0) {
          await db.vehicles.bulkPut(VEHICLES);
        }

        // Snapshot اول (سید) — فقط اگر هیچ Snapshotی نباشد
        const snapCount = await db.vehicleSnapshots.count();
        if (snapCount === 0) {
          const { marketPrices, dealerPrices } = snapshot1Prices();
          const snap1 = buildSnapshot(VEHICLES, {
            dateTs: SNAPSHOT1_TS,
            dateLabel: SNAPSHOT1_JALALI,
            usdRate: SNAPSHOT1_USD_RATE,
            priceSource: SNAPSHOT1_SOURCE,
            marketPrices,
            dealerPrices
          });
          await db.vehicleSnapshots.put(snap1);
        }

        const vehicles = await db.vehicles.toArray();
        const snapshots = (await db.vehicleSnapshots.toArray()).sort((a, b) => a.dateTs - b.dateTs);
        set({ vehicles, snapshots, loading: false, seeded: true });
      } catch {
        set({ error: true, loading: false });
      } finally {
        hydratePromise = null;
      }
    })();
    return hydratePromise;
  },

  addVehicle: async (v) => {
    const exists = get().vehicles.some((x) => x.id === v.id);
    if (exists) return false;
    try {
      const db = (await getDb()) as unknown as VehicleDb | null;
      if (db) await db.vehicles.put(v);
    } catch {
      /* فقط حافظه */
    }
    set((st) => ({ vehicles: [...st.vehicles, v] }));
    return true;
  },

  addSnapshot: async (input) => {
    const vehicles = get().vehicles;
    if (vehicles.length === 0) return null;
    const snap = buildSnapshot(vehicles, input);
    try {
      const db = (await getDb()) as unknown as VehicleDb | null;
      if (db) {
        // جلوگیری از دوباره‌نویسی Snapshot با همان تاریخ
        const existing = await db.vehicleSnapshots.get(snap.id);
        if (existing) return existing;
        await db.vehicleSnapshots.put(snap);
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
      const db = (await getDb()) as unknown as VehicleDb | null;
      if (db) {
        await db.vehicles.clear();
        await db.vehicleSnapshots.clear();
      }
    } catch {
      /* خاموش */
    }
    set({ vehicles: [], snapshots: [], seeded: false });
    hydratePromise = null;
  }
}));

/** هوک مصرفی */
export function useVehicles() {
  const st = useVehicleStore();
  useEffect(() => {
    void st.hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return st;
}

/** پاک‌سازی صف (تست) */
export function resetVehicleHydrate(): void {
  hydratePromise = null;
}
