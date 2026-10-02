/** ============================================================
 * Arcus — وضعیت حساب (حافظهٔ موقت جلسه، به تفکیک محیط/آدرس/زیرحساب)
 *
 *  • پیش‌فرض: دادهٔ دریافتی فقط در حافظهٔ همین جلسه نگه داشته می‌شود؛
 *    نه در سرور، نه در IndexedDB، نه در cache سرویس‌ورکر.
 *  • با شکست sync، آخرین دادهٔ معتبر با برچسب «قدیمی» باقی می‌ماند — هرگز صفر نمی‌شود.
 *  • تازه‌سازی دوره‌ای فقط وقتی صفحه دیده می‌شود؛ در پس‌زمینه متوقف.
 *  • mainnet و testnet کلید cache جدا دارند.
 * ============================================================ */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { arcusGet, ArcusError } from '../api/client';
import { fetchHistory, HISTORY_SPECS, type HistoryKind, type HistoryResult, type HistoryRowMap } from '../api/paginate';
import { ArcusLive, type LiveChannel, type LiveStatus } from '../api/live';
import type { ArcusAccount, ArcusLeverage, ArcusMarket, ArcusOrder, ArcusPortfolio, ArcusPosition } from '../api/types';
import type { ArcusEnv } from '@/features/custody/domain/types';

export interface Res<T> {
  data: T | null;
  fetchedAt: number | null;
  error: ArcusError | null;
  loading: boolean;
}

const emptyRes = <T,>(): Res<T> => ({ data: null, fetchedAt: null, error: null, loading: false });

export interface HistoryRes<K extends HistoryKind> extends Res<HistoryResult<HistoryRowMap[K]>> {
  rangeKey: string | null;
  /** بازهٔ همین دادهٔ بارگذاری‌شده (برای تازه‌سازی زنده با همان بازه) */
  range: { fromUs: string | null; key: string } | null;
  progress: { pages: number; rows: number } | null;
}

export interface ArcusAccountState {
  key: string;
  /** null = بدون فعالیت (404 مستند) */
  account: Res<ArcusAccount | null>;
  positions: Res<ArcusPosition[]>;
  openOrders: Res<ArcusOrder[]>;
  leverages: Res<ArcusLeverage[]>;
  portfolio: Res<ArcusPortfolio>;
  history: { [K in HistoryKind]: HistoryRes<K> };
  live: LiveStatus;
}

export interface AccountRef {
  env: ArcusEnv;
  address: string;
  accountIndex: number;
}

export const accountKey = (r: AccountRef) => `${r.env}:${r.address.toLowerCase()}:${r.accountIndex}`;

const store = new Map<string, ArcusAccountState>();
const marketsByEnv: Record<ArcusEnv, Res<ArcusMarket[]>> = { mainnet: emptyRes(), testnet: emptyRes() };
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

function emptyHistory<K extends HistoryKind>(): HistoryRes<K> {
  return { ...emptyRes(), rangeKey: null, range: null, progress: null };
}

function getState(key: string): ArcusAccountState {
  let s = store.get(key);
  if (!s) {
    s = {
      key,
      account: emptyRes(),
      positions: emptyRes(),
      openOrders: emptyRes(),
      leverages: emptyRes(),
      portfolio: emptyRes(),
      history: { fills: emptyHistory(), orders: emptyHistory(), funding: emptyHistory(), transfers: emptyHistory() },
      live: 'idle'
    };
    store.set(key, s);
  }
  return s;
}

function patch(key: string, fn: (s: ArcusAccountState) => ArcusAccountState): void {
  store.set(key, fn(getState(key)));
  emit();
}

type SimpleRes = 'account' | 'positions' | 'openOrders' | 'leverages' | 'portfolio';

async function load<T>(key: string, field: SimpleRes, run: () => Promise<T>): Promise<void> {
  const cur = getState(key)[field] as Res<T>;
  if (cur.loading) return;
  patch(key, (s) => ({ ...s, [field]: { ...(s[field] as Res<T>), loading: true } }));
  try {
    const data = await run();
    patch(key, (s) => ({ ...s, [field]: { data, fetchedAt: Date.now(), error: null, loading: false } }));
  } catch (e) {
    const err = e instanceof ArcusError ? e : new ArcusError('server', 'خطای ناشناخته');
    // آخرین دادهٔ معتبر حفظ می‌شود
    patch(key, (s) => ({ ...s, [field]: { ...(s[field] as Res<T>), error: err, loading: false } }));
  }
}

export function refreshSummary(r: AccountRef): Promise<unknown> {
  const key = accountKey(r);
  const p = { address: r.address, accountIndex: r.accountIndex };
  return Promise.all([
    load(key, 'account', async () => {
      try {
        return await arcusGet<ArcusAccount>(r.env, '/v1/account', p);
      } catch (e) {
        if (e instanceof ArcusError && e.kind === 'no_activity') return null;
        throw e;
      }
    }),
    load(key, 'positions', async () => {
      const body = await arcusGet<{ positions?: Record<string, ArcusPosition> }>(r.env, '/v1/positions', p);
      return Object.values(body.positions ?? {});
    }),
    load(key, 'openOrders', async () => {
      const body = await arcusGet<{ orders?: ArcusOrder[] }>(r.env, '/v1/openOrders', p);
      return body.orders ?? [];
    })
  ]);
}

export function refreshExtras(r: AccountRef): Promise<unknown> {
  const key = accountKey(r);
  const p = { address: r.address, accountIndex: r.accountIndex };
  return Promise.all([
    load(key, 'leverages', async () => (await arcusGet<{ leverages?: ArcusLeverage[] }>(r.env, '/v1/leverages', p)).leverages ?? []),
    load(key, 'portfolio', () => arcusGet<ArcusPortfolio>(r.env, '/v1/portfolio', p)),
    loadMarkets(r.env)
  ]);
}

export async function loadMarkets(env: ArcusEnv): Promise<void> {
  const cur = marketsByEnv[env];
  if (cur.loading || (cur.data && cur.fetchedAt && Date.now() - cur.fetchedAt < 10 * 60_000)) return;
  marketsByEnv[env] = { ...cur, loading: true };
  emit();
  try {
    const body = await arcusGet<{ markets?: ArcusMarket[] }>(env, '/v1/markets', {});
    marketsByEnv[env] = { data: body.markets ?? [], fetchedAt: Date.now(), error: null, loading: false };
  } catch (e) {
    marketsByEnv[env] = { ...cur, error: e instanceof ArcusError ? e : null, loading: false };
  }
  emit();
}

export async function loadHistory<K extends HistoryKind>(r: AccountRef, kind: K, range: { fromUs: string | null; key: string }, firstPageOnly = false): Promise<void> {
  const key = accountKey(r);
  const cur = getState(key).history[kind];
  if (cur.loading) return;
  const setH = (fn: (h: HistoryRes<K>) => HistoryRes<K>) =>
    patch(key, (s) => ({ ...s, history: { ...s.history, [kind]: fn(s.history[kind] as HistoryRes<K>) } }));
  setH((h) => ({ ...h, loading: true, progress: { pages: 0, rows: 0 } }));
  try {
    const res = await fetchHistory(kind, {
      env: r.env,
      address: r.address,
      accountIndex: r.accountIndex,
      fromUs: range.fromUs,
      maxPages: firstPageOnly ? 1 : undefined,
      onProgress: (p) => setH((h) => ({ ...h, progress: p }))
    });
    if (firstPageOnly && cur.data && cur.rangeKey === range.key) {
      // ادغام صفحهٔ اول تازه با داده‌های قبلی همان بازه (حذف تکراری با شناسه)
      const idOf = HISTORY_SPECS[kind].id as (row: HistoryRowMap[K]) => string;
      const ids = new Set<string>();
      const merged = [...res.rows, ...cur.data.rows].filter((row) => {
        const id = idOf(row);
        if (ids.has(id)) return false;
        ids.add(id);
        return true;
      });
      setH(() => ({ data: { ...cur.data!, rows: merged as HistoryRowMap[K][] }, fetchedAt: Date.now(), error: null, loading: false, rangeKey: range.key, range, progress: null }));
    } else {
      setH(() => ({ data: res, fetchedAt: Date.now(), error: null, loading: false, rangeKey: range.key, range, progress: null }));
    }
  } catch (e) {
    const err = e instanceof ArcusError ? e : new ArcusError('server', 'خطای ناشناخته');
    setH((h) => ({ ...h, error: err, loading: false, progress: null }));
  }
}

/** خواندن وضعیت بدون ایجاد رکورد جدید (برای نمایش در صفحات دیگر) */
export function getArcusState(key: string): ArcusAccountState | undefined {
  return store.get(key);
}

/** پاک‌کردن همهٔ دادهٔ حساب‌های Arcus از حافظهٔ این جلسه */
export function clearArcusMemory(): void {
  store.clear();
  marketsByEnv.mainnet = emptyRes();
  marketsByEnv.testnet = emptyRes();
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useArcusStoreVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}

export function useMarkets(env: ArcusEnv | null): Res<ArcusMarket[]> {
  useArcusStoreVersion();
  return env ? marketsByEnv[env] : emptyRes();
}

const SUMMARY_POLL_MS = 30_000;
const LIVE_RECONCILE_MS = 120_000;
const SIGNAL_THROTTLE_MS: Record<LiveChannel, number> = {
  account: 10_000,
  positions: 5_000,
  orders: 8_000,
  userFills: 15_000,
  funding: 30_000,
  accountTransferUpdates: 15_000
};

/**
 * هوک حساب: REST هنگام باز شدن، تازه‌سازی دستی، polling فقط در حالت visible،
 * و در صورت فعال بودن، WS به‌عنوان نشانهٔ تغییر.
 */
export function useArcusAccount(ref: AccountRef | null, opts: { live: boolean; historyRange: { fromUs: string | null; key: string } }) {
  useArcusStoreVersion();
  const key = ref ? accountKey(ref) : null;
  const state = key ? getState(key) : null;
  const lastSignal = useRef<Partial<Record<LiveChannel, number>>>({});
  const refRef = useRef(ref);
  refRef.current = ref;

  const refresh = useCallback(() => {
    const r = refRef.current;
    if (!r) return;
    void refreshSummary(r);
    void refreshExtras(r);
  }, []);

  // بارگذاری اولیه + polling فقط وقتی صفحه دیده می‌شود
  useEffect(() => {
    if (!key) return;
    refresh();
    let timer: ReturnType<typeof setInterval> | null = null;
    const interval = opts.live ? LIVE_RECONCILE_MS : SUMMARY_POLL_MS;
    const startTimer = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === 'visible' && refRef.current) void refreshSummary(refRef.current);
      }, interval);
    };
    const stopTimer = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        if (refRef.current) void refreshSummary(refRef.current);
        startTimer();
      } else stopTimer();
    };
    if (document.visibilityState === 'visible') startTimer();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stopTimer();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [key, opts.live, refresh]);

  // دریافت زنده
  useEffect(() => {
    if (!key || !opts.live || !refRef.current) return;
    const r = refRef.current;
    const live = new ArcusLive({
      env: r.env,
      address: r.address,
      accountIndex: r.accountIndex,
      onStatus: (st) => patch(key, (s) => ({ ...s, live: st })),
      onConnected: () => void refreshSummary(r),
      onSignal: (ch) => {
        const now = Date.now();
        if (now - (lastSignal.current[ch] ?? 0) < SIGNAL_THROTTLE_MS[ch]) return;
        lastSignal.current[ch] = now;
        if (ch === 'account' || ch === 'positions' || ch === 'orders') void refreshSummary(r);
        const hk: HistoryKind | null =
          ch === 'userFills' ? 'fills' : ch === 'funding' ? 'funding' : ch === 'accountTransferUpdates' ? 'transfers' : ch === 'orders' ? 'orders' : null;
        // فقط تاریخچه‌ای که قبلاً بارگذاری شده، با همان بازهٔ خودش (صفحهٔ اول تازه + ادغام با شناسه)
        const loaded = hk ? getState(key).history[hk] : null;
        if (hk && loaded?.data && loaded.range) void loadHistory(r, hk, loaded.range, true);
      }
    });
    live.start();
    return () => {
      live.stop();
      patch(key, (s) => ({ ...s, live: 'idle' }));
    };
  }, [key, opts.live]);

  return { state, refresh };
}

/** آیا داده قدیمی است؟ (آخرین تلاش ناموفق بوده یا بیش از ۳ برابر بازهٔ polling گذشته) */
export function isStale(res: Res<unknown>, now = Date.now(), maxAgeMs = 3 * SUMMARY_POLL_MS): boolean {
  if (!res.fetchedAt) return false;
  return !!res.error || now - res.fetchedAt > maxAgeMs;
}
