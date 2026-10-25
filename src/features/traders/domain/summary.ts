/**
 * خلاصهٔ کوچک و JSON‌پذیر کارنامه — روی سرور محاسبه و برای همهٔ دستگاه‌ها کش می‌شود
 * تا فهرست برترین‌ها بدون صدها درخواست از مرورگر، نرخ برد و ثبات هر ۱۰۰ نفر را نشان دهد.
 * Pure.
 */
import type { Copyability, TraderReport } from './report.js';

export interface TraderSummary {
  address: string;
  computedAt: number;
  totalPnl: number | null;
  positiveMonths: number;
  months: number;
  maxDrawdownPct: number | null;
  closedCount: number;
  winRate: number | null;
  /** بی‌نهایت (بدون باخت) به‌صورت null + allWins */
  profitFactor: number | null;
  allWins: boolean;
  expectancy: number | null;
  medianHoldHours: number | null;
  tradesPerDay: number | null;
  copyability: Copyability;
  makerLike: boolean;
  fillsCount: number;
  truncated: boolean;
  coverageFrom: number | null;
}

export function summarize(address: string, r: TraderReport, now = Date.now()): TraderSummary {
  return {
    address,
    computedAt: now,
    totalPnl: r.curve.totalPnl,
    positiveMonths: r.curve.positiveMonths,
    months: r.curve.months.length,
    maxDrawdownPct: r.curve.maxDrawdownPct,
    closedCount: r.closedCount,
    winRate: r.winRate,
    profitFactor: r.profitFactor === Infinity ? null : r.profitFactor,
    allWins: r.profitFactor === Infinity,
    expectancy: r.expectancy,
    medianHoldHours: r.medianHoldHours,
    tradesPerDay: r.tradesPerDay,
    copyability: r.copyability,
    makerLike: r.fees < 0 && r.closedCount > 0,
    fillsCount: r.fillsCount,
    truncated: r.truncated,
    coverageFrom: r.coverageFrom
  };
}

export const STEADY_MIN_MONTHS = 6;

/** «ثابت‌قدم»: حداقل ۶ ماه سابقه، ≥۶۰٪ ماه‌ها سودده، افت ۱۲ ماه ≤ ۵۰٪، مارکت‌میکر نیست */
export function isSteady(s: Pick<TraderSummary, 'months' | 'positiveMonths' | 'maxDrawdownPct' | 'makerLike'> | null | undefined): boolean {
  if (!s || s.makerLike || s.months < STEADY_MIN_MONTHS) return false;
  return s.positiveMonths / s.months >= 0.6 && s.maxDrawdownPct !== null && s.maxDrawdownPct <= 50;
}
