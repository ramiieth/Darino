/** ============================================================
 * Boros — Collateral-Aware Opportunity Engine (Deposit-Aware)
 *
 * هدف: «اگر X Collateral وارد Boros کنم، کدام بازار برای من مناسب‌تر است؟»
 *
 *  - Simulation Collateral (پیش‌فرض 0.102 ETH) — فقط شبیه‌سازی؛ هرگز «واقعی/
 *    Deposited/On-chain» نمایش داده نمی‌شود.
 *  - برای هر بازار: Max Notional قابل‌دستیابی (Collateral ÷ MarginPerUnit) ← Margin ← Fees ←
 *    Settlement PnL ← Net PnL ← ROI — با Collateral مشخص.
 *  - Liquidation APR = N/A (بدون Position واقعی) — مگر مقدار رسمی Boros.
 *  - رتبه‌بندی چندبعدی: Economic Edge · Net PnL · ROI · Robustness · Liquidity ·
 *    Risk · Confidence · Anomaly · Execution Feasibility · Collateral Fit.
 *    Spread فقط یکی از ورودی‌هاست (هرگز Spread → Best).
 * ============================================================ */
import type { BorosMarket } from './types';
import { BorosCalculationEngine } from './engine';
import { MarginCalculator } from './engine/margin';
import { FeeCalculator } from './engine/fees';
import { LongPnLCalculator, ShortPnLCalculator, calcRateSensitivity, daysToMaturity } from './engine/pnl';
import { NA_LIQUIDATION_APR, type LiquidationAPRData } from '@/features/boros/domain/liquidationApr';

/** پیش‌فرض Simulation Collateral (فقط شبیه‌سازی — نه واقعی) */
export const DEFAULT_SIMULATION_COLLATERAL_ETH = 0.102;

/** نماد دارایی Collateral پیش‌فرض */
export const SIMULATION_COLLATERAL_ASSET = 'ETH';

export interface UserCapitalOpportunityInput {
  m: BorosMarket;
  direction: 'long' | 'short';
  /** Collateral شبیه‌سازی (واحد دارایی — ETH) */
  collateralAsset: number;
  /** قیمت واحد Collateral (USD) */
  collateralPriceUsd: number;
  /** Liquidation APR رسمی — فقط اگر Boros Preview/Position ارائه دهد */
  officialLiquidationApr?: number | null;
  gasUsd?: number;
  slippageRate?: number | null;
  nowSec?: number;
}

export interface UserCapitalOpportunity {
  marketId: number;
  asset: string;
  venue: string;
  maturity: number;
  daysToMaturity: number;
  direction: 'long' | 'short';
  /* ---------- نرخ‌ها (BOROS API) ---------- */
  fixedApr: number;
  underlyingApr: number;
  markApr: number;
  /** Rate Edge جهت‌دار = Underlying−Fixed (Long) یا Fixed−Underlying (Short) */
  rateEdge: number;
  /* ---------- Collateral (SIMULATED) ---------- */
  simulationCollateral: number;
  collateralPriceUsd: number;
  /** Max Notional قابل‌دستیابی با کل Collateral (YU) */
  notional: number;
  /** Margin فرمول رسمی = Notional × max(Rate,Floor) × YTM × IM (USD) */
  marginUsd: number;
  /** استفاده از Collateral = Margin/CollateralUSD (٪) */
  marginUtilizationPct: number;
  collateralSufficient: boolean;
  /* ---------- Economics (DERIVED) ---------- */
  rateSensitivityUsd: number;
  feesUsd: number;
  /** Slippage — null = N/A (بدون Order Book) */
  slippageUsd: number | null;
  settlementPnl: number;
  mtmPnl: number;
  /** Net = Settlement + MTM − Fees − Slippage — null وقتی Slippage نامعلوم */
  netPnl: number | null;
  /** ROI روی Margin (٪) */
  roiOnMargin: number | null;
  /** Economic Edge = Net − MinEdge */
  economicEdge: number | null;
  minEconomicEdge: number;
  /* ---------- Risk / Quality (از تحلیل Market — مستقل) ---------- */
  riskLevel: string;
  confidence: number;
  liquidityScore: number;
  executable: boolean;
  robustness: string;
  anomalyDetected: boolean;
  /* ---------- Liquidation (بدون Position واقعی → N/A) ---------- */
  liquidationApr: LiquidationAPRData;
  /** Score ترکیبی کاربر-آگاه (۰..۱۰۰) */
  userScore: number;
}

/** Margin فرمول رسمی Boros برای یک بازار (USD per YU) */
export function marginPerUnitUsd(
  m: BorosMarket,
  rate: number,
  nowSec: number
): number {
  const ytm = Math.max(0, (m.maturity - nowSec) / 86_400 / 365);
  return MarginCalculator.calc({
    size: 1,
    rate,
    rateFloor: m.marginFloor,
    ytm,
    ytmFloor: m.ytmFloor ?? 0.014,
    imRatio: m.kIM
  });
}

/**
 * محاسبه فرصت با Collateral مشخص:
 *  Notional = CollateralUSD / MarginPerUnit (Max قابل‌دستیابی)
 *  سپس همه اجزای اقتصادی روی همین Notional.
 */
export function userCapitalOpportunity(
  input: UserCapitalOpportunityInput
): UserCapitalOpportunity | null {
  const { m, direction } = input;
  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);
  const days = daysToMaturity(m, nowSec);
  if (days <= 0) return null;
  if (!Number.isFinite(input.collateralAsset) || input.collateralAsset <= 0) return null;
  if (!Number.isFinite(input.collateralPriceUsd) || input.collateralPriceUsd <= 0) return null;

  const fixed = m.markApr;
  const underlying = m.floatingApr;

  const mpu = marginPerUnitUsd(m, fixed, nowSec);
  if (mpu <= 0) return null;

  const collateralUsd = input.collateralAsset * input.collateralPriceUsd;
  // Max Notional قابل‌دستیابی با کل Collateral — واحد: Collateral-Asset per YU
  // (مثال Boros: 0.102 ETH → ~51 YU با MPU ≈ 0.001988 ETH/YU)
  const notional = input.collateralAsset / mpu; // YU
  // Margin مصرف‌شده = Notional × MPU × قیمت Collateral ≈ CollateralUSD (RoundTrip)
  const marginUsd = notional * mpu * input.collateralPriceUsd;
  const marginUtilizationPct = collateralUsd > 0 ? (marginUsd / collateralUsd) * 100 : 0;
  const collateralSufficient = marginUsd <= collateralUsd + 1e-9;

  const rateEdge =
    direction === 'long' ? underlying - fixed : fixed - underlying;

  const rateSensitivityUsd = calcRateSensitivity(notional, days);
  const fees = FeeCalculator.calc({
    m,
    size: notional,
    nowSec,
    slippageRate: null,
    gasUsd: input.gasUsd ?? 0
  });

  const slippageUsd =
    input.slippageRate !== null && input.slippageRate !== undefined
      ? notional * input.slippageRate
      : null;

  const settlementPnl =
    direction === 'long'
      ? LongPnLCalculator.gross(notional, fixed, underlying, days)
      : ShortPnLCalculator.gross(notional, fixed, underlying, days);

  const mtmPnl =
    direction === 'long'
      ? rateSensitivityUsd * ((m.markApr - fixed) / 0.01)
      : -rateSensitivityUsd * ((m.markApr - fixed) / 0.01);

  const totalCosts = slippageUsd !== null ? fees.total + slippageUsd : null;
  const netPnl = totalCosts !== null ? settlementPnl + mtmPnl - totalCosts : null;
  const roiOnMargin = marginUsd > 0 && netPnl !== null ? (netPnl / marginUsd) * 100 : null;

  const analysis = BorosCalculationEngine.analyze({ m, size: notional, nowSec, gasUsd: input.gasUsd ?? 0 });
  const minEdge = analysis.minEconomicEdge;
  const economicEdge = netPnl !== null ? netPnl - minEdge : null;

  const liquidationApr =
    input.officialLiquidationApr !== null && input.officialLiquidationApr !== undefined
      ? {
          value: input.officialLiquidationApr,
          source: 'boros_preview' as const,
          status: 'available' as const,
          isPositionSpecific: true,
          collateral: input.collateralAsset,
          notional,
          direction
        }
      : NA_LIQUIDATION_APR;

  // Score کاربر-آگاه (چندبعدی — Spread فقط یک ورودی):
  //  Economic Edge 30% · ROI 20% · Robustness 15% · Liquidity 10% · Risk 10%
  //  Confidence 5% · Execution 5% · Collateral Fit 5%
  const edgeN = Math.max(0, Math.min(1, (economicEdge ?? -1) / 50 + 0.5));
  const roiN = Math.max(0, Math.min(1, (roiOnMargin ?? -5) / 20));
  const robN = analysis.robustness === 'robust' ? 1 : analysis.robustness === 'conditional' ? 0.55 : 0.1;
  const exeN = analysis.liquidity.executable ? 1 : 0;
  const fitN = collateralSufficient ? 1 : 0;
  const userScore = Math.max(
    0,
    Math.min(
      100,
      (edgeN * 0.3 + roiN * 0.2 + robN * 0.15 + analysis.liquidityScore * 0.1 +
        (1 - analysis.riskScore / 100) * 0.1 + (analysis.confidence / 100) * 0.05 +
        exeN * 0.05 + fitN * 0.05) * 100
    )
  );

  return {
    marketId: m.marketId,
    asset: m.asset,
    venue: m.venue,
    maturity: m.maturity,
    daysToMaturity: days,
    direction,
    fixedApr: fixed,
    underlyingApr: underlying,
    markApr: m.markApr,
    rateEdge,
    simulationCollateral: input.collateralAsset,
    collateralPriceUsd: input.collateralPriceUsd,
    notional,
    marginUsd,
    marginUtilizationPct,
    collateralSufficient,
    rateSensitivityUsd,
    feesUsd: fees.total,
    slippageUsd,
    settlementPnl,
    mtmPnl,
    netPnl,
    roiOnMargin,
    economicEdge,
    minEconomicEdge: minEdge,
    riskLevel: analysis.riskLevel,
    confidence: analysis.confidence,
    liquidityScore: analysis.liquidityScore,
    executable: analysis.liquidity.executable,
    robustness: analysis.robustness,
    anomalyDetected: analysis.anomaly.detected,
    liquidationApr,
    userScore
  };
}

/** رتبه‌بندی فرصت‌های کاربر-آگاه برای همه بازارها (Long و Short جدا) */
export function rankUserCapitalOpportunities(
  markets: BorosMarket[],
  collateralAsset: number,
  collateralPriceUsd: number,
  opts?: {
    direction?: 'long' | 'short';
    nowSec?: number;
    gasUsd?: number;
    /** نرخ اسلیپج فرضی (نسبتی) — برای محاسبه Net در نبود Order Book عمومی */
    slippageRate?: number | null;
  }
): UserCapitalOpportunity[] {
  const nowSec = opts?.nowSec ?? Math.floor(Date.now() / 1000);
  const out: UserCapitalOpportunity[] = [];
  for (const m of markets) {
    if (opts?.direction && opts.direction !== 'long') {
      const s = userCapitalOpportunity({ m, direction: 'short', collateralAsset, collateralPriceUsd, nowSec, gasUsd: opts.gasUsd ?? 0, slippageRate: opts.slippageRate ?? null });
      if (s) out.push(s);
    }
    if (opts?.direction && opts.direction !== 'short') {
      const l = userCapitalOpportunity({ m, direction: 'long', collateralAsset, collateralPriceUsd, nowSec, gasUsd: opts.gasUsd ?? 0, slippageRate: opts.slippageRate ?? null });
      if (l) out.push(l);
    }
  }
  // اولویت: valid + executable + net مثبت + edge مثبت + score
  return out
    .filter((o) => !o.anomalyDetected)
    .filter((o) => o.executable)
    .filter((o) => (o.netPnl ?? -1) > 0)
    .filter((o) => (o.economicEdge ?? -1) > 0)
    .sort((a, b) => b.userScore - a.userScore)
    .slice(0, 10);
}
