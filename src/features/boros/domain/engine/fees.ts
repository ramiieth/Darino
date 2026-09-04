/** ============================================================
 * Boros Calculation Engine — FeeCalculator (مطابق مستندات رسمی Boros)
 *
 * منبع: docs.pendle.finance/boros-dev/Mechanics/Fees
 *
 *  ۱) Position Opening Fee (Taker/OTC):
 *     Fee = |Position Size| × Fee Rate × Time to Maturity
 *     (پایه: Position Size — ضربدر YTM؛ مثال رسمی: 100 × 0.0005 × 0.2466 = 0.01233)
 *
 *  ۲) Settlement Fee (هر دوره):
 *     Settlement Fee = |Position Size| × Settlement Fee Rate × Settlement Period
 *     (پایه: |Position Size| — نه Gross PnL؛ مثال رسمی: 50 × 0.002 × 0.000913 = 0.0000913)
 *
 *  ۳) Market Entrance Fee: یک‌بار ~$۱ (از CashFeeData.marketEntranceFee — در API عمومی نیست → N/A)
 *  ۴) Gas: فقط User Input (هرگز حدس نمی‌زنیم)
 *  ۵) Slippage: فقط با داده واقعی Order Book/شبیه‌سازی
 * ============================================================ */
import { daysToMaturity } from './pnl';
import type { BorosMarket } from '../types';

/** زمان تا سررسید به سال (برای فرمول‌های زمان‌مقیاس) */
export function ytmYears(m: BorosMarket, nowSec: number): number {
  return Math.max(0, (m.maturity - nowSec) / 86_400 / 365);
}

/** طول هر دوره تسویه به سال (paymentPeriod ثانیه → سال) */
export function periodYears(m: BorosMarket): number {
  return (m.paymentPeriod || 28800) / (365 * 24 * 3600);
}

export interface FeeInput {
  m: BorosMarket;
  size: number; // |Position Size| (نotional)
  nowSec: number;
  /** نرخ اسلیپج (نسبتی) — از Order Book/شبیه‌سازی؛ null اگر داده نیست */
  slippageRate?: number | null;
  gasUsd?: number;
}

export interface FeeBreakdown {
  /** Entry = |size| × takerFee × YTM (مستندات رسمی) */
  entryFee: number;
  /** Exit = |size| × takerFee × YTM (همان فرمول خروج) */
  exitFee: number;
  /** Settlement = |size| × settleFeeRate × periodYears × تعداد تسویه (مستندات رسمی) */
  settlementCost: number;
  /** Entrance — از API عمومی در دسترس نیست → ۰ با منبع N/A */
  entranceFee: number;
  gasFee: number;
  slippageCost: number;
  total: number;
}

export class FeeCalculator {
  /**
   * Position Opening Fee (مستندات رسمی):
   *  Fee = |Position Size| × Fee Rate × Time to Maturity
   */
  static openingFee(size: number, feeRate: number, ytm: number): number {
    return Math.abs(size) * feeRate * ytm;
  }

  /**
   * Settlement Fee هر دوره (مستندات رسمی):
   *  Fee = |Position Size| × Settlement Fee Rate × Settlement Period
   *  مجموع = Fee هر دوره × تعداد تسویه‌ها تا سررسید
   */
  static settlementFee(
    size: number,
    settleFeeRate: number,
    periodY: number,
    settlementsCount: number
  ): number {
    return Math.abs(size) * settleFeeRate * periodY * settlementsCount;
  }

  /** تعداد تسویه‌ها تا سررسید (از API یا محاسبه از paymentPeriod) */
  static settlementsCount(m: BorosMarket, nowSec: number): number {
    if (m.settlementsToMaturity > 0) return m.settlementsToMaturity;
    const days = daysToMaturity(m, nowSec);
    const periodDays = (m.paymentPeriod || 28800) / 86_400;
    return Math.max(1, Math.floor(days / periodDays));
  }

  static slippageCost(size: number, executionRate: number | null, referenceRate: number): number {
    if (executionRate === null || !Number.isFinite(executionRate)) return 0;
    return size * Math.abs(executionRate - referenceRate);
  }

  static calc(f: FeeInput): FeeBreakdown {
    const ytm = ytmYears(f.m, f.nowSec);
    const nSettle = FeeCalculator.settlementsCount(f.m, f.nowSec);

    const entryFee = FeeCalculator.openingFee(f.size, f.m.takerFee, ytm);
    const exitFee = FeeCalculator.openingFee(f.size, f.m.takerFee, ytm);
    const settlementCost = FeeCalculator.settlementFee(
      f.size,
      f.m.settleFeeRate,
      periodYears(f.m),
      nSettle
    );
    const gasFee = f.gasUsd ?? 0;
    const slippageCost = FeeCalculator.slippageCost(f.size, f.slippageRate ?? null, f.m.markApr);
    const entranceFee = 0; // از API عمومی در دسترس نیست → N/A (منبع: na)

    return {
      entryFee,
      exitFee,
      settlementCost,
      entranceFee,
      gasFee,
      slippageCost,
      total: entryFee + exitFee + settlementCost + entranceFee + gasFee + slippageCost
    };
  }
}
