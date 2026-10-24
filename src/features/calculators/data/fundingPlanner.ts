/**
 * داده‌های برنامه‌ریز فاندینگ — نمادهای صرافی‌های دارینو، فاندینگ ۷ روزهٔ هر صرافی، دفتر سفارش و بازارهای Boros
 *
 *  نمادها        اجتماع بازارهای همهٔ صرافی‌های دلتا (useDeltaBooks)، گروه‌بندی با نماد پایه
 *  فاندینگ مبنا   میانگین نرخ‌های تسویه‌شدهٔ ۷ روز همان بازار (≥ ۴۸ ساعت داده)، وگرنه نرخ لحظه‌ای
 *  Boros         بازارهای رسمی (fetchBorosMarkets، کش ۳ دقیقه)؛ فقط Hyperliquid اصلی و Lighter در دارینو قابل اجرا هستند
 *                بازار اسپرد HL − Gate هم ساخته می‌شود ولی پای Gate بیرون از دارینو است (external)
 */
import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { fetchBorosMarkets } from '@/features/boros/data/borosService';
import type { BorosMarket } from '@/features/boros/domain/types';
import { slippagePct, type PlanBorosLock, type PlanKind, type PlanPerpLeg, type PlanSpec, type RatePoint } from '@/features/calculators/domain';
import type { PerpCategory } from './perpMarkets';
import { DELTA_VENUE_LABELS, type DeltaVenue, type VenueBook, type VenueQuote } from './deltaMarkets';
import { fetchFundingHistory, fetchOrderBook, type OrderBook } from './fundingHistory';

/** کارمزد تیکر محافظه‌کارانه وقتی API مقدار نمی‌دهد (٪) */
const FALLBACK_TAKER_PCT = 0.05;
const FALLBACK_MMF = 0.05;
/** مارجین نگهداری محافظه‌کارانهٔ پای Gate (داده‌اش در دارینو نیست) */
const GATE_MMF = 0.01;
const DAY_SEC = 86_400;
const VENUE_ORDER: readonly DeltaVenue[] = ['hyperliquid', 'lighter', 'lighterRh', 'arcus', 'ondo', 'qfex', 'txflow'];

/* ---------------- نمادها ---------------- */

export type SymbolGroup = 'crypto' | 'equity' | 'commodity' | 'index';

export const SYMBOL_GROUP_LABELS: Record<SymbolGroup, string> = {
  crypto: 'رمزارز',
  equity: 'سهام و ETF توکنیزه',
  commodity: 'کالا',
  index: 'شاخص'
};

export interface PlannerSymbol {
  base: string;
  nameFa: string;
  group: SymbolGroup;
  quotes: VenueQuote[];
  venues: DeltaVenue[];
  /** بازار Boros قابل اجرا در دارینو دارد */
  hasBoros: boolean;
  volume24hUsd: number;
}

/** دقیق‌ترین دسته بین صرافی‌ها: بعضی صرافی‌ها سهام را «other/crypto» برچسب می‌زنند */
function groupOf(categories: readonly PerpCategory[]): SymbolGroup {
  for (const g of ['equity', 'commodity', 'index'] as const) if (categories.includes(g)) return g;
  return 'crypto';
}

/** پای Boros قابل اجرا: Hyperliquid اصلی (نه HIP-3) و Lighter mainnet */
export function borosVenueOf(q: VenueQuote): string | null {
  if (q.venue === 'hyperliquid' && !q.builderDex) return 'Hyperliquid';
  if (q.venue === 'lighter') return 'Lighter';
  return null;
}

export const isSpread = (m: BorosMarket) => m.isSpreadMarket === true || m.fundingRateSymbol.startsWith('spread-');

/** بازار Boros که در برنامه‌ریز کاربرد دارد: Hyperliquid و Lighter (قابل اجرا) + اسپرد HL − Gate (فقط ماشین‌حساب) */
export const isPlannerBoros = (m: BorosMarket) => isSpread(m) || m.venue === 'Hyperliquid' || m.venue === 'Lighter';

/** بازارهای Boros فعال یک نماد (بدون سررسیدهای کمتر از ۱ روز و بدون سفارش مقابل) */
export function activeBoros(markets: readonly BorosMarket[], base: string, nowSec: number): BorosMarket[] {
  return markets.filter(
    (m) =>
      m.asset.toUpperCase() === base.toUpperCase() &&
      (m.status === undefined || m.status === 'GOOD') &&
      m.maturity - nowSec > DAY_SEC &&
      (m.bestBid > 0 || m.bestAsk > 0)
  );
}

export function listSymbols(books: Record<DeltaVenue, VenueBook>, boros: readonly BorosMarket[], nowSec: number): PlannerSymbol[] {
  const byBase = new Map<string, VenueQuote[]>();
  for (const v of VENUE_ORDER)
    for (const q of books[v].quotes) {
      if (q.fundingHourly === null || !Number.isFinite(q.fundingHourly)) continue;
      const key = q.base.toUpperCase();
      byBase.set(key, [...(byBase.get(key) ?? []), q]);
    }
  return [...byBase.entries()]
    .map(([base, quotes]): PlannerSymbol => {
      const live = activeBoros(boros, base, nowSec).filter((m) => !isSpread(m));
      return {
        base,
        nameFa: (quotes.find((q) => q.nameFa && q.nameFa !== q.base) ?? quotes[0]).nameFa,
        group: groupOf(quotes.map((q) => q.category)),
        quotes,
        venues: [...new Set(quotes.map((q) => q.venue))],
        hasBoros: quotes.some((q) => live.some((m) => m.venue === borosVenueOf(q))),
        volume24hUsd: quotes.reduce((s, q) => s + (q.volume24hUsd ?? 0), 0)
      };
    })
    .sort((a, b) => b.venues.length - a.venues.length || b.volume24hUsd - a.volume24hUsd);
}

/* ---------------- فاندینگ مبنا ---------------- */

export interface LegData {
  quote: VenueQuote;
  /** ٪ سالانه؛ مثبت = لانگ می‌پردازد */
  currentApr: number;
  avg7dApr: number | null;
  /** مبنای پیش‌بینی */
  fundingApr: number;
  basis: 'avg7d' | 'current';
  historyStatus: 'loading' | 'ready' | 'error';
  book: OrderBook | null;
  bookStatus: 'loading' | 'ready' | 'error';
}

/** میانگین نرخ ساعتی ۷ روز اخیر به ٪ سالانه؛ کمتر از ۴۸ ساعت داده = null */
export function avgFundingApr(points: readonly RatePoint[] | undefined, now: number, hours = 7 * 24): number | null {
  if (!points?.length) return null;
  const from = now - hours * 3_600_000;
  const seen = new Map<number, number>();
  for (const p of points) if (p.hour >= from && p.hour <= now && Number.isFinite(p.rate)) seen.set(p.hour, p.rate);
  if (seen.size < 48) return null;
  let sum = 0;
  for (const r of seen.values()) sum += r;
  return (sum / seen.size) * 8760 * 100;
}

const qStatus = (q: { data?: unknown; isError: boolean }): 'loading' | 'ready' | 'error' => (q.data ? 'ready' : q.isError ? 'error' : 'loading');

/** تاریخچه و دفتر سفارش همهٔ بازارهای یک نماد (همان کلیدهای کش اسکنر) */
export function useSymbolLegs(quotes: readonly VenueQuote[]): LegData[] {
  const history = useQueries({
    queries: quotes.map((q) => ({
      queryKey: ['funding-history', q.venue, q.ref],
      queryFn: () => fetchFundingHistory(q.venue, q.ref),
      staleTime: 10 * 60_000,
      gcTime: 30 * 60_000,
      retry: 1
    }))
  });
  const books = useQueries({
    queries: quotes.map((q) => ({
      queryKey: ['order-book', q.venue, q.ref],
      queryFn: () => fetchOrderBook(q.venue, q.ref),
      staleTime: 60_000,
      refetchInterval: 120_000,
      retry: 1
    }))
  });
  const stamp = [...history, ...books].map((x) => `${qStatus(x)}@${x.dataUpdatedAt}`).join();
  return useMemo(() => {
    const now = Date.now();
    return quotes.map((quote, k): LegData => {
      const currentApr = (quote.fundingHourly ?? 0) * 8760 * 100;
      const avg7dApr = avgFundingApr(history[k]?.data, now);
      return {
        quote,
        currentApr,
        avg7dApr,
        fundingApr: avg7dApr ?? currentApr,
        basis: avg7dApr === null ? 'current' : 'avg7d',
        historyStatus: history[k] ? qStatus(history[k]) : 'loading',
        book: books[k]?.data ?? null,
        bookStatus: books[k] ? qStatus(books[k]) : 'loading'
      };
    });
    // history/books در stamp آمده‌اند
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, stamp]);
}

export function useBorosPlannerMarkets() {
  return useQuery({
    queryKey: ['planner-boros-markets'],
    queryFn: fetchBorosMarkets,
    staleTime: 3 * 60_000,
    refetchInterval: 3 * 60_000,
    retry: 1
  });
}

/* ---------------- ساخت برنامه‌ها ---------------- */

export type FeeMode = 'taker' | 'maker';

export interface PlanOption {
  spec: PlanSpec;
  /** دادهٔ هر پای پرپ (null = پای بیرونی Gate) */
  legs: (LegData | null)[];
  borosMarkets: BorosMarket[];
}

export interface BuildOptions {
  nowSec: number;
  feeMode: FeeMode;
  /** کارمزد هر معامله در Gate (٪) */
  gateFeePct: number;
}

export function legLabel(q: VenueQuote): string {
  return q.builderDex ? `${DELTA_VENUE_LABELS[q.venue]} (${q.builderDex})` : DELTA_VENUE_LABELS[q.venue];
}

function perpLeg(d: LegData, side: 'long' | 'short', feeMode: FeeMode): PlanPerpLeg {
  const q = d.quote;
  const taker = q.takerFeePct ?? FALLBACK_TAKER_PCT;
  return {
    key: `${q.venue}:${q.ref}`,
    venue: legLabel(q),
    side,
    fundingApr: d.fundingApr,
    feePct: feeMode === 'maker' ? q.makerFeePct ?? taker : taker,
    // maker = بدون اسلیپیج؛ taker از دفتر سفارش (بعد از معلوم شدن نوتیونال پر می‌شود)
    slipPct: feeMode === 'maker' ? 0 : null,
    maxLeverage: q.maxLeverage,
    mmf: q.maintenanceMarginFraction ?? FALLBACK_MMF
  };
}

const daysTo = (m: BorosMarket, nowSec: number) => (m.maturity - nowSec) / DAY_SEC;

function borosLock(m: BorosMarket, side: 'long' | 'short', locks: number[], nowSec: number): PlanBorosLock | null {
  const fixedRate = side === 'short' ? m.bestBid : m.bestAsk;
  if (!(fixedRate > 0) && !(fixedRate < 0)) return null;
  return {
    marketId: m.marketId,
    side,
    fixedRate,
    takerFee: m.takerFee,
    settleFeeRate: m.settleFeeRate,
    marginFloor: m.marginFloor,
    kIM: m.kIM,
    kMM: m.kMM,
    ytmFloor: m.ytmFloor ?? 0.014,
    daysToMaturity: daysTo(m, nowSec),
    locks
  };
}

const borosOf = (markets: readonly BorosMarket[], d: LegData) => {
  const v = borosVenueOf(d.quote);
  return v ? markets.filter((m) => !isSpread(m) && m.venue === v) : [];
};

/**
 * همهٔ برنامه‌های قابل محاسبه برای یک نماد:
 *  perpPerp     هر جفت صرافی؛ شورت روی فاندینگ بیشتر
 *  spotPerp     خرید اسپات + شورت پرپ (فقط فاندینگ مثبت)
 *  borosSpot    اسپات + شورت پرپ HL/Lighter + Short YU همان بازار → کل درآمد ثابت
 *  borosPair    پرپ–پرپ با قفل یک یا هر دو پا (هم‌سررسید)
 *  borosSpread  شورت HL + لانگ Gate + Short YU بازار اسپرد (پای Gate بیرون از دارینو)
 */
export function buildPlans(legs: readonly LegData[], boros: readonly BorosMarket[], o: BuildOptions): PlanOption[] {
  const out: PlanOption[] = [];
  const add = (kind: PlanKind, plan: Omit<PlanOption, 'spec'> & { spot: boolean; perps: PlanPerpLeg[]; locks: PlanBorosLock[] }) => {
    const id = [kind, ...plan.perps.map((l) => `${l.side}@${l.key}`), ...plan.locks.map((b) => `${b.side}#${b.marketId}`)].join('|');
    out.push({ spec: { id, kind, perps: plan.perps, spot: plan.spot, boros: plan.locks }, legs: plan.legs, borosMarkets: plan.borosMarkets });
  };

  legs.forEach((d, i) => {
    if (d.fundingApr > 0) add('spotPerp', { spot: true, perps: [perpLeg(d, 'short', o.feeMode)], locks: [], legs: [d], borosMarkets: [] });
    for (const m of borosOf(boros, d)) {
      const lock = borosLock(m, 'short', [0], o.nowSec);
      if (lock) add('borosSpot', { spot: true, perps: [perpLeg(d, 'short', o.feeMode)], locks: [lock], legs: [d], borosMarkets: [m] });
    }
    for (let j = i + 1; j < legs.length; j++) {
      const e = legs[j];
      if (d.quote.venue === e.quote.venue) continue;
      const [short, long] = d.fundingApr >= e.fundingApr ? [d, e] : [e, d];
      const perps = [perpLeg(short, 'short', o.feeMode), perpLeg(long, 'long', o.feeMode)];
      add('perpPerp', { spot: false, perps, locks: [], legs: [short, long], borosMarkets: [] });
      const sMarkets = borosOf(boros, short);
      const lMarkets = borosOf(boros, long);
      for (const sm of sMarkets) {
        const lock = borosLock(sm, 'short', [0], o.nowSec);
        if (lock) add('borosPair', { spot: false, perps, locks: [lock], legs: [short, long], borosMarkets: [sm] });
      }
      for (const lm of lMarkets) {
        const lock = borosLock(lm, 'long', [1], o.nowSec);
        if (lock) add('borosPair', { spot: false, perps, locks: [lock], legs: [short, long], borosMarkets: [lm] });
        const sm = sMarkets.find((m) => m.maturity === lm.maturity);
        const sLock = sm && borosLock(sm, 'short', [0], o.nowSec);
        if (sm && sLock && lock) add('borosPair', { spot: false, perps, locks: [sLock, lock], legs: [short, long], borosMarkets: [sm, lm] });
      }
    }
  });

  // اسپرد HL − Gate: شناور = فاندینگ HL − فاندینگ Gate
  const hl = legs.find((d) => d.quote.venue === 'hyperliquid' && !d.quote.builderDex);
  const base = legs[0]?.quote.base;
  if (hl && base) {
    for (const m of activeBoros(boros, base, o.nowSec).filter(isSpread)) {
      const side = m.bestBid > 0 ? 'short' : 'long';
      const lock = borosLock(m, side, [0, 1], o.nowSec);
      if (!lock) continue;
      // Short YU (دریافت ثابت) ⇐ شورت HL + لانگ Gate؛ Long YU برعکس
      const hlLeg = perpLeg(hl, side, o.feeMode);
      const gate: PlanPerpLeg = {
        key: `gate:${base}`,
        venue: 'گیت',
        side: side === 'short' ? 'long' : 'short',
        fundingApr: hl.fundingApr - m.floatingApr * 100,
        feePct: o.gateFeePct,
        slipPct: null,
        maxLeverage: null,
        mmf: GATE_MMF,
        external: true
      };
      add('borosSpread', { spot: false, perps: [hlLeg, gate], locks: [lock], legs: [hl, null], borosMarkets: [m] });
    }
  }
  return out;
}

/** اسلیپیج پاهای taker از دفتر سفارش زنده در نوتیونال واقعی: لانگ از asks، شورت از bids */
export function withSlippage(p: PlanOption, notional: number): PlanSpec {
  return {
    ...p.spec,
    perps: p.spec.perps.map((l, k) => {
      if (l.slipPct !== null) return l;
      const book = p.legs[k]?.book;
      if (!book) return l;
      return { ...l, slipPct: slippagePct(l.side === 'long' ? book.asks : book.bids, notional, book.mid) };
    })
  };
}
