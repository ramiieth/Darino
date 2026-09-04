/** ============================================================
 * Boros Calculation Engine — Long/Short PnL & Break-Even (Part A-3..7)
 * ============================================================ */
import type { BorosDirection, BorosMarket } from '../types';

export const DAYS_PER_YEAR = 365;

/** YTM دقیق (اعشاری سال) — از timestamp خام */
export function ytmOf(m: BorosMarket, nowSec = Math.floor(Date.now() / 1000)): number {
  return Math.max(0, (m.maturity - nowSec) / 86_400 / DAYS_PER_YEAR);
}

/** روز تا سررسید — فقط برای نمایش گرد می‌شود؛ محاسبات با YTM دقیق */
export function daysToMaturity(m: BorosMarket, nowSec = Math.floor(Date.now() / 1000)): number {
  return Math.max(0, Math.floor((m.maturity - nowSec) / 86_400));
}

/** Time Fraction = Days / 365 */
export function timeFraction(days: number): number {
  return days / DAYS_PER_YEAR;
}

export class LongPnLCalculator {
  /** Gross PnL(Long) = size × (Floating − Fixed) × (Days/365) */
  static gross(size: number, fixedRate: number, floatingRate: number, days: number): number {
    return size * (floatingRate - fixedRate) * timeFraction(days);
  }

  /** Long Spread = Underlying APR − Implied/Fixed APR */
  static spread(underlyingApr: number, fixedApr: number): number {
    return underlyingApr - fixedApr;
  }

  /**
   * Long Break-Even: Floating = Fixed + TotalCosts / (Size × Days/365)
   * (فلوطینگی که Net PnL = 0 می‌کند)
   */
  static breakEven(fixedRate: number, totalCosts: number, size: number, days: number): number {
    const denom = size * timeFraction(days);
    return denom > 0 ? fixedRate + totalCosts / denom : fixedRate;
  }
}

export class ShortPnLCalculator {
  /** Gross PnL(Short) = size × (Fixed − Floating) × (Days/365) */
  static gross(size: number, fixedRate: number, floatingRate: number, days: number): number {
    return size * (fixedRate - floatingRate) * timeFraction(days);
  }

  /** Short Spread = Implied/Fixed APR − Underlying APR */
  static spread(fixedApr: number, underlyingApr: number): number {
    return fixedApr - underlyingApr;
  }

  /** Short Break-Even: Floating = Fixed − TotalCosts / (Size × Days/365) */
  static breakEven(fixedRate: number, totalCosts: number, size: number, days: number): number {
    const denom = size * timeFraction(days);
    return denom > 0 ? fixedRate - totalCosts / denom : fixedRate;
  }
}

/** Rate Sensitivity (1%) = size × 0.01 × (Days/365) — تغییر PnL به ازای +۱٪ APR */
export function calcRateSensitivity(size: number, days: number): number {
  return size * 0.01 * timeFraction(days);
}

/** PnL عمومی بر اساس جهت (برای سناریوها) */
export function calcDirectionalPnl(
  direction: BorosDirection,
  size: number,
  fixedRate: number,
  floatingRate: number,
  days: number
): number {
  return direction === 'long'
    ? LongPnLCalculator.gross(size, fixedRate, floatingRate, days)
    : ShortPnLCalculator.gross(size, fixedRate, floatingRate, days);
}

/** Break-Even عمومی بر اساس جهت */
export function calcBreakEven(
  direction: BorosDirection,
  fixedRate: number,
  totalCosts: number,
  size: number,
  days: number
): number {
  return direction === 'long'
    ? LongPnLCalculator.breakEven(fixedRate, totalCosts, size, days)
    : ShortPnLCalculator.breakEven(fixedRate, totalCosts, size, days);
}
