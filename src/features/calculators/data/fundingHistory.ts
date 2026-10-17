/**
 * تاریخچهٔ فاندینگ تسویه‌شده و دفتر سفارش — آرکوس، اوندو پرپس، لایتر (فقط دادهٔ عمومی؛ بدون حساب/کلید)
 *
 *  Lighter  GET /api/v1/fundings?resolution=1h   rate = درصد ساعتی (۴ رقم اعشار)، direction=long → لانگ می‌پردازد
 *           GET /api/v1/orderBookOrders           سفارش‌های باز (حداکثر ۱۰۰ در هر سمت)
 *  Arcus    GET /v1/fundingRates?market&limit     نرخ ساعتی کسری، time به میکروثانیه
 *           GET /v1/l2OrderBook/{market}          [قیمت، حجم]
 *  Ondo     /api/integrations?op=ondo-perps-history | ondo-perps-depth   (REST اوندو CORS ندارد)
 *
 * همه نرخ‌ها به «کسری ساعتی، مثبت = لانگ می‌پردازد» نرمال می‌شوند.
 */
import { useMemo, useRef } from 'react';
import { useQueries } from '@tanstack/react-query';
import { fetchJson } from '@/repositories/remoteClient';
import { arcusGet, arcusOrderBook } from '@/features/arcus/api/client';
import {
  alignSpread,
  floorHour,
  fundingSpreads,
  midPrice,
  spreadStats,
  stabilityOf,
  type BookLevel,
  type RatePoint,
  type SpreadStats,
  type Stability
} from '@/features/calculators/domain';
import type { DeltaVenue, VenueBook, VenueQuote } from './deltaMarkets';

const LIGHTER_BASE = 'https://mainnet.zklighter.elliot.ai';
const HISTORY_HOURS = 30 * 24;
const fin = (v: unknown): number | null => {
  if ((typeof v !== 'number' && typeof v !== 'string') || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const rows = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];

/* ---------------- نرمال‌سازی (خالص، تست‌پذیر) ---------------- */

export function parseLighterFundings(body: unknown): RatePoint[] {
  return rows((body as { fundings?: unknown } | null)?.fundings).flatMap((f) => {
    const ts = fin(f.timestamp);
    const pct = fin(f.rate);
    if (ts === null || pct === null) return [];
    const sign = f.direction === 'short' ? -1 : 1;
    return [{ hour: floorHour(ts * 1000), rate: (sign * pct) / 100 }];
  });
}

export function parseArcusFundings(body: unknown): RatePoint[] {
  return rows((body as { fundingRates?: unknown } | null)?.fundingRates).flatMap((f) => {
    const rate = fin(f.fundingRate);
    const t = typeof f.time === 'string' || typeof f.time === 'number' ? String(f.time) : '';
    if (rate === null || !/^\d{13,17}$/.test(t)) return [];
    return [{ hour: floorHour(Number(BigInt(t) / 1000n)), rate }];
  });
}

export function parseOndoFundings(body: unknown): RatePoint[] {
  return rows((body as { rates?: unknown } | null)?.rates).flatMap((f) => {
    const t = fin(f.t);
    const r = fin(f.r);
    return t === null || r === null ? [] : [{ hour: floorHour(t), rate: r }];
  });
}

export interface OrderBook {
  bids: BookLevel[];
  asks: BookLevel[];
  mid: number | null;
}

const tupleLevels = (v: unknown): BookLevel[] =>
  (Array.isArray(v) ? v : []).flatMap((l) => {
    const price = Array.isArray(l) ? fin(l[0]) : null;
    const size = Array.isArray(l) ? fin(l[1]) : null;
    return price !== null && size !== null && price > 0 && size > 0 ? [{ price, size }] : [];
  });
const book = (bids: BookLevel[], asks: BookLevel[]): OrderBook => {
  const b = [...bids].sort((x, y) => y.price - x.price);
  const a = [...asks].sort((x, y) => x.price - y.price);
  return { bids: b, asks: a, mid: midPrice(b, a) };
};

export function parseLighterBook(body: unknown): OrderBook {
  const side = (v: unknown) =>
    rows(v).flatMap((o) => {
      const price = fin(o.price);
      const size = fin(o.remaining_base_amount);
      return price !== null && size !== null && price > 0 && size > 0 ? [{ price, size }] : [];
    });
  const b = body as { bids?: unknown; asks?: unknown } | null;
  return book(side(b?.bids), side(b?.asks));
}

export function parseTupleBook(body: unknown): OrderBook {
  const b = body as { bids?: unknown; asks?: unknown } | null;
  return book(tupleLevels(b?.bids), tupleLevels(b?.asks));
}

/* ---------------- دریافت ---------------- */

async function getJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer', headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchFundingHistory(venue: DeltaVenue, ref: string): Promise<RatePoint[]> {
  if (venue === 'lighter') {
    if (!/^\d{1,6}$/.test(ref)) throw new Error('invalid market');
    const now = Math.floor(Date.now() / 1000);
    const q = new URLSearchParams({
      market_id: ref,
      resolution: '1h',
      start_timestamp: String(now - HISTORY_HOURS * 3600),
      end_timestamp: String(now),
      count_back: String(HISTORY_HOURS)
    });
    return parseLighterFundings(await getJson(`${LIGHTER_BASE}/api/v1/fundings?${q}`));
  }
  if (venue === 'arcus') return parseArcusFundings(await arcusGet('mainnet', '/v1/fundingRates', { market: ref, limit: HISTORY_HOURS }));
  return parseOndoFundings(await fetchJson(`/api/integrations?op=ondo-perps-history&market=${encodeURIComponent(ref)}`, { timeoutMs: 15_000 }));
}

export async function fetchOrderBook(venue: DeltaVenue, ref: string): Promise<OrderBook> {
  if (venue === 'lighter') {
    if (!/^\d{1,6}$/.test(ref)) throw new Error('invalid market');
    return parseLighterBook(await getJson(`${LIGHTER_BASE}/api/v1/orderBookOrders?${new URLSearchParams({ market_id: ref, limit: '100' })}`));
  }
  if (venue === 'arcus') return parseTupleBook(await arcusOrderBook('mainnet', ref));
  return parseTupleBook(await fetchJson(`/api/integrations?op=ondo-perps-depth&market=${encodeURIComponent(ref)}`, { timeoutMs: 15_000 }));
}

/* ---------------- فرصت‌ها ---------------- */

export interface WindowStats {
  d1: SpreadStats;
  d7: SpreadStats;
  d30: SpreadStats;
}

export interface Opportunity {
  /** base:shortVenue>longVenue */
  key: string;
  base: string;
  short: VenueQuote;
  long: VenueQuote;
  /** اسپرد لحظه‌ای به نفع همین جهت (٪ سالانه) */
  currentApr: number;
  stats: WindowStats | null;
  /** اسپرد ساعتی مبنای پیش‌بینی (کسری) */
  projectedHourly: number;
  /** avg7d = میانگین تسویه‌شدهٔ ۷ روز · current = نرخ لحظه‌ای (تاریخچه ناکافی) */
  projectedFrom: 'avg7d' | 'current';
  stability: Stability;
  historyStatus: 'loading' | 'ready' | 'error';
  longBook: OrderBook | null;
  shortBook: OrderBook | null;
  bookStatus: 'loading' | 'ready' | 'error';
}

const PAIRS: [DeltaVenue, DeltaVenue][] = [
  ['arcus', 'ondo'],
  ['arcus', 'lighter'],
  ['ondo', 'lighter']
];

/** نامزدها: بیشترین اختلاف لحظه‌ای در هر سه جفت صرافی (تکراری حذف) */
export function pickCandidates(books: Record<DeltaVenue, VenueBook>, limit: number) {
  const all = PAIRS.flatMap(([a, b]) => fundingSpreads(books[a].quotes, books[b].quotes));
  return all.sort((x, y) => y.spreadApr - x.spreadApr).slice(0, limit);
}

/** میانگین ۷ روز تعیین‌کنندهٔ جهت است؛ بدون تاریخچهٔ کافی جهت لحظه‌ای */
export function buildOpportunity(
  a: VenueQuote,
  b: VenueQuote,
  histA: RatePoint[] | undefined,
  histB: RatePoint[] | undefined,
  now: number
): Pick<Opportunity, 'short' | 'long' | 'currentApr' | 'stats' | 'projectedHourly' | 'projectedFrom' | 'stability'> {
  const fa = a.fundingHourly ?? 0;
  const fb = b.fundingHourly ?? 0;
  const statsFor = (series: RatePoint[]): WindowStats => ({
    d1: spreadStats(series, 24, now),
    d7: spreadStats(series, 7 * 24, now),
    d30: spreadStats(series, 30 * 24, now)
  });
  if (histA && histB) {
    const aShort = alignSpread(histA, histB);
    const sA = statsFor(aShort);
    if (sA.d7.hours >= 48 && sA.d7.avgApr !== null) {
      const shortIsA = sA.d7.avgApr >= 0;
      const stats = shortIsA ? sA : statsFor(aShort.map((p) => ({ hour: p.hour, rate: -p.rate })));
      const [short, long] = shortIsA ? [a, b] : [b, a];
      return {
        short,
        long,
        currentApr: ((short.fundingHourly ?? 0) - (long.fundingHourly ?? 0)) * 8760 * 100,
        stats,
        projectedHourly: (stats.d7.avgApr ?? 0) / 8760 / 100,
        projectedFrom: 'avg7d',
        stability: stabilityOf(stats.d7)
      };
    }
  }
  const [short, long] = fa >= fb ? [a, b] : [b, a];
  const hourly = (short.fundingHourly ?? 0) - (long.fundingHourly ?? 0);
  return { short, long, currentApr: hourly * 8760 * 100, stats: null, projectedHourly: hourly, projectedFrom: 'current', stability: 'unknown' };
}

const qStatus = (q: { data?: unknown; isError: boolean }) => (q.data ? 'ready' : q.isError ? 'error' : 'loading');

/** نامزدها + تاریخچهٔ ۳۰ روزه + دفتر سفارش هر دو طرف (کش مشترک بین تب‌ها) */
/** فهرست نامزدها ۱۰ دقیقه ثابت می‌ماند تا هر تیک فاندینگ درخواست‌های تازه (و ۴۲۹) نسازد */
const CANDIDATE_TTL_MS = 10 * 60_000;

export function useFundingOpportunities(books: Record<DeltaVenue, VenueBook>, limit = 10): Opportunity[] {
  const frozen = useRef<{ keys: string[]; at: number; ready: string } | null>(null);
  const ready = (['arcus', 'ondo', 'lighter'] as const).map((v) => `${v}:${books[v].quotes.length > 0}`).join();
  const candidates = useMemo(() => {
    const keyOf = (c: { base: string; a: VenueQuote; b: VenueQuote }) => `${c.base}|${c.a.venue}:${c.a.ref}|${c.b.venue}:${c.b.ref}`;
    const f = frozen.current;
    if (!f || !f.keys.length || f.ready !== ready || Date.now() - f.at > CANDIDATE_TTL_MS) {
      frozen.current = { keys: pickCandidates(books, limit).map(keyOf), at: Date.now(), ready };
    }
    // همان جفت‌ها با تازه‌ترین نرخ لحظه‌ای
    const all = new Map(pickCandidates(books, Number.MAX_SAFE_INTEGER).map((c) => [keyOf(c), c]));
    return frozen.current!.keys.flatMap((k) => all.get(k) ?? []);
  }, [books, limit, ready]);
  const legs = useMemo(() => {
    const seen = new Map<string, VenueQuote>();
    for (const c of candidates) for (const q of [c.a, c.b]) seen.set(`${q.venue}:${q.ref}`, q);
    return [...seen.values()];
  }, [candidates]);

  const history = useQueries({
    queries: legs.map((q) => ({
      queryKey: ['funding-history', q.venue, q.ref],
      queryFn: () => fetchFundingHistory(q.venue, q.ref),
      staleTime: 10 * 60_000,
      gcTime: 30 * 60_000,
      retry: 1
    }))
  });
  const orderBooks = useQueries({
    queries: legs.map((q) => ({
      queryKey: ['order-book', q.venue, q.ref],
      queryFn: () => fetchOrderBook(q.venue, q.ref),
      staleTime: 60_000,
      refetchInterval: 120_000,
      retry: 1
    }))
  });

  // dataUpdatedAt + وضعیت هر query تغییر داده را نشان می‌دهد؛ آرایه‌های useQueries در هر رندر تازه‌اند
  const historyStamp = history.map((h) => `${qStatus(h)}@${h.dataUpdatedAt}`).join();
  const bookStamp = orderBooks.map((b) => `${qStatus(b)}@${b.dataUpdatedAt}`).join();

  return useMemo(() => {
    const now = Date.now();
    const idx = new Map(legs.map((q, i) => [`${q.venue}:${q.ref}`, i]));
    const at = (q: VenueQuote) => idx.get(`${q.venue}:${q.ref}`) ?? -1;
    const pair = (list: { data?: unknown; isError: boolean }[], i: number, j: number): 'loading' | 'ready' | 'error' => {
      const a = list[i] ? qStatus(list[i]) : 'loading';
      const b = list[j] ? qStatus(list[j]) : 'loading';
      return a === 'error' || b === 'error' ? 'error' : a === 'ready' && b === 'ready' ? 'ready' : 'loading';
    };
    return candidates.map((c): Opportunity => {
      const ia = at(c.a);
      const ib = at(c.b);
      const core = buildOpportunity(c.a, c.b, history[ia]?.data, history[ib]?.data, now);
      const bookOf = (q: VenueQuote) => orderBooks[at(q)]?.data ?? null;
      return {
        key: `${c.base}:${core.short.venue}>${core.long.venue}`,
        base: c.base,
        ...core,
        historyStatus: pair(history, ia, ib),
        longBook: bookOf(core.long),
        shortBook: bookOf(core.short),
        bookStatus: pair(orderBooks, ia, ib)
      };
    });
    // history/orderBooks عمداً در وابستگی‌ها نیستند — stampها هر تغییرشان را پوشش می‌دهند
  }, [candidates, legs, historyStamp, bookStamp]);
}
