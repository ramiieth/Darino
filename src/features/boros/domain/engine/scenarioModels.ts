/** ============================================================
 * Boros Scenario Models — سه مدل سناریو (Master Prompt §3-5)
 *
 *  A) Constant Current Rate: Floating = Current Underlying (برچسب «ثابت ماندن نرخ فعلی»)
 *  B) Mean-Reversion: نرخ به‌تدریج به سمت میانگین (7D/30D/90D) حرکت می‌کند
 *     — اگر داده تاریخی کافی نیست → N/A (هرگز داده ساختگی)
 *  C) Stress: Bear/Base/Bull با مقدار Stress از داده واقعی (volatility/توزیع/بازه)
 *     — اولویت: historical volatility ← rate distribution ← 7D/30D range ← N/A
 * ============================================================ */
import { mean, sampleStdDev } from './stats';
import type { BorosDirection } from '../types';

/* ---------------- A) Constant Current Rate ---------------- */

export interface ConstantRateScenario {
  model: 'constant';
  label: string; // «سناریوی ثابت ماندن نرخ فعلی»
  floatingRate: number;
  /** PnL اگر نرخ فعلی تا سررسید ثابت بماند */
  settlementPnl: number;
  netPnl: number;
  roiOnMargin: number;
}

/** A) فرض: Floating Rate = Current Underlying در تمام مدت — هرگز Forecast قطعی نامیده نمی‌شود */
export function constantRateScenario(input: {
  direction: BorosDirection;
  size: number;
  fixedRate: number;
  currentFloating: number;
  days: number;
  totalCosts: number;
  margin: number;
}): ConstantRateScenario {
  const diff =
    input.direction === 'long'
      ? input.currentFloating - input.fixedRate
      : input.fixedRate - input.currentFloating;
  const settlementPnl = input.size * diff * (input.days / 365);
  const netPnl = settlementPnl - input.totalCosts;
  return {
    model: 'constant',
    label: 'ثابت ماندن نرخ فعلی',
    floatingRate: input.currentFloating,
    settlementPnl,
    netPnl,
    roiOnMargin: input.margin > 0 ? (netPnl / input.margin) * 100 : 0
  };
}

/* ---------------- B) Mean-Reversion ---------------- */

export interface MeanReversionScenario {
  model: 'mean-reversion';
  /** null = N/A (داده تاریخی کافی نیست) */
  available: boolean;
  label: string;
  targetRate: number | null; // میانگین هدف (7D/30D/90D ترکیبی)
  currentRate: number | null;
  /** PnL با حرکت تدریجی به سمت میانگین */
  settlementPnl: number | null;
  netPnl: number | null;
  roiOnMargin: number | null;
  note: string;
}

/**
 * B) بازگشت تدریجی به میانگین:
 *  میانگین هدف = میانگین وزنی 7D (0.5) و 30D (0.3) و 90D (0.2) — اگر موجود باشند
 *  حرکت تدریجی: نرخ مؤثر = میانگین (Current → Target) در طول دوره (نه انتقال یکباره)
 */
export function meanReversionScenario(input: {
  direction: BorosDirection;
  size: number;
  fixedRate: number;
  currentFloating: number;
  days: number;
  totalCosts: number;
  margin: number;
  avg7d: number | null;
  avg30d: number | null;
  avg90d: number | null;
}): MeanReversionScenario {
  const hasData = input.avg7d !== null || input.avg30d !== null || input.avg90d !== null;
  if (!hasData || input.days <= 0) {
    return {
      model: 'mean-reversion',
      available: false,
      label: 'بازگشت به میانگین',
      targetRate: null,
      currentRate: input.currentFloating,
      settlementPnl: null,
      netPnl: null,
      roiOnMargin: null,
      note: 'داده تاریخی کافی برای سناریوی بازگشت به میانگین در دسترس نیست (N/A)'
    };
  }
  // میانگین وزنی هدف
  const parts: { v: number; w: number }[] = [];
  if (input.avg7d !== null) parts.push({ v: input.avg7d, w: 0.5 });
  if (input.avg30d !== null) parts.push({ v: input.avg30d, w: 0.3 });
  if (input.avg90d !== null) parts.push({ v: input.avg90d, w: 0.2 });
  const totalW = parts.reduce((s, p) => s + p.w, 0);
  const target = parts.reduce((s, p) => s + p.v * p.w, 0) / totalW;

  // حرکت تدریجی: نرخ مؤثر = میانگین نقطه‌ای (Current + Target)/2 (خطی در طول دوره)
  const effectiveRate = (input.currentFloating + target) / 2;
  const diff =
    input.direction === 'long'
      ? effectiveRate - input.fixedRate
      : input.fixedRate - effectiveRate;
  const settlementPnl = input.size * diff * (input.days / 365);
  const netPnl = settlementPnl - input.totalCosts;
  return {
    model: 'mean-reversion',
    available: true,
    label: 'بازگشت تدریجی به میانگین',
    targetRate: target,
    currentRate: input.currentFloating,
    settlementPnl,
    netPnl,
    roiOnMargin: input.margin > 0 ? (netPnl / input.margin) * 100 : 0,
    note: `حرکت تدریجی از نرخ فعلی به میانگین ${(target * 100).toFixed(2)}٪ (میانگین وزنی 7D/30D/90D)`
  };
}

/* ---------------- C) Stress Scenario ---------------- */

export interface StressScenario {
  model: 'stress';
  bearRate: number;
  baseRate: number;
  bullRate: number;
  /** مقدار Stress (از داده واقعی — نه دلخواه) */
  stressAmount: number;
  stressSource: string;
  bear: { settlementPnl: number; netPnl: number; roiOnMargin: number };
  base: { settlementPnl: number; netPnl: number; roiOnMargin: number };
  bull: { settlementPnl: number; netPnl: number; roiOnMargin: number };
}

export interface StressConfig {
  /** چند برابر انحراف معیار برای Stress (پیش‌فرض 1 = یک σ) */
  sigmaMultiplier: number;
  /** سقف Stress (نسبت) — جلوگیری از مقادیر غیرواقعی */
  maxStress: number;
}

export const DEFAULT_STRESS_CONFIG: StressConfig = { sigmaMultiplier: 1, maxStress: 0.15 };

/**
 * C) Stress از داده واقعی Market:
 *  ۱) Historical volatility (انحراف معیار) ← ارجح
 *  ۲) Historical rate distribution (P10/P90) — اگر vol صفر است
 *  ۳) 7D/30D range (max−min)
 *  ۴) داده کافی نیست → N/A (برمی‌گردانیم null)
 */
export function stressScenario(input: {
  direction: BorosDirection;
  size: number;
  fixedRate: number;
  currentFloating: number;
  days: number;
  totalCosts: number;
  margin: number;
  historicalApr: number[];
  config?: StressConfig;
}): StressScenario | null {
  const cfg = input.config ?? DEFAULT_STRESS_CONFIG;
  const hist = (input.historicalApr ?? []).filter((c) => c > 0);
  if (hist.length < 10) return null; // داده کافی نیست → N/A

  const vol = sampleStdDev(hist);
  let stress = vol * cfg.sigmaMultiplier;
  let source = `انحراف معیار تاریخی (σ=${(vol * 100).toFixed(2)}٪)`;

  if (stress <= 1e-9 || !Number.isFinite(stress)) {
    // فالبک: توزیع (P10/P90) یا بازه
    const sorted = [...hist].sort((a, b) => a - b);
    const p10 = sorted[Math.max(0, Math.floor(sorted.length * 0.1))];
    const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
    stress = (p90 - p10) / 2;
    source = 'بازه توزیع تاریخی (P10-P90)';
  }
  if (stress <= 1e-9) {
    const range = Math.max(...hist) - Math.min(...hist);
    stress = range / 2;
    source = 'بازه 7D/30D تاریخی';
  }
  stress = Math.min(stress, cfg.maxStress);

  const bearRate = Math.max(0, input.currentFloating - stress);
  const bullRate = input.currentFloating + stress;
  const mk = (rate: number) => {
    const diff =
      input.direction === 'long' ? rate - input.fixedRate : input.fixedRate - rate;
    const settlementPnl = input.size * diff * (input.days / 365);
    const netPnl = settlementPnl - input.totalCosts;
    return {
      settlementPnl,
      netPnl,
      roiOnMargin: input.margin > 0 ? (netPnl / input.margin) * 100 : 0
    };
  };
  return {
    model: 'stress',
    bearRate,
    baseRate: input.currentFloating,
    bullRate,
    stressAmount: stress,
    stressSource: source,
    bear: mk(bearRate),
    base: mk(input.currentFloating),
    bull: mk(bullRate)
  };
}

/* ---------------- Scenario Robustness (Master §26) ---------------- */

export type Robustness = 'robust' | 'conditional' | 'not-attractive' | 'na';

/** برچسب فارسی Robustness */
export const ROBUSTNESS_LABEL: Record<Robustness, string> = {
  robust: 'فرصت پایدار (تمام سناریوها مثبت)',
  conditional: 'فرصت مشروط (Base مثبت، Bear منفی)',
  'not-attractive': 'جذاب نیست (Base منفی)',
  na: 'داده ناکافی'
};

/**
 * طبقه‌بندی بر اساس سناریوها:
 *  Robust: Bear/Base/Bull همگی مثبت
 *  Conditional: Base مثبت ولی Bear منفی
 *  Not Attractive: Base منفی
 *  N/A: داده کافی نیست
 */
export function classifyRobustness(input: {
  bearNet: number | null;
  baseNet: number | null;
  bullNet: number | null;
}): Robustness {
  const { bearNet, baseNet, bullNet } = input;
  if (bearNet === null || baseNet === null || bullNet === null) return 'na';
  if (baseNet <= 0) return 'not-attractive';
  if (bearNet > 0) return 'robust';
  return 'conditional';
}
