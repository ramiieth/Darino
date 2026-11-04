/**
 * برنامهٔ خودکار — بدون تایپ: از خود معامله و سفارش‌های استاپ (SL) و هدف (TP) که روی صرافی گذاشته شده
 *
 *   ورود   = میانگین قیمت ورود واقعی · اندازه = بیشترین اندازهٔ پوزیشن
 *   استاپ  = اولین SL سمتِ بستن که از ۶ ساعت قبل (نه پیش از بستن معاملهٔ قبلی همان نماد) تا بستن گذاشته شده و هنگام ورود زنده بوده
 *            (سمت درست ورود: لانگ زیر ورود، شورت بالای آن). دیرتر از ۱۵ دقیقه = «استاپ دیر».
 *   جابه‌جایی = آخرین SL قبل از بستن در برابر اولی: دورتر = ریسک بیشتر از برنامه، نزدیک‌تر = قفل سود/سربه‌سر
 *   هدف    = اولین TP سمت درست
 *   چشم‌انداز = از کندل‌های روزانهٔ قبل از ورود (سوگیری هفتگی/روزانه، روند یا رنج، هم‌جهت با روند)
 * برنامهٔ خودکار «ثبت» است نه «برنامهٔ قبل از ورود»؛ پوشش برنامه و تعهد «هیچ ورودی بدون برنامه» فقط برنامهٔ نوشته‌شده را می‌شمارند.
 * لایتر با توکن فقط‌خواندنی سرور خوانده می‌شود؛ بدون توکن → stopSource = unreadable، نه «بدون استاپ».
 */
import type { AutoPlanMeta, Bias, ClassifiedTrade, MarketOutlook, TradePlan, TriggerOrder, YesNo } from './types';
import type { JournalAccount } from './types';
import type { Candle } from './excursions';
import { emptyOutlook } from './plan';
import { usToMs } from './fills';
import { baseOf as baseOfSymbol } from './roundTrips';

const MIN = 60_000;
const BEFORE_OPEN = 6 * 60 * MIN;
const LATE = 15 * MIN;

type Raw = Record<string, unknown>;
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const rows = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter((x): x is Raw => !!x && typeof x === 'object') : []);

/* ---------------- نرمال‌سازی سفارش‌ها ---------------- */

/** هایپرلیکوئید / تی‌اکس‌فلو: info historicalOrders → [{ order: {coin, side, triggerPx, orderType, timestamp, oid, isTrigger}, status, statusTimestamp }] */
export function fromHlOrders(acc: Pick<JournalAccount, 'key'>, raw: unknown): TriggerOrder[] {
  return rows(raw).flatMap((r): TriggerOrder[] => {
    const o = (r.order && typeof r.order === 'object' ? r.order : r) as Raw;
    const type = String(o.orderType ?? '');
    const kind = /stop/i.test(type) ? 'sl' : /take profit/i.test(type) ? 'tp' : null;
    const px = num(o.triggerPx), at = num(o.timestamp);
    const coin = typeof o.coin === 'string' ? o.coin : '';
    if (!kind || !px || at === null || !coin || coin.startsWith('@') || (o.side !== 'B' && o.side !== 'A')) return [];
    const status = String(r.status ?? 'open');
    return [{ id: `${acc.key}|o:${String(o.oid ?? `${at}:${px}`)}`, account: acc.key, symbol: coin, kind, side: o.side === 'B' ? 'buy' : 'sell', triggerPx: px, placedAt: at, endedAt: status === 'open' ? null : num(r.statusTimestamp), status }];
  });
}

/** آرکوس: /v1/orders (tpslType، triggerPrice، زمان میکروثانیه) */
export function fromArcusOrders(acc: Pick<JournalAccount, 'key'>, raw: unknown): TriggerOrder[] {
  return rows(raw).flatMap((o): TriggerOrder[] => {
    const kind = o.tpslType === 'STOP_LOSS' ? 'sl' : o.tpslType === 'TAKE_PROFIT' ? 'tp' : null;
    const px = num(o.triggerPrice), at = usToMs(o.createdAt ?? o.updatedAt);
    const sym = typeof o.marketDisplayName === 'string' ? o.marketDisplayName : '';
    if (!kind || !px || at === null || !sym || (o.side !== 'BUY' && o.side !== 'SELL')) return [];
    const status = String(o.status ?? '');
    const live = /^(open|new|pending|untriggered|partially)/i.test(status);
    return [{ id: `${acc.key}|o:${String(o.orderId)}`, account: acc.key, symbol: sym, kind, side: o.side === 'BUY' ? 'buy' : 'sell', triggerPx: px, placedAt: at, endedAt: live ? null : usToMs(o.updatedAt), status }];
  });
}

/** لایتر: خلاصهٔ سرور (api/_perpsRead.ts → trimLighterOrder)؛ زمان‌ها میلی‌ثانیه */
export interface LighterOrderLite { id: string; sym: string; kind: 'sl' | 'tp'; side: 'buy' | 'sell'; trigger: number; placed: number; ended: number | null; status: string }

export function fromLighterOrders(acc: Pick<JournalAccount, 'key'>, list: readonly LighterOrderLite[]): TriggerOrder[] {
  return list.filter((o) => o.trigger > 0 && o.placed > 0 && o.sym).map((o) => ({
    id: `${acc.key}|o:${o.id}`, account: acc.key, symbol: o.sym, kind: o.kind, side: o.side, triggerPx: o.trigger, placedAt: o.placed, endedAt: o.ended, status: o.status
  }));
}

/* ---------------- استاپ و هدف هر معامله ---------------- */

export interface OrderCoverage {
  /** از این زمان به بعد سفارش‌های حساب کامل خوانده شده؛ null = پلتفرم سفارش عمومی نمی‌دهد */
  from: number | null;
  why: string | null;
}

export interface Levels {
  stop: number | null;
  target: number | null;
  meta: Omit<AutoPlanMeta, 'outlookAuto'>;
}

/** `prevClose`: بستن معاملهٔ قبلی همین حساب و نماد — سفارشی که قبل از آن گذاشته شده مال آن معامله است */
export function levelsFor(t: ClassifiedTrade, orders: readonly TriggerOrder[], cov: OrderCoverage | undefined, now: number, prevClose: number | null = null): Levels {
  const none = (stopSource: AutoPlanMeta['stopSource'], why: string | null = null): Levels => ({ stop: null, target: null, meta: { stopSource, unreadableWhy: why, stopLateMin: null, finalStop: null, stopMoved: null } });
  if (!cov || cov.from === null) return none('unreadable', cov?.why ?? 'سفارش‌های این پلتفرم عمومی خوانده نمی‌شود.');
  // پوزیشن بازی که شروعش خارج از تاریخچه است: سفارش‌های زندهٔ فعلی (SL/TP روی صرافی) همچنان معتبرند
  const liveOnly = t.open && t.truncated;
  if (t.openTime < cov.from && !t.open) return none('unreadable', 'این معامله قدیمی‌تر از تاریخچهٔ سفارش‌هایی است که صرافی می‌دهد.');
  if (t.entryPx === null) return none('none');
  const long = t.direction === 'long';
  const closeSide = long ? 'sell' : 'buy';
  const end = t.closeTime ?? now;
  const start = Math.max(t.openTime - BEFORE_OPEN, prevClose ?? -Infinity);
  const base = baseOfSymbol(t.symbol);
  const mine = orders
    .filter((o) => o.account === t.account && (o.symbol === t.symbol || baseOfSymbol(o.symbol) === base) && o.side === closeSide)
    .filter((o) => (liveOnly ? o.endedAt === null && o.placedAt <= end && (prevClose === null || o.placedAt >= prevClose) : o.placedAt >= start && o.placedAt <= end && (o.endedAt === null || o.endedAt >= t.openTime)))
    .sort((a, b) => a.placedAt - b.placedAt);
  if (!mine.length && t.openTime < cov.from) return none('unreadable', 'این معامله قدیمی‌تر از تاریخچهٔ سفارش‌هایی است که صرافی می‌دهد.');
  const entry = t.entryPx;
  const sls = mine.filter((o) => o.kind === 'sl');
  const first = sls.find((o) => (long ? o.triggerPx < entry : o.triggerPx > entry)) ?? null;
  const tp = mine.find((o) => o.kind === 'tp' && (long ? o.triggerPx > entry : o.triggerPx < entry)) ?? null;
  if (!first) return { ...none('none'), target: tp?.triggerPx ?? null };
  const last = sls[sls.length - 1];
  const eps = Math.abs(first.triggerPx) * 1e-6;
  const diff = (last.triggerPx - first.triggerPx) * (long ? 1 : -1);
  return {
    stop: first.triggerPx,
    target: tp?.triggerPx ?? null,
    meta: {
      stopSource: 'exchange',
      unreadableWhy: null,
      stopLateMin: !liveOnly && first.placedAt - t.openTime > LATE ? Math.round((first.placedAt - t.openTime) / MIN) : null,
      finalStop: last.triggerPx,
      stopMoved: Math.abs(diff) <= eps ? 'none' : diff > 0 ? 'tighter' : 'wider'
    }
  };
}

/* ---------------- چشم‌انداز خودکار از کندل روزانه ---------------- */

const DAY = 86_400_000;

function ema(xs: readonly number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  xs.forEach((x, i) => out.push(i === 0 ? x : x * k + out[i - 1] * (1 - k)));
  return out;
}
const sma = (xs: readonly number[], n: number, end = xs.length) => xs.slice(end - n, end).reduce((s, x) => s + x, 0) / n;

function bias(close: number, now: number, before: number): Bias {
  if (close > now && now > before) return 'bullish';
  if (close < now && now < before) return 'bearish';
  return 'neutral';
}

/**
 * فقط کندل‌های روزانهٔ بسته‌شده قبل از `at`. حداقل ۶۰ روز.
 *   روزانه: بستهٔ آخر در برابر EMA۲۰ و شیب آن (۵ روز) · هفتگی: در برابر میانگین ۵۰ روزه (~۱۰ هفته) و شیب ۱۰ روزه
 *   محیط: نسبت کارایی ۲۰ روز (|جابه‌جایی خالص| ÷ مجموع حرکت‌ها) ≥ ۰٫۳ روند، ≤ ۰٫۱۸ رنج
 */
export function autoOutlook(daily: readonly Candle[], at: number, direction: 'long' | 'short'): MarketOutlook | null {
  const closed = daily.filter((c) => c.t + DAY <= at);
  if (closed.length < 60) return null;
  const cs = closed.map((c) => c.c);
  const last = cs[cs.length - 1];
  const e = ema(cs, 20);
  const dailyBias = bias(last, e[e.length - 1], e[e.length - 6]);
  const weeklyBias = bias(last, sma(cs, 50), sma(cs, 50, cs.length - 10));
  const w = cs.slice(-21);
  let path = 0;
  for (let i = 1; i < w.length; i++) path += Math.abs(w[i] - w[i - 1]);
  const er = path > 0 ? Math.abs(w[w.length - 1] - w[0]) / path : 0;
  const env = er >= 0.3 ? 'trend' : er <= 0.18 ? 'range' : 'unknown';
  const want: Bias = direction === 'long' ? 'bullish' : 'bearish';
  const proTrend: YesNo = dailyBias === 'neutral' ? '-' : dailyBias === want ? 'y' : 'n';
  const fa = (b: Bias) => (b === 'bullish' ? 'بالای' : b === 'bearish' ? 'زیر' : 'حوالی');
  return {
    ...emptyOutlook(),
    weeklyBias,
    weeklyNote: `خودکار: قیمت ${fa(weeklyBias)} میانگین ۵۰ روزه`,
    dailyBias,
    dailyNote: `خودکار: قیمت ${fa(dailyBias)} میانگین ۲۰ روزه`,
    env,
    proTrend
  };
}

/* ---------------- ساخت برنامه‌های خودکار ---------------- */

/**
 * برای هر معاملهٔ جهت‌داری که برنامهٔ نوشته‌شده ندارد، یک برنامهٔ خودکار (ذخیره نمی‌شود).
 * `outlookOf` چشم‌انداز لحظهٔ ورود را می‌دهد (اگر کندل در دسترس باشد).
 */
export function autoPlans(
  trades: readonly ClassifiedTrade[],
  manual: ReadonlyMap<string, TradePlan>,
  orders: readonly TriggerOrder[],
  coverage: ReadonlyMap<string, OrderCoverage>,
  now: number,
  outlookOf?: (t: ClassifiedTrade) => MarketOutlook | null
): Map<string, TradePlan> {
  const out = new Map<string, TradePlan>();
  const byAccount = new Map<string, TriggerOrder[]>();
  for (const o of orders) (byAccount.get(o.account) ?? byAccount.set(o.account, []).get(o.account)!).push(o);
  const prevClose = new Map<string, number | null>();
  const lastClose = new Map<string, number>();
  for (const t of [...trades].sort((a, b) => a.openTime - b.openTime)) {
    const k = `${t.account}|${t.symbol}`;
    prevClose.set(t.id, lastClose.get(k) ?? null);
    if (t.closeTime !== null) lastClose.set(k, Math.max(lastClose.get(k) ?? 0, t.closeTime));
  }
  for (const t of trades) {
    // جهت‌دار: همه · نوترال: فقط پوزیشن باز (تا هر پوزیشن زنده در «برنامهٔ معامله» دیده شود)
    if ((t.book !== 'directional' && !t.open) || manual.has(t.id)) continue;
    const lv = levelsFor(t, byAccount.get(t.account) ?? [], coverage.get(t.account), now, prevClose.get(t.id) ?? null);
    const outlook = outlookOf?.(t) ?? null;
    out.set(t.id, {
      id: `auto:${t.id}`,
      createdAt: t.openTime,
      updatedAt: t.closeTime ?? t.openTime,
      symbol: t.symbol,
      direction: t.direction,
      account: t.account,
      entry: t.entryPx,
      stop: lv.stop,
      target: lv.target,
      size: t.maxSize,
      leverage: null,
      setupTags: [],
      entryWhy: '',
      stopWhy: '',
      targetWhy: '',
      confluences: [],
      reasonsAgainst: [],
      outlook: outlook ?? emptyOutlook(),
      status: 'taken',
      linkedTradeId: t.id,
      validHours: 0,
      notes: '',
      source: 'auto',
      auto: { ...lv.meta, outlookAuto: !!outlook }
    });
  }
  return out;
}

/* ---------------- گزارش ---------------- */

export interface AutoReport {
  trades: number;
  readable: number;
  withStop: number;
  late: number;
  widened: number;
  tightened: number;
  withTarget: number;
  overRisk: number;
  avgRiskPct: number | null;
  /** معاملات بسته با استاپ: میانگین R واقعی */
  avgR: number | null;
  /** زیان بیشتر از ۱٫۱ برابر ریسک استاپ */
  stopBreaches: number;
  counterTrend: { n: number; net: number };
  withTrend: { n: number; net: number };
  noStopNet: number;
}

export function autoReport(trades: readonly ClassifiedTrade[], plans: ReadonlyMap<string, TradePlan>, accountSize: number | null, maxRiskPct: number): AutoReport {
  const r: AutoReport = { trades: 0, readable: 0, withStop: 0, late: 0, widened: 0, tightened: 0, withTarget: 0, overRisk: 0, avgRiskPct: null, avgR: null, stopBreaches: 0, counterTrend: { n: 0, net: 0 }, withTrend: { n: 0, net: 0 }, noStopNet: 0 };
  const risks: number[] = [];
  const rs: number[] = [];
  for (const t of trades) {
    const p = plans.get(t.id);
    if (!p || t.book !== 'directional') continue;
    r.trades++;
    const a = p.auto;
    if (a?.stopSource !== 'unreadable') r.readable++;
    if (p.target !== null) r.withTarget++;
    if (!t.open && p.outlook.proTrend === 'n') { r.counterTrend.n++; r.counterTrend.net += t.netPnl; }
    if (!t.open && p.outlook.proTrend === 'y') { r.withTrend.n++; r.withTrend.net += t.netPnl; }
    if (p.stop === null || p.entry === null) {
      if (a?.stopSource === 'none' && !t.open) r.noStopNet += t.netPnl;
      continue;
    }
    r.withStop++;
    if (a?.stopLateMin) r.late++;
    if (a?.stopMoved === 'wider') r.widened++;
    if (a?.stopMoved === 'tighter') r.tightened++;
    const riskUsd = t.maxSize * Math.abs(p.entry - p.stop);
    if (accountSize && riskUsd > 0) {
      const pct = (riskUsd / accountSize) * 100;
      risks.push(pct);
      if (pct > maxRiskPct) r.overRisk++;
    }
    if (!t.open && riskUsd > 0) {
      const R = t.netPnl / riskUsd;
      rs.push(R);
      if (R < -1.1) r.stopBreaches++;
    }
  }
  r.avgRiskPct = risks.length ? risks.reduce((s, x) => s + x, 0) / risks.length : null;
  r.avgR = rs.length ? rs.reduce((s, x) => s + x, 0) / rs.length : null;
  return r;
}
