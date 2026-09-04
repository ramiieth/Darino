/** ============================================================
 * عملکرد ۳۰/۶۰/۹۰ روزه — همه بازارها (داشبورد)
 *
 * دنیای عملکرد (همه بازارها):
 *  - ۱۵۰ رمزارز برتر مارکت‌کپ (CoinGecko)
 *  - تمام سهام توکن‌ایز (۱۳۵ نماد — CoinGecko Tokenized Products)
 *  - تمام سهام/ETF/کالاهای سنتی آمریکا (۷۳ نماد — Alpha Vantage)
 *
 * منابع بازده:
 *  - ۳۰ روزه: CoinGecko (price_change_percentage_30d) برای کریپتو و توکن‌ایز
 *  - ۶۰/۹۰ روزه: بایگانی تاریخچه قیمت روزانه (کریپتو + توکن‌ایز)
 *  - سهام سنتی: سری روزانه Alpha Vantage (سهمیه‌بندی + کش ۲۴ ساعت)
 *    → همگام‌سازی تدریجی؛ اگر سهمیه روزانه پر شود، بقیه در نشست بعدی
 * اجرای پیش‌رونده: هر داده که آماده شد بلافاصله در UI نمایش داده می‌شود
 * ============================================================ */
import { useEffect } from 'react';
import { create } from 'zustand';
import { fetchWithRetry } from '@/shared/lib/fetchWithRetry';
import { cgFetch } from '@/shared/lib/coingeckoGate';
import { cacheBulkGetPrice, cachePutPrice } from '@/shared/lib/db';
import { useAutoSync } from '@/shared/hooks/useAutoSync';
import { fetchTopMarketsOnce, buildSeedMarkets } from './useTopCryptoMarkets';
import {
  COIN_NAMES_FA,
  TOKENIZED_STOCK_PRICES,
  TOKENIZED_NAMES,
  TRADFI_SYMBOLS,
  TRADFI_NAMES
} from '@/features/simulation/domain/constants';
import { TOKENIZED_COIN_MAP } from '@/features/simulation/data/tokenizedCoinMap';
import type { PricePoint } from '@/features/calculators/data/historical';
import { COINGECKO_BASE, ALPHA_VANTAGE_BASE, STOCK_GAP_MS } from '@/app/config/apiConfig';
import { useSettingsStore, effectiveApiKeys } from '@/shared/store/settingsStore';
import { useAvBudgetStore } from '@/shared/store/avBudgetStore';

export interface ChartPoint {
  timestamp: number;
  price: number;
}

/** نوع بازار در دنیای عملکرد */
export type PerfKind = 'crypto' | 'tokenized' | 'tradfi';

/** دارایی حاضر در رتبه‌بندی عملکرد */
export interface PerfCoin {
  symbol: string;
  id: string;
  nameFa: string;
  price: number | null;
  marketCap: number | null;
  kind: PerfKind;
}

/* ---------------- توابع خالص (تست‌پذیر) ---------------- */

const DAY_MS = 86_400_000;

/** نزدیک‌ترین نقطه روزانه به هدف زمانی (حداکثر ۳ روز فاصله) — در فاصله مساوی، نقطه جدیدتر */
export function priceAt(points: ChartPoint[], targetTs: number): number | null {
  if (points.length === 0) return null;
  let best = points[0];
  let bestDist = Math.abs(best.timestamp - targetTs);
  for (let i = 1; i < points.length; i++) {
    const d = Math.abs(points[i].timestamp - targetTs);
    if (d < bestDist || (d === bestDist && points[i].timestamp > best.timestamp)) {
      best = points[i];
      bestDist = d;
    }
  }
  if (bestDist > 3 * DAY_MS) return null;
  return best.price;
}

/**
 * بازده ۱/۷/۳۰/۶۰/۹۰ روزه از سری قیمت روزانه:
 *  ret1  = آخرین قیمت / قیمت ~۱ روز پیش − ۱
 *  ret7  = آخرین قیمت / قیمت ~۷ روز پیش − ۱
 *  ret30 = آخرین قیمت / قیمت ~۳۰ روز پیش − ۱
 *  ret60 = آخرین قیمت / قیمت ~۶۰ روز پیش − ۱
 *  ret90 = آخرین قیمت / قیمت ~۹۰ روز پیش − ۱
 */
export function returnsFromChart(
  points: ChartPoint[],
  now = Date.now()
): { ret1: number | null; ret7: number | null; ret30: number | null; ret60: number | null; ret90: number | null } {
  if (!points || points.length < 2)
    return { ret1: null, ret7: null, ret30: null, ret60: null, ret90: null };
  const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
  const cur = sorted[sorted.length - 1].price;
  if (!Number.isFinite(cur) || cur <= 0)
    return { ret1: null, ret7: null, ret30: null, ret60: null, ret90: null };
  const p1 = priceAt(sorted, now - 1 * DAY_MS);
  const p7 = priceAt(sorted, now - 7 * DAY_MS);
  const p30 = priceAt(sorted, now - 30 * DAY_MS);
  const p60 = priceAt(sorted, now - 60 * DAY_MS);
  const p90 = priceAt(sorted, now - 90 * DAY_MS);
  const ret = (base: number | null): number | null =>
    base !== null && Number.isFinite(base) && base > 0 ? (cur / base - 1) * 100 : null;
  return { ret1: ret(p1), ret7: ret(p7), ret30: ret(p30), ret60: ret(p60), ret90: ret(p90) };
}

/** بازه‌های عملکرد مشترک (کارت عملکرد + شبیه‌سازی نمایشی) */
export type PerfPeriod = '1d' | '7d' | '30d' | '60d' | '90d';

export interface RankedRow {
  coin: PerfCoin;
  pct: number;
}

/** رتبه‌بندی دارایی‌ها بر اساس بازده یک بازه: بیشترین رشد و بیشترین افت (پیش‌فرض ۵) */
export function rankRows(
  coins: PerfCoin[],
  perf: Record<string, number | null>,
  n = 5
): { gainers: RankedRow[]; losers: RankedRow[] } {
  const withVal: RankedRow[] = coins
    .map((coin) => ({ coin, pct: perf[coin.symbol] ?? null }))
    .filter((r): r is RankedRow => r.pct !== null && Number.isFinite(r.pct))
    .sort((a, b) => b.pct - a.pct);
  return { gainers: withVal.slice(0, n), losers: withVal.slice(-n).reverse() };
}

/**
 * شبیه‌سازی نمایشی سرمایه‌گذاری (Historical Performance Simulation)
 * فقط محاسبه فرضی — هیچ ارتباطی با حسابداری/موجودی واقعی ندارد.
 *  profit = capital × pct/100 ; finalValue = capital + profit
 */
export function simulateInvestment(
  capital: number,
  pct: number | null
): { profit: number | null; finalValue: number | null } {
  if (pct === null || !Number.isFinite(pct)) return { profit: null, finalValue: null };
  const profit = (capital * pct) / 100;
  return { profit, finalValue: capital + profit };
}

/** شناسه‌های جایگزین برای سکه‌هایی که در بایگانی با شناسه متفاوت ثبت شده‌اند */
export const CHART_ID_ALIAS: Record<string, string> = {
  'matic-network': 'polygon-ecosystem-token',
  toncoin: 'the-open-network'
};

/** کلیدهای کش IndexedDB */
const CHART_CACHE_MS = 12 * 60 * 60 * 1000;
const chartKey = (id: string) => `perf:chart:${id}`;

/* ---------------- استور Zustand ---------------- */

interface PerfState {
  /** دنیای عملکرد (همه بازارها) */
  coins: PerfCoin[];
  /** نماد → بازده درصدی هر بازه (null = ناموجود) */
  perf1d: Record<string, number | null>;
  perf7d: Record<string, number | null>;
  perf30: Record<string, number | null>;
  perf60: Record<string, number | null>;
  perf90: Record<string, number | null>;
  /** نماد → مارکت‌کپ (سهام توکن‌ایز از CoinGecko Category) */
  mcap: Record<string, number | null>;
  loading: boolean;
  /** آیا فاز تاریخچه تمام شده (موفق یا ناموفق) */
  historyDone: boolean;
  /** داده از اسنپ‌شات کش است */
  stale: boolean;
  /** پیشرفت همگام‌سازی سهام سنتی (فاز آلفا وانتج) */
  stockSync: { done: number; total: number } | null;
  loadedAt: number | null;
  setCoins: (c: PerfCoin[]) => void;
  setPerf1d: (p: Record<string, number | null>) => void;
  setPerf7d: (p: Record<string, number | null>) => void;
  setPerf30: (p: Record<string, number | null>) => void;
  setPerf60: (p: Record<string, number | null>) => void;
  setPerf90: (p: Record<string, number | null>) => void;
  setMcap: (p: Record<string, number | null>) => void;
  setLoading: (v: boolean) => void;
  setHistoryDone: (v: boolean) => void;
  setStale: (v: boolean) => void;
  setStockSync: (v: { done: number; total: number } | null) => void;
  setLoadedAt: (v: number | null) => void;
}

export const usePerfStore = create<PerfState>((set) => ({
  coins: [],
  perf1d: {},
  perf7d: {},
  perf30: {},
  perf60: {},
  perf90: {},
  mcap: {},
  loading: false,
  historyDone: false,
  stale: false,
  stockSync: null,
  loadedAt: null,
  setCoins: (c) => set({ coins: c }),
  setPerf1d: (p) => set({ perf1d: p }),
  setPerf7d: (p) => set({ perf7d: p }),
  setPerf30: (p) => set({ perf30: p }),
  setPerf60: (p) => set({ perf60: p }),
  setPerf90: (p) => set({ perf90: p }),
  setMcap: (p) => set({ mcap: p }),
  setLoading: (v) => set({ loading: v }),
  setHistoryDone: (v) => set({ historyDone: v }),
  setStale: (v) => set({ stale: v }),
  setStockSync: (v) => set({ stockSync: v }),
  setLoadedAt: (v) => set({ loadedAt: v })
}));

/* ---------------- ابزار ---------------- */

/** اجرای محدود همزمان (خطای هر آیتم خنثی می‌شود) */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        out[i] = await fn(items[i], i);
      } catch {
        out[i] = undefined as unknown as R;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

/** ادغام بازده یک دارایی در استور (پیش‌رونده) — فقط بازه‌های خالی پر می‌شوند */
export function applyReturns(
  symbol: string,
  r: { ret1: number | null; ret7: number | null; ret30: number | null; ret60: number | null; ret90: number | null }
): void {
  const st = usePerfStore.getState();
  const p1 = { ...st.perf1d };
  const p7 = { ...st.perf7d };
  const p30 = { ...st.perf30 };
  const p60 = { ...st.perf60 };
  const p90 = { ...st.perf90 };
  if (p1[symbol] === undefined || p1[symbol] === null) p1[symbol] = r.ret1;
  if (p7[symbol] === undefined || p7[symbol] === null) p7[symbol] = r.ret7;
  if (p30[symbol] === undefined || p30[symbol] === null) p30[symbol] = r.ret30;
  if (p60[symbol] === undefined || p60[symbol] === null) p60[symbol] = r.ret60;
  if (p90[symbol] === undefined || p90[symbol] === null) p90[symbol] = r.ret90;
  st.setPerf1d(p1);
  st.setPerf7d(p7);
  st.setPerf30(p30);
  st.setPerf60(p60);
  st.setPerf90(p90);
}

/** گرفتن تاریخچه قیمت روزانه یک دارایی (coingecko:{id}) */
export async function fetchChartHistory(id: string): Promise<ChartPoint[] | null> {
  const realId = CHART_ID_ALIAS[id] ?? id;
  const now = Date.now();
  const start = Math.floor(now / 1000) - 92 * 86_400;
  const url = `https://coins.llama.fi/chart/coingecko:${encodeURIComponent(realId)}?start=${start}&span=90`;
  const res = await fetchWithRetry(url, { retries: 1, timeoutMs: 10_000 });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    coins?: Record<string, { prices?: { timestamp: number; price: number }[] }>;
  };
  const pts = body.coins?.[`coingecko:${realId}`]?.prices;
  if (!pts || pts.length < 2) return null;
  return pts.map((p) => ({ timestamp: p.timestamp * 1000, price: p.price }));
}

/** تغییر ۱/۷/۳۰ روزه سهام توکن‌ایز از CoinGecko (یک درخواست با همه شناسه‌ها) */
const TK_PERF_CACHE_MS = 60 * 60 * 1000;
const TK_PERF_KEY = 'perf:tkperf';

export async function fetchTokenizedPerf(): Promise<{
  d1: Record<string, number | null>;
  d7: Record<string, number | null>;
  d30: Record<string, number | null>;
  mcap: Record<string, number | null>;
}> {
  const empty = (): Record<string, number | null> => ({});
  const out = { d1: empty(), d7: empty(), d30: empty(), mcap: empty() };
  try {
    const rec = await cacheBulkGetPrice([TK_PERF_KEY]);
    const r = rec.get(TK_PERF_KEY);
    if (r && Date.now() - r.fetchedAt < TK_PERF_CACHE_MS) {
      const cached = r.price as unknown as typeof out;
      // سازگاری با کش قدیمی (بدون mcap)
      if (cached && cached.d1) return { ...cached, mcap: cached.mcap ?? empty() };
    }
  } catch {
    /* ادامه */
  }
  try {
    const ids = [...new Set(Object.values(TOKENIZED_COIN_MAP).map((m) => m.id))];
    const url =
      `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids.join(','))}` +
      `&per_page=250&price_change_percentage=24h,7d,30d`;
    const res = await cgFetch(url, { timeoutMs: 15_000 });
    if (res.ok) {
      const list = (await res.json()) as {
        symbol: string;
        market_cap?: number | null;
        price_change_percentage_24h_in_currency?: number | null;
        price_change_percentage_7d_in_currency?: number | null;
        price_change_percentage_30d_in_currency?: number | null;
      }[];
      for (const c of list) {
        const sym = c.symbol.toUpperCase();
        const v1 = c.price_change_percentage_24h_in_currency;
        const v7 = c.price_change_percentage_7d_in_currency;
        const v30 = c.price_change_percentage_30d_in_currency;
        if (v1 !== null && v1 !== undefined) out.d1[sym] = v1;
        if (v7 !== null && v7 !== undefined) out.d7[sym] = v7;
        if (v30 !== null && v30 !== undefined) out.d30[sym] = v30;
        if (c.market_cap !== null && c.market_cap !== undefined) out.mcap[sym] = c.market_cap;
      }
      try {
        await cachePutPrice(TK_PERF_KEY, {
          price: out as unknown as number,
          source: 'live',
          fetchedAt: Date.now()
        });
      } catch {
        /* خاموش */
      }
    }
  } catch {
    /* خاموش */
  }
  return out;
}

/** سازگاری عقب‌رو: fetchTokenized30d قدیمی → فقط بازه ۳۰ روزه */
export async function fetchTokenized30d(): Promise<Record<string, number | null>> {
  const r = await fetchTokenizedPerf();
  return r.d30;
}

/** MCAP سهام توکن‌ایز (از CoinGecko Category) */
export async function fetchTokenizedMcap(): Promise<Record<string, number | null>> {
  const r = await fetchTokenizedPerf();
  return r.mcap;
}

/** توابع سری روزانه آلفا وانتج برای کالاها (غیر از TIME_SERIES_DAILY) */
const AV_SERIES_FUNCS: Record<string, string> = {
  WTI: 'WTI',
  BRENT: 'BRENT',
  NG: 'NATURAL_GAS',
  COPPER: 'COPPER',
  CORN: 'CORN',
  WHEAT: 'WHEAT',
  COFFEE: 'COFFEE',
  SUGAR: 'SUGAR'
};

/** کش سری روزانه سهام (۲۴ ساعت) — مشترک با ماشین‌حساب‌ها */
const STOCK_CACHE_MS = 24 * 60 * 60 * 1000;
const stockCacheKey = (symbol: string) => `avhist:${symbol}`;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** آخرین استفاده از هر کلید آلفا وانتج (محدودیت ۱۲ ثانیه برای هر کلید) */
const keyLastUse: Record<string, number> = {};

/**
 * تاریخچه روزانه یک سهم/ETF/کالای سنتی با سهمیه‌بندی:
 *  - چرخش بین کلیدها (۵ کلید موازی → ۵ درخواست/۱۲ ثانیه)
 *  - احترام به بودجه روزانه (هر کلید ۲۲/روز — مشترک با بقیه اپ)
 *  - کش IndexedDB ۲۴ ساعت (هیچ درخواست تکراری)
 */
export async function fetchStockDailyBudgeted(symbol: string): Promise<PricePoint[] | null> {
  const cacheKey = stockCacheKey(symbol);
  try {
    const rec = await cacheBulkGetPrice([cacheKey]);
    const r = rec.get(cacheKey);
    if (r && Date.now() - r.fetchedAt < STOCK_CACHE_MS) {
      return (r.price as unknown as PricePoint[]) ?? null;
    }
  } catch {
    /* ادامه */
  }

  // کلیدی با قدیمی‌ترین آخرین استفاده (چرخش موازی بین ۵ کلید)
  const keys = effectiveApiKeys(useSettingsStore.getState().apiKeys);
  let best: string | null = null;
  let earliest = Infinity;
  for (const k of keys) {
    if (!useAvBudgetStore.getState().canUse(k)) continue;
    const last = keyLastUse[k] ?? 0;
    if (last < earliest) {
      earliest = last;
      best = k;
    }
  }
  if (!best) return null; // سهمیه روزانه تمام → بدون درخواست

  // رزرو فوری کلید (قبل از sleep) تا درخواست‌های همزمان به کلیدهای مختلف بروند
  const lastUsedAt = keyLastUse[best] ?? 0;
  const wait = Math.max(0, STOCK_GAP_MS - (Date.now() - lastUsedAt));
  if (wait > 0) await sleep(wait);
  keyLastUse[best] = Date.now();
  await useAvBudgetStore.getState().consume(best);

  try {
    const func = AV_SERIES_FUNCS[symbol] ?? 'TIME_SERIES_DAILY';
    const url =
      `${ALPHA_VANTAGE_BASE}?function=${func}` +
      (func === 'TIME_SERIES_DAILY'
        ? `&symbol=${encodeURIComponent(symbol)}&outputsize=compact`
        : '&interval=daily') +
      `&apikey=${encodeURIComponent(best)}`;
    const res = await fetchWithRetry(url, { retries: 1 });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;

    if (json['Information'] || json['Note']) {
      await useAvBudgetStore.getState().exhaust(best);
      return null;
    }

    let points: PricePoint[] = [];
    if (func === 'TIME_SERIES_DAILY') {
      const series = json['Time Series (Daily)'] as
        | Record<string, Record<string, string>>
        | undefined;
      if (!series) return null;
      points = Object.entries(series).map(([date, vals]) => ({
        t: new Date(date + 'T00:00:00Z').getTime(),
        price: parseFloat(vals['4. close'])
      }));
    } else {
      const data = json['data'] as { date: string; value: string }[] | undefined;
      if (!data) return null;
      points = data.map((d) => ({
        t: new Date(d.date + 'T00:00:00Z').getTime(),
        price: parseFloat(d.value)
      }));
    }
    if (points.length > 1) {
      try {
        await cachePutPrice(cacheKey, {
          price: points as unknown as number,
          source: 'snapshot',
          fetchedAt: Date.now()
        });
      } catch {
        /* خاموش */
      }
    }
    return points;
  } catch {
    return null;
  }
}

/** همگام‌سازی سهام سنتی (آلفا وانتج) — ۵ کلید موازی با سهمیه‌بندی */
async function loadTradFiStocks(coins: PerfCoin[]): Promise<void> {
  const stocks = coins.filter((c) => c.kind === 'tradfi');
  const st = usePerfStore.getState();
  st.setStockSync({ done: 0, total: stocks.length });
  let done = 0;
  await mapLimit(stocks, 5, async (c) => {
    try {
      const points = await fetchStockDailyBudgeted(c.symbol);
      if (points && points.length > 1) {
        applyReturns(
          c.symbol,
          returnsFromChart(points.map((p) => ({ timestamp: p.t, price: p.price })))
        );
      }
    } catch {
      /* خاموش */
    }
    done += 1;
    if (done % 5 === 0 || done === stocks.length) {
      usePerfStore.getState().setStockSync({ done, total: stocks.length });
    }
  });
  usePerfStore.getState().setStockSync(null);
}

let loadPromise: Promise<void> | null = null;

/** پاک‌سازی صف درون‌حافظه‌ای (برای تست) */
export function resetPerfLoadPromise(): void {
  loadPromise = null;
}

/**
 * بارگذاری عملکرد ۳۰/۶۰/۹۰ روزه همه بازارها (یک بار همزمان برای همه مصرف‌کننده‌ها).
 *  فاز ۱: کریپتو + توکن‌ایز ۳۰ روزه → نمایش فوری
 *  فاز ۲: ۶۰/۹۰ از بایگانی تاریخی (پیش‌رونده، همزمانی ۸)
 *  فاز ۳: سهام سنتی (پیش‌رونده، سهمیه آلفا وانتج)
 */
export function loadTopPerformers(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const st = usePerfStore.getState();
    if (st.loading) return;
    st.setLoading(true);
    try {
      // ===== فاز ۱: کریپتو (۱۵۰ برتر) =====
      let cryptoCoins: PerfCoin[] = [];
      const crypto1d: Record<string, number | null> = {};
      const crypto7d: Record<string, number | null> = {};
      const crypto30: Record<string, number | null> = {};
      let stale = false;
      try {
        const { data, stale: isStale } = await fetchTopMarketsOnce();
        stale = isStale;
        cryptoCoins = data.map((c) => ({
          symbol: c.symbol.toUpperCase(),
          id: c.id,
          nameFa: COIN_NAMES_FA[c.id] ?? c.name,
          price: c.current_price ?? null,
          marketCap: c.market_cap ?? null,
          kind: 'crypto' as const
        }));
        for (const c of data) {
          const sym = c.symbol.toUpperCase();
          const v1 = c.price_change_percentage_24h;
          const v7 = c.price_change_percentage_7d_in_currency;
          const v30 = c.price_change_percentage_30d_in_currency;
          if (v1 !== null && v1 !== undefined) crypto1d[sym] = v1;
          if (v7 !== null && v7 !== undefined) crypto7d[sym] = v7;
          if (v30 !== null && v30 !== undefined) crypto30[sym] = v30;
        }
      } catch {
        // CoinGecko در دسترس نیست → دنیای فالبک ساختاری
        stale = true;
        const seed = buildSeedMarkets();
        cryptoCoins = seed.out.map((m) => ({
          symbol: m.symbol,
          id: seed.symToId.get(m.symbol) ?? m.symbol,
          nameFa: m.nameFa,
          price: m.price,
          marketCap: m.marketCap,
          kind: 'crypto' as const
        }));
      }

      // ===== فاز ۱: سهام توکن‌ایز (همه) =====
      const tkCoins: PerfCoin[] = Object.keys(TOKENIZED_STOCK_PRICES).map((sym) => {
        const meta = TOKENIZED_COIN_MAP[sym];
        return {
          symbol: sym,
          id: meta?.id ?? sym,
          nameFa: TOKENIZED_NAMES[sym] ?? sym,
          price: TOKENIZED_STOCK_PRICES[sym] ?? null,
          marketCap: null,
          kind: 'tokenized' as const
        };
      });
      const tkPerf = await fetchTokenizedPerf();
      const tk1d = tkPerf.d1;
      const tk7d = tkPerf.d7;
      const tk30 = tkPerf.d30;
      const tkMcap = tkPerf.mcap;
      st.setMcap(tkMcap);

      // ===== فاز ۱: سهام سنتی (همه — داده تدریجی) =====
      const trCoins: PerfCoin[] = TRADFI_SYMBOLS.map((sym) => ({
        symbol: sym,
        id: sym,
        nameFa: TRADFI_NAMES[sym] ?? sym,
        price: null,
        marketCap: null,
        kind: 'tradfi' as const
      }));

      const coins = [...cryptoCoins, ...tkCoins, ...trCoins];
      st.setCoins(coins);
      st.setStale(stale);
      st.setPerf1d({ ...crypto1d, ...tk1d });
      st.setPerf7d({ ...crypto7d, ...tk7d });
      st.setPerf30({ ...crypto30, ...tk30 });
      // زمان همگام‌سازی اولیه بلافاصله ثبت می‌شود (فازهای بعدی پیش‌رونده‌اند)
      st.setLoadedAt(Date.now());

      // ===== فاز ۲ و ۳ (موازی): بایگانی تاریخی + سهام سنتی =====
      // هر دو پیش‌رونده‌اند؛ داده‌ها به محض آماده‌شدن در استور می‌نشینند
      const chartTask = (async () => {
        const chartCoins = [...cryptoCoins, ...tkCoins];
        const now = Date.now();
        const keys = chartCoins.map((c) => chartKey(c.id));
        const cached = await cacheBulkGetPrice(keys);
        const need: PerfCoin[] = [];
        for (const c of chartCoins) {
          const rec = cached.get(chartKey(c.id));
          if (rec && now - rec.fetchedAt < CHART_CACHE_MS) {
            applyReturns(c.symbol, returnsFromChart(rec.price as unknown as ChartPoint[]));
          } else {
            need.push(c);
          }
        }
        await mapLimit(need, 8, async (c) => {
          const points = await fetchChartHistory(c.id);
          if (points) {
            try {
              await cachePutPrice(chartKey(c.id), {
                price: points as unknown as number,
                source: 'snapshot',
                fetchedAt: Date.now()
              });
            } catch {
              /* خاموش */
            }
            applyReturns(c.symbol, returnsFromChart(points));
          }
        });
      })();
      const stockTask = loadTradFiStocks(trCoins);
      await Promise.all([chartTask, stockTask]);

      st.setHistoryDone(true);
      st.setLoadedAt(Date.now());
    } catch {
      // بدون داده — UI پیام مناسب نشان می‌دهد
      st.setHistoryDone(true);
    } finally {
      st.setLoading(false);
    }
  })().finally(() => {
    loadPromise = null;
  });
  return loadPromise;
}

/** هوک مصرفی کامپوننت‌ها */
export function useTopPerformers() {
  const st = usePerfStore();
  useEffect(() => {
    void loadTopPerformers();
  }, []);

  // همگام‌سازی خودکار زنده: هر ۵ دقیقه + هنگام فوکوس
  // (بازده‌ها با کش تاریخچه + سهمیه روزانه آلفا وانتج مدیریت می‌شوند — بدون فشار اضافه)
  useAutoSync(
    'top-performers',
    () => {
      const s = usePerfStore.getState();
      if (s.loading) return;
      resetPerfLoadPromise();
      void loadTopPerformers();
    },
    { intervalMs: 5 * 60_000, minAgeMs: 3 * 60_000 }
  );

  return st;
}

/** به‌روزرسانی دستی (دکمه همگام‌سازی) */
export function refreshTopPerformers(): void {
  resetPerfLoadPromise();
  void loadTopPerformers();
}
