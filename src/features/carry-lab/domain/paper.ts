/**
 * بات کاغذی کری — منطق خالص (مشترک سرور و رابط)
 *
 *   همان استپر بک‌تست (carryOnBar / carryOnHour) روی دادهٔ زندهٔ هر ساعت اجرا می‌شود؛ پس هر اختلافی
 *   بین کاغذی و بک‌تست از داده/عملیات است، نه از دو پیاده‌سازی متفاوت.
 *   پول واقعی، کلید یا سفارشی در کار نیست. هر تیک فقط ساعت‌های تسویه‌شدهٔ تازه را جلو می‌برد (تکرار بی‌اثر است).
 *
 * سه پوزیشن (بررسی آبان ۱۴۰۵ روی ۲ سال داده):
 *   BTC  هایپرلیکوئید ۳× میکر — تنها حالت «تأییدشده» در هر چهار آزمون
 *   ETH  هایپرلیکوئید ۳× میکر — با سفارش میکر تأیید شد
 *   طلا  لایتر: اسپات XAUT + شورت XAU ۳× — «آزمایشی» (تاریخچهٔ کوتاه؛ کاغذی دادهٔ لازم را جمع می‌کند)
 * قانون مشترک: همیشه باز با ترمز — خروج اگر میانگین فاندینگ ۷ روزه ≤ ۰، ورود دوباره از ۲٪ سالانه.
 */
import {
  carryOnBar,
  carryOnHour,
  carryWarm,
  compactState,
  floorToHour,
  HOUR_MS,
  initCarryState,
  liquidationDistance,
  type CarryEvent,
  type CarryState,
  type CostParams,
  type FundingPoint,
  type PriceBar,
  type Rule
} from './engine.js';

export type PaperVenue = 'hyperliquid' | 'lighter';

export interface PaperStrategy {
  id: 'btc-hl' | 'eth-hl' | 'gold-lt';
  label: string;
  venue: PaperVenue;
  /** نماد هایپرلیکوئید یا market_id لایتر */
  market: string;
  status: 'validated' | 'experimental';
  /** بازده سالانهٔ بک‌تست ۲ سال (آبان ۱۴۰۵) برای مقایسه */
  backtestCagr: number;
  rule: Rule;
  cost: CostParams;
}

export const BRAKE_RULE: Rule = { kind: 'threshold', lookbackH: 168, entryApr: 2, exitApr: 0 };

export const PAPER_STRATEGIES: readonly PaperStrategy[] = [
  {
    id: 'btc-hl',
    label: 'BTC · هایپرلیکوئید',
    venue: 'hyperliquid',
    market: 'BTC',
    status: 'validated',
    backtestCagr: 0.077,
    rule: BRAKE_RULE,
    cost: { leverage: 3, mmrPct: 1.25, perpFeePct: 0.015, spotFeePct: 0.04, slippagePct: 0.01, hurdleApr: 4, idleEarnsHurdle: true }
  },
  {
    id: 'eth-hl',
    label: 'ETH · هایپرلیکوئید',
    venue: 'hyperliquid',
    market: 'ETH',
    status: 'validated',
    backtestCagr: 0.074,
    rule: BRAKE_RULE,
    cost: { leverage: 3, mmrPct: 2, perpFeePct: 0.015, spotFeePct: 0.04, slippagePct: 0.01, hurdleApr: 4, idleEarnsHurdle: true }
  },
  {
    id: 'gold-lt',
    label: 'طلا · لایتر (XAUT + XAU)',
    venue: 'lighter',
    market: '92',
    status: 'experimental',
    backtestCagr: 0.077,
    rule: BRAKE_RULE,
    cost: { leverage: 3, mmrPct: 2, perpFeePct: 0, spotFeePct: 0, slippagePct: 0.05, hurdleApr: 4, idleEarnsHurdle: true }
  }
];

export const NEAR_LIQ_ALERT = 0.8;
const NEAR_LIQ_COOLDOWN_MS = 6 * HOUR_MS;
const EVENT_LOG = 120;
const DAILY_LOG = 800;

export interface PaperEvent {
  at: number;
  strategy: PaperStrategy['id'];
  kind: CarryEvent['kind'] | 'near-liquidation' | 'data-gap';
  price?: number;
  /** کسری از سرمایهٔ همان پوزیشن */
  amount?: number;
}

export interface PaperLeg {
  state: CarryState;
  lastNearAlertAt: number | null;
}

export interface PaperBook {
  version: 1;
  startedAt: number;
  capitalUsd: number;
  running: boolean;
  legs: Record<PaperStrategy['id'], PaperLeg>;
  events: PaperEvent[];
  /** ارزش پایان هر ساعت پردازش‌شده، روزانه (UTC) — کسری از سرمایهٔ هر پا */
  daily: { day: number; equity: Record<string, number> }[];
  lastTickAt: number | null;
  lastErrors: string[];
}

export function newBook(capitalUsd: number, warm: Partial<Record<PaperStrategy['id'], FundingPoint[]>>, now: number): PaperBook {
  const legs = {} as PaperBook['legs'];
  for (const st of PAPER_STRATEGIES) {
    const state = initCarryState(1);
    carryWarm(state, [...(warm[st.id] ?? [])].sort((a, b) => a.hour - b.hour), st.rule);
    legs[st.id] = { state, lastNearAlertAt: null };
  }
  return { version: 1, startedAt: now, capitalUsd, running: true, legs, events: [], daily: [], lastTickAt: null, lastErrors: [] };
}

/**
 * جلو بردن یک پا با دادهٔ تازه؛ فقط ساعت‌های تسویه‌شده بعد از lastHour و کندل‌های بسته‌شده تا همان ساعت.
 * خروجی: رویدادهای این قدم (برای اعلان)
 */
export function advanceLeg(leg: PaperLeg, st: PaperStrategy, funding: readonly FundingPoint[], bars: readonly PriceBar[], now: number): PaperEvent[] {
  const s = leg.state;
  const out: PaperEvent[] = [];
  const ev: CarryEvent[] = [];
  const sortedBars = [...bars].sort((a, b) => a.end - b.end);
  const settled = [...funding].filter((p) => p.hour <= now && (s.lastHour === null || p.hour > s.lastHour)).sort((a, b) => a.hour - b.hour);
  const rLiq = liquidationDistance(st.cost.leverage, st.cost.mmrPct);
  // فاصلهٔ بیش از یک ساعت بین فاندینگ‌ها = قطعی داده (برای پنل اعتماد)
  if (s.lastHour !== null && settled.length && settled[0].hour - s.lastHour > HOUR_MS) out.push({ at: settled[0].hour, strategy: st.id, kind: 'data-gap', amount: (settled[0].hour - s.lastHour) / HOUR_MS - 1 });
  let j = 0;
  for (const p of settled) {
    while (j < sortedBars.length && sortedBars[j].end <= p.hour) {
      const bar = sortedBars[j++];
      const wasOpen = s.open;
      const ref = s.ref;
      carryOnBar(s, bar, st.cost, ev);
      if (wasOpen && s.open && rLiq > 0) {
        const use = (bar.high / ref - 1) / rLiq;
        if (use >= NEAR_LIQ_ALERT && (leg.lastNearAlertAt === null || bar.end - leg.lastNearAlertAt >= NEAR_LIQ_COOLDOWN_MS)) {
          leg.lastNearAlertAt = bar.end;
          out.push({ at: bar.end, strategy: st.id, kind: 'near-liquidation', price: bar.high, amount: use });
        }
      }
    }
    carryOnHour(s, p, st.rule, st.cost, ev);
  }
  for (const e of ev) {
    out.push({
      at: e.at,
      strategy: st.id,
      kind: e.kind,
      price: e.price,
      amount: e.kind === 'enter' ? e.notional : e.kind === 'rebalance' ? e.cost : e.kind === 'liquidation' ? e.loss : undefined
    });
  }
  leg.state = compactState(s, st.rule);
  return out.sort((a, b) => a.at - b.at);
}

/** ثبت ارزش روزانه و رویدادها روی دفتر */
export function recordTick(book: PaperBook, events: PaperEvent[], now: number, errors: string[]): void {
  book.events = [...book.events, ...events].slice(-EVENT_LOG);
  const day = Math.floor(now / 86_400_000) * 86_400_000;
  const equity = Object.fromEntries(PAPER_STRATEGIES.map((st) => [st.id, book.legs[st.id].state.E]));
  const last = book.daily[book.daily.length - 1];
  if (last && last.day === day) last.equity = equity;
  else book.daily.push({ day, equity });
  book.daily = book.daily.slice(-DAILY_LOG);
  book.lastTickAt = now;
  book.lastErrors = errors;
}

/** ساعت بعد از آخرین ساعت پردازش‌شدهٔ همهٔ پاها — اگر تسویه نشده، تیک کاری ندارد */
export function needsTick(book: PaperBook, now: number): boolean {
  if (!book.running) return false;
  const settledHour = floorToHour(now);
  return PAPER_STRATEGIES.some((st) => {
    const h = book.legs[st.id]?.state.lastHour;
    return h === null || h === undefined || h < settledHour;
  });
}

/* ---------------- خلاصه برای رابط ---------------- */

export interface LegSummary {
  id: PaperStrategy['id'];
  usd: number;
  ret: number;
  open: boolean;
  avgAprWindow: number | null;
  peakLiqUse: number;
  breakdown: CarryState['breakdown'];
  entries: number;
}

export function summarize(book: PaperBook, now: number) {
  const share = book.capitalUsd / PAPER_STRATEGIES.length;
  const legs: LegSummary[] = PAPER_STRATEGIES.map((st) => {
    const s = book.legs[st.id].state;
    const lb = st.rule.kind === 'threshold' ? st.rule.lookbackH : 0;
    return {
      id: st.id,
      usd: s.E * share,
      ret: s.E - 1,
      open: s.open,
      avgAprWindow: lb && s.rates.length >= lb ? (s.rates.slice(-lb).reduce((a, b) => a + b, 0) / lb) * 8760 * 100 : null,
      peakLiqUse: s.peakLiqUse,
      breakdown: s.breakdown,
      entries: s.entries
    };
  });
  const totalUsd = legs.reduce((a, l) => a + l.usd, 0);
  const days = Math.max(0, (now - book.startedAt) / 86_400_000);
  const ret = totalUsd / book.capitalUsd - 1;
  const expected = PAPER_STRATEGIES.reduce((a, st) => a + st.backtestCagr, 0) / PAPER_STRATEGIES.length;
  return {
    legs,
    totalUsd,
    ret,
    days,
    /** بازده سالانه‌شده؛ زیر ۷ روز بی‌معنی است */
    annualized: days >= 7 ? (1 + ret) ** (365 / days) - 1 : null,
    expected,
    hurdle: 0.04,
    /** شرط رفتن به مرحلهٔ ۲: ۳۰ روز و فاصلهٔ کمتر از ۲۰٪ از بک‌تست */
    gate: { daysOk: days >= 30, deviation: days >= 7 && expected > 0 ? Math.abs(((1 + ret) ** (365 / days) - 1) / expected - 1) : null }
  };
}

/* ---------------- پارسرهای دادهٔ زنده (سرور) ---------------- */

const fin = (v: unknown): number | null => {
  if ((typeof v !== 'number' && typeof v !== 'string') || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const rows = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []);

/** هایپرلیکوئید fundingHistory → کسری ساعتی */
export const parseHlFunding = (body: unknown): FundingPoint[] =>
  rows(body).flatMap((f) => {
    const t = fin(f.time);
    const r = fin(f.fundingRate);
    return t === null || r === null ? [] : [{ hour: floorToHour(t), rate: r }];
  });

/** لایتر fundings: rate درصد ساعتی، direction=short → شورت می‌پردازد */
export const parseLighterFunding = (body: unknown): FundingPoint[] =>
  rows((body as { fundings?: unknown } | null)?.fundings).flatMap((f) => {
    const ts = fin(f.timestamp);
    const pct = fin(f.rate);
    if (ts === null || pct === null) return [];
    return [{ hour: floorToHour(ts * 1000), rate: ((f.direction === 'short' ? -1 : 1) * pct) / 100 }];
  });

/** کندل ساعتی هایپرلیکوئید ({t,h,l,c}) یا لایتر ({c: [{t,h,l,c}]}) */
export const parseHourBars = (body: unknown): PriceBar[] =>
  rows(Array.isArray(body) ? body : (body as { c?: unknown } | null)?.c).flatMap((c) => {
    const t = fin(c.t);
    const h = fin(c.h);
    const l = fin(c.l);
    const cl = fin(c.c);
    return t === null || h === null || cl === null || cl <= 0 ? [] : [{ end: t + HOUR_MS, high: h, low: l ?? cl, close: cl }];
  });
