/** ============================================================
 * Boros Capital Projection — «اگر X دلار سرمایه/مارجین وارد کنم…»
 *
 * WORLD A — PREVIEW/SIMULATION (این ماژول):
 *  مجاز: Projected Margin/Notional/Settlement PnL/Fees/Net PnL/Scenario/Rate Sensitivity/
 *        Theoretical APR Buffer/Theoretical ROI
 *  ممنوع: Actual Liquidation APR / Health Factor / Maintenance Margin / Net Balance —
 *        اینها فقط با Position واقعی (WORLD B) معتبرند.
 *
 * اصلاحات ممیزی:
 *  ۱) Liquidation Implied APR همیشه N/A (position-required) — بدون Position واقعی
 *     هرگز حدس زده نمی‌شود (نه ۰، نه تخمینی، نه از روی Projection).
 *  ۲) Theoretical APR Risk Buffer = Initial Margin / Rate Sensitivity (pp) —
 *     متریک شبیه‌ساز، هرگز با Liquidation APR واقعی یکی نیست.
 *  ۳) capitalMode = "initial-margin-only" — سرمایه دقیقاً Initial Margin است
 *     (فقط reverse فرمول Margin؛ هزینه‌ها جدا از سرمایه فرض می‌شوند).
 *  ۴) MTM سناریو = N/A وقتی Mark سناریو موجود نیست (Underlying هرگز Mark نمی‌شود).
 *  ۵) سناریوها با Ordering اقتصادی تضمین‌شده (Bear ≤ Base ≤ Bull) و نقش
 *     اقتصادی (Adverse/Base/Favorable) بر اساس جهت Position.
 * ============================================================ */
import type { BorosMarket } from '../types';
import { LongPnLCalculator, ShortPnLCalculator, calcRateSensitivity, daysToMaturity } from './pnl';
import { MarginCalculator } from './margin';
import { FeeCalculator, type FeeBreakdown } from './fees';
import { buildScenarioRates, type ScenarioRole } from './scenario';
import { historicalAprOf } from './index';
import {
  NA_LIQUIDATION_APR,
  type LiquidationAPRData
} from '@/features/boros/domain/liquidationApr';

/* ---------------- Scenario Projection ---------------- */

export interface ScenarioProjection {
  label: string;
  /** نقش اقتصادی (Adverse/Base/Favorable) — بر اساس جهت Position */
  role: ScenarioRole;
  /** کلید خام نرخ */
  rateKey: 'bear' | 'base' | 'bull';
  /** فرضیات */
  assumedMark: number | null; // از API عمومی در دسترس نیست → N/A
  assumedUnderlyingApr: number;
  assumedFloatingRate: number;
  daysToMaturity: number;
  /** PnL */
  settlementPnl: number;
  mtmPnl: number | null; // null = N/A (Mark سناریو در دسترس نیست)
  /** دلیل N/A بودن MTM — هرگز Underlying به‌جای Mark استفاده نمی‌شود */
  mtmReason: string;
  /** هزینه */
  fees: number;
  slippage: number;
  totalCosts: number;
  netPnl: number | null; // null = N/A (زمانی که MTM ناشناخته است)
  roiOnMargin: number | null;
}

/* ---------------- Liquidation Info ---------------- */

export interface LiquidationInfo {
  status: 'ok' | 'na';
  /** اگر مدل کامل در دسترس نیست → پیام */
  note: string;
  /** نسبت kMM/kIM (از API — اطلاعات جزئی) */
  mmRatio: number | null;
  /**
   * Liquidation Implied APR — ویژگی Position-Specific.
   * در Projection (بدون Position واقعی) همیشه N/A (position-required).
   */
  liquidationApr: LiquidationAPRData;
}

/* ---------------- Margin Breakdown ---------------- */

export interface MarginBreakdown {
  /** نرخ ورودی (Decimal) — Mark/Implied */
  rateInput: number;
  /** Rate Floor — از API (imData.marginFloor) */
  rateFloor: number;
  /** Effective Rate = max(|rate|, RateFloor) */
  effectiveRate: number;
  /** سال تا سررسید = Days/365 */
  yearsToMaturity: number;
  /** Time Floor — از پارامتر بازار (در نبود API پیش‌فرض مستند) */
  timeFloor: number;
  /** Effective Time = max(Years, TimeFloor) */
  effectiveTime: number;
  /** IM Factor — از API (config.kIM) */
  imFactor: number;
  /** فرمول: Size × EffectiveRate × EffectiveTime × IMFactor */
  formula: string;
}

/* ---------------- Capital Projection ---------------- */

export interface CapitalProjection {
  /* ورودی */
  capital: number; // سرمایه = Initial Margin (حالت initial-margin-only)
  /** حالت سرمایه: فقط Initial Margin (reverse فرمول Margin) — هزینه‌ها جدا */
  capitalMode: 'initial-margin-only';
  direction: 'long' | 'short';
  /* مشتق‌شده */
  notional: number;
  /** نسبت Notional/Capital — ⚠️ لوریج متعارف دارایی نیست */
  effectiveExposure: number;
  initialMargin: number;
  /** Round Trip: مارجین بازمحاسبه‌شده از نهional (باید = سرمایه) */
  recalculatedMargin: number;
  /* تفکیک مارجین (Audit) */
  marginBreakdown: MarginBreakdown;
  /* PnL پایه */
  entryCost: number;
  expectedSettlementPnl: number;
  expectedMtm: number;
  /** دلیل MTM پایه (ورود در Mark فعلی → Entry = Mark → MTM شروع = 0) */
  mtmReason: string;
  totalCost: number;
  expectedNetPnl: number;
  roiOnMargin: number;
  roiOnNotional: number;
  daysToMaturity: number;
  /** فقط نظری — extrapolation ریاضی، نه پیش‌بینی */
  theoreticalAnnualizedRoi: number;
  /* هزینه تفکیکی */
  fees: FeeBreakdown;
  slippage: number;
  /* Exposure / Risk Proxy */
  rateSensitivity: number;
  /** Theoretical APR Risk Buffer (pp) = Initial Margin / Rate Sensitivity
   *  ⚠️ متریک شبیه‌ساز — Liquidation APR واقعی بوروس نیست */
  theoreticalAprRiskBufferPct: number | null;
  /* لیکوییدیشن — WORLD A: همیشه N/A */
  liquidation: LiquidationInfo;
  /* سناریوها (با فرضیات صریح) — null = N/A (داده تاریخی کافی نیست) */
  scenarios: {
    bear: ScenarioProjection | null;
    base: ScenarioProjection | null;
    bull: ScenarioProjection | null;
  };
}

/**
 * لیکوییدیشن: مدل کامل از API عمومی در دسترس نیست → N/A
 * Liquidation Implied APR همیشه N/A (position-required) — بدون Position واقعی حدس زده نمی‌شود.
 */
function liquidationInfo(m: BorosMarket): LiquidationInfo {
  return {
    status: 'na',
    note: 'مدل کامل لیکوییدیشن (قیمت/حد زیان) از API عمومی در دسترس نیست — محاسبه نشده (N/A)',
    mmRatio: m.kMM > 0 && m.kIM > 0 ? m.kMM / m.kIM : null,
    liquidationApr: NA_LIQUIDATION_APR
  };
}

export interface CapitalProjectionInput {
  m: BorosMarket;
  capitalUsd: number;
  direction: 'long' | 'short';
  nowSec?: number;
  gasUsd?: number;
  slippageRate?: number | null;
}

/** تفکیک کامل مارجین — همه پارامترها از Market/API (هیچ Hardcode پنهان) */
function marginBreakdown(
  m: BorosMarket,
  rate: number,
  ytm: number,
  ytmFloor: number
): MarginBreakdown {
  const effectiveRate = Math.max(Math.abs(rate), m.marginFloor);
  const effectiveTime = Math.max(ytm, ytmFloor);
  return {
    rateInput: rate,
    rateFloor: m.marginFloor,
    effectiveRate,
    yearsToMaturity: ytm,
    timeFloor: ytmFloor,
    effectiveTime,
    imFactor: m.kIM,
    formula: 'Size × max(|Rate|, RateFloor) × max(Years, TimeFloor) × IM'
  };
}

/** ساخت سناریو با فرضیات صریح — MTM سناریو = N/A چون Mark سناریو از API در دسترس نیست */
function buildScenario(
  label: string,
  role: ScenarioRole,
  rateKey: 'bear' | 'base' | 'bull',
  m: BorosMarket,
  direction: 'long' | 'short',
  notional: number,
  fixed: number,
  floating: number,
  days: number,
  fees: FeeBreakdown,
  capital: number
): ScenarioProjection {
  const settlementPnl =
    direction === 'long'
      ? LongPnLCalculator.gross(notional, fixed, floating, days)
      : ShortPnLCalculator.gross(notional, fixed, floating, days);
  // MTM سناریو: Mark سناریو از API در دسترس نیست → N/A (هرگز $0 فرض نمی‌کنیم)
  const mtmPnl: number | null = null;
  const mtmReason =
    'MTM سناریو = N/A — Mark سناریو در دسترس نیست؛ نرخ Underlying هرگز به‌جای Mark استفاده نمی‌شود';
  const totalCosts = fees.total;
  const netPnl: number | null = settlementPnl - totalCosts; // بدون MTM (ناشناخته)
  return {
    label,
    role,
    rateKey,
    assumedMark: null, // N/A
    assumedUnderlyingApr: floating,
    assumedFloatingRate: floating,
    daysToMaturity: days,
    settlementPnl,
    mtmPnl,
    mtmReason,
    fees: fees.entryFee + fees.exitFee,
    slippage: fees.slippageCost,
    totalCosts,
    netPnl,
    roiOnMargin: capital > 0 && netPnl !== null ? (netPnl / capital) * 100 : null
  };
}

export function projectCapital(input: CapitalProjectionInput): CapitalProjection | null {
  const { m, capitalUsd, direction } = input;
  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(capitalUsd) || capitalUsd <= 0) return null;
  const days = daysToMaturity(m, nowSec);
  if (days <= 0) return null;

  const fixed = m.markApr;
  const floating = m.floatingApr;
  const ytm = Math.max(0, (m.maturity - nowSec) / 86_400 / 365);
  const ytmFloor = m.ytmFloor ?? 0.014;

  // نسبت مارجین واحد (فرمول رسمی Boros)
  const marginPerUnit = MarginCalculator.calc({
    size: 1,
    rate: fixed,
    rateFloor: m.marginFloor,
    ytm,
    ytmFloor,
    imRatio: m.kIM
  });
  if (marginPerUnit <= 0) return null;

  // ۱) سرمایه → نهional مشتق‌شده (حالت initial-margin-only)
  const notional = capitalUsd / marginPerUnit;

  // ۲) Round Trip: مارجین بازمحاسبه‌شده از نهional (باید دقیقاً = سرمایه)
  const recalculatedMargin = MarginCalculator.calc({
    size: notional,
    rate: fixed,
    rateFloor: m.marginFloor,
    ytm,
    ytmFloor,
    imRatio: m.kIM
  });

  // Leverage صریح (Notional/Capital)
  const effectiveExposure = notional / capitalUsd;

  // PnL پایه
  const grossSettlement =
    direction === 'long'
      ? LongPnLCalculator.gross(notional, fixed, floating, days)
      : ShortPnLCalculator.gross(notional, fixed, floating, days);
  const sensitivity = calcRateSensitivity(notional, days);
  // MTM پایه: ورود در Mark فعلی → Entry = Mark → MTM شروع = 0 (واقعی، نه فرض)
  const mtm = direction === 'long' ? sensitivity * ((m.markApr - fixed) / 0.01) : -sensitivity * ((m.markApr - fixed) / 0.01);
  const mtmReason =
    'MTM پایه = ورود در Mark فعلی (Entry = Mark) → MTM شروع صفر است؛ MTM سناریوها N/A چون Mark سناریو در دسترس نیست';

  // هزینه‌ها (فرمول‌های مستند رسمی Boros)
  const fees = FeeCalculator.calc({
    m,
    size: notional,
    nowSec,
    slippageRate: input.slippageRate ?? null,
    gasUsd: input.gasUsd ?? 0
  });

  const expectedNetPnl = grossSettlement + mtm - fees.total;
  const roiOnMargin = capitalUsd > 0 ? (expectedNetPnl / capitalUsd) * 100 : 0;
  const roiOnNotional = notional > 0 ? (expectedNetPnl / notional) * 100 : 0;
  const theoreticalAnnualizedRoi =
    capitalUsd > 0 && days > 0 ? (expectedNetPnl / capitalUsd) * (365 / days) * 100 : 0;

  // Theoretical APR Risk Buffer (pp) — متریک شبیه‌ساز، نه Liquidation APR
  const theoreticalAprRiskBufferPct =
    sensitivity > 0 ? capitalUsd / sensitivity : null;

  // سناریوها — Ordering تضمین‌شده + نقش اقتصادی بر اساس جهت
  const hist = historicalAprOf(m);
  const rates = buildScenarioRates(hist, floating);
  const roleFor = (r: 'bear' | 'bull'): ScenarioRole => {
    if (direction === 'long') return r === 'bear' ? 'adverse' : 'favorable';
    return r === 'bear' ? 'favorable' : 'adverse';
  };
  const labelFor = (r: 'bear' | 'bull'): string => {
    if (direction === 'long') return r === 'bear' ? 'بدبینانه (Adverse)' : 'خوش‌بینانه (Favorable)';
    return r === 'bear' ? 'مطلوب (Favorable)' : 'نامطلوب (Adverse)';
  };
  const mk = (r: 'bear' | 'base' | 'bull', rate: number): ScenarioProjection =>
    buildScenario(
      r === 'base' ? 'پایه (Base)' : labelFor(r),
      r === 'base' ? 'base' : roleFor(r),
      r,
      m,
      direction,
      notional,
      fixed,
      rate,
      days,
      fees,
      capitalUsd
    );

  return {
    capital: capitalUsd,
    capitalMode: 'initial-margin-only',
    direction,
    notional,
    effectiveExposure,
    initialMargin: capitalUsd,
    recalculatedMargin,
    marginBreakdown: marginBreakdown(m, fixed, ytm, ytmFloor),
    entryCost: fees.entryFee + fees.exitFee,
    expectedSettlementPnl: grossSettlement,
    expectedMtm: mtm,
    mtmReason,
    totalCost: fees.total,
    expectedNetPnl,
    roiOnMargin,
    roiOnNotional,
    daysToMaturity: days,
    theoreticalAnnualizedRoi,
    fees,
    slippage: fees.slippageCost,
    rateSensitivity: sensitivity,
    theoreticalAprRiskBufferPct,
    liquidation: liquidationInfo(m),
    scenarios: {
      bear: rates ? mk('bear', rates.bear) : null,
      base: rates ? mk('base', rates.base) : null,
      bull: rates ? mk('bull', rates.bull) : null
    }
  };
}

/** Round Trip Verification: |recalcMargin − capital| ≈ 0 */
export function verifyMarginRoundTrip(p: CapitalProjection): boolean {
  return Math.abs(p.recalculatedMargin - p.capital) < 1e-6 * Math.max(1, p.capital);
}
