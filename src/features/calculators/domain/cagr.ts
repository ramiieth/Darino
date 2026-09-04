/**
 * ۳) نرخ رشد سالانه مرکب (CAGR):
 *   CAGR = (Final ÷ Initial)^(1 ÷ Years) − 1
 */
import { D, Decimal, round12, safeDiv, yearsBetween } from './money';

export interface CagrInput {
  initialValue: number;
  finalValue: number;
  startDate: number;
  endDate: number;
}

export interface CagrResult {
  /** نرخ سالانه (کسری، مثلاً 0.12) */
  cagr: number | null;
  /** سود کل */
  totalProfit: number | null;
  /** درصد رشد کل */
  totalGrowthPct: number | null;
  /** مدت سرمایه‌گذاری (سال) */
  years: number;
  /** مدت (روز) */
  days: number;
}

export function calcCagr(input: CagrInput): number | null {
  const init = D(input.initialValue);
  const fin = D(input.finalValue);
  const years = yearsBetween(input.startDate, input.endDate);

  if (init.lte(0) || years <= 0) return null;
  const ratio = safeDiv(fin, init);
  if (ratio === null || ratio.lte(0)) return null;

  // (Final/Initial)^(1/Years) − 1
  const exp = new Decimal(1).div(years);
  return round12(ratio.pow(exp).minus(1));
}

export function calcCagrFull(input: CagrInput): CagrResult {
  const init = D(input.initialValue);
  const fin = D(input.finalValue);
  const days = Math.max(0, input.endDate - input.startDate) / 86_400_000;
  const years = days / 365.25;

  const cagr = calcCagr(input);
  const totalProfit = fin.minus(init);
  const growth = safeDiv(totalProfit, init);

  return {
    cagr,
    totalProfit: round12(totalProfit),
    totalGrowthPct: growth === null ? null : round12(growth.mul(100)),
    years,
    days
  };
}
