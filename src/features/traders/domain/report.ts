/**
 * کارنامهٔ معاملاتی یک تریدر — از معاملات کامل (roundTrips) و منحنی سود حساب (portfolio)
 *
 * نرخ برد هیچ‌وقت تنها نمایش داده نمی‌شود: میانگین برد/باخت، Profit Factor، امید هر معامله
 * و حکم‌های صریح (نمونهٔ کم، ریسک دم، پرتکرار) کنارش می‌آیند تا «۹۰٪ برد با زیان کل» گول نزند.
 * Pure — بدون شبکه.
 */
import type { Fill, HlPortfolio } from './types.js';
import { buildRoundTrips, type RoundTrip } from './roundTrips.js';
import { pnlCurve, type PnlCurve } from './portfolio.js';

/** هر پاسخ userFills حداکثر این تعداد fill دارد؛ رسیدن به آن یعنی سابقه بریده شده */
export const FILLS_PAGE = 2000;
export const MIN_SAMPLE = 30;

export type Copyability = 'manual' | 'fast' | 'unknown';
export interface Verdict {
  tone: 'gain' | 'warn' | 'loss' | 'info';
  text: string;
}

export interface TraderReport {
  closed: RoundTrip[];
  open: RoundTrip[];
  closedCount: number;
  wins: number;
  /** درصد */
  winRate: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  netPnl: number;
  fees: number;
  best: RoundTrip | null;
  worst: RoundTrip | null;
  maxLossStreak: number;
  medianHoldHours: number | null;
  tradesPerDay: number | null;
  longShare: number | null;
  byCoin: { coin: string; trades: number; net: number; winRate: number }[];
  coverageFrom: number | null;
  coverageTo: number | null;
  fillsCount: number;
  truncated: boolean;
  copyability: Copyability;
  curve: PnlCurve;
  verdicts: Verdict[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function copyabilityOf(medianHoldHours: number | null, tradesPerDay: number | null, closedCount: number): Copyability {
  if (medianHoldHours === null || tradesPerDay === null || closedCount < 5) return 'unknown';
  if (medianHoldHours < 0.5 || tradesPerDay > 20) return 'fast';
  if (medianHoldHours >= 4 && tradesPerDay <= 5) return 'manual';
  return 'unknown';
}

const pct = (v: number) => `${Math.round(v)}٪`;

export function buildReport(fills: Fill[], portfolio: HlPortfolio | null, now = Date.now()): TraderReport {
  const trips = buildRoundTrips(fills);
  const closed = trips.filter((t) => t.complete && t.closeTime !== null).sort((a, b) => (b.closeTime ?? 0) - (a.closeTime ?? 0));
  const open = trips.filter((t) => t.closeTime === null);
  const winsArr = closed.filter((t) => t.net > 0).map((t) => t.net);
  const lossArr = closed.filter((t) => t.net < 0).map((t) => t.net);
  const grossWin = sum(winsArr);
  const grossLoss = Math.abs(sum(lossArr));
  const netPnl = sum(closed.map((t) => t.net));

  let streak = 0;
  let maxLossStreak = 0;
  for (const t of [...closed].reverse()) {
    streak = t.net < 0 ? streak + 1 : 0;
    maxLossStreak = Math.max(maxLossStreak, streak);
  }

  const times = fills.map((f) => f.time).filter(Number.isFinite);
  const coverageFrom = times.length ? Math.min(...times) : null;
  const coverageTo = times.length ? Math.max(...times) : null;
  const spanDays = coverageFrom !== null ? Math.max(1, (Math.max(coverageTo ?? now, now) - coverageFrom) / 86_400_000) : null;
  const medianHoldHours = median(closed.map((t) => ((t.closeTime ?? t.openTime) - t.openTime) / 3_600_000));
  const tradesPerDay = spanDays !== null && closed.length ? closed.length / spanDays : null;

  const coins = new Map<string, { trades: number; net: number; wins: number }>();
  for (const t of closed) {
    const c = coins.get(t.coin) ?? { trades: 0, net: 0, wins: 0 };
    c.trades++;
    c.net += t.net;
    if (t.net > 0) c.wins++;
    coins.set(t.coin, c);
  }
  const byCoin = [...coins.entries()]
    .map(([coin, c]) => ({ coin, trades: c.trades, net: c.net, winRate: (c.wins / c.trades) * 100 }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  const report: TraderReport = {
    closed,
    open,
    closedCount: closed.length,
    wins: winsArr.length,
    winRate: closed.length ? (winsArr.length / closed.length) * 100 : null,
    avgWin: winsArr.length ? grossWin / winsArr.length : null,
    avgLoss: lossArr.length ? -grossLoss / lossArr.length : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
    expectancy: closed.length ? netPnl / closed.length : null,
    netPnl,
    fees: sum(closed.map((t) => t.fees)),
    best: closed.reduce<RoundTrip | null>((b, t) => (!b || t.net > b.net ? t : b), null),
    worst: closed.reduce<RoundTrip | null>((w, t) => (!w || t.net < w.net ? t : w), null),
    maxLossStreak,
    medianHoldHours,
    tradesPerDay,
    longShare: closed.length ? (closed.filter((t) => t.side === 'long').length / closed.length) * 100 : null,
    byCoin,
    coverageFrom,
    coverageTo,
    fillsCount: fills.length,
    truncated: fills.length >= FILLS_PAGE,
    copyability: copyabilityOf(medianHoldHours, tradesPerDay, closed.length),
    curve: pnlCurve(portfolio),
    verdicts: []
  };
  report.verdicts = verdictsOf(report);
  return report;
}

export function verdictsOf(r: TraderReport): Verdict[] {
  const out: Verdict[] = [];
  if (r.closedCount > 0 && r.closedCount < MIN_SAMPLE) out.push({ tone: 'warn', text: `فقط ${r.closedCount} معاملهٔ کامل در داده هست؛ برای قضاوت دربارهٔ نرخ برد کافی نیست.` });
  if (r.winRate !== null && r.winRate >= 60 && r.profitFactor !== null && r.profitFactor < 1)
    out.push({ tone: 'loss', text: `نرخ برد ${pct(r.winRate)} است اما در مجموع زیان‌ده: سودها کوچک و ضررها بزرگ‌اند.` });
  if (r.worst && r.worst.net < 0 && r.avgWin !== null) {
    const grossWin = r.avgWin * r.wins;
    if (grossWin > 0 && -r.worst.net >= 0.4 * grossWin)
      out.push({ tone: 'warn', text: `ریسک دم: یک معامله (${r.worst.coin}) ${pct((-r.worst.net / grossWin) * 100)} کل سودهای این دوره را از بین برده.` });
  }
  if (r.copyability === 'manual') out.push({ tone: 'gain', text: 'معامله‌ها چند ساعت یا بیشتر باز می‌مانند و تعدادشان کم است؛ با چند دقیقه تأخیر هم قابل کپی دستی است.' });
  if (r.copyability === 'fast') out.push({ tone: 'warn', text: 'پرتکرار: معامله‌ها خیلی کوتاه یا خیلی زیادند؛ با تأخیر کپی دستی عملاً ممکن نیست.' });
  if (r.fees < 0 && r.closedCount > 0) out.push({ tone: 'info', text: 'کارمزد خالص منفی (ریبیت میکر) است؛ احتمالاً مارکت‌میکر یا ربات است، نه تریدر جهت‌دار.' });
  if (r.truncated && r.coverageFrom !== null) out.push({ tone: 'info', text: 'هایپرلیکوئید فقط ۲۰۰۰ معاملهٔ اخیر را می‌دهد؛ آمار معاملات فقط از تاریخ شروع داده است. سود کل حساب کامل است.' });
  return out;
}
