/**
 * موتور بک‌تست کری فاندینگ دلتا نوترال — خالص، قطعی و بدون نگاه به آینده
 *
 * استراتژی: لانگ اسپات + شورت پرپ با اندازهٔ برابر؛ قیمت اثری ندارد، درآمد = فاندینگ دریافتی شورت.
 *   سرمایهٔ C → ناشنال N = C·L/(L+1) (اسپات N، مارجین پرپ N/L)
 *
 * هر ساعت (به ترتیب):
 *   ۱. کندل‌های ۴ساعتهٔ بسته‌شده تا این لحظه: اول آزمون لیکوئید با «بیشترین قیمت» کندل نسبت به قیمت مرجع،
 *      بعد ریبالانس با قیمت بسته شدن اگر از باند گذشته باشد (انتقال مارجین ← هزینهٔ معامله روی مبلغ جابه‌جاشده)
 *   ۲. تصمیم ورود/خروج فقط با فاندینگ‌های تسویه‌شدهٔ «قبل از» این ساعت (میانگین lookback ساعت)
 *   ۳. فاندینگ همین ساعت به پوزیشن باز تعلق می‌گیرد (مثبت = شورت دریافت می‌کند)؛
 *      سرمایهٔ بیرون از بازار در صورت انتخاب، بازده استیبل (hurdle) می‌گیرد
 * در پایان، پوزیشن باز با هزینهٔ خروج بسته فرض می‌شود.
 *
 * ساده‌سازی‌ها (روی صفحه هم گفته می‌شوند): ریبالانس فقط در مرز کندل ۴ساعته؛ لیکوئید = از دست رفتن
 * مارجین نگهداری + فروش اسپات؛ اسلیپیج به اندازهٔ سفارش وابسته نیست؛ قیمت اسپات = قیمت پرپ (بیس صفر).
 */
import { deflatedSharpe, periodSharpe, variance } from './stats.js';

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
export const HOURS_PER_YEAR = 8760;
export const floorToHour = (ms: number) => Math.floor(ms / HOUR_MS) * HOUR_MS;

export interface FundingPoint {
  /** ساعت تسویه (ms، گرد به ساعت) */
  hour: number;
  /** نرخ ساعتی کسری؛ مثبت = لانگ می‌پردازد */
  rate: number;
}

export interface PriceBar {
  /** زمان بسته شدن کندل (ms) — قیمت بسته شدن از این لحظه به بعد معلوم است */
  end: number;
  high: number;
  /** کمترین قیمت (برای لیکوئید پای لانگ در اسپرد)؛ نبودنش = close */
  low?: number;
  close: number;
}

export interface CostParams {
  leverage: number;
  /** مارجین نگهداری (٪) */
  mmrPct: number;
  perpFeePct: number;
  spotFeePct: number;
  /** اسلیپیج هر پا در هر معامله (٪) */
  slippagePct: number;
  /** بازده سالانهٔ استیبل بدون ریسک فاندینگ (٪) — معیار مقایسه */
  hurdleApr: number;
  /** سرمایهٔ بیرون از بازار بازده استیبل بگیرد */
  idleEarnsHurdle: boolean;
}

export type Rule = { kind: 'always' } | { kind: 'threshold'; lookbackH: number; entryApr: number; exitApr: number };

export interface Breakdown {
  funding: number;
  idle: number;
  tradingFees: number;
  rebalance: number;
  liquidation: number;
}

export interface SimResult {
  /** ارزش در پایان هر روز UTC (شروع = ۱) */
  days: number[];
  equity: number[];
  breakdown: Breakdown;
  entries: number;
  /** زمان هر ورود (ms) */
  entryTimes: number[];
  liquidations: number[];
  /** بیشترین سهمِ مصرف‌شده از فاصلهٔ لیکوئید (۱ = لیکوئید) */
  peakLiqUse: number;
  hoursIn: number;
  hoursTotal: number;
  negativeHoursIn: number;
}

export const aprToHourly = (aprPct: number) => aprPct / 100 / HOURS_PER_YEAR;
export const hourlyToApr = (rate: number) => rate * HOURS_PER_YEAR * 100;

/** فاصلهٔ قیمت تا لیکوئید شورت از قیمت مرجع: (1/L − mmr)/(1 + mmr) */
export function liquidationDistance(leverage: number, mmrPct: number): number {
  const mmr = mmrPct / 100;
  return Math.max(0, (1 / leverage - mmr) / (1 + mmr));
}

/** باند ریبالانس پیش‌فرض: نیمهٔ فاصله تا لیکوئید */
export const rebalanceBand = (leverage: number, mmrPct: number) => liquidationDistance(leverage, mmrPct) / 2;

export function cleanFunding(points: readonly FundingPoint[]): FundingPoint[] {
  const byHour = new Map<number, number>();
  for (const p of points) if (Number.isFinite(p.hour) && Number.isFinite(p.rate)) byHour.set(p.hour, p.rate);
  return [...byHour.entries()].sort((a, b) => a[0] - b[0]).map(([hour, rate]) => ({ hour, rate }));
}

/* ---------------- استپر: یک ساعت در هر قدم (مشترک بین بک‌تست و بات کاغذی) ---------------- */

/** وضعیت قابل ذخیره (JSON) — بات کاغذی همین را بین تیک‌ها نگه می‌دارد */
export interface CarryState {
  E: number;
  open: boolean;
  Q: number;
  ref: number;
  price: number | null;
  /** فاندینگ‌های تسویه‌شدهٔ اخیر (برای میانگین قانون) */
  rates: number[];
  windowSum: number;
  /** آخرین ساعت پردازش‌شده و آخرین کندل دیده‌شده */
  lastHour: number | null;
  lastBarEnd: number | null;
  breakdown: Breakdown;
  entries: number;
  entryTimes: number[];
  liquidations: number[];
  peakLiqUse: number;
  hoursIn: number;
  hoursTotal: number;
  negativeHoursIn: number;
}

export type CarryEvent =
  | { kind: 'enter'; at: number; price: number; notional: number }
  | { kind: 'exit'; at: number; price: number; reason: 'rule' | 'final' }
  | { kind: 'rebalance'; at: number; price: number; cost: number }
  | { kind: 'liquidation'; at: number; price: number; loss: number };

export function initCarryState(equity = 1): CarryState {
  return {
    E: equity,
    open: false,
    Q: 0,
    ref: 0,
    price: null,
    rates: [],
    windowSum: 0,
    lastHour: null,
    lastBarEnd: null,
    breakdown: { funding: 0, idle: 0, tradingFees: 0, rebalance: 0, liquidation: 0 },
    entries: 0,
    entryTimes: [],
    liquidations: [],
    peakLiqUse: 0,
    hoursIn: 0,
    hoursTotal: 0,
    negativeHoursIn: 0
  };
}

const lookbackOf = (rule: Rule) => (rule.kind === 'threshold' ? Math.max(1, Math.round(rule.lookbackH)) : 0);
const tradeCostOf = (cost: CostParams) => (cost.spotFeePct + cost.perpFeePct + 2 * cost.slippagePct) / 100;

/** کندل بسته‌شده: اول آزمون لیکوئید با بیشترین قیمت، بعد ریبالانس با قیمت بسته شدن */
export function carryOnBar(s: CarryState, bar: PriceBar, cost: CostParams, events?: CarryEvent[]): void {
  if (s.lastBarEnd !== null && bar.end <= s.lastBarEnd) return;
  s.lastBarEnd = bar.end;
  const rLiq = liquidationDistance(cost.leverage, cost.mmrPct);
  if (s.open) {
    const pLiq = s.ref * (1 + rLiq);
    if (rLiq > 0) s.peakLiqUse = Math.max(s.peakLiqUse, Math.min(1, (bar.high / s.ref - 1) / rLiq));
    if (bar.high >= pLiq) {
      const loss = s.Q * pLiq * (cost.mmrPct / 100) + (s.Q * pLiq * (cost.spotFeePct + cost.slippagePct)) / 100;
      s.E -= loss;
      s.breakdown.liquidation -= loss;
      s.liquidations.push(bar.end);
      s.open = false;
      s.Q = 0;
      events?.push({ kind: 'liquidation', at: bar.end, price: pLiq, loss });
    } else if (Math.abs(bar.close / s.ref - 1) >= rebalanceBand(cost.leverage, cost.mmrPct)) {
      // بازگشت به ناشنال هدف از ارزش فعلی: با رشد قیمت اسپات فروخته و شورت به همان اندازه کم می‌شود
      // (و برعکس)؛ وگرنه اهرم مؤثر با قیمت بالا می‌رود و فاندینگ ساختگی بزرگ می‌شود
      const nFrac = cost.leverage / (cost.leverage + 1);
      const c = Math.abs((s.E * nFrac) / bar.close - s.Q) * bar.close * tradeCostOf(cost);
      s.E -= c;
      s.breakdown.rebalance -= c;
      s.Q = (s.E * nFrac) / bar.close;
      s.ref = bar.close;
      events?.push({ kind: 'rebalance', at: bar.end, price: bar.close, cost: c });
    }
  }
  s.price = bar.close;
}

/** یک ساعت: تصمیم با فاندینگ‌های قبل از این ساعت، بعد فاندینگ (یا بازده استیبل) همین ساعت */
export function carryOnHour(s: CarryState, point: FundingPoint, rule: Rule, cost: CostParams, events?: CarryEvent[]): void {
  if (s.lastHour !== null && point.hour <= s.lastHour) return;
  s.lastHour = point.hour;
  s.hoursTotal++;
  const lookback = lookbackOf(rule);
  const tradeCost = tradeCostOf(cost);
  let want = false;
  if (s.price !== null) {
    if (rule.kind !== 'threshold') want = true;
    else if (s.rates.length >= lookback) {
      const avg = s.windowSum / lookback;
      want = s.open ? avg > aprToHourly(rule.exitApr) : avg >= aprToHourly(rule.entryApr);
    }
  }
  if (want && !s.open && s.price !== null) {
    const N = (s.E * cost.leverage) / (cost.leverage + 1);
    const c = N * tradeCost;
    s.E -= c;
    s.breakdown.tradingFees -= c;
    s.Q = N / s.price;
    s.ref = s.price;
    s.open = true;
    s.entries++;
    s.entryTimes.push(point.hour);
    events?.push({ kind: 'enter', at: point.hour, price: s.price, notional: N });
  } else if (!want && s.open && s.price !== null) {
    const c = s.Q * s.price * tradeCost;
    s.E -= c;
    s.breakdown.tradingFees -= c;
    s.open = false;
    s.Q = 0;
    events?.push({ kind: 'exit', at: point.hour, price: s.price, reason: 'rule' });
  }

  if (s.open && s.price !== null) {
    const f = s.Q * s.price * point.rate;
    s.E += f;
    s.breakdown.funding += f;
    s.hoursIn++;
    if (point.rate < 0) s.negativeHoursIn++;
  } else if (cost.idleEarnsHurdle) {
    const y = s.E * aprToHourly(cost.hurdleApr);
    s.E += y;
    s.breakdown.idle += y;
  }

  if (lookback > 0) {
    s.windowSum += point.rate;
    s.rates.push(point.rate);
    if (s.rates.length > lookback) s.windowSum -= s.rates[s.rates.length - 1 - lookback];
  }
}

/** پیش‌گرم: پر کردن پنجرهٔ قانون با تاریخچه بدون پوزیشن (شروع بات کاغذی) */
export function carryWarm(s: CarryState, points: readonly FundingPoint[], rule: Rule): void {
  const lookback = lookbackOf(rule);
  for (const p of points.slice(-lookback)) {
    s.windowSum += p.rate;
    s.rates.push(p.rate);
    if (s.rates.length > lookback) s.windowSum -= s.rates[s.rates.length - 1 - lookback];
  }
  const last = points[points.length - 1];
  if (last) s.lastHour = last.hour;
}

/** برای ذخیره: فقط پنجرهٔ لازم از نرخ‌ها نگه داشته می‌شود */
export function compactState(s: CarryState, rule: Rule): CarryState {
  const keep = lookbackOf(rule) + 1;
  return { ...s, rates: s.rates.slice(-keep), entryTimes: s.entryTimes.slice(-50), liquidations: s.liquidations.slice(-50) };
}

export function carryClose(s: CarryState, cost: CostParams, at: number, events?: CarryEvent[]): void {
  if (!s.open || s.price === null) return;
  const c = s.Q * s.price * tradeCostOf(cost);
  s.E -= c;
  s.breakdown.tradingFees -= c;
  s.open = false;
  s.Q = 0;
  events?.push({ kind: 'exit', at, price: s.price, reason: 'final' });
}

export function simulate(funding: readonly FundingPoint[], prices: readonly PriceBar[], rule: Rule, cost: CostParams): SimResult {
  const bars = [...prices].sort((a, b) => a.end - b.end);
  const s = initCarryState();
  const days: number[] = [];
  const equity: number[] = [];
  let curDay: number | null = null;
  const pushDay = (day: number) => {
    if (days.length && days[days.length - 1] === day) equity[equity.length - 1] = s.E;
    else {
      days.push(day);
      equity.push(s.E);
    }
  };
  let j = 0;
  for (const point of funding) {
    const day = Math.floor(point.hour / DAY_MS) * DAY_MS;
    if (curDay !== null && day !== curDay) pushDay(curDay);
    curDay = day;
    while (j < bars.length && bars[j].end <= point.hour) carryOnBar(s, bars[j++], cost);
    carryOnHour(s, point, rule, cost);
  }
  carryClose(s, cost, s.lastHour ?? 0);
  if (curDay !== null) pushDay(curDay);
  return {
    days,
    equity,
    breakdown: s.breakdown,
    entries: s.entries,
    entryTimes: s.entryTimes,
    liquidations: s.liquidations,
    peakLiqUse: s.peakLiqUse,
    hoursIn: s.hoursIn,
    hoursTotal: s.hoursTotal,
    negativeHoursIn: s.negativeHoursIn
  };
}

/* ---------------- معیارها ---------------- */

export function dailyReturns(equity: readonly number[]): number[] {
  return equity.map((e, i) => e / (i === 0 ? 1 : equity[i - 1]) - 1);
}

export interface SegmentMetrics {
  days: number;
  totalReturn: number;
  /** بازده سالانهٔ مرکب */
  cagr: number;
  /** بازده سالانهٔ مرکب منهای بازده سالانهٔ مرکب استیبل */
  excessCagr: number;
  /** شارپ سالانهٔ بازده مازاد بر استیبل */
  sharpe: number | null;
  maxDrawdown: number;
}

export const hurdleDaily = (hurdleApr: number) => hurdleApr / 100 / 365;

export function segmentMetrics(returns: readonly number[], hurdleApr: number): SegmentMetrics {
  const n = returns.length;
  let eq = 1;
  let peak = 1;
  let mdd = 0;
  for (const r of returns) {
    eq *= 1 + r;
    peak = Math.max(peak, eq);
    mdd = Math.min(mdd, eq / peak - 1);
  }
  const years = n / 365;
  const cagr = n > 0 ? eq ** (1 / years) - 1 : 0;
  const hurdleCagr = (1 + hurdleDaily(hurdleApr)) ** 365 - 1;
  const ex = returns.map((r) => r - hurdleDaily(hurdleApr));
  const sr = periodSharpe(ex);
  return { days: n, totalReturn: eq - 1, cagr, excessCagr: cagr - hurdleCagr, sharpe: sr === null ? null : sr * Math.sqrt(365), maxDrawdown: mdd };
}

/* ---------------- جاروب، آزمون پیش‌رونده و حکم ---------------- */

export const LOOKBACKS_H = [24, 72, 168, 336] as const;
export const ENTRY_APRS = [0, 5, 10, 15, 20, 30] as const;

export interface GridConfig {
  id: string;
  rule: Rule;
  /** اندیس در شبکه؛ برای «همیشه باز» null */
  cell: { li: number; ei: number } | null;
}

export function gridConfigs(): GridConfig[] {
  const out: GridConfig[] = [{ id: 'always', rule: { kind: 'always' }, cell: null }];
  LOOKBACKS_H.forEach((lookbackH, li) =>
    ENTRY_APRS.forEach((entryApr, ei) => out.push({ id: `L${lookbackH}-E${entryApr}`, rule: { kind: 'threshold', lookbackH, entryApr, exitApr: entryApr / 2 }, cell: { li, ei } }))
  );
  return out;
}

export interface ConfigRun extends GridConfig {
  sim: SimResult;
  returns: number[];
  metrics: SegmentMetrics;
}

export interface WalkFold {
  index: number;
  from: number;
  to: number;
  chosen: string;
  inSampleExcess: number;
  oos: SegmentMetrics;
  oosLiquidations: number;
}

export type VerdictKind = 'validated' | 'fragile' | 'no-edge' | 'insufficient';

export interface Check {
  id: 'oos' | 'dsr' | 'plateau' | 'liquidation';
  pass: boolean;
  value: number | null;
}

export interface Study {
  runs: ConfigRun[];
  best: ConfigRun;
  always: ConfigRun;
  folds: WalkFold[];
  oos: SegmentMetrics | null;
  dsr: { dsr: number; sr: number; sr0: number } | null;
  trials: number;
  plateau: { share: number; neighbors: number } | null;
  checks: Check[];
  verdict: VerdictKind;
  days: number;
}

export const MIN_DAYS = 120;
export const WALK_FOLDS = 4;
export const DSR_PASS = 0.95;
export const PLATEAU_PASS = 0.6;

const rank = (r: ConfigRun) => r.metrics.excessCagr;

function plateauOf(best: ConfigRun, runs: readonly ConfigRun[]): { share: number; neighbors: number } | null {
  const grid = runs.filter((r) => r.cell);
  const neighbors = best.cell
    ? grid.filter((r) => r !== best && Math.abs(r.cell!.li - best.cell!.li) <= 1 && Math.abs(r.cell!.ei - best.cell!.ei) <= 1)
    : grid.filter((r) => r.cell!.ei === 0);
  if (!neighbors.length) return null;
  return { share: neighbors.filter((r) => r.metrics.excessCagr > 0).length / neighbors.length, neighbors: neighbors.length };
}

/**
 * مطالعهٔ کامل: همهٔ پیکربندی‌ها روی کل دوره، آزمون پیش‌رونده (لنگردار، ۴ برش)، DSR و پایداری همسایه‌ها.
 * priorTrials = پیکربندی‌هایی که کاربر پیش‌تر روی همین دارایی آزموده — DSR با جمع آن‌ها سخت‌گیرتر می‌شود.
 */
export function runStudy(funding: readonly FundingPoint[], prices: readonly PriceBar[], cost: CostParams, priorTrials = 0): Study {
  const clean = cleanFunding(funding);
  return evaluateRuns(
    gridConfigs().map((g) => toRun(g, simulate(clean, prices, g.rule, cost), cost.hurdleApr)),
    cost.hurdleApr,
    priorTrials
  );
}

export function toRun(g: GridConfig, sim: SimResult, hurdleApr: number): ConfigRun {
  const returns = dailyReturns(sim.equity);
  return { ...g, sim, returns, metrics: segmentMetrics(returns, hurdleApr) };
}

/** داور مشترک (کری و اسپرد): runs[0] باید «همیشه باز» باشد */
export function evaluateRuns(runs: ConfigRun[], hurdleApr: number, priorTrials = 0): Study {
  const cost = { hurdleApr };
  const always = runs[0];
  // قانونی که هیچ‌وقت وارد نشده همان «استیبل» است، نه استراتژی کری — کاندید بهترین نیست
  const traded = runs.filter((r) => r.sim.entries > 0);
  const best = (traded.length ? traded : runs).reduce((a, b) => (rank(b) > rank(a) ? b : a));
  const days = always.returns.length;
  const trials = Math.max(runs.length, priorTrials + runs.length);

  // آزمون پیش‌رونده: انتخاب روی گذشته، سنجش روی برش بعدی که در انتخاب دیده نشده
  const folds: WalkFold[] = [];
  const oosReturns: number[] = [];
  if (days >= MIN_DAYS) {
    const size = Math.floor(days / WALK_FOLDS);
    for (let k = 1; k < WALK_FOLDS; k++) {
      const from = k * size;
      const to = k === WALK_FOLDS - 1 ? days : (k + 1) * size;
      const cutoff = always.sim.days[from];
      const eligible = runs.filter((r) => r.sim.entryTimes.some((t) => t < cutoff));
      const scored = (eligible.length ? eligible : runs).map((r) => ({ r, ex: segmentMetrics(r.returns.slice(0, from), cost.hurdleApr).excessCagr }));
      const pick = scored.reduce((a, b) => (b.ex > a.ex ? b : a));
      const slice = pick.r.returns.slice(from, to);
      const start = always.sim.days[from];
      const end = always.sim.days[to - 1] + DAY_MS;
      oosReturns.push(...slice);
      folds.push({
        index: k,
        from: start,
        to: end,
        chosen: pick.r.id,
        inSampleExcess: pick.ex,
        oos: segmentMetrics(slice, cost.hurdleApr),
        oosLiquidations: pick.r.sim.liquidations.filter((t) => t >= start && t < end).length
      });
    }
  }
  const oos = oosReturns.length ? segmentMetrics(oosReturns, cost.hurdleApr) : null;

  const srs = runs.map((r) => periodSharpe(r.returns.map((x) => x - hurdleDaily(cost.hurdleApr)))).filter((s): s is number => s !== null);
  const dsr = deflatedSharpe(
    best.returns.map((x) => x - hurdleDaily(cost.hurdleApr)),
    variance(srs),
    trials
  );
  const plateau = plateauOf(best, runs);
  // «همیشه باز» با همین اهرم هم شمرده می‌شود: قانونی که فقط از روی شانس بیرون از بازار بوده، ایمن حساب نشود
  const liq = best.sim.liquidations.length + (best === always ? 0 : always.sim.liquidations.length) + folds.reduce((s, f) => s + f.oosLiquidations, 0);

  const checks: Check[] = [
    { id: 'oos', pass: !!oos && oos.excessCagr > 0, value: oos?.excessCagr ?? null },
    { id: 'dsr', pass: !!dsr && dsr.dsr >= DSR_PASS, value: dsr?.dsr ?? null },
    { id: 'plateau', pass: !!plateau && plateau.share >= PLATEAU_PASS, value: plateau?.share ?? null },
    { id: 'liquidation', pass: liq === 0, value: liq }
  ];
  const verdict: VerdictKind = days < MIN_DAYS ? 'insufficient' : !checks[0].pass ? 'no-edge' : checks.every((c) => c.pass) ? 'validated' : 'fragile';

  return { runs, best, always, folds, oos, dsr, trials, plateau, checks, verdict, days };
}

/* ---------------- رژیم فاندینگ ماهانه ---------------- */

export interface MonthFunding {
  month: number;
  avgApr: number;
  negativeShare: number;
  hours: number;
}

export function monthlyFunding(funding: readonly FundingPoint[]): MonthFunding[] {
  const map = new Map<number, { sum: number; neg: number; n: number }>();
  for (const p of funding) {
    const d = new Date(p.hour);
    const m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    const cur = map.get(m) ?? { sum: 0, neg: 0, n: 0 };
    cur.sum += p.rate;
    cur.neg += p.rate < 0 ? 1 : 0;
    cur.n++;
    map.set(m, cur);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([month, v]) => ({ month, avgApr: hourlyToApr(v.sum / v.n), negativeShare: v.neg / v.n, hours: v.n }));
}
