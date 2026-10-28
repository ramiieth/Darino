/**
 * موتور معیارهای عملکرد — همه محاسبه، هیچ تخمین چشمی (طبق دو پرامپت حسابرسی)
 *
 *   • ورودی فقط معاملات بسته و کامل یک دفتر است؛ معاملهٔ باز یا ناقص در آمار نمی‌آید.
 *   • معاملهٔ «سربه‌سر» (scratch): |سود خالص| کمتر از بزرگ‌ترِ (کارمزد رفت‌وبرگشت همان معامله، ۲٪ میانگین سود)
 *     — آستانه یک‌بار از میانگین سودِ پیش از حذف سربه‌سرها حساب می‌شود.
 *   • نرخ برد دو بار: با سربه‌سرها در مخرج، و فقط روی معاملات قطعی.
 *   • هر معیاری که دادهٔ لازمش نیست null می‌ماند (در کارنامه «ارزیابی نشد»)، نه صفر.
 */
import type { ClassifiedTrade, TradePlan } from './types';
import { dayKey, mean, median, stdev } from './time';

export type Style = 'scalp' | 'day' | 'swing' | 'position';
export const STYLE_FA: Record<Style, string> = { scalp: 'اسکالپ', day: 'روزانه', swing: 'سوینگ', position: 'پوزیشن (بلندمدت)' };

export interface EquityPoint {
  t: number;
  equity: number;
  drawdown: number;
}

export interface CoreMetrics {
  n: number;
  decisive: number;
  scratches: number;
  scratchPct: number | null;
  /** آستانهٔ ۲٪ میانگین سود (بخش ثابت آستانهٔ سربه‌سر) */
  scratchFloor: number;
  wins: number;
  losses: number;
  winRateAll: number | null;
  winRateDecisive: number | null;
  grossPnl: number;
  netPnl: number;
  fees: number;
  feesKnown: boolean;
  funding: number;
  fundingKnown: boolean;
  grossProfit: number;
  grossLoss: number;
  feeDragPct: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  payoff: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  expectancyPctNotional: number | null;
  expectancyPerMonth: number | null;
  largestWin: number | null;
  largestLoss: number | null;
  largestWinPctNet: number | null;
  largestLossPctNet: number | null;
  maxDrawdown: number;
  maxDrawdownPct: number | null;
  drawdownFrom: number | null;
  drawdownTo: number | null;
  worstDay: number | null;
  worstDayKey: string | null;
  worstDayPct: number | null;
  recoveryFactor: number | null;
  longestWinStreak: number;
  longestLossStreak: number;
  tradesPerDay: number | null;
  tradesPerActiveDay: number | null;
  activeDays: number;
  spanDays: number;
  sharpe: number | null;
  sharpeDays: number;
  bestDayShare: number | null;
  bestDayKey: string | null;
  sizeCv: number | null;
  medianHoldMs: number | null;
  avgHoldWinMs: number | null;
  avgHoldLossMs: number | null;
  style: Style | null;
  /** درصد زیان کل که از بدترین ۵٪ معاملات آمده */
  tailLossShare: number | null;
  withoutWorst1: number | null;
  withoutWorst3: number | null;
  /** سهم ۵ معاملهٔ برتر از سود خالص */
  top5Share: number | null;
  top5Pnl: number;
  monthsPositive: number;
  months: number;
  /** معیارهای R — فقط برای معاملات دارای برنامه با استاپ */
  rCount: number;
  avgR: number | null;
  rValues: number[];
  riskPctAvg: number | null;
  riskPctCount: number;
  equity: EquityPoint[];
  accountSize: number | null;
  first: number | null;
  last: number | null;
}

export interface PlannedRisk {
  /** ریسک دلاری برنامه با اندازهٔ واقعی: اندازهٔ بیشینه × |ورود − استاپ| */
  riskUsd: number;
  plan: TradePlan;
}

export function scratchFloorOf(trades: readonly ClassifiedTrade[]): number {
  const wins = trades.filter((t) => t.netPnl > 0).map((t) => t.netPnl);
  return 0.02 * (mean(wins) ?? 0);
}

export function isScratch(t: ClassifiedTrade, floor: number): boolean {
  return Math.abs(t.netPnl) < Math.max(Math.abs(t.fees ?? 0), floor);
}

const pct = (a: number, b: number) => (b !== 0 ? (a / b) * 100 : null);

export function styleOf(medianHoldMs: number | null): Style | null {
  if (medianHoldMs === null) return null;
  if (medianHoldMs < 3_600_000) return 'scalp';
  if (medianHoldMs < 86_400_000) return 'day';
  if (medianHoldMs < 14 * 86_400_000) return 'swing';
  return 'position';
}

/** منحنی سرمایه بر پایهٔ زمان بستن؛ افت از قله در هر نقطه */
export function equityCurve(trades: readonly ClassifiedTrade[]): EquityPoint[] {
  const sorted = [...trades].sort((a, b) => (a.closeTime ?? 0) - (b.closeTime ?? 0));
  let eq = 0, peak = 0;
  return sorted.map((t) => {
    eq += t.netPnl;
    peak = Math.max(peak, eq);
    return { t: t.closeTime ?? t.openTime, equity: eq, drawdown: eq - peak };
  });
}

export function streaks(signs: readonly (1 | -1 | 0)[]): { win: number; loss: number } {
  let w = 0, l = 0, cw = 0, cl = 0;
  for (const s of signs) {
    if (s === 1) { cw++; cl = 0; }
    else if (s === -1) { cl++; cw = 0; }
    w = Math.max(w, cw);
    l = Math.max(l, cl);
  }
  return { win: w, loss: l };
}

export function computeCore(
  input: readonly ClassifiedTrade[],
  opts: { tz: string; accountSize: number | null; risks?: ReadonlyMap<string, PlannedRisk> }
): CoreMetrics {
  const trades = [...input].sort((a, b) => (a.closeTime ?? 0) - (b.closeTime ?? 0));
  const n = trades.length;
  const floor = scratchFloorOf(trades);
  const signs = trades.map((t): 1 | -1 | 0 => (isScratch(t, floor) ? 0 : t.netPnl > 0 ? 1 : -1));
  const winsArr = trades.filter((_, i) => signs[i] === 1).map((t) => t.netPnl);
  const lossArr = trades.filter((_, i) => signs[i] === -1).map((t) => t.netPnl);
  const scratches = signs.filter((s) => s === 0).length;
  const decisive = n - scratches;
  const net = trades.reduce((s, t) => s + t.netPnl, 0);
  const gross = trades.reduce((s, t) => s + t.grossPnl, 0);
  const feesKnown = trades.every((t) => t.fees !== null);
  const fees = trades.reduce((s, t) => s + (t.fees ?? 0), 0);
  const fundingKnown = trades.every((t) => t.funding !== null);
  const funding = trades.reduce((s, t) => s + (t.funding ?? 0), 0);
  const grossProfit = trades.filter((t) => t.netPnl > 0).reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = -trades.filter((t) => t.netPnl < 0).reduce((s, t) => s + t.netPnl, 0);
  const grossProfitBeforeFees = trades.filter((t) => t.grossPnl > 0).reduce((s, t) => s + t.grossPnl, 0);
  const avgWin = mean(winsArr);
  const avgLossSigned = mean(lossArr);
  const avgLoss = avgLossSigned === null ? null : -avgLossSigned;
  const expectancy = n ? net / n : null;
  const notionals = trades.map((t) => t.maxNotional).filter((x) => x > 0);
  const meanNotional = mean(notionals);

  const equity = equityCurve(trades);
  let maxDd = 0, ddFrom: number | null = null, ddTo: number | null = null, peakT: number | null = trades[0]?.openTime ?? null, peakVal = 0, maxDdPct: number | null = null;
  for (const p of equity) {
    if (p.equity >= peakVal) { peakVal = p.equity; peakT = p.t; }
    if (-p.drawdown > maxDd) { maxDd = -p.drawdown; ddFrom = peakT; ddTo = p.t; }
    if (opts.accountSize && opts.accountSize > 0) {
      const base = opts.accountSize + peakVal;
      const dpct = base > 0 ? (-p.drawdown / base) * 100 : null;
      if (dpct !== null && (maxDdPct === null || dpct > maxDdPct)) maxDdPct = dpct;
    }
  }

  const days = new Map<string, { pnl: number; count: number }>();
  for (const t of trades) {
    const k = dayKey(t.closeTime ?? t.openTime, opts.tz);
    const d = days.get(k) ?? { pnl: 0, count: 0 };
    d.pnl += t.netPnl;
    d.count++;
    days.set(k, d);
  }
  let worstDay: number | null = null, worstDayKey: string | null = null, bestDay = -Infinity, bestDayKey: string | null = null;
  for (const [k, d] of days) {
    if (worstDay === null || d.pnl < worstDay) { worstDay = d.pnl; worstDayKey = k; }
    if (d.pnl > bestDay) { bestDay = d.pnl; bestDayKey = k; }
  }
  const first = trades.length ? Math.min(...trades.map((t) => t.openTime)) : null;
  const last = trades.length ? Math.max(...trades.map((t) => t.closeTime ?? t.openTime)) : null;
  const spanDays = first !== null && last !== null ? Math.max(1, Math.ceil((last - first) / 86_400_000)) : 0;

  // شارپ روزانه: همهٔ روزهای تقویمی بازه (روز بی‌معامله = صفر)
  let sharpe: number | null = null;
  if (first !== null && spanDays >= 20 && days.size >= 10) {
    const series: number[] = [];
    for (let i = 0; i <= spanDays; i++) series.push(days.get(dayKey(first + i * 86_400_000, opts.tz))?.pnl ?? 0);
    const m = mean(series), s = stdev(series);
    if (m !== null && s && s > 0) sharpe = (m / s) * Math.sqrt(365);
  }

  const holds = trades.map((t) => (t.closeTime ?? t.openTime) - t.openTime);
  const winHolds = trades.filter((_, i) => signs[i] === 1).map((t) => (t.closeTime ?? 0) - t.openTime);
  const lossHolds = trades.filter((_, i) => signs[i] === -1).map((t) => (t.closeTime ?? 0) - t.openTime);
  const medHold = median(holds);

  const byNet = [...trades].sort((a, b) => a.netPnl - b.netPnl);
  const worstN = Math.max(1, Math.ceil(n * 0.05));
  const tailLoss = byNet.slice(0, worstN).filter((t) => t.netPnl < 0).reduce((s, t) => s - t.netPnl, 0);
  const top5 = [...byNet].reverse().slice(0, 5).filter((t) => t.netPnl > 0).reduce((s, t) => s + t.netPnl, 0);

  const months = new Map<string, number>();
  for (const t of trades) {
    const k = dayKey(t.closeTime ?? t.openTime, opts.tz).slice(0, 7);
    months.set(k, (months.get(k) ?? 0) + t.netPnl);
  }

  const rValues: number[] = [];
  const riskPcts: number[] = [];
  for (const t of trades) {
    const r = opts.risks?.get(t.id);
    if (!r || !(r.riskUsd > 0)) continue;
    rValues.push(t.netPnl / r.riskUsd);
    if (opts.accountSize && opts.accountSize > 0) riskPcts.push((r.riskUsd / opts.accountSize) * 100);
  }

  return {
    n,
    decisive,
    scratches,
    scratchPct: n ? (scratches / n) * 100 : null,
    scratchFloor: floor,
    wins: winsArr.length,
    losses: lossArr.length,
    winRateAll: n ? (winsArr.length / n) * 100 : null,
    winRateDecisive: decisive ? (winsArr.length / decisive) * 100 : null,
    grossPnl: gross,
    netPnl: net,
    fees,
    feesKnown,
    funding,
    fundingKnown,
    grossProfit,
    grossLoss,
    feeDragPct: feesKnown && grossProfitBeforeFees > 0 ? (fees / grossProfitBeforeFees) * 100 : null,
    avgWin,
    avgLoss,
    payoff: avgWin !== null && avgLoss ? avgWin / avgLoss : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null,
    expectancy,
    expectancyPctNotional: expectancy !== null && meanNotional ? (expectancy / meanNotional) * 100 : null,
    expectancyPerMonth: expectancy !== null && spanDays >= 7 ? (net / spanDays) * 30 : null,
    largestWin: byNet.length && byNet[byNet.length - 1].netPnl > 0 ? byNet[byNet.length - 1].netPnl : null,
    largestLoss: byNet.length && byNet[0].netPnl < 0 ? byNet[0].netPnl : null,
    largestWinPctNet: byNet.length && net > 0 && byNet[byNet.length - 1].netPnl > 0 ? pct(byNet[byNet.length - 1].netPnl, net) : null,
    largestLossPctNet: byNet.length && net !== 0 && byNet[0].netPnl < 0 ? pct(Math.abs(byNet[0].netPnl), Math.abs(net)) : null,
    maxDrawdown: maxDd,
    maxDrawdownPct: maxDdPct,
    drawdownFrom: maxDd > 0 ? ddFrom : null,
    drawdownTo: maxDd > 0 ? ddTo : null,
    worstDay,
    worstDayKey,
    worstDayPct: worstDay !== null && opts.accountSize && opts.accountSize > 0 ? (worstDay / opts.accountSize) * 100 : null,
    recoveryFactor: maxDd > 0 ? net / maxDd : null,
    longestWinStreak: streaks(signs).win,
    longestLossStreak: streaks(signs).loss,
    tradesPerDay: spanDays ? n / spanDays : null,
    tradesPerActiveDay: days.size ? n / days.size : null,
    activeDays: days.size,
    spanDays,
    sharpe,
    sharpeDays: spanDays,
    bestDayShare: net > 0 && bestDay > 0 ? (bestDay / net) * 100 : null,
    bestDayKey: net > 0 ? bestDayKey : null,
    sizeCv: notionals.length >= 5 && meanNotional ? (stdev(notionals) ?? 0) / meanNotional : null,
    medianHoldMs: medHold,
    avgHoldWinMs: mean(winHolds),
    avgHoldLossMs: mean(lossHolds),
    style: styleOf(medHold),
    tailLossShare: grossLoss > 0 ? (tailLoss / grossLoss) * 100 : null,
    withoutWorst1: n >= 2 ? net - byNet.slice(0, 1).reduce((s, t) => s + t.netPnl, 0) : null,
    withoutWorst3: n >= 4 ? net - byNet.slice(0, 3).reduce((s, t) => s + t.netPnl, 0) : null,
    top5Share: net > 0 ? (top5 / net) * 100 : null,
    top5Pnl: top5,
    monthsPositive: [...months.values()].filter((v) => v > 0).length,
    months: months.size,
    rCount: rValues.length,
    avgR: mean(rValues),
    rValues,
    riskPctAvg: mean(riskPcts),
    riskPctCount: riskPcts.length,
    equity,
    accountSize: opts.accountSize,
    first,
    last
  };
}
