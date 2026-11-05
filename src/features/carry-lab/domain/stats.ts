/**
 * آمار پایه برای آزمایشگاه کری — خالص و بدون وابستگی
 *
 *  normCdf / normInv            توزیع نرمال استاندارد (A&S 7.1.26 و الگوریتم Acklam)
 *  moments                      میانگین، انحراف معیار نمونه، چولگی و کشیدگی (غیر اضافه؛ نرمال = ۳)
 *  deflatedSharpe               احتمال اینکه شارپ واقعی از «بهترین شارپ تصادفی در N آزمون» بیشتر باشد
 *                               Bailey & López de Prado (2014), The Deflated Sharpe Ratio
 */

const EULER_GAMMA = 0.5772156649015329;

export function normCdf(x: number): number {
  // erf با خطای کمتر از 1.5e-7
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export function normInv(p: number): number {
  if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -normInv(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export interface Moments {
  n: number;
  mean: number;
  std: number;
  skew: number;
  kurt: number;
}

export function moments(xs: readonly number[]): Moments | null {
  const n = xs.length;
  if (n < 3) return null;
  const mean = xs.reduce((s, x) => s + x, 0) / n;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const x of xs) {
    const d = x - mean;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  const varPop = m2 / n;
  const std = Math.sqrt(m2 / (n - 1));
  // سری ثابت: نوسانِ باقی‌مانده فقط خطای اعشاری است و شارپ «بی‌نهایت» جعلی می‌سازد
  if (!(varPop > 0) || std <= 1e-12 * Math.max(1, Math.abs(mean))) return { n, mean, std: 0, skew: 0, kurt: 3 };
  return { n, mean, std, skew: m3 / n / varPop ** 1.5, kurt: m4 / n / varPop ** 2 };
}

/** شارپ هر دوره (سالانه نشده)؛ بدون نوسان → null */
export function periodSharpe(xs: readonly number[]): number | null {
  const m = moments(xs);
  return m && m.std > 0 ? m.mean / m.std : null;
}

export function variance(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  return xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1);
}

/**
 * بهترین شارپی که از N آزمون بی‌لبه فقط از روی شانس انتظار می‌رود
 * SR0 = √V · ((1−γ)·Φ⁻¹(1−1/N) + γ·Φ⁻¹(1−1/(N·e)))
 */
export function expectedMaxSharpe(trialsSrVariance: number, nTrials: number): number {
  if (nTrials < 2 || !(trialsSrVariance > 0)) return 0;
  return Math.sqrt(trialsSrVariance) * ((1 - EULER_GAMMA) * normInv(1 - 1 / nTrials) + EULER_GAMMA * normInv(1 - 1 / (nTrials * Math.E)));
}

/**
 * شارپ تعدیل‌شده (DSR) = Φ( (SR − SR0)·√(T−1) / √(1 − γ3·SR + (γ4−1)/4·SR²) )
 * همهٔ SRها در واحد «هر دوره» (روزانه)، نه سالانه.
 */
export function deflatedSharpe(returns: readonly number[], trialsSrVariance: number, nTrials: number): { dsr: number; sr: number; sr0: number } | null {
  const m = moments(returns);
  if (!m || !(m.std > 0)) return null;
  const sr = m.mean / m.std;
  const sr0 = expectedMaxSharpe(trialsSrVariance, nTrials);
  const denom2 = 1 - m.skew * sr + ((m.kurt - 1) / 4) * sr * sr;
  if (!(denom2 > 0)) return null;
  const z = ((sr - sr0) * Math.sqrt(m.n - 1)) / Math.sqrt(denom2);
  return { dsr: normCdf(z), sr, sr0 };
}
