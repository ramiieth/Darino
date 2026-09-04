/** ============================================================
 * Boros Calculation Engine — ScenarioCalculator (اصلاح ممیزی)
 *
 * اصلاحات:
 *  ۱) Ordering اقتصادی تضمین‌شده: Bear ≤ Base ≤ Bull (Floating APR)
 *     — Bull = max(P75, Current)، Bear = min(P25, Current)
 *     — دیگر هرگز Bull < Base رخ نمی‌دهد (باگ قبلی)
 *  ۲) بدون داده تاریخی کافی (≥۱۰ نقطه) → N/A (null) — هرگز Fallback خودسرانه
 *  ۳) نقش اقتصادی هر سناریو (Adverse/Base/Favorable) بر اساس جهت Position:
 *     Long:  نرخ پایین = Adverse · نرخ بالا = Favorable
 *     Short: نرخ پایین = Favorable · نرخ بالا = Adverse
 * ============================================================ */
import { percentile } from './stats';
import type { BorosDirection } from '../types';

export interface ScenarioConfig {
  bearPct: number;
  basePct: number; // 50 = median؛ یا از Current استفاده شود
  bullPct: number;
}

export const DEFAULT_SCENARIO_CONFIG: ScenarioConfig = {
  bearPct: 25,
  basePct: 50,
  bullPct: 75
};

export interface ScenarioRates {
  bear: number;
  base: number;
  bull: number;
}

/** حداقل مشاهدات تاریخی برای سناریو (کمتر → N/A — هرگز داده ساختگی) */
export const MIN_SCENARIO_HISTORY = 10;

/**
 * ساخت نرخ‌های سناریو از سری تاریخی APR:
 *  Base = Current · Bear = min(P25, Current) · Bull = max(P75, Current)
 *  → همیشه Bear ≤ Base ≤ Bull (Ordering تضمین‌شده — INVALID_SCENARIO_ORDER ممکن نیست)
 *  اگر داده تاریخی کافی نبود → null (N/A)
 */
export function buildScenarioRates(
  historicalApr: number[],
  currentUnderlyingApr: number,
  config: ScenarioConfig = DEFAULT_SCENARIO_CONFIG
): ScenarioRates | null {
  const hasData = historicalApr.length >= MIN_SCENARIO_HISTORY;
  if (!hasData) return null;

  const p25 = percentile(historicalApr, config.bearPct) ?? currentUnderlyingApr;
  const p75 = percentile(historicalApr, config.bullPct) ?? currentUnderlyingApr;

  // Ordering اقتصادی: Bear هرگز از Current بالاتر و Bull هرگز از Current پایین‌تر نیست
  const bear = Math.min(p25, currentUnderlyingApr);
  const bull = Math.max(p75, currentUnderlyingApr);

  return {
    bear,
    base: currentUnderlyingApr,
    bull
  };
}

/** نقش اقتصادی سناریو بر اساس جهت Position */
export type ScenarioRole = 'adverse' | 'base' | 'favorable';

/** برچسب فارسی نقش اقتصادی — با توضیح جهت */
export function scenarioRoleLabel(role: ScenarioRole, direction: BorosDirection): string {
  if (role === 'base') return 'پایه (Base)';
  if (role === 'adverse')
    return direction === 'long' ? 'بدبینانه (Adverse)' : 'نامطلوب (Adverse)';
  return direction === 'long' ? 'خوش‌بینانه (Favorable)' : 'مطلوب (Favorable)';
}

export interface ScenarioInput {
  direction: BorosDirection;
  size: number;
  fixedRate: number;
  days: number;
  totalCosts: number;
  marginRequired: number;
}

export interface ScenarioPnl {
  /** کلید خام نرخ (bear/base/bull) */
  rateKey: 'bear' | 'base' | 'bull';
  /** نقش اقتصادی (Adverse/Base/Favorable) — بر اساس جهت */
  role: ScenarioRole;
  label: string;
  /** نرخ شناور فرضی (Decimal) */
  floatingRate: number;
  gross: number;
  net: number;
  roi: number; // روی مارجین
  roiNotional: number; // روی نotional
}

/** PnL سناریو: gross(Long/Short) − Total Costs */
export function scenarioNetPnl(
  direction: BorosDirection,
  size: number,
  fixedRate: number,
  scenarioFloating: number,
  days: number,
  totalCosts: number
): number {
  const gross =
    direction === 'long'
      ? size * (scenarioFloating - fixedRate) * (days / 365)
      : size * (fixedRate - scenarioFloating) * (days / 365);
  return gross - totalCosts;
}

export type ScenarioResult = {
  bear: ScenarioPnl;
  base: ScenarioPnl;
  bull: ScenarioPnl;
} | null;

export class ScenarioCalculator {
  /**
   * اجرای سناریوها با Ordering اقتصادی تضمین‌شده:
   *  Long:  bear(Adverse) ≤ base ≤ bull(Favorable)  →  PnL افزایشی
   *  Short: bear(Favorable) ≥ base ≥ bull(Adverse)  →  PnL کاهشی
   */
  static run(input: ScenarioInput, rates: ScenarioRates | null): ScenarioResult {
    if (!rates) return null;

    const make = (
      rateKey: 'bear' | 'base' | 'bull',
      floating: number,
      role: ScenarioRole
    ): ScenarioPnl => {
      const net = scenarioNetPnl(input.direction, input.size, input.fixedRate, floating, input.days, input.totalCosts);
      const gross = net + input.totalCosts;
      return {
        rateKey,
        role,
        label: scenarioRoleLabel(role, input.direction),
        floatingRate: floating,
        gross,
        net,
        roi: input.marginRequired > 0 ? (net / input.marginRequired) * 100 : 0,
        roiNotional: input.size > 0 ? (net / input.size) * 100 : 0
      };
    };

    // نقش اقتصادی بر اساس جهت:
    //  Long  → bear = Adverse, bull = Favorable
    //  Short → bear = Favorable, bull = Adverse
    const longDirection = input.direction === 'long';
    return {
      bear: make('bear', rates.bear, longDirection ? 'adverse' : 'favorable'),
      base: make('base', rates.base, 'base'),
      bull: make('bull', rates.bull, longDirection ? 'favorable' : 'adverse')
    };
  }
}
