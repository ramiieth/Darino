/**
 * ⑬ آپشن (Derive) — موتور محاسبه؛ مدل زبانی فقط این اعداد را توضیح می‌دهد
 *
 * قیمت‌گذاری   Black-76 روی قیمت Forward (همان مبنای Derive)، نرخ تنزیل ≈ ۱
 *   d1 = (ln(F/K) + σ²T/2) / (σ√T) · d2 = d1 − σ√T
 *   Call = F·N(d1) − K·N(d2) · Put = K·N(−d2) − F·N(−d1)
 * Payoff سررسید  Σ (± ارزش ذاتی ∓ پرمیوم) × مقدار ؛ تکه‌ای خطی ← Breakeven دقیق از نقاط شکست (Strikeها)
 * حداکثر سود/ضرر  ارزیابی در ۰، همهٔ Strikeها و شیب انتهای بالا (شیب ≠ ۰ یعنی نامحدود)
 * احتمال سود    سهم توزیع ضمنی lognormal (σ = IV در پول) که Payoff در آن مثبت است:
 *   P(S_T > x) = N( (ln(F/x) − σ²T/2) / (σ√T) )
 * هیچ عددی حدس زده نمی‌شود: پرمیوم از Bid/Ask/Mark خود Derive، IV و Greeks از تیکر Derive.
 */

export type OptionType = 'C' | 'P';
export type Side = 'buy' | 'sell';

export interface OptionLeg {
  kind: 'option';
  type: OptionType;
  side: Side;
  strike: number;
  qty: number;
  /** قیمت ورود هر واحد (دلار) */
  premium: number;
  /** IV کسری (۰٫۵ = ۵۰٪) برای ارزش‌گذاری پیش از سررسید */
  iv: number | null;
  name?: string;
  delta?: number | null;
  gamma?: number | null;
  theta?: number | null;
  vega?: number | null;
}

export interface SpotLeg {
  kind: 'spot';
  side: Side;
  qty: number;
  entry: number;
}

export type Leg = OptionLeg | SpotLeg;

/* ---------------- توزیع نرمال و Black-76 ---------------- */

/** CDF نرمال استاندارد (Abramowitz–Stegun 26.2.17، خطا < ۷.۵e-8) */
export function normCdf(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

export function black76(type: OptionType, F: number, K: number, T: number, sigma: number): number {
  if (!(F > 0) || !(K > 0)) return 0;
  if (!(T > 0) || !(sigma > 0)) return Math.max(0, type === 'C' ? F - K : K - F);
  const s = sigma * Math.sqrt(T);
  const d1 = (Math.log(F / K) + (s * s) / 2) / s;
  const d2 = d1 - s;
  return type === 'C' ? F * normCdf(d1) - K * normCdf(d2) : K * normCdf(-d2) - F * normCdf(-d1);
}

/** احتمال S_T > x زیر توزیع ضمنی */
export function probAbove(F: number, x: number, T: number, sigma: number): number {
  if (!(x > 0)) return 1;
  if (!(F > 0) || !(T > 0) || !(sigma > 0)) return F > x ? 1 : 0;
  const s = sigma * Math.sqrt(T);
  return normCdf((Math.log(F / x) - (s * s) / 2) / s);
}

/* ---------------- Payoff ---------------- */

const sign = (s: Side) => (s === 'buy' ? 1 : -1);

/** سود/زیان در سررسید با قیمت S (دلار) */
export function payoffAt(legs: readonly Leg[], S: number): number {
  let total = 0;
  for (const l of legs) {
    if (l.kind === 'spot') total += sign(l.side) * (S - l.entry) * l.qty;
    else {
      const intrinsic = Math.max(0, l.type === 'C' ? S - l.strike : l.strike - S);
      total += sign(l.side) * (intrinsic - l.premium) * l.qty;
    }
  }
  return total;
}

/** سود/زیان پیش از سررسید: T سال مانده، IV هر طرف + ivShift (کسری) */
export function valueAt(legs: readonly Leg[], S: number, T: number, ivShift = 0): number {
  let total = 0;
  for (const l of legs) {
    if (l.kind === 'spot') total += sign(l.side) * (S - l.entry) * l.qty;
    else {
      const iv = l.iv === null ? null : Math.max(0.01, l.iv + ivShift);
      const price = iv === null ? Math.max(0, l.type === 'C' ? S - l.strike : l.strike - S) : black76(l.type, S, l.strike, T, iv);
      total += sign(l.side) * (price - l.premium) * l.qty;
    }
  }
  return total;
}

export interface PositionStats {
  /** خالص پرمیوم: مثبت = دریافتی (Credit)، منفی = پرداختی (Debit) */
  netPremium: number;
  /** null = نامحدود */
  maxProfit: number | null;
  /** مثبت؛ null = نامحدود */
  maxLoss: number | null;
  breakevens: number[];
  /** احتمال تقریبی سود در سررسید (۰ تا ۱)؛ null بدون IV */
  pop: number | null;
  greeks: { delta: number | null; gamma: number | null; theta: number | null; vega: number | null };
}

/** آمار پوزیشن از Payoff تکه‌ای خطی؛ F و T و σ برای احتمال سود */
export function positionStats(legs: readonly Leg[], F: number, T: number, sigma: number | null): PositionStats {
  const strikes = [...new Set(legs.flatMap((l) => (l.kind === 'option' ? [l.strike] : [])))].sort((a, b) => a - b);
  const top = Math.max(F, ...strikes, 1) * 4;
  const points = [0, ...strikes, top];
  const values = points.map((p) => payoffAt(legs, p));
  // شیب بعد از آخرین نقطه (بالای همهٔ Strikeها)
  const slopeHigh = payoffAt(legs, top + 1) - values[values.length - 1];
  const finiteMax = Math.max(...values);
  const finiteMin = Math.min(...values);
  const maxProfit = slopeHigh > 1e-9 ? null : finiteMax;
  const maxLoss = slopeHigh < -1e-9 ? null : Math.max(0, -finiteMin);

  // Breakevenها: ریشهٔ هر تکهٔ خطی
  const breakevens: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i], points[i + 1]];
    const [va, vb] = [values[i], values[i + 1]];
    if (va === 0 && i > 0) breakevens.push(a);
    else if ((va < 0 && vb > 0) || (va > 0 && vb < 0)) breakevens.push(a + ((b - a) * -va) / (vb - va));
  }
  const last = values[values.length - 1];
  // بالای همهٔ Strikeها: اگر مقدار و شیب علامت مخالف دارند، یک ریشهٔ دیگر هست
  if (slopeHigh !== 0 && last * slopeHigh < 0) breakevens.push(top - last / slopeHigh);

  // احتمال سود: بازه‌های بین Breakevenها که وسطشان سودده است
  let pop: number | null = null;
  if (sigma !== null && sigma > 0 && T > 0) {
    const edges = [0, ...breakevens.sort((x, y) => x - y), Infinity];
    pop = 0;
    for (let i = 0; i < edges.length - 1; i++) {
      const lo = edges[i];
      const hi = edges[i + 1];
      const mid = hi === Infinity ? Math.max(lo * 1.5, lo + 1) : (lo + hi) / 2;
      if (payoffAt(legs, mid) > 0) pop += probAbove(F, lo, T, sigma) - (hi === Infinity ? 0 : probAbove(F, hi, T, sigma));
    }
  }

  const sum = (pick: (l: OptionLeg) => number | null | undefined, spot: number) => {
    let s = 0;
    for (const l of legs) {
      if (l.kind === 'spot') s += sign(l.side) * spot * l.qty;
      else {
        const g = pick(l);
        if (g === null || g === undefined) return null;
        s += sign(l.side) * g * l.qty;
      }
    }
    return s;
  };
  const netPremium = legs.reduce((s, l) => (l.kind === 'option' ? s - sign(l.side) * l.premium * l.qty : s), 0);
  return {
    netPremium,
    maxProfit,
    maxLoss,
    breakevens: [...new Set(breakevens.map((b) => Math.round(b * 100) / 100))].sort((x, y) => x - y),
    pop,
    greeks: { delta: sum((l) => l.delta, 1), gamma: sum((l) => l.gamma, 0), theta: sum((l) => l.theta, 0), vega: sum((l) => l.vega, 0) }
  };
}

/* ---------------- وضعیت بازار ---------------- */

/** نوسان تاریخی سالانه از قیمت‌های بسته‌شدن روزانه (انحراف معیار بازده لگاریتمی × √۳۶۵) */
export function historicalVol(closes: readonly number[]): number | null {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) if (closes[i - 1] > 0 && closes[i] > 0) r.push(Math.log(closes[i] / closes[i - 1]));
  if (r.length < 10) return null;
  const mean = r.reduce((s, x) => s + x, 0) / r.length;
  const variance = r.reduce((s, x) => s + (x - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variance * 365);
}

export type IvRegime = 'rich' | 'cheap' | 'fair';

/** قاعدهٔ ثابت و اعلام‌شده: IV بیش از ۱۱۰٪ HV گران، کمتر از ۹۰٪ ارزان */
export function ivRegime(iv: number | null, hv: number | null): IvRegime | null {
  if (iv === null || hv === null || !(hv > 0)) return null;
  const ratio = iv / hv;
  return ratio > 1.1 ? 'rich' : ratio < 0.9 ? 'cheap' : 'fair';
}

export function trendOf(closes: readonly number[]): { change7d: number | null; change30d: number | null; aboveMa20: boolean | null } {
  const n = closes.length;
  const pct = (back: number) => (n > back && closes[n - 1 - back] > 0 ? (closes[n - 1] / closes[n - 1 - back] - 1) * 100 : null);
  const ma = n >= 20 ? closes.slice(-20).reduce((s, x) => s + x, 0) / 20 : null;
  return { change7d: pct(7), change30d: pct(30), aboveMa20: ma === null ? null : closes[n - 1] > ma };
}

/* ---------------- مدیریت سرمایه ---------------- */

export type RiskProfile = 'conservative' | 'moderate' | 'aggressive';
export const RISK_PCT: Record<RiskProfile, number> = { conservative: 2, moderate: 3.5, aggressive: 5 };

export type CapitalTier = 'small' | 'medium' | 'large';
export const capitalTier = (usd: number): CapitalTier => (usd < 1_000 ? 'small' : usd <= 10_000 ? 'medium' : 'large');

/** تعداد قرارداد: بیشترین مضرب گام که ریسک آن از سقف بیشتر نشود؛ null = حتی حداقل اندازه از سقف بیشتر است */
export function sizeByRisk(riskCapUsd: number, lossPerUnit: number, minAmount: number, step: number): number | null {
  if (!(lossPerUnit > 0)) return minAmount;
  const st = step > 0 ? step : minAmount;
  const raw = Math.floor(riskCapUsd / lossPerUnit / st + 1e-9) * st;
  const q = Math.round(raw * 1e8) / 1e8;
  return q >= minAmount ? q : null;
}
