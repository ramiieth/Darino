/** ============================================================
 * Boros — Order Preview Engine (MODE C)
 *
 * کاربر قصد باز کردن Position واقعی دارد (Deposit/Collateral موجود است)؛
 * سیستم همه چیز قابل‌محاسبه را Preview می‌کند — اما Position هنوز در Boros
 * ایجاد نشده است:
 *
 *  - Margin Required / Rate Sensitivity / Fees / Slippage / Expected PnL / ROI
 *  - Liquidation Implied APR = N/A (position-required) — مگر اینکه Boros خودش
 *    مقدار رسمی Preview ارائه کند (source = boros_preview).
 *
 * ⚠️ Preview ≠ Position — هرگز به‌عنوان Position واقعی نمایش داده نمی‌شود.
 * ⚠️ اگر پارامتری در دسترس نیست → N/A (هرگز حدس/صفر جعلی).
 * ============================================================ */
import type { BorosMarket } from './types';
import { MarginCalculator } from './engine/margin';
import { FeeCalculator, type FeeBreakdown } from './engine/fees';
import { LongPnLCalculator, ShortPnLCalculator, calcRateSensitivity, daysToMaturity } from './engine/pnl';
import {
  makePositionLiquidationAPR,
  liquidationBufferFromData,
  NA_LIQUIDATION_APR,
  type LiquidationAPRData
} from '@/features/boros/domain/liquidationApr';

export interface OrderPreviewInput {
  m: BorosMarket;
  /** Collateral موجود/قابل‌واریز کاربر (واحد دارایی — مثلاً ETH) */
  availableCollateral: number | null;
  /** قیمت واحد Collateral (USD) — برای تبدیل واحدها */
  collateralPriceUsd: number | null;
  direction: 'long' | 'short';
  /** حجم Position (YU) */
  notional: number;
  /** نرخ ورود / Fixed APR (Decimal) */
  fixedApr: number;
  /** Underlying APR فعلی (Decimal) */
  underlyingApr: number;
  /** Liquidation APR رسمی — فقط اگر Boros Preview API ارائه دهد */
  officialLiquidationApr?: number | null;
  gasUsd?: number;
  /** Slippage تخمینی (نسبتی) — از Order Book/Boros */
  slippageRate?: number | null;
  /** حداکثر Slippage مجاز (نسبتی) */
  maxSlippageRate?: number | null;
  nowSec?: number;
}

export interface OrderPreviewResult {
  /** همیشه 'order-preview' — نه Position واقعی */
  mode: 'order-preview';
  hasLivePosition: false;
  /* ---------- ورودی ---------- */
  direction: 'long' | 'short';
  notional: number;
  fixedApr: number;
  underlyingApr: number;
  availableCollateral: number | null;
  collateralPriceUsd: number | null;
  /* ---------- محاسبه‌شده (SIMULATED/CALCULATED) ---------- */
  daysToMaturity: number;
  /** Margin فرمول رسمی: Notional × max(Rate,Floor) × YTM × IM (واحد USD-equivalent) */
  marginRequiredUsd: number;
  /** Margin به واحد Collateral (فقط اگر قیمت موجود باشد) */
  marginRequiredAsset: number | null;
  /** Available Margin = Collateral − Margin (واحد Collateral) */
  availableMarginAsset: number | null;
  /** Rate Sensitivity = Notional × YTM × 1% (USD-equivalent) */
  rateSensitivityUsd: number;
  rateSensitivityAsset: number | null;
  /** Effective Exposure = Notional / Margin (⚠️ لوریج متعارف نیست) */
  effectiveExposure: number;
  fees: FeeBreakdown;
  /** Slippage تخمینی (USD) — null = N/A */
  slippageUsd: number | null;
  /** حداکثر Slippage (USD) — null = N/A */
  maxSlippageUsd: number | null;
  totalCostUsd: number | null; // null وقتی slippage نامعلوم است
  expectedSettlementPnl: number;
  /** MTM پایه (Mark فعلی vs Entry) — CALCULATED چون Mark از API موجود است */
  expectedMtm: number;
  expectedNetPnl: number | null;
  roiOnMargin: number | null;
  /* ---------- Liquidation (MODE C) ---------- */
  liquidationApr: LiquidationAPRData;
  liquidationBufferPct: number | null;
  /** Collateral کفایت مارجین را دارد؟ (فقط بررسی ریاضی — نه تضمین) */
  collateralSufficient: boolean | null;
}

export function orderPreview(input: OrderPreviewInput): OrderPreviewResult | null {
  const { m } = input;
  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(input.notional) || input.notional <= 0) return null;
  if (!Number.isFinite(input.fixedApr)) return null;
  const days = daysToMaturity(m, nowSec);
  if (days <= 0) return null;

  const ytm = Math.max(0, (m.maturity - nowSec) / 86_400 / 365);
  const ytmFloor = m.ytmFloor ?? 0.014;

  /* ---------- Margin (فرمول رسمی Boros) ---------- */
  const marginPerUnit = MarginCalculator.calc({
    size: 1,
    rate: input.fixedApr,
    rateFloor: m.marginFloor,
    ytm,
    ytmFloor,
    imRatio: m.kIM
  });
  const marginRequiredUsd = marginPerUnit * input.notional;

  /* تبدیل به واحد Collateral — فقط اگر قیمت موجود باشد */
  const price = input.collateralPriceUsd;
  const marginRequiredAsset =
    price && price > 0 ? marginRequiredUsd / price : null;
  const availableMarginAsset =
    marginRequiredAsset !== null && input.availableCollateral !== null
      ? input.availableCollateral - marginRequiredAsset
      : null;
  const collateralSufficient =
    availableMarginAsset !== null ? availableMarginAsset >= 0 : null;

  /* ---------- Rate Sensitivity ---------- */
  const rateSensitivityUsd = calcRateSensitivity(input.notional, days);
  const rateSensitivityAsset =
    price && price > 0 ? rateSensitivityUsd / price : null;

  /* ---------- Fees (مستندات رسمی — بدون double-count) ---------- */
  const fees = FeeCalculator.calc({
    m,
    size: input.notional,
    nowSec,
    slippageRate: null, // سلیپج جدا محاسبه می‌شود (نه داخل fee)
    gasUsd: input.gasUsd ?? 0
  });

  /* ---------- Slippage (سه حالت: Actual/Estimated/Unavailable) ---------- */
  const slippageUsd =
    input.slippageRate !== null && input.slippageRate !== undefined
      ? input.notional * input.slippageRate
      : null;
  const maxSlippageUsd =
    input.maxSlippageRate !== null && input.maxSlippageRate !== undefined
      ? input.notional * input.maxSlippageRate
      : null;

  const totalCostUsd =
    slippageUsd !== null ? fees.total + slippageUsd : null;

  /* ---------- Settlement PnL (Underlying vs Fixed) ---------- */
  const expectedSettlementPnl =
    input.direction === 'long'
      ? LongPnLCalculator.gross(input.notional, input.fixedApr, input.underlyingApr, days)
      : ShortPnLCalculator.gross(input.notional, input.fixedApr, input.underlyingApr, days);

  /* ---------- MTM پایه (Mark فعلی vs Entry) — CALCULATED ---------- */
  const expectedMtm =
    input.direction === 'long'
      ? rateSensitivityUsd * ((m.markApr - input.fixedApr) / 0.01)
      : -rateSensitivityUsd * ((m.markApr - input.fixedApr) / 0.01);

  const expectedNetPnl =
    totalCostUsd !== null ? expectedSettlementPnl + expectedMtm - totalCostUsd : null;
  const roiOnMargin =
    marginRequiredUsd > 0 && expectedNetPnl !== null
      ? (expectedNetPnl / marginRequiredUsd) * 100
      : null;

  /* ---------- Liquidation (MODE C) ---------- */
  const liquidationApr =
    input.officialLiquidationApr !== null &&
    input.officialLiquidationApr !== undefined
      ? makePositionLiquidationAPR({
          value: input.officialLiquidationApr,
          source: 'boros_preview',
          collateral: input.availableCollateral ?? undefined,
          notional: input.notional,
          direction: input.direction
        })
      : NA_LIQUIDATION_APR;
  const liquidationBufferPct =
    liquidationApr.value !== null
      ? liquidationBufferFromData(input.fixedApr * 100, liquidationApr)
      : null;

  return {
    mode: 'order-preview',
    hasLivePosition: false,
    direction: input.direction,
    notional: input.notional,
    fixedApr: input.fixedApr,
    underlyingApr: input.underlyingApr,
    availableCollateral: input.availableCollateral,
    collateralPriceUsd: price,
    daysToMaturity: days,
    marginRequiredUsd,
    marginRequiredAsset,
    availableMarginAsset,
    rateSensitivityUsd,
    rateSensitivityAsset,
    effectiveExposure: marginRequiredUsd > 0 ? input.notional / marginRequiredUsd : 0,
    fees,
    slippageUsd,
    maxSlippageUsd,
    totalCostUsd,
    expectedSettlementPnl,
    expectedMtm,
    expectedNetPnl,
    roiOnMargin,
    liquidationApr,
    liquidationBufferPct,
    collateralSufficient
  };
}
