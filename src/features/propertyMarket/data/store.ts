/** ============================================================
 * Property Market — استور داده (IndexedDB = منبع حقیقت، تک‌کاربره)
 *
 * سه مسیر جمع‌آوری — همه به `ingestSeeds` → IndexedDB → Snapshot می‌رسند:
 *   ۱) خودکار (سرور): /api/propertyMarket فقط واکشی می‌کند (بدون دیتابیس)
 *   ۲) پل مرورگر: کلکشنر روی divar.ir / sheypoor.com → postMessage
 *   ۳) ورود فایل JSON (خروجی پل یا اسکریپت محلی)
 *
 *  - پیشرفت هر تکه بلافاصله ذخیره می‌شود (قطع شبکه = از دست رفتن داده نیست)
 *  - خطای یک منبع، منبع دیگر را متوقف نمی‌کند
 *  - Neon فقط پشتیبان اختیاری است (best-effort؛ هرگز مانع کار نیست)
 *  - سناریوی دلار آینده در جدول settings (هیچ جدول ارزی جدیدی نیست)
 * ============================================================ */
import { useEffect } from 'react';
import { create } from 'zustand';
import { getDb, settingGet, settingSet } from '@/shared/lib/db';
import { fetchJson, isRemoteAllowed, isRemoteReady } from '@/repositories/remoteClient';
import type {
  CleaningReport,
  ListingSource,
  PropertyMarketListing,
  PropertyMarketScenario,
  PropertyMarketSnapshot
} from '../domain/types';
import { LISTING_SOURCE_FA } from '../domain/types';
import { migrateLegacySnapshot, LEGACY_MIGRATION_FLAG } from './legacyMigration';
import type { CollectCursor } from '../collector/run';
import type { ParsedListingSeed } from '../collector/parse';
import { newCleaningReport } from '../collector/pipeline';
import { buildSnapshot, ingestSeeds, rekeyListings } from './ingest';
import { parseSeedPayload, type SeedPayload } from '../bridge/protocol';
import { useUsdtStore, usdtIsStale } from '@/shared/store/usdtStore';

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
  /** سرور کلکشن در دسترس نبود → پیشنهاد پل مرورگر */
  serverUnavailable: boolean;
}

export interface SourceProbe {
  ok: boolean;
  ms: number;
  listings: number;
  error?: string;
}

export interface DiagnosticsState {
  status: 'idle' | 'running' | 'done';
  /** null = هنوز بررسی نشده */
  server: boolean | null;
  results: Partial<Record<ListingSource, SourceProbe>>;
  checkedAt: number | null;
}

export interface ImportState {
  status: 'idle' | 'done' | 'error';
  message: string | null;
  at: number | null;
}

const SCENARIO_KEY = 'pmScenarioV1';
const SOURCES_KEY = 'pmSourcesV1';
const ALL_SOURCES: ListingSource[] = ['divar', 'sheypoor'];
/** محافظ حلقه: حداکثر تکه برای هر منبع در یک اجرا */
const MAX_CHUNKS_PER_SOURCE = 120;
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
    sources: { divar: { ...EMPTY_PROGRESS }, sheypoor: { ...EMPTY_PROGRESS } },
    added: 0,
    serverUnavailable: false
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
  scenario: PropertyMarketScenario;
  legacyAssets: LegacyRealAssetRow[];
  enabledSources: Record<ListingSource, boolean>;
  loading: boolean;
  hydrated: boolean;
  remoteConnected: boolean;
  collect: CollectState;
  diagnostics: DiagnosticsState;
  importState: ImportState;
  hydrate: () => Promise<void>;
  setScenario: (patch: Partial<Omit<PropertyMarketScenario, 'updatedAt'>>) => Promise<void>;
  resetScenario: () => Promise<void>;
  setSourceEnabled: (source: ListingSource, enabled: boolean) => Promise<void>;
  startCollection: () => Promise<void>;
  cancelCollection: () => void;
  runDiagnostics: () => Promise<void>;
  /** ورود payload (پل مرورگر/فایل) — خروجی: تعداد آگهی جدید یا خطا */
  importPayloads: (payloads: SeedPayload[], label: string) => Promise<{ ok: boolean; added: number; error?: string }>;
  /** ورود محتوای فایل JSON */
  importFileText: (text: string) => Promise<{ ok: boolean; added: number; error?: string }>;
}

const DEFAULT_SCENARIO: PropertyMarketScenario = {
  futureUsdRateToman: null,
  propertyTomanGrowthPct: null,
  updatedAt: 0
};

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
    for (let i = 0; i < MAX_CHUNKS_PER_SOURCE; i++) {
      if (cancelRequested) {
        patchSource(source, { status: 'cancelled' });
        return;
      }
      let res: CollectChunkResponse;
      try {
        res = await fetchJson<CollectChunkResponse>('/api/propertyMarket', {
          method: 'POST',
          body: { action: 'collectChunk', source, city: 'ahvaz', cursor },
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
    scenario: DEFAULT_SCENARIO,
    legacyAssets: [],
    enabledSources: { divar: true, sheypoor: true },
    loading: false,
    hydrated: false,
    remoteConnected: false,
    collect: idleCollect(),
    diagnostics: { status: 'idle', server: null, results: {}, checkedAt: null },
    importState: { status: 'idle', message: null, at: null },

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

        const scenario = await settingGet<PropertyMarketScenario>(SCENARIO_KEY, DEFAULT_SCENARIO);
        const enabled = await settingGet<Record<ListingSource, boolean>>(SOURCES_KEY, { divar: true, sheypoor: true });

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

        set({
          listings,
          snapshots,
          scenario,
          legacyAssets,
          enabledSources: { divar: enabled?.divar !== false, sheypoor: enabled?.sheypoor !== false },
          loading: false,
          hydrated: true,
          remoteConnected
        });
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

    setSourceEnabled: async (source, enabled) => {
      const next = { ...get().enabledSources, [source]: enabled };
      set({ enabledSources: next });
      await settingSet(SOURCES_KEY, next);
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
      const sources = ALL_SOURCES.filter((s) => get().enabledSources[s]);
      if (sources.length === 0) {
        set({ collect: { ...idleCollect(), status: 'error', message: 'هیچ منبعی فعال نیست — حداقل یک منبع را روشن کنید.' } });
        return;
      }

      if (!(await pingServer())) {
        set({
          collect: {
            ...idleCollect(),
            status: 'unavailable',
            serverUnavailable: true,
            message:
              'سرور کلکشن در دسترس نیست. از «پل مرورگر» استفاده کنید — جمع‌آوری مستقیم روی دیوار/شیپور در مرورگر خودتان و بدون نیاز به سرور.'
          },
          diagnostics: { ...get().diagnostics, server: false }
        });
        return;
      }

      const c0 = get().collect;
      const waiting = { ...c0.sources };
      for (const s of ALL_SOURCES) waiting[s] = { ...EMPTY_PROGRESS, status: sources.includes(s) ? 'waiting' : 'skipped' };
      set({
        collect: { ...c0, status: 'running', message: 'در حال جمع‌آوری…', sources: waiting },
        diagnostics: { ...get().diagnostics, server: true }
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
      const allFailed = sources.every((s) => c.sources[s].status === 'error');
      const snap = anyData ? await finalizeSnapshot(report) : null;

      if (snap) {
        const failed = sources.filter((s) => c.sources[s].status === 'error').map((s) => LISTING_SOURCE_FA[s]);
        set({
          collect: {
            ...get().collect,
            status: 'done',
            message:
              `Snapshot بازار ثبت شد — ${snap.cleaning.market.toLocaleString('fa-IR')} آگهی در تحلیل` +
              (cancelRequested ? ' (متوقف‌شده توسط شما)' : '') +
              (failed.length > 0 ? ` · ${failed.join('، ')} در دسترس نبود` : '')
          }
        });
      } else {
        set({
          collect: {
            ...get().collect,
            status: 'error',
            serverUnavailable: allFailed,
            message: allFailed
              ? 'سرور به هیچ‌کدام از منابع دسترسی نداشت (احتمالاً IP سرور مسدود است). از «پل مرورگر» استفاده کنید.'
              : cancelRequested
                ? 'جمع‌آوری متوقف شد و هنوز آگهی معتبری ثبت نشده بود.'
                : 'آگهی معتبری دریافت نشد — «تست اتصال» را بزنید یا از پل مرورگر استفاده کنید.'
          }
        });
      }
      cancelRequested = false;
    },

    runDiagnostics: async () => {
      if (get().diagnostics.status === 'running') return;
      set({ diagnostics: { status: 'running', server: null, results: {}, checkedAt: null } });
      const server = await pingServer();
      if (!server) {
        set({ diagnostics: { status: 'done', server: false, results: {}, checkedAt: Date.now() } });
        return;
      }
      try {
        const r = await fetchJson<{ ok?: boolean; results?: Partial<Record<ListingSource, SourceProbe>> }>(
          '/api/propertyMarket',
          { method: 'POST', body: { action: 'diagnose' }, timeoutMs: 70_000 }
        );
        set({ diagnostics: { status: 'done', server: true, results: r.results ?? {}, checkedAt: Date.now() } });
      } catch {
        set({ diagnostics: { status: 'done', server: true, results: {}, checkedAt: Date.now() } });
      }
    },

    importPayloads: async (payloads, label) => {
      await get().hydrate();
      const report = newCleaningReport();
      let added = 0;
      let valid = 0;
      for (const p of payloads) {
        const r = await applySeeds(p.seeds, p.cityId);
        added += r.added;
        valid += r.valid;
        addReports(report, r.report);
      }
      if (valid === 0) {
        const msg = 'هیچ آگهی معتبری (با قیمت و متراژ) در داده دریافتی نبود.';
        set({ importState: { status: 'error', message: msg, at: Date.now() } });
        return { ok: false, added: 0, error: msg };
      }
      const snap = await finalizeSnapshot(report);
      const sources = [...new Set(payloads.map((p) => LISTING_SOURCE_FA[p.source]))].join(' و ');
      set({
        importState: {
          status: 'done',
          message: `${label} (${sources}): ${valid.toLocaleString('fa-IR')} آگهی معتبر، ${added.toLocaleString('fa-IR')} جدید${snap ? ' — Snapshot بازار به‌روز شد' : ''}`,
          at: Date.now()
        }
      });
      return { ok: true, added };
    },

    importFileText: async (text) => {
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        const msg = 'فایل JSON معتبر نیست.';
        set({ importState: { status: 'error', message: msg, at: Date.now() } });
        return { ok: false, added: 0, error: msg };
      }
      const items = Array.isArray(raw) ? raw : [raw];
      const payloads: SeedPayload[] = [];
      let lastError = '';
      for (const it of items) {
        const r = parseSeedPayload(it);
        if (r.ok) payloads.push(r.payload);
        else lastError = r.error;
      }
      if (payloads.length === 0) {
        set({ importState: { status: 'error', message: lastError || 'داده‌ای در فایل نیست.', at: Date.now() } });
        return { ok: false, added: 0, error: lastError };
      }
      return get().importPayloads(payloads, 'ورود فایل');
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
