/** ============================================================
 * نرخ زنده تتر (USDT/تومان) — تنها مبنای ارزش‌گذاری دلار در کل اپ
 * (نرخ دستی وجود ندارد)
 *
 * ترتیب تلاش: منبع ترجیحی کاربر (پیش‌فرض والکس) → منبع دیگر.
 *   والکس:   از مسیر سرور /api/usdt (CORS والکس فقط wallex.ir است)
 *   بیت‌پین: مستقیم از مرورگر (CORS آزاد) → حتی بدون سرور کار می‌کند؛
 *            اگر نشد، از مسیر سرور.
 * همه ناموفق → آخرین نرخ ذخیره‌شده با برچسب «قدیمی» (هرگز عدد جعلی).
 * ============================================================ */
import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { settingGet, settingSet } from '@/shared/lib/db';
import { fetchJson, isRemoteAllowed } from '@/repositories/remoteClient';
import { fetchUsdtDirect, isSaneUsdtPrice, type UsdtQuote, type UsdtSource } from '@/shared/fx/usdtRate';
import { fetchDailyRatesDirect, ratesCoverage, tehranDayKey, type DailyRates } from '@/shared/fx/usdtHistory';

const PREF_KEY = 'usdtSourceV1';
const LAST_KEY = 'usdtLastQuoteV1';
/** فاصله به‌روزرسانی خودکار */
export const USDT_REFRESH_MS = 60_000;
/** نرخ قدیمی‌تر از این → «قدیمی» */
export const USDT_STALE_MS = 10 * 60_000;

export type UsdtStatus = 'idle' | 'loading' | 'live' | 'stale' | 'unavailable';

interface UsdtState {
  quote: UsdtQuote | null;
  status: UsdtStatus;
  preferred: UsdtSource;
  error: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  setPreferred: (s: UsdtSource) => Promise<void>;
}

let inflight: Promise<void> | null = null;

function isQuote(v: unknown): v is UsdtQuote {
  const q = v as UsdtQuote | null;
  return !!q && (q.source === 'wallex' || q.source === 'bitpin') && isSaneUsdtPrice(q.priceToman) && typeof q.fetchedAt === 'number';
}

/** یک منبع — والکس فقط از سرور؛ بیت‌پین اول مستقیم بعد سرور */
async function fetchFrom(source: UsdtSource): Promise<UsdtQuote> {
  if (source === 'bitpin') {
    try {
      return await fetchUsdtDirect('bitpin');
    } catch {
      /* فالبک سرور */
    }
  }
  if (!isRemoteAllowed()) throw new Error('offline');
  const r = await fetchJson<Partial<UsdtQuote> & { ok?: boolean; error?: string }>(`/api/usdt?source=${source}`, {
    timeoutMs: 12_000
  });
  if (!r?.ok) throw new Error(r?.error ?? 'unavailable');
  const q = { source, priceToman: r.priceToman, tradedAt: r.tradedAt ?? null, fetchedAt: Date.now() };
  if (!isQuote(q)) throw new Error('invalid price');
  return q;
}

export const useUsdtStore = create<UsdtState>((set, get) => ({
  quote: null,
  status: 'idle',
  preferred: 'wallex',
  error: null,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const [pref, last] = await Promise.all([
      settingGet<UsdtSource>(PREF_KEY, 'wallex').catch(() => 'wallex' as UsdtSource),
      settingGet<UsdtQuote | null>(LAST_KEY, null).catch(() => null)
    ]);
    const cached = isQuote(last) ? last : null;
    set({
      preferred: pref === 'bitpin' ? 'bitpin' : 'wallex',
      quote: get().quote ?? cached,
      status: get().quote ? get().status : cached ? 'stale' : 'idle',
      hydrated: true
    });
  },

  refresh: async () => {
    if (inflight) return inflight;
    inflight = (async () => {
      set({ status: get().quote ? get().status : 'loading' });
      const order: UsdtSource[] = get().preferred === 'bitpin' ? ['bitpin', 'wallex'] : ['wallex', 'bitpin'];
      const errors: string[] = [];
      for (const s of order) {
        try {
          const q = await fetchFrom(s);
          set({ quote: q, status: 'live', error: null });
          void settingSet(LAST_KEY, q).catch(() => undefined);
          return;
        } catch (e) {
          errors.push(`${s}: ${e instanceof Error ? e.message : 'error'}`);
        }
      }
      const q = get().quote;
      set({ status: q ? 'stale' : 'unavailable', error: errors.join(' · ') });
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  },

  setPreferred: async (s) => {
    set({ preferred: s });
    await settingSet(PREF_KEY, s).catch(() => undefined);
    await get().refresh();
  }
}));

/** برچسب وضعیت برای نمایش (زنده/قدیمی بر اساس سن داده) */
export function usdtIsStale(q: UsdtQuote | null, now = Date.now()): boolean {
  return !q || now - q.fetchedAt > USDT_STALE_MS;
}

/** نرخ مؤثر دلار: تتر زنده → آخرین تتر ذخیره‌شده (قدیمی) → هیچ (هرگز عدد دستی/جعلی) */
export interface EffectiveRate {
  /** تومان بر دلار */
  rate: number | null;
  kind: 'live' | 'stale' | 'none';
  source: UsdtSource | null;
  fetchedAt: number | null;
}

export function resolveEffectiveRate(
  usdt: { quote: UsdtQuote | null; status: string },
  now = Date.now()
): EffectiveRate {
  const q = usdt.quote;
  if (!q) return { rate: null, kind: 'none', source: null, fetchedAt: null };
  const stale = usdt.status !== 'live' || usdtIsStale(q, now);
  return { rate: q.priceToman, kind: stale ? 'stale' : 'live', source: q.source, fetchedAt: q.fetchedAt };
}

/** هوک مصرفی نرخ دلار (بدون راه‌اندازی polling — آن یک‌بار در AppProviders است) */
export function useUsdRate(): EffectiveRate {
  const quote = useUsdtStore((s) => s.quote);
  const status = useUsdtStore((s) => s.status);
  return useMemo(() => resolveEffectiveRate({ quote, status }), [quote, status]);
}

/** بارگذاری + به‌روزرسانی خودکار هر دقیقه (فقط وقتی صفحه دیده می‌شود) — فقط effect */
export function useUsdtPolling(): void {
  useEffect(() => {
    let alive = true;
    void useUsdtStore
      .getState()
      .hydrate()
      .then(() => {
        if (alive) void useUsdtStore.getState().refresh();
      });
    const tick = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') void useUsdtStore.getState().refresh();
    };
    const timer = setInterval(tick, USDT_REFRESH_MS);
    const onVis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
}

/** هوک: polling + کل وضعیت استور */
export function useLiveUsdt(): UsdtState {
  useUsdtPolling();
  return useUsdtStore();
}

/* ============================================================
 * تاریخچه روزانه تتر — تبدیل دلاری Snapshotهای گذشته با نرخ همان روز
 * کش در settings؛ هر ۱۲ ساعت یا وقتی بازه لازم پوشش داده نشده، به‌روز می‌شود.
 * ============================================================ */
const HISTORY_KEY = 'usdtDailyV1';
const HISTORY_TTL_MS = 12 * 3600_000;

interface HistoryCache {
  rates: DailyRates;
  source: UsdtSource | null;
  fetchedAt: number;
}

interface UsdtHistoryState {
  rates: DailyRates;
  source: UsdtSource | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  fetchedAt: number | null;
  /** اطمینان از پوشش بازه [fromTs, اکنون] */
  ensure: (fromTs: number) => Promise<void>;
}

let historyInflight: Promise<void> | null = null;

async function fetchHistoryFrom(source: UsdtSource, fromTs: number, toTs: number): Promise<DailyRates> {
  if (source === 'bitpin') {
    try {
      return await fetchDailyRatesDirect('bitpin', fromTs, toTs);
    } catch {
      /* فالبک سرور */
    }
  }
  if (!isRemoteAllowed()) throw new Error('offline');
  const r = await fetchJson<{ ok?: boolean; rates?: DailyRates; error?: string }>(
    `/api/usdt?history=1&source=${source}&from=${Math.floor(fromTs)}&to=${Math.floor(toTs)}`,
    { timeoutMs: 20_000 }
  );
  if (!r?.ok || !r.rates || Object.keys(r.rates).length === 0) throw new Error(r?.error ?? 'empty history');
  return r.rates;
}

export const useUsdtHistoryStore = create<UsdtHistoryState>((set, get) => ({
  rates: {},
  source: null,
  status: 'idle',
  fetchedAt: null,

  ensure: async (fromTs) => {
    if (historyInflight) return historyInflight;
    historyInflight = (async () => {
      const now = Date.now();
      let rates = get().rates;
      let fetchedAt = get().fetchedAt;
      let source = get().source;
      if (Object.keys(rates).length === 0) {
        const cached = await settingGet<HistoryCache | null>(HISTORY_KEY, null).catch(() => null);
        if (cached && cached.rates && typeof cached.fetchedAt === 'number') {
          rates = cached.rates;
          fetchedAt = cached.fetchedAt;
          source = cached.source;
          set({ rates, fetchedAt, source, status: 'ready' });
        }
      }
      const cov = ratesCoverage(rates);
      const needFrom = tehranDayKey(fromTs);
      const covered = cov.first !== null && cov.first <= needFrom;
      const fresh = fetchedAt !== null && now - fetchedAt < HISTORY_TTL_MS;
      if (covered && fresh) return;

      set({ status: Object.keys(rates).length > 0 ? 'ready' : 'loading' });
      // کمی قبل‌تر از نیاز، تا روزهای خالی ابتدای بازه هم پوشش داشته باشند
      const from = Math.min(fromTs, now - 30 * 86_400_000) - 7 * 86_400_000;
      const order: UsdtSource[] = useUsdtStore.getState().preferred === 'wallex' ? ['wallex', 'bitpin'] : ['bitpin', 'wallex'];
      for (const s of order) {
        try {
          const fetched = await fetchHistoryFrom(s, from, now);
          const merged = { ...rates, ...fetched };
          set({ rates: merged, source: s, fetchedAt: now, status: 'ready' });
          void settingSet(HISTORY_KEY, { rates: merged, source: s, fetchedAt: now } satisfies HistoryCache).catch(() => undefined);
          return;
        } catch {
          /* منبع بعدی */
        }
      }
      set({ status: Object.keys(rates).length > 0 ? 'ready' : 'error' });
    })().finally(() => {
      historyInflight = null;
    });
    return historyInflight;
  }
}));
