/** ============================================================
 * خودروهای اروند — استور و هماهنگ‌کننده جمع‌آوری (IndexedDB + Neon)
 *
 *  یک اجرا:
 *   ۱) جستجو: ۳ شهر × عبارت‌های اروند، همه صفحه‌ها (از مسیر سرور)
 *      آگهی شناخته‌شده → قیمت/زمان دیده‌شدن از ردیف؛ جدید → صف جزئیات
 *   ۲) جزئیات: خواندن متن کامل → طبقه‌بندی پلاک؛ غیراروند در فهرست «بررسی‌شده»
 *      ذخیره می‌شود تا هر بار دوباره باز نشود
 *   ۳) مبنای ملی: برای مدل‌های دارای ≥۲ آگهی اروند، آگهی‌های هم‌مدل تهران
 *   ۴) حذف آگهی‌های دیده‌نشده/قدیمی (>۳۰ روز) · Snapshot روزانه · پشتیبان Neon
 *  خودکار: با باز شدن صفحه اگر آخرین اجرا بیش از ۶ ساعت پیش بوده
 * ============================================================ */
import { useEffect } from 'react';
import { create } from 'zustand';
import { getDb, settingGet, settingSet } from '@/shared/lib/db';
import { fetchJson, isRemoteAllowed, isRemoteReady } from '@/repositories/remoteClient';
import { tehranDayKey } from '@/shared/fx/usdtHistory';
import { useUsdtStore, usdtIsStale } from '@/shared/store/usdtStore';
import { ARVAND_QUERIES, KHUZ_CITIES, type ParsedDetail } from '../collector/divarCar';
import { KHUZ_KINDS, NATIONAL_KINDS, buildAd, mergeAds, pruneAds, touchFromRow } from '../domain/ads';
import { baselineTargets, buildGroups, groupStats } from '../domain/compare';
import type { ArvandCity, ArvandSnapshot, CarAd, ListRow, Region } from '../domain/types';

interface ArvandDb {
  arvandAds: { toArray(): Promise<CarAd[]>; bulkPut(v: CarAd[]): Promise<unknown>; bulkDelete(k: string[]): Promise<unknown> };
  arvandSnapshots: { toArray(): Promise<ArvandSnapshot[]>; put(v: ArvandSnapshot): Promise<unknown> };
}

export const AUTO_RUN_MS = 6 * 3600_000;
const LAST_RUN_KEY = 'arvandLastRunV1';
const CHECKED_KEY = 'arvandCheckedV1';
const CHECKED_TTL_MS = 30 * 86_400_000;
const DETAIL_REFRESH_MS = 7 * 86_400_000;
const MAX_PAGES_KHUZ = 15;
const MAX_PAGES_TEHRAN = 2;
const MAX_NEW_PER_MODEL = 25;
const DETAIL_CHUNK = 40;

export type RunPhase = 'search' | 'details' | 'baseline' | 'saving';
export interface RunState {
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
  phase: RunPhase | null;
  done: number;
  total: number;
  message: string | null;
  startedAt: number | null;
  auto: boolean;
}

interface ArvandState {
  ads: CarAd[];
  snapshots: ArvandSnapshot[];
  loading: boolean;
  hydrated: boolean;
  lastRunAt: number | null;
  run: RunState;
  hydrate: () => Promise<void>;
  collect: (opts?: { auto?: boolean }) => Promise<void>;
  cancel: () => void;
}

const IDLE: RunState = { status: 'idle', phase: null, done: 0, total: 0, message: null, startedAt: null, auto: false };

async function localDb(): Promise<ArvandDb | null> {
  try {
    return (await getDb()) as unknown as ArvandDb | null;
  } catch {
    return null;
  }
}

interface SearchRes {
  ok: boolean;
  rows?: ListRow[];
  next?: unknown;
  error?: string;
}
interface DetailsRes {
  ok: boolean;
  details?: Record<string, ParsedDetail>;
  failed?: string[];
  remaining?: string[];
  error?: string;
}

const api = <T,>(body: Record<string, unknown>, timeoutMs: number) =>
  fetchJson<T>('/api/propertyMarket', { method: 'POST', body, timeoutMs });

async function liveUsdt(): Promise<number | null> {
  try {
    const st = useUsdtStore.getState();
    if (!st.quote || usdtIsStale(st.quote)) await st.refresh();
    const { quote, status } = useUsdtStore.getState();
    return quote && status === 'live' && !usdtIsStale(quote) ? quote.priceToman : null;
  } catch {
    return null;
  }
}

let hydratePromise: Promise<void> | null = null;
let cancelRequested = false;

export const useArvandStore = create<ArvandState>((set, get) => {
  const progress = (patch: Partial<RunState>) => set({ run: { ...get().run, ...patch } });
  const cancelled = () => cancelRequested;

  /** همه صفحه‌های یک جستجو؛ null = خطا */
  async function searchAll(city: ArvandCity, query: string, maxPages: number): Promise<ListRow[] | null> {
    const rows: ListRow[] = [];
    let pagination: unknown = undefined;
    for (let p = 0; p < maxPages; p++) {
      if (cancelled()) return null;
      let r: SearchRes | null = null;
      for (let attempt = 0; attempt < 2 && !r?.ok; attempt++) {
        try {
          r = await api<SearchRes>({ action: 'arvandSearch', city, query, pagination }, 30_000);
        } catch {
          r = null;
        }
        if (!r?.ok) await new Promise((res) => setTimeout(res, 2500));
      }
      if (!r?.ok) return p === 0 ? null : rows;
      rows.push(...(r.rows ?? []));
      if (!r.next) break;
      pagination = r.next;
    }
    return rows;
  }

  /** جزئیات در تکه‌ها؛ onDetail برای هر آگهی */
  async function fetchDetails(tokens: string[], onDetail: (token: string, d: ParsedDetail | null) => void): Promise<void> {
    let queue = [...tokens];
    let stalls = 0;
    while (queue.length > 0 && !cancelled()) {
      const chunk = queue.slice(0, DETAIL_CHUNK);
      let r: DetailsRes | null = null;
      try {
        r = await api<DetailsRes>({ action: 'arvandDetails', tokens: chunk }, 70_000);
      } catch {
        r = null;
      }
      if (!r?.ok) {
        if (++stalls >= 3) return;
        await new Promise((res) => setTimeout(res, 3000));
        continue;
      }
      stalls = 0;
      for (const [t, d] of Object.entries(r.details ?? {})) onDetail(t, d);
      for (const t of r.failed ?? []) onDetail(t, null);
      const remaining = new Set(r.remaining ?? []);
      queue = [...chunk.filter((t) => remaining.has(t)), ...queue.slice(chunk.length)];
    }
  }

  return {
    ads: [],
    snapshots: [],
    loading: false,
    hydrated: false,
    lastRunAt: null,
    run: IDLE,

    hydrate: async () => {
      if (get().hydrated) return;
      if (hydratePromise) return hydratePromise;
      hydratePromise = (async () => {
        set({ loading: true });
        let ads: CarAd[] = [];
        let snapshots: ArvandSnapshot[] = [];
        const db = await localDb();
        if (db) {
          try {
            ads = await db.arvandAds.toArray();
            snapshots = await db.arvandSnapshots.toArray();
          } catch {
            /* حافظه */
          }
        }
        let lastRunAt = await settingGet<number | null>(LAST_RUN_KEY, null).catch(() => null);
        if (isRemoteAllowed()) {
          try {
            if (await isRemoteReady()) {
              const r = await fetchJson<{ ads?: CarAd[]; snapshots?: ArvandSnapshot[] }>('/api/propertyMarket?market=arvand', { timeoutMs: 12_000 });
              if (Array.isArray(r.ads) && r.ads.length > 0) {
                const merged = mergeAds(ads, r.ads);
                const changed = merged.filter((a) => !ads.includes(a));
                ads = merged;
                if (db && changed.length) await db.arvandAds.bulkPut(changed).catch(() => undefined);
                const remoteRun = Math.max(...r.ads.map((a) => a.lastSeenAt ?? 0));
                lastRunAt = Math.max(lastRunAt ?? 0, remoteRun) || null;
              }
              if (Array.isArray(r.snapshots)) {
                const byId = new Map(snapshots.map((s) => [s.id, s]));
                for (const s of r.snapshots) {
                  const prev = byId.get(s.id);
                  if (!prev || prev.dateTs < s.dateTs) {
                    byId.set(s.id, s);
                    if (db) await db.arvandSnapshots.put(s).catch(() => undefined);
                  }
                }
                snapshots = [...byId.values()];
              }
            }
          } catch {
            /* محلی ادامه می‌دهد */
          }
        }
        snapshots.sort((a, b) => a.dateTs - b.dateTs);
        set({ ads, snapshots, lastRunAt, loading: false, hydrated: true });
        hydratePromise = null;
      })();
      return hydratePromise;
    },

    cancel: () => {
      if (get().run.status === 'running') cancelRequested = true;
    },

    collect: async (opts) => {
      if (get().run.status === 'running') return;
      cancelRequested = false;
      const startedAt = Date.now();
      set({ run: { ...IDLE, status: 'running', phase: 'search', startedAt, auto: !!opts?.auto } });
      await get().hydrate();

      const byToken = new Map(get().ads.map((a) => [a.token, a]));
      const checked = await settingGet<Record<string, number>>(CHECKED_KEY, {}).catch(() => ({}) as Record<string, number>);
      for (const [t, ts] of Object.entries(checked)) if (startedAt - ts > CHECKED_TTL_MS) delete checked[t];
      const completed: Region[] = [];
      /** نمایش تدریجی آگهی‌های تأییدشده در حین جمع‌آوری */
      let lastPublish = 0;
      const publish = (force = false) => {
        if (!force && Date.now() - lastPublish < 4000) return;
        lastPublish = Date.now();
        set({ ads: [...byToken.values()] });
      };

      /* ---------- ۱) جستجوی اروند در خوزستان ---------- */
      const jobs = KHUZ_CITIES.flatMap((c) => ARVAND_QUERIES.map((q) => [c, q] as const));
      const queued = new Map<string, { row: ListRow; city: ArvandCity }>();
      let khuzOk = true;
      for (let i = 0; i < jobs.length && !cancelled(); i++) {
        const [city, q] = jobs[i];
        progress({ phase: 'search', done: i, total: jobs.length });
        const rows = await searchAll(city, q, MAX_PAGES_KHUZ);
        if (!rows) {
          khuzOk = false;
          continue;
        }
        for (const row of rows) {
          const known = byToken.get(row.token);
          if (known) {
            const fresh = touchFromRow(known, row, Date.now());
            byToken.set(row.token, fresh);
            if (startedAt - known.detailAt > DETAIL_REFRESH_MS) queued.set(row.token, { row, city });
          } else if (!(row.token in checked)) {
            queued.set(row.token, { row, city });
          }
        }
      }
      if (khuzOk && !cancelled()) completed.push('khuz');

      /* ---------- ۲) جزئیات آگهی‌های جدید ---------- */
      const tokens = [...queued.keys()];
      let done = 0;
      progress({ phase: 'details', done: 0, total: tokens.length });
      await fetchDetails(tokens, (t, d) => {
        done += 1;
        const q = queued.get(t)!;
        if (!d) {
          byToken.delete(t);
        } else {
          const ad = buildAd({ row: q.row, detail: d, city: q.city, now: Date.now(), prev: byToken.get(t) });
          if (KHUZ_KINDS.includes(ad.plate)) byToken.set(t, ad);
          else {
            byToken.delete(t);
            checked[t] = Date.now();
          }
        }
        if (done % 5 === 0) progress({ done });
        publish();
      });
      publish(true);

      /* ---------- ۳) مبنای پلاک ملی (تهران) ---------- */
      const targets = cancelled() ? [] : baselineTargets([...byToken.values()]);
      let tehranOk = targets.length > 0;
      for (let i = 0; i < targets.length && !cancelled(); i++) {
        const model = targets[i];
        progress({ phase: 'baseline', done: i, total: targets.length });
        const rows = await searchAll('tehran', model, MAX_PAGES_TEHRAN);
        if (!rows) {
          tehranOk = false;
          continue;
        }
        const fresh: { row: ListRow; city: ArvandCity }[] = [];
        for (const row of rows) {
          const known = byToken.get(row.token);
          if (known) byToken.set(row.token, touchFromRow(known, row, Date.now()));
          else if (!(row.token in checked) && fresh.length < MAX_NEW_PER_MODEL) fresh.push({ row, city: 'tehran' });
        }
        const map = new Map(fresh.map((f) => [f.row.token, f]));
        await fetchDetails([...map.keys()], (t, d) => {
          const f = map.get(t)!;
          if (!d) return;
          const ad = buildAd({ row: f.row, detail: d, city: 'tehran', now: Date.now(), baselineFor: model });
          if (NATIONAL_KINDS.includes(ad.plate) && ad.model === model) byToken.set(t, ad);
          else checked[t] = Date.now();
        });
      }
      if (tehranOk && !cancelled()) completed.push('tehran');

      /* ---------- ۴) حذف قدیمی‌ها، Snapshot، ذخیره ---------- */
      progress({ phase: 'saving', done: 0, total: 0 });
      const now = Date.now();
      const { kept, removed } = pruneAds([...byToken.values()], { now, runStartedAt: startedAt, completed });
      const groups = buildGroups(kept);
      const snapshot: ArvandSnapshot | null = completed.includes('khuz')
        ? {
            id: `arv-${tehranDayKey(now)}`,
            day: tehranDayKey(now),
            dateTs: now,
            usdtRate: await liveUsdt(),
            activeAds: kept.filter((a) => a.region === 'khuz').length,
            groups: groupStats(groups)
          }
        : null;

      const removedLocal = get().ads.filter((a) => !kept.some((k) => k.token === a.token)).map((a) => a.token);
      const allRemoved = [...new Set([...removed, ...removedLocal])];
      const db = await localDb();
      if (db) {
        await db.arvandAds.bulkPut(kept).catch(() => undefined);
        if (allRemoved.length) await db.arvandAds.bulkDelete(allRemoved).catch(() => undefined);
        if (snapshot) await db.arvandSnapshots.put(snapshot).catch(() => undefined);
      }
      await settingSet(CHECKED_KEY, checked).catch(() => undefined);
      const wasCancelled = cancelled();
      if (!wasCancelled && completed.includes('khuz')) await settingSet(LAST_RUN_KEY, now).catch(() => undefined);

      const snapshots = snapshot ? [...get().snapshots.filter((s) => s.id !== snapshot.id), snapshot].sort((a, b) => a.dateTs - b.dateTs) : get().snapshots;
      set({
        ads: kept,
        snapshots,
        lastRunAt: !wasCancelled && completed.includes('khuz') ? now : get().lastRunAt,
        run: {
          ...get().run,
          status: wasCancelled ? 'cancelled' : completed.includes('khuz') ? 'done' : 'error',
          phase: null,
          message: wasCancelled
            ? 'جمع‌آوری متوقف شد؛ آگهی‌های دریافت‌شده ذخیره شدند.'
            : completed.includes('khuz')
              ? null
              : 'دسترسی به دیوار کامل نبود — آگهی‌های قبلی حفظ شدند و بعداً دوباره تلاش می‌شود.'
        }
      });

      if (isRemoteAllowed() && !wasCancelled) {
        void api({ action: 'arvandPersist', ads: kept, removed: allRemoved, snapshot }, 45_000).catch(() => undefined);
      }
      cancelRequested = false;
    }
  };
});

export function needsAutoRun(lastRunAt: number | null, now = Date.now()): boolean {
  return lastRunAt === null || now - lastRunAt > AUTO_RUN_MS;
}

/** هوک مصرفی — بارگذاری + جمع‌آوری خودکار */
export function useArvand(active: boolean) {
  const st = useArvandStore();
  useEffect(() => {
    if (!active) return;
    let stop = false;
    void (async () => {
      await useArvandStore.getState().hydrate();
      const s = useArvandStore.getState();
      if (!stop && s.run.status !== 'running' && needsAutoRun(s.lastRunAt)) void s.collect({ auto: true });
    })();
    return () => {
      stop = true;
    };
  }, [active]);
  return st;
}
