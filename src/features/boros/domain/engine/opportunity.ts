/** ============================================================
 * Boros Calculation Engine — OpportunityCalculator (Part C/E/G)
 * Long Score و Short Score جدا — هرگز در یک عدد ادغام نمی‌شوند.
 * رتبه‌بندی ۸ عاملی Long/Short + Risk-Adjusted Return
 * ============================================================ */
import { LongPnLCalculator, ShortPnLCalculator } from './pnl';
import { RiskCalculator } from './risk';
import { relativeDeviation } from './stats';

/* ---------------- Spread ها (Part C-15/16) ---------------- */

export function longSpread(underlyingApr: number, impliedApr: number): number {
  return LongPnLCalculator.spread(underlyingApr, impliedApr);
}

export function shortSpread(impliedApr: number, underlyingApr: number): number {
  return ShortPnLCalculator.spread(impliedApr, underlyingApr);
}

/* ---------------- Historical Deviation (Part C-17/18) ---------------- */

export function deviation7d(currentApr: number, avg7d: number | null): number | null {
  return avg7d === null ? null : currentApr - avg7d;
}

export function deviation30d(currentApr: number, avg30d: number | null): number | null {
  return avg30d === null ? null : currentApr - avg30d;
}

/* ---------------- Opportunity Score (Part E-24) ---------------- */

export interface OppWeights {
  expectedReturn: number;
  risk: number;
  liquidity: number;
  stability: number;
  costEfficiency: number;
  dataConfidence: number;
}

export const DEFAULT_OPP_WEIGHTS: OppWeights = {
  expectedReturn: 0.25,
  risk: 0.2,
  liquidity: 0.2,
  stability: 0.15,
  costEfficiency: 0.1,
  dataConfidence: 0.1
};

export interface OppInput {
  /** بازده خالص موردانتظار نرمال‌شده ۰..۱ (بر اساس spread و PnL) */
  expectedReturn: number;
  /** ریسک ۰..۱۰۰ (پایین = بهتر) */
  riskScore: number;
  /** نقدشوندگی ۰..۱ */
  liquidityScore: number;
  /** پایداری تاریخی ۰..۱ (۱ = پایدار) */
  stabilityScore: number;
  /** کارایی هزینه ۰..۱ (۱ = هزینه کم) */
  costEfficiency: number;
  /** اطمینان داده ۰..۱ (۱ = کامل) */
  dataConfidence: number;
}

export class OpportunityCalculator {
  /** خروجی ۰..۱۰۰ — وزن‌ها Configurable */
  static score(i: OppInput, w: OppWeights = DEFAULT_OPP_WEIGHTS): number {
    const s =
      i.expectedReturn * w.expectedReturn +
      (1 - i.riskScore / 100) * w.risk +
      i.liquidityScore * w.liquidity +
      i.stabilityScore * w.stability +
      i.costEfficiency * w.costEfficiency +
      i.dataConfidence * w.dataConfidence;
    return Math.max(0, Math.min(100, s * 100));
  }

  /**
   * Risk-Adjusted Return = Expected Net Return / normalized Risk Score
   * فقط برای Ranking — نه به‌عنوان سود تضمینی.
   */
  static riskAdjustedReturn(expectedNetReturn: number, riskScore100: number): number {
    const denom = RiskCalculator.normalizedNonZero(riskScore100);
    return expectedNetReturn / denom;
  }
}

/* ---------------- نرمال‌سازی Spread (برای ورود به Score) ---------------- */

/** نرمال‌سازی spread: ۰..۱ (spread ۵٪+ → ۱، ۰٪ → ۰.۵، منفی → ۰) */
export function normalizeSpread(spread: number, positive = true): number {
  if (positive) {
    return Math.max(0, Math.min(1, (spread + 0.02) / 0.07));
  }
  return Math.max(0, Math.min(1, (-spread + 0.02) / 0.07));
}

/* ---------------- رتبه‌بندی ۸ عاملی (Part G-29/30) ---------------- */

export interface RankFactors {
  spread: number;
  expectedNetPnl: number;
  riskScore: number;
  liquidityScore: number;
  stabilityScore: number;
  fees: number;
  marginEfficiency: number;
  /** زیان سناریوی Bear (قدر مطلق) — null = N/A (داده تاریخی کافی نیست → وزن خنثی) */
  scenarioDownside: number | null;
}

/**
 * امتیاز ترکیبی رتبه‌بندی (۰..۱۰۰) — Spread به تنهایی کافی نیست:
 * Market با Spread بزرگ ولی نقدشوندگی/پایداری بد، نباید اول شود.
 */
export function rankScore(f: RankFactors): number {
  const spreadN = Math.max(0, Math.min(1, (f.spread + 0.02) / 0.07));
  const pnlN = Math.max(0, Math.min(1, f.expectedNetPnl / 50));
  const riskN = 1 - f.riskScore / 100;
  const feeN = 1 - Math.min(1, f.fees / (Math.abs(f.expectedNetPnl) + 1));
  // سناریوی N/A → وزن خنثی (نه «بدون ریسک» — هرگز ادعای بی‌خطری نمی‌کنیم)
  const downN = f.scenarioDownside === null ? 0.5 : 1 - Math.min(1, f.scenarioDownside / 50);
  const s =
    spreadN * 0.25 +
    pnlN * 0.2 +
    riskN * 0.15 +
    f.liquidityScore * 0.15 +
    f.stabilityScore * 0.1 +
    f.marginEfficiency * 0.075 +
    feeN * 0.05 +
    downN * 0.025;
  return Math.max(0, Math.min(100, s * 100));
}

export { relativeDeviation };
