/** ============================================================
 * Boros Calculation Engine — RiskCalculator (Part E-23/25)
 * Risk Score: 0 = کمترین ریسک … 100 = بیشترین ریسک
 * وزن‌ها Configurable: Volatility 30% · Liquidity 25% · APR Instability 20% · Slippage 15% · Data Quality 10%
 * ============================================================ */
import { sampleStdDev } from './stats';

export interface RiskWeights {
  volatility: number;
  liquidity: number;
  aprInstability: number;
  slippage: number;
  dataQuality: number;
}

export const DEFAULT_RISK_WEIGHTS: RiskWeights = {
  volatility: 0.3,
  liquidity: 0.25,
  aprInstability: 0.2,
  slippage: 0.15,
  dataQuality: 0.1
};

export interface RiskInput {
  /** نوسان روزانه APR (۰..۱) */
  volatility: number | null;
  /** نقدشوندگی ۰..۱ (۱ = عالی) */
  liquidityScore: number;
  /** نوسان APR تاریخی (انحراف معیار، نسبت) */
  aprInstability: number;
  /** ریسک اسلیپج ۰..۱ (از عمق/اسپرد) */
  slippageRisk: number;
  /** کیفیت داده ۰..۱ (۱ = کامل) — تاریخچه/Order Book موجود */
  dataQuality: number;
}

/** اجزای ریسک (هر کدام ۰..۱) */
export function riskComponents(i: RiskInput): Record<keyof RiskWeights, number> {
  const volFactor = i.volatility === null ? 0.5 : Math.min(1, i.volatility / 0.05);
  const liqRisk = 1 - i.liquidityScore;
  const instabFactor = Math.min(1, i.aprInstability / 0.02);
  return {
    volatility: volFactor,
    liquidity: liqRisk,
    aprInstability: instabFactor,
    slippage: i.slippageRisk,
    dataQuality: 1 - i.dataQuality
  };
}

export class RiskCalculator {
  /** خروجی ۰..۱۰۰ با وزن‌های قابل‌پیکربندی */
  static score(i: RiskInput, w: RiskWeights = DEFAULT_RISK_WEIGHTS): number {
    const c = riskComponents(i);
    const s =
      c.volatility * w.volatility +
      c.liquidity * w.liquidity +
      c.aprInstability * w.aprInstability +
      c.slippage * w.slippage +
      c.dataQuality * w.dataQuality;
    return Math.max(0, Math.min(100, s * 100));
  }

  /** نرمال‌سازی برای تقسیم (Risk-Adjusted Return): ۰ → حداقل ۱ */
  static normalizedNonZero(score100: number): number {
    return Math.max(1, score100);
  }
}

export type RiskLevel = 'کم' | 'متوسط' | 'زیاد';

export function riskLevel(score100: number): RiskLevel {
  if (score100 < 33) return 'کم';
  if (score100 < 66) return 'متوسط';
  return 'زیاد';
}

/** APR Volatility = انحراف معیار نمونه سری تاریخی APR */
export function aprVolatility(historicalApr: number[]): number {
  return sampleStdDev(historicalApr);
}
