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
  size: number; // native YU, or explicitly USD-equivalent when unitPriceUsd=1
  nowSec: number;
  /** اثر اضافی نرخ بر APR — اعشاری، نه درصد قیمت توکن؛ null اگر داده نیست */
  slippageRate?: number | null;
  gasUsd?: number;
  /** USD per collateral unit; 1 when size is USD-equivalent. */
  unitPriceUsd?: number;
  /** Forecast defaults to holding until maturity; early-close must be explicit. */
  closeAtSec?: number;
}

export interface FeeBreakdown {
  /** Entry = |size| × takerFee × YTM (مستندات رسمی) */
  entryFee: number;
  /** Exit uses remaining YTM at closeAtSec, zero at maturity. */
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
    const remaining = Math.max(0, m.maturity - nowSec);
    if (!(m.paymentPeriod > 0) || remaining === 0) return 0;
    return Math.ceil(remaining / m.paymentPeriod);
  }

  static slippageCost(size: number, executionRate: number | null, referenceRate: number, ytm = 1): number {
    if (executionRate === null || !Number.isFinite(executionRate)) return 0;
    return Math.abs(size) * Math.abs(executionRate - referenceRate) * Math.max(0, ytm);
  }

  static calc(f: FeeInput): FeeBreakdown {
    const ytm = ytmYears(f.m, f.nowSec);
    const closeAt = Math.max(f.nowSec, Math.min(f.closeAtSec ?? f.m.maturity, f.m.maturity));
    const holdingYears = Math.max(0, closeAt - f.nowSec) / (365 * 86400);
    const price = f.unitPriceUsd ?? 1;
    const entryFee = FeeCalculator.openingFee(f.size, f.m.takerFee, ytm) * price;
    const exitFee = FeeCalculator.openingFee(f.size, f.m.takerFee, ytmYears(f.m, closeAt)) * price;
    // Continuous carrying-cost projection; actual debits depend on settlement fee-index events.
    const settlementCost = Math.abs(f.size) * f.m.settleFeeRate * holdingYears * price;
    const gasFee = f.gasUsd ?? 0;
    // slippageRate is an absolute APR impact (0.01 = one percentage point), not a token-price ratio.
    const slippageCost = FeeCalculator.slippageCost(f.size, f.slippageRate ?? null, 0, ytm) * price;
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
