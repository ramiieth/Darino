/** ============================================================
 * Car Market — استور (IndexedDB = منبع حقیقت محلی)
 *
 *  به‌روزرسانی: car.ir مستقیم از مرورگر (CORS باز) → نبود → از مسیر سرور
 *    → Snapshot امروز (با نرخ زنده تتر) → IndexedDB → پشتیبان Neon (best-effort)
 *  خودکار: با باز شدن صفحه، اگر Snapshot امروز نیست یا بیش از ۶ ساعت گذشته
 *  تاریخچه: Snapshotهای Cron روزانه سرور (Neon) با داده محلی ادغام می‌شوند
 *  تا روزهایی که اپ باز نشده هم در تاریخچه باشند.
 * ============================================================ */
import { useEffect } from 'react';
import { create } from 'zustand';
import { getDb } from '@/shared/lib/db';
import { fetchJson, isRemoteAllowed, isRemoteReady } from '@/repositories/remoteClient';
import { useUsdtStore, usdtIsStale } from '@/shared/store/usdtStore';
import { tehranDayKey } from '@/shared/fx/usdtHistory';
import { fetchCarIrPrices, type ParsedCarPrices } from '../collector/carIr';
import { buildCarSnapshot, isCarSnapshot, mergeCarSnapshots } from '../domain/snapshot';
import type { CarSnapshot } from '../domain/types';

interface CarDb {
  carSnapshots: {
    toArray(): Promise<CarSnapshot[]>;
    put(v: CarSnapshot): Promise<unknown>;
  };
}

/** فاصله به‌روزرسانی خودکار در همان روز */
export const AUTO_REFRESH_MS = 6 * 3600_000;

export type CarRefreshStatus = 'idle' | 'running' | 'done' | 'error';

interface CarMarketState {
  snapshots: CarSnapshot[];
  loading: boolean;
  hydrated: boolean;
  status: CarRefreshStatus;
  message: string | null;
  /** مسیر آخرین واکشی موفق */
  via: 'direct' | 'server' | null;
  hydrate: () => Promise<void>;
  refresh: (opts?: { auto?: boolean }) => Promise<void>;
}

async function localDb(): Promise<CarDb | null> {
  try {
    return (await getDb()) as unknown as CarDb | null;
  } catch {
    return null;
  }
}

async function localPut(s: CarSnapshot): Promise<void> {
  const db = await localDb();
  if (!db) return;
  try {
    await db.carSnapshots.put(s);
  } catch {
    /* خاموش — در حافظه باقی است */
  }
}

/** نرخ زنده تتر برای Snapshot — نرخ قدیمی ذخیره نمی‌شود (بعداً از تاریخچه روزانه) */
async function liveUsdt(): Promise<{ rateToman: number; source: 'wallex' | 'bitpin' } | null> {
  try {
    const st = useUsdtStore.getState();
    if (!st.quote || usdtIsStale(st.quote)) await st.refresh();
    const { quote, status } = useUsdtStore.getState();
    if (!quote || status !== 'live' || usdtIsStale(quote)) return null;
    return { rateToman: quote.priceToman, source: quote.source };
  } catch {
    return null;
  }
}

/** مرورگر مستقیم → فالبک سرور */
async function fetchPrices(): Promise<{ parsed: ParsedCarPrices; via: 'direct' | 'server' }> {
  try {
    return { parsed: await fetchCarIrPrices(), via: 'direct' };
  } catch (direct) {
    if (!isRemoteAllowed()) throw direct;
    const r = await fetchJson<{ ok?: boolean; error?: string } & Partial<ParsedCarPrices>>('/api/propertyMarket', {
      method: 'POST',
      body: { action: 'carPrices' },
      timeoutMs: 45_000
    });
    if (!r?.ok || !Array.isArray(r.rows) || r.rows.length === 0) throw new Error(r?.error ?? 'empty');
    return { parsed: { rows: r.rows, brandNames: r.brandNames ?? {}, sourceUpdatedAt: r.sourceUpdatedAt ?? null }, via: 'server' };
  }
}

export function needsAutoRefresh(snaps: CarSnapshot[], now = Date.now()): boolean {
  const last = snaps.length > 0 ? snaps[snaps.length - 1] : null;
  if (!last) return true;
  return last.day !== tehranDayKey(now) || now - last.dateTs > AUTO_REFRESH_MS;
}

let hydratePromise: Promise<void> | null = null;

export const useCarMarketStore = create<CarMarketState>((set, get) => ({
  snapshots: [],
  loading: false,
  hydrated: false,
  status: 'idle',
  message: null,
  via: null,

  hydrate: async () => {
    if (get().hydrated) return;
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      set({ loading: true });
      let local: CarSnapshot[] = [];
      const db = await localDb();
      if (db) {
        try {
          local = await db.carSnapshots.toArray();
        } catch {
          /* فالبک حافظه */
        }
      }
      let snapshots = mergeCarSnapshots(local);
      set({ snapshots });

      // تاریخچه Cron سرور → ادغام (روزهایی که اپ باز نشده)
      if (isRemoteAllowed()) {
        try {
          if (await isRemoteReady()) {
            const r = await fetchJson<{ snapshots?: unknown[] }>('/api/propertyMarket?market=car', { timeoutMs: 10_000 });
            const remote = (Array.isArray(r.snapshots) ? r.snapshots : []).filter(isCarSnapshot);
            if (remote.length > 0) {
              const known = new Map(snapshots.map((s) => [s.day, s.dateTs]));
              snapshots = mergeCarSnapshots(snapshots, remote);
              for (const s of snapshots) {
                if ((known.get(s.day) ?? -1) < s.dateTs) await localPut(s);
              }
            }
          }
        } catch {
          /* محلی ادامه می‌دهد */
        }
      }
      set({ snapshots, loading: false, hydrated: true });
      hydratePromise = null;
    })();
    return hydratePromise;
  },

  refresh: async (opts) => {
    if (get().status === 'running') return;
    set({ status: 'running', message: null });
    await get().hydrate();
    try {
      const [{ parsed, via }, usdt] = await Promise.all([fetchPrices(), liveUsdt()]);
      const snap = buildCarSnapshot(parsed, usdt);
      await localPut(snap);
      set({ snapshots: mergeCarSnapshots(get().snapshots, [snap]), status: 'done', via, message: null });
      if (isRemoteAllowed()) {
        void fetchJson('/api/propertyMarket', { method: 'POST', body: { action: 'carPersist', snapshot: snap }, timeoutMs: 30_000 }).catch(
          () => undefined
        );
      }
    } catch {
      set({
        status: 'error',
        message: opts?.auto
          ? 'به‌روزرسانی خودکار قیمت‌ها انجام نشد — آخرین قیمت ذخیره‌شده نمایش داده می‌شود.'
          : 'دریافت قیمت از car.ir ممکن نشد — اتصال اینترنت را بررسی و دوباره امتحان کنید.'
      });
    }
  }
}));

/** هوک مصرفی — بارگذاری + به‌روزرسانی خودکار روزانه */
export function useCarMarket() {
  const st = useCarMarketStore();
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await useCarMarketStore.getState().hydrate();
      if (!cancelled && needsAutoRefresh(useCarMarketStore.getState().snapshots)) {
        void useCarMarketStore.getState().refresh({ auto: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return st;
}
