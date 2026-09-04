/**
 * Risk Engine — Health Factor / Liquidation Distance / Risk Levels
 *
 * ⚠️ کاملاً جدا از Reference Engine: هرگز Leverage مرجع را کاهش نمی‌دهد.
 * ⚠️ HF = (Total Supply × Liquidation Threshold) / Total Borrow
 */

export type RiskLevel = 'low' | 'moderate' | 'high' | 'very-high' | 'liquidation' | 'unknown';

export const RISK_LEVEL_FA: Record<RiskLevel, string> = {
  low: 'کم',
  moderate: 'متوسط',
  high: 'زیاد',
  'very-high': 'خیلی زیاد',
  liquidation: 'در معرض لیکوییدیشن',
  unknown: 'N/A'
};

/** Health Factor = (Total Supply × LT) / Total Borrow — null اگر LT یا Borrow ناشناخته/صفر باشد */
export function healthFactor(
  totalSupply: number,
  totalBorrow: number,
  liqThreshold: number | null
): number | null {
  if (liqThreshold === null || totalBorrow <= 0 || totalSupply <= 0) return null;
  return (totalSupply * liqThreshold) / totalBorrow;
}

/** حداکثر Borrow که HF ≥ hfMin می‌ماند (ابزار ریسک — نه Reference) */
export function maxSafeBorrow(
  totalSupply: number,
  totalBorrow: number,
  liqThreshold: number | null,
  hfMin: number
): number | null {
  if (liqThreshold === null || liqThreshold >= hfMin) return null; // نامعتبر/ناشناخته
  const denom = hfMin - liqThreshold;
  if (denom <= 0) return null;
  return Math.max(0, (totalSupply * liqThreshold - hfMin * totalBorrow) / denom);
}

/** Distance تا حد ایمنی (hfMin) — معنای موجود: (1 − hfMin/HF) × 100 */
export function liquidationDistancePct(healthFactorValue: number | null, hfMin: number): number | null {
  if (healthFactorValue === null || healthFactorValue <= hfMin) return null;
  return (1 - hfMin / healthFactorValue) * 100;
}

/**
 * Distance تا لیکوییدیشن واقعی (HF=1):
 *   Collateral می‌تواند تا dd٪ افت کند که HF به ۱ برسد:
 *   B = S × LT × (1 − dd)  →  dd = 1 − B / (S × LT)
 */
export function liquidationPriceDropPct(
  totalSupply: number,
  totalBorrow: number,
  liqThreshold: number | null
): number | null {
  if (liqThreshold === null || liqThreshold <= 0 || totalBorrow <= 0 || totalSupply <= 0) return null;
  const dd = 1 - totalBorrow / (totalSupply * liqThreshold);
  return Math.max(0, dd) * 100;
}

/** طبقه‌بندی سطح ریسک بر اساس HF (مستقل از Safety Level کاربر) */
export function classifyRiskLevel(hf: number | null): RiskLevel {
  if (hf === null) return 'unknown';
  if (hf > 2.0) return 'low';
  if (hf > 1.5) return 'moderate';
  if (hf > 1.2) return 'high';
  if (hf > 1.0) return 'very-high';
  return 'liquidation';
}
