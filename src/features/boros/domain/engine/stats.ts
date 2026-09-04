/** ============================================================
 * Boros Calculation Engine — آمار توصیفی (Part C/D)
 * میانگین، انحراف معیار نمونه، Z-Score، Percentile، Turnover
 * ============================================================ */

/** میانگین حسابی */
export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** انحراف معیار نمونه (N−1) — APR Volatility */
export function sampleStdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/** Z-Score: (current − mean) / stddev — تشخیص Extreme (|Z| > 2) */
export function zScore(current: number, xs: number[]): number | null {
  if (xs.length < 2) return null;
  const sd = sampleStdDev(xs);
  if (sd === 0) return null;
  return (current - mean(xs)) / sd;
}

export type ExtremeLevel = 'normal' | 'high' | 'low';

/** تفسیر Z-Score: Z>+2 = High Extreme، Z<−2 = Low Extreme */
export function extremeLevel(z: number | null): ExtremeLevel {
  if (z === null) return 'normal';
  if (z > 2) return 'high';
  if (z < -2) return 'low';
  return 'normal';
}

/** Percentile (روش نزدیک‌ترین رتبه) — برای سناریوهای Bear/Base/Bull */
export function percentile(xs: number[], p: number): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

/** Turnover Ratio = 24H Volume / Open Interest (فقط شاخص تحلیلی) */
export function turnoverRatio(volume24h: number, oi: number): number | null {
  if (!Number.isFinite(volume24h) || !Number.isFinite(oi) || oi <= 0) return null;
  return volume24h / oi;
}

/** انحراف نسبی: (current − avg) / |avg| × 100 — اگر avg نزدیک صفر → null (N/A) */
export function relativeDeviation(current: number, avg: number | null): number | null {
  if (avg === null || !Number.isFinite(avg) || Math.abs(avg) < 1e-9) return null;
  return ((current - avg) / Math.abs(avg)) * 100;
}
