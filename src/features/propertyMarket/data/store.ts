/** ============================================================
 * Property Market — استور داده (IndexedDB = منبع حقیقت، تک‌کاربره)
 *
 * تنها مسیر جمع‌آوری: سرور (/api/propertyMarket) از دیوار واکشی می‌کند →
 *   `ingestSeeds` → IndexedDB → Snapshot
 *
 *  - پیشرفت هر تکه بلافاصله ذخیره می‌شود (قطع شبکه = از دست رفتن داده نیست)
 *  - خطای یک منبع، منبع دیگر را متوقف نمی‌کند
 *  - Neon فقط پشتیبان اختیاری است (best-effort؛ هرگز مانع کار نیست)
 * ============================================================ */
import { useEffect } from 'react';
import { create } from 'zustand';
import { getDb, settingGet, settingSet } from '@/shared/lib/db';
import { fetchJson, isRemoteAllowed, isRemoteReady } from '@/repositories/remoteClient';
import type {
  CleaningReport,
  ListingSource,
  PropertyMarketListing,
  PropertyMarketSnapshot
} from '../domain/types';
import { migrateLegacySnapshot, LEGACY_MIGRATION_FLAG } from './legacyMigration';
import type { CollectCursor } from '../collector/run';
import type { ParsedListingSeed } from '../collector/parse';
import { newCleaningReport } from '../collector/pipeline';
import { buildSnapshot, ingestSeeds, purgeStoredListings, rekeyListings } from './ingest';
import { useUsdtStore, usdtIsStale } from '@/shared/store/usdtStore';
import { toFaDigits } from '@/shared/utils/formatters';

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
    bulkDelete(keys: string[]): Promise<unknown>;
  };
  pmSnapshots: {
    toArray(): Promise<PropertyMarketSnapshot[]>;
    put(v: PropertyMarketSnapshot): Promise<unknown>;
    get(id: string): Promise<PropertyMarketSnapshot | undefined>;
  };
  realAssets: { toArray(): Promise<LegacyRealAssetRow[]> };
  realEstateSnapshots: { toArray(): Promise<LegacySnapshotRow[]> };
}

/* ---------------- وضعیت‌ها ---------------- */

export type CollectStatus = 'idle' | 'checking' | 'running' | 'done' | 'error' | 'unavailable';
export type SourceRunStatus = 'idle' | 'waiting' | 'running' | 'done' | 'error' | 'skipped' | 'cancelled';

export interface SourceProgress {
  status: SourceRunStatus;
  pages: number;
  seen: number;
  details: number;
  failed: number;
  /** آگهی معتبر واردشده از این منبع در این اجرا */
  valid: number;
  error: string | null;
}

export interface CollectState {
  status: CollectStatus;
  message: string | null;
  startedAt: number | null;
  sources: Record<ListingSource, SourceProgress>;
  /** آگهی جدید (توکن ناشناخته) در این اجرا */
  added: number;
}

const ALL_SOURCES: ListingSource[] = ['divar'];
/** محافظ حلقه: حداکثر تکه برای هر منبع در یک اجرا */
const MAX_CHUNKS_PER_SOURCE = 400;
const CHUNK_TIMEOUT_MS = 75_000;

export const EMPTY_PROGRESS: SourceProgress = {
  status: 'idle',
  pages: 0,
  seen: 0,
  details: 0,
  failed: 0,
  valid: 0,
  error: null
};

function idleCollect(): CollectState {
  return {
    status: 'idle',
    message: null,
    startedAt: null,
    sources: { divar: { ...EMPTY_PROGRESS } },
    added: 0
  };
}

/** پاسخ سرور برای هر تکه کلکشن */
interface CollectChunkResponse {
  ok: boolean;
  source?: ListingSource;
  done?: boolean;
  cursor?: CollectCursor;
  cityId?: string | null;
  seeds?: ParsedListingSeed[];
  fetchedDetails?: number;
  failedDetails?: number;
  pending?: number;
  error?: string;
}

interface PropertyMarketState {
  listings: PropertyMarketListing[];
  snapshots: PropertyMarketSnapshot[];
  legacyAssets: LegacyRealAssetRow[];
  loading: boolean;
  hydrated: boolean;
  remoteConnected: boolean;
  collect: CollectState;
  hydrate: () => Promise<void>;
  startCollection: () => Promise<void>;
  cancelCollection: () => void;
}

let hydratePromise: Promise<void> | null = null;
let cancelRequested = false;

/* ---------------- محلی (Dexie) ---------------- */

async function localDb(): Promise<PropertyMarketDb | null> {
  try {
    return (await getDb()) as unknown as PropertyMarketDb | null;
  } catch {
    return null;
  }
}

async function localPutListings(listings: PropertyMarketListing[]): Promise<void> {
  if (listings.length === 0) return;
  const db = await localDb();
  if (!db) return;
  try {
    await db.pmListings.bulkPut(listings);
  } catch {
    /* خاموش — داده در حافظه باقی است */
  }
}

async function localDeleteListings(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const db = await localDb();
  if (!db) return;
  try {
    await db.pmListings.bulkDelete(tokens);
  } catch {
    /* خاموش — در بارگذاری بعد دوباره حذف می‌شوند */
  }
}

async function localPutSnapshot(snap: PropertyMarketSnapshot): Promise<void> {
  const db = await localDb();
  if (!db) return;
  try {
    await db.pmSnapshots.put(snap);
  } catch {
    /* خاموش */
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

/** ادغام دو فهرست آگهی بر اساس توکن — نسخه با scrapedAt جدیدتر می‌ماند */
function mergeListings(a: PropertyMarketListing[], b: PropertyMarketListing[]): PropertyMarketListing[] {
  const map = new Map<string, PropertyMarketListing>();
  for (const l of [...a, ...b]) {
    if (!l || typeof l.token !== 'string') continue;
    const prev = map.get(l.token);
    if (!prev || (l.scrapedAt ?? 0) > (prev.scrapedAt ?? 0)) map.set(l.token, l);
  }
  return [...map.values()];
}

/** جمع گزارش‌های قیف چند ورود (برای Snapshot همان اجرا) */
function addReports(into: CleaningReport, r: CleaningReport): void {
  into.raw += r.raw;
  into.normalized += r.normalized;
  into.valid += r.valid;
  into.deduplicated += r.deduplicated;
  for (const [k, v] of Object.entries(r.rejectReasons)) into.rejectReasons[k] = (into.rejectReasons[k] ?? 0) + v;
}

function errorFa(raw: string): string {
  if (/source unreachable|divar unreachable|fetch failed|network|timeout|abort/i.test(raw)) {
    return 'سرور به این منبع دسترسی نداشت (مسدودسازی/اختلال شبکه)';
  }
  if (/HTTP 4\d\d/.test(raw)) return `منبع درخواست را رد کرد (${raw.match(/HTTP \d+/)?.[0] ?? ''})`;
  if (/HTTP 5\d\d/.test(raw)) return 'خطای موقت سرور منبع';
  return raw || 'خطای نامشخص';
}

/**
 * نرخ زنده تتر برای ثبت در Snapshot (مبنای مقایسه دلاری در آینده).
 * نرخ قدیمی/نامعتبر ذخیره نمی‌شود — بعداً از تاریخچه روزانه همان تاریخ پر می‌شود.
 */
async function liveUsdtForSnapshot(): Promise<{ rateToman: number; source: 'wallex' | 'bitpin' } | null> {
  try {
    const st = useUsdtStore.getState();
    if (!st.quote || usdtIsStale(st.quote)) await st.refresh();
    const q = useUsdtStore.getState().quote;
    const status = useUsdtStore.getState().status;
    if (!q || status !== 'live' || usdtIsStale(q)) return null;
    return { rateToman: q.priceToman, source: q.source };
  } catch {
    return null;
  }
}

/** درخواست ذخیره‌سازی ماندگار — تاریخچه چندساله نباید با پاک‌سازی خودکار مرورگر حذف شود */
function requestPersistentStorage(): void {
  try {
    const s = (globalThis.navigator as Navigator | undefined)?.storage;
    if (s && typeof s.persist === 'function') void s.persist().catch(() => undefined);
  } catch {
    /* خاموش */
  }
}

/* ---------------- استور ---------------- */

export const usePropertyMarketStore = create<PropertyMarketState>((set, get) => {
  /** ورود seedهای یک منبع → حافظه + IndexedDB (بلافاصله) */
  async function applySeeds(seeds: ParsedListingSeed[], cityId: string | null): Promise<{ added: number; valid: number; report: CleaningReport }> {
    const res = ingestSeeds({ existing: get().listings, seeds, city: 'ahvaz', cityId });
    set({ listings: res.listings });
    await localPutListings(res.changed);
    return { added: res.added, valid: res.report.valid, report: res.report };
  }

  /** ساخت Snapshot از وضعیت فعلی + پشتیبان اختیاری سرور */
  async function finalizeSnapshot(report: CleaningReport): Promise<PropertyMarketSnapshot | null> {
    const snap = buildSnapshot({ listings: get().listings, ingestReport: report, usdt: await liveUsdtForSnapshot() });
    if (!snap) return null;
    await localPutSnapshot(snap);
    requestPersistentStorage();
    set({
      snapshots: [...get().snapshots.filter((s) => s.id !== snap.id), snap].sort((a, b) => a.dateTs - b.dateTs)
    });
    // پشتیبان Neon — best-effort (هرگز خطا به کاربر نمی‌رسد)
    if (isRemoteAllowed()) {
      const listings = get().listings.filter((l) => l.source !== 'manual-legacy');
      void Promise.resolve()
        .then(() =>
          fetchJson('/api/propertyMarket', {
            method: 'POST',
            body: { action: 'persist', listings, snapshot: snap },
            timeoutMs: 30_000
          })
        )
        .catch(() => undefined);
    }
    return snap;
  }

  function patchSource(source: ListingSource, patch: Partial<SourceProgress>): void {
    const c = get().collect;
    set({ collect: { ...c, sources: { ...c.sources, [source]: { ...c.sources[source], ...patch } } } });
  }

  /** زنده بودن فانکشن سرور (بدون وابستگی به دیتابیس/health) */
  async function pingServer(): Promise<boolean> {
    if (!isRemoteAllowed()) return false;
    try {
      const r = await fetchJson<{ ok?: boolean; service?: string }>('/api/propertyMarket', {
        method: 'POST',
        body: { action: 'ping' },
        timeoutMs: 10_000
      });
      return r?.ok === true && r.service === 'darino-property-market';
    } catch {
      return false;
    }
  }

  /** اجرای کامل یک منبع از مسیر سرور */
  async function runSource(source: ListingSource, report: CleaningReport): Promise<void> {
    patchSource(source, { status: 'running', error: null });
    let cursor: CollectCursor | null = null;
    let retried = false;
    // آگهی‌هایی که متراژ و سال ساختشان ذخیره است → سرور جزئیاتشان را دوباره نمی‌گیرد
    const known = get()
      .listings.filter((l) => l.areaSqm !== null && l.yearBuilt !== null)
      .map((l) => l.token);
    for (let i = 0; i < MAX_CHUNKS_PER_SOURCE; i++) {
      if (cancelRequested) {
        patchSource(source, { status: 'cancelled' });
        return;
      }
      let res: CollectChunkResponse;
      try {
        res = await fetchJson<CollectChunkResponse>('/api/propertyMarket', {
          method: 'POST',
          body: { action: 'collectChunk', source, city: 'ahvaz', cursor, known },
          timeoutMs: CHUNK_TIMEOUT_MS
        });
      } catch (e) {
        res = { ok: false, error: e instanceof Error ? e.message : 'network' };
      }
      if (!res.ok) {
        // یک بار تلاش مجدد (قطعی لحظه‌ای/سردشدن فانکشن)؛ سپس توقف همین منبع
        if (!retried) {
          retried = true;
          await new Promise((r) => setTimeout(r, 2500));
          i -= 1;
          continue;
        }
        patchSource(source, { status: 'error', error: errorFa(res.error ?? '') });
        return;
      }
      retried = false;
      cursor = res.cursor ?? cursor;
      const seeds = Array.isArray(res.seeds) ? res.seeds : [];
      const applied = seeds.length > 0 ? await applySeeds(seeds, res.cityId ?? null) : null;
      if (applied) {
        addReports(report, applied.report);
        set({ collect: { ...get().collect, added: get().collect.added + applied.added } });
      }
      const p = get().collect.sources[source];
      patchSource(source, {
        pages: cursor?.pagesRead ?? p.pages,
        seen: cursor?.seenTokens.length ?? p.seen,
        details: p.details + (res.fetchedDetails ?? 0),
        failed: p.failed + (res.failedDetails ?? 0),
        valid: p.valid + (applied?.valid ?? 0)
      });
      if (res.done) {
        patchSource(source, { status: 'done' });
        return;
      }
    }
    patchSource(source, { status: 'done' });
  }

  return {
    listings: [],
    snapshots: [],
    legacyAssets: [],
    loading: false,
    hydrated: false,
    remoteConnected: false,
    collect: idleCollect(),

    hydrate: async () => {
      if (get().hydrated) return;
      if (hydratePromise) return hydratePromise;
      hydratePromise = (async () => {
        set({ loading: true });
        let listings: PropertyMarketListing[] = [];
        let snapshots: PropertyMarketSnapshot[] = [];
        let legacyAssets: LegacyRealAssetRow[] = [];
        let remoteConnected = false;

        const db = await localDb();
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


        // پشتیبان Neon (اختیاری) → ادغام (نه جایگزینی) با داده محلی
        if (isRemoteAllowed()) {
          try {
            if (await isRemoteReady()) {
              const res = await fetchJson<{ listings?: PropertyMarketListing[]; snapshots?: PropertyMarketSnapshot[] }>(
                '/api/propertyMarket',
                { timeoutMs: 8000 }
              );
              if (Array.isArray(res.listings) && res.listings.length > 0) {
                const merged = mergeListings(listings, res.listings);
                const fresh = merged.filter((l) => !listings.includes(l));
                listings = merged;
                await localPutListings(fresh);
              }
              if (Array.isArray(res.snapshots) && res.snapshots.length > 0) {
                const known = new Set(snapshots.map((s) => s.id));
                const extra = res.snapshots.filter((s) => s && typeof s.id === 'string' && !known.has(s.id));
                for (const s of extra) await localPutSnapshot(s);
                snapshots = [...snapshots, ...extra].sort((a, b) => a.dateTs - b.dateTs);
              }
              remoteConnected = true;
            }
          } catch {
            /* محلی ادامه می‌دهد */
          }
        }

        // کاتالوگ محله‌ها تغییر کرده باشد (مثلاً تفکیک شرقی/غربی) → بازکلیدگذاری خودکار
        const rk = rekeyListings(listings);
        if (rk.changed.length > 0) {
          listings = rk.listings;
          await localPutListings(rk.changed);
        }
        // قواعد فعلی روی داده قبلی: شیپور، زیر ۹۰ متر، محله متناقض با متن → حذف
        const purged = purgeStoredListings(listings);
        if (purged.removed.length > 0) {
          listings = purged.listings;
          await localDeleteListings(purged.removed);
        }

        set({
          listings,
          snapshots,
          legacyAssets,
          loading: false,
          hydrated: true,
          remoteConnected
        });
        hydratePromise = null;
      })();
      return hydratePromise;
    },

    cancelCollection: () => {
      if (get().collect.status === 'running' || get().collect.status === 'checking') cancelRequested = true;
    },

    startCollection: async () => {
      const st = get().collect.status;
      if (st === 'running' || st === 'checking') return;
      // وضعیت «checking» همزمان (قبل از هر await) — کلیک دوباره اجرای دوم نمی‌سازد
      cancelRequested = false;
      set({
        collect: { ...idleCollect(), status: 'checking', message: 'بررسی سرور کلکشن…', startedAt: Date.now() }
      });
      await get().hydrate();
      const sources = ALL_SOURCES;

      if (!(await pingServer())) {
        set({
          collect: {
            ...idleCollect(),
            status: 'unavailable',
            message: 'سرور جمع‌آوری در دسترس نیست — کمی بعد دوباره «به‌روزرسانی داده» را بزنید.'
          }
        });
        return;
      }

      const c0 = get().collect;
      const waiting = { ...c0.sources };
      for (const s of ALL_SOURCES) waiting[s] = { ...EMPTY_PROGRESS, status: sources.includes(s) ? 'waiting' : 'skipped' };
      set({
        collect: { ...c0, status: 'running', message: 'در حال جمع‌آوری…', sources: waiting }
      });

      const report = newCleaningReport();
      for (const s of sources) {
        if (cancelRequested) {
          patchSource(s, { status: 'cancelled' });
          continue;
        }
        await runSource(s, report);
      }

      const c = get().collect;
      const anyData = sources.some((s) => c.sources[s].valid > 0);
      const snap = anyData ? await finalizeSnapshot(report) : null;

      if (snap) {
        set({
          collect: {
            ...get().collect,
            status: 'done',
            message:
              `${toFaDigits(snap.cleaning.market.toLocaleString('en-US'))} آگهی در تحلیل` + (cancelRequested ? ' (متوقف‌شده توسط شما)' : '')
          }
        });
      } else {
        const err = c.sources.divar.error;
        set({
          collect: {
            ...get().collect,
            status: 'error',
            message: cancelRequested
              ? 'جمع‌آوری متوقف شد و هنوز آگهی معتبری ثبت نشده بود.'
              : err
                ? `دیوار در دسترس نبود: ${err}`
                : 'آگهی معتبری از دیوار دریافت نشد — کمی بعد دوباره امتحان کنید.'
          }
        });
      }
      cancelRequested = false;
    }
  };
});

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
