/**
 * MASTER CORRECTIVE — تست‌های اجباری یکپارچه Boros (اسپک §44-45)
 *
 *  ۱) verifyPreviewDoesNotPretendToBePosition
 *  ۲) verifyActivePositionUsesActualCollateral
 *  ۳) verifyNoDoubleCounting (Fees)
 *  ۴) verifyLiquidityFilter
 *  ۵) verifyNegativeNetNeverRanksBest
 *  ۶) verifyExtremeSpreadNeverAutomaticallyRanksBest
 *  ۷) CRITICAL INTEGRATION TEST §45:
 *       Scanner (ETHUSDT Fixed 6.62% / Underlying 10.95%) → Liquidation APR = N/A
 *       Simulator (2 YU)                                  → Liquidation APR = N/A
 *       Order Preview (بدون مقدار رسمی)                     → Liquidation APR = N/A
 *       Position واقعی (Collateral 0.102 ETH / 2 YU)       → Liquidation APR = 78.23% [BOROS]
 *  ۸) مثال §4: Short 2 YU · Collateral 0.102 ETH · Sensitivity 0.00104 ETH/1%
 */
import { describe, expect, it } from 'vitest';
import { BorosCalculationEngine } from '@/features/boros/domain/engine';
import { projectCapital } from '@/features/boros/domain/engine/projection';
import { orderPreview } from '@/features/boros/domain/preview';
import {
  makePositionLiquidationAPR,
  isLiquidationAPRAvailable,
  liquidationBufferPct
} from '@/features/boros/domain/liquidationApr';
import { FeeCalculator } from '@/features/boros/domain/engine/fees';
import { calcRateSensitivity } from '@/features/boros/domain/engine/pnl';
import { assessLiquidity } from '@/features/boros/domain/engine/anomaly';
import type { BorosMarket } from '@/features/boros/domain/types';

/* ---------------- بازار: ETHUSDT (Fixed 6.62% / Underlying 10.95% / 19 روز) ---------------- */
const NOW = 1_750_000_000;
const M: BorosMarket = {
  marketId: 101,
  name: 'Hyperliquid ETHUSDT',
  symbol: 'HYPERLIQUID-ETHUSDT',
  venue: 'Hyperliquid',
  asset: 'ETH',
  fundingRateSymbol: 'ETHUSDT',
  maturity: NOW + 19 * 86_400, // 19 روز → YTM ≈ 0.052
  marginFloor: 0.06,
  ytmFloor: 0.014,
  tickStep: 2,
  iTickThresh: 583,
  maxLeverage: 30,
  isUiWhitelisted: true,
  // kIM طوری انتخاب شده که Margin مثال §4 ≈ 0.00397676 واحد را بازتولید کند
  kIM: 0.577,
  kMM: 0.25,
  takerFee: 0.0005,
  otcFee: 0.0005,
  settleFeeRate: 0.001,
  paymentPeriod: 28800,
  hardOICap: 20000,
  softOICap: 9500,
  maxRateDeviationFactorBase1e4: 2500,
  liqBase: 0.25,
  liqSlope: 0.5,
  liqFeeRate: 0.0005,
  markApr: 0.0662, // 6.62% Fixed/Implied
  lastTradedApr: 0.0662,
  midApr: 0.066,
  floatingApr: 0.1095, // 10.95% Underlying
  longYieldApr: 0,
  notionalOI: 19183.2,
  volume24h: 1328.53,
  nextSettlementTime: NOW + 28800,
  settlementsToMaturity: 57,
  rateSensitivity: 0.001,
  dailyVolatility: 0.0121,
  bestBid: 0.066,
  bestAsk: 0.0664,
  assetMarkPrice: 2820,
  ohlcv: Array.from({ length: 60 }, (_, i) => ({
    ts: NOW - (60 - i) * 86400,
    c: 0.06 + (i % 6) * 0.003
  }))
};

describe('1) verifyPreviewDoesNotPretendToBePosition (MODE C)', () => {
  it('Order Preview بدون Position واقعی → hasLivePosition=false و Liquidation APR = N/A', () => {
    const pv = orderPreview({
      m: M,
      availableCollateral: 0.102,
      collateralPriceUsd: 2820,
      direction: 'short',
      notional: 2,
      fixedApr: 0.0662,
      underlyingApr: 0.1095,
      officialLiquidationApr: null, // Boros مقدار رسمی نداده
      nowSec: NOW
    });
    expect(pv).not.toBeNull();
    expect(pv!.mode).toBe('order-preview');
    expect(pv!.hasLivePosition).toBe(false);
    expect(pv!.liquidationApr.value).toBeNull();
    expect(pv!.liquidationApr.status).toBe('position-required');
    expect(pv!.liquidationBufferPct).toBeNull();
  });

  it('Preview هرگز خودش Liquidation APR نمی‌سازد — فقط مقدار رسمی Boros پذیرفته می‌شود', () => {
    // بدون مقدار رسمی → N/A حتی با Collateral کامل
    const without = orderPreview({
      m: M, availableCollateral: 0.102, collateralPriceUsd: 2820,
      direction: 'short', notional: 2, fixedApr: 0.0662, underlyingApr: 0.1095,
      nowSec: NOW
    });
    expect(without!.liquidationApr.value).toBeNull();
    expect(without!.liquidationApr.source).toBe('na');

    // با مقدار رسمی Boros Preview → نمایش با source=boros_preview
    const withOfficial = orderPreview({
      m: M, availableCollateral: 0.102, collateralPriceUsd: 2820,
      direction: 'short', notional: 2, fixedApr: 0.0662, underlyingApr: 0.1095,
      officialLiquidationApr: 78.23,
      nowSec: NOW
    });
    expect(withOfficial!.liquidationApr.value).toBe(78.23);
    expect(withOfficial!.liquidationApr.source).toBe('boros_preview');
    expect(isLiquidationAPRAvailable(withOfficial!.liquidationApr)).toBe(true);
  });
});

describe('2) verifyActivePositionUsesActualCollateral', () => {
  it('Liquidation APR واقعی فقط با Position/Collateral واقعی — با collateral ذخیره می‌شود', () => {
    const d = makePositionLiquidationAPR({
      value: 78.23,
      source: 'boros_position_api',
      positionId: 'pos-1',
      collateral: 0.102,
      notional: 2,
      direction: 'short'
    });
    expect(d.collateral).toBe(0.102);
    expect(d.notional).toBe(2);
    expect(d.direction).toBe('short');
    expect(d.source).toBe('boros_position_api');
    // Collateral واقعی در Order Preview برای کفایت مارجین استفاده می‌شود
    const pv = orderPreview({
      m: M, availableCollateral: 0.102, collateralPriceUsd: 2820,
      direction: 'short', notional: 2, fixedApr: 0.0662, underlyingApr: 0.1095,
      nowSec: NOW
    });
    expect(pv!.collateralSufficient).not.toBeNull();
  });
});

describe('3) verifyNoDoubleCounting (Fees)', () => {
  it('Entry + Exit + Settlement + Gas = Total (بدون double-count؛ Slippage جدا)', () => {
    const fees = FeeCalculator.calc({ m: M, size: 100, nowSec: NOW, gasUsd: 5, slippageRate: null });
    expect(fees.total).toBeCloseTo(fees.entryFee + fees.exitFee + fees.settlementCost + fees.gasFee + fees.slippageCost, 9);
    expect(fees.slippageCost).toBe(0); // بدون Order Book → 0 با منبع N/A
  });

  it('Slippage در Order Preview جدا از fees.total حساب می‌شود', () => {
    const pv = orderPreview({
      m: M, availableCollateral: 0.102, collateralPriceUsd: 2820,
      direction: 'long', notional: 10, fixedApr: 0.0662, underlyingApr: 0.1095,
      slippageRate: 0.001121, // 0.1121%
      nowSec: NOW
    });
    expect(pv!.slippageUsd).toBeCloseTo(10 * 0.001121, 9);
    expect(pv!.totalCostUsd).toBeCloseTo(pv!.fees.total + pv!.slippageUsd!, 9);
  });
});

describe('4) verifyLiquidityFilter', () => {
  it('نقدشوندگی پایین (حجم ۰) → available=false — بازار قابل اجرا نیست', () => {
    const thin: BorosMarket = { ...M, notionalOI: 0, volume24h: 0 };
    const a = BorosCalculationEngine.analyze({ m: thin, size: 1000, nowSec: NOW });
    expect(a.liquidity.available).toBe(false);
    expect(a.liquidity.executable).toBe(false);
  });

  it('assessLiquidity با OI/حجم کافی و target مناسب → executable', () => {
    // حجم ۱۳۲۸.۵۳ → ظرفیت تخمینی ۵٪ = ۶۶.۴
    const liq = assessLiquidity(M, 50);
    expect(liq.available).toBe(true);
    expect(liq.executable).toBe(true);
    // target بزرگ‌تر از ظرفیت → غیرقابل اجرا
    const big = assessLiquidity(M, 1000);
    expect(big.executable).toBe(false);
  });
});

describe('5) verifyNegativeNetNeverRanksBest', () => {
  it('بازار با Net منفی هرگز status=potential ندارد', () => {
    const neg: BorosMarket = { ...M, floatingApr: 0.03, markApr: 0.09 }; // spread منفی
    const a = BorosCalculationEngine.analyze({ m: neg, size: 1000, nowSec: NOW });
    expect(a.statusLong).not.toBe('potential');
    expect(['not-attractive', 'insufficient-data', 'anomaly-detected']).toContain(a.statusLong);
  });
});

describe('6) verifyExtremeSpreadNeverAutomaticallyRanksBest', () => {
  it('Spread عظیم (BRENTOIL-like) → anomaly-detected نه فرصت رتبه‌اول', () => {
    const extreme: BorosMarket = {
      ...M,
      asset: 'BRENTOIL',
      markApr: -0.5725, // Fixed = -57.25%
      floatingApr: 0.0548 // Underlying = +5.48% → Spread = +62.73%
    };
    const a = BorosCalculationEngine.analyze({ m: extreme, size: 1000, nowSec: NOW });
    expect(a.anomaly.detected).toBe(true);
    expect(a.statusLong).toBe('anomaly-detected');
  });
});

describe('7) CRITICAL INTEGRATION TEST §45 — Scanner → Simulator → Preview → Position', () => {
  it('Scanner: ETHUSDT Fixed 6.62% / Underlying 10.95% → Liquidation APR = N/A', () => {
    const a = BorosCalculationEngine.analyze({ m: M, size: 1000, nowSec: NOW });
    // Scanner هیچ Liquidation APR ندارد (فقط فیلدهای Market)
    expect(a).not.toHaveProperty('liquidationApr');
    expect(a).not.toHaveProperty('liquidationAPR');
    // بازار همچنان تحلیل می‌شود (Rate Edge / PnL / Risk)
    expect(a.longSpread).toBeCloseTo(0.1095 - 0.0662, 9);
    expect(a.longSpread).toBeGreaterThan(0);
  });

  it('Simulator: 2 YU → Liquidation APR = N/A', () => {
    const p = projectCapital({ m: M, capitalUsd: 1000, direction: 'short', nowSec: NOW });
    expect(p!.liquidation.liquidationApr.value).toBeNull();
    expect(p!.liquidation.liquidationApr.status).toBe('position-required');
  });

  it('Order Preview (بدون مقدار رسمی) → Liquidation APR = N/A', () => {
    const pv = orderPreview({
      m: M, availableCollateral: 0.102, collateralPriceUsd: 2820,
      direction: 'short', notional: 2, fixedApr: 0.0662, underlyingApr: 0.1095,
      nowSec: NOW
    });
    expect(pv!.liquidationApr.value).toBeNull();
  });

  it('Position واقعی (Collateral 0.102 ETH / Notional 2 YU) → Liquidation APR = 78.23% [BOROS]', () => {
    const d = makePositionLiquidationAPR({
      value: 78.23,
      source: 'boros_position_api',
      positionId: 'pos-eth-2yu',
      collateral: 0.102,
      notional: 2,
      direction: 'short'
    });
    expect(d.value).toBe(78.23);
    expect(d.source).toBe('boros_position_api');
    expect(isLiquidationAPRAvailable(d)).toBe(true);
    // Liquidation Buffer = |78.23 − 6.62| = 71.61 pp
    expect(liquidationBufferPct(6.62, 78.23)).toBeCloseTo(71.61, 2);
  });

  it('همان Market در Scanner و Position — دو خروجی متفاوت (تناقض نیست)', () => {
    const a = BorosCalculationEngine.analyze({ m: M, size: 1000, nowSec: NOW });
    expect(a).not.toHaveProperty('liquidationApr'); // Market-level
    const d = makePositionLiquidationAPR({ value: 78.23, source: 'boros_position_api', notional: 2 });
    expect(d.value).toBe(78.23); // Position-specific
  });
});

describe('8) مثال §4 — Short 2 YU · Collateral 0.102 ETH', () => {
  it('Rate Sensitivity = 2 × (19/365) × 1% ≈ 0.001041 (ETH-equivalent با قیمت 2820)', () => {
    const sensUsd = calcRateSensitivity(2, 19);
    expect(sensUsd).toBeCloseTo(2 * (19 / 365) * 0.01, 9);
    expect(sensUsd).toBeCloseTo(0.0010411, 6);
    const sensEth = sensUsd / 2820;
    expect(sensEth).toBeCloseTo(0.0010411 / 2820, 9);
  });

  it('Margin = 2 × max(6.62%, 6%) × (19/365) × IM ≈ 0.00397676 (واحد فرمول)', () => {
    const pv = orderPreview({
      m: M, availableCollateral: 0.102, collateralPriceUsd: 2820,
      direction: 'short', notional: 2, fixedApr: 0.0662, underlyingApr: 0.1095,
      nowSec: NOW
    });
    expect(pv!.marginRequiredUsd).toBeCloseTo(2 * 0.0662 * (19 / 365) * 0.577, 6);
    // Margin به واحد ETH (با قیمت Collateral)
    expect(pv!.marginRequiredAsset).toBeCloseTo(pv!.marginRequiredUsd / 2820, 9);
    // Collateral 0.102 از مارجین بیشتر است → کفایت ریاضی
    expect(pv!.collateralSufficient).toBe(true);
  });

  it('Short 2 YU: Fixed 6.62% < Underlying 10.95% → Settlement منفی (Pay Floating)', () => {
    const pv = orderPreview({
      m: M, availableCollateral: 0.102, collateralPriceUsd: 2820,
      direction: 'short', notional: 2, fixedApr: 0.0662, underlyingApr: 0.1095,
      nowSec: NOW
    });
    const expected = 2 * (0.0662 - 0.1095) * (19 / 365);
    expect(pv!.expectedSettlementPnl).toBeCloseTo(expected, 9);
    expect(pv!.expectedSettlementPnl).toBeLessThan(0);
    // Long همان Position → قرینه
    const pvLong = orderPreview({
      m: M, availableCollateral: 0.102, collateralPriceUsd: 2820,
      direction: 'long', notional: 2, fixedApr: 0.0662, underlyingApr: 0.1095,
      nowSec: NOW
    });
    expect(pvLong!.expectedSettlementPnl).toBeCloseTo(-(pv!.expectedSettlementPnl), 9);
  });

  it('Fees از فرمول‌های مستند — بدون double-count با Slippage', () => {
    const pv = orderPreview({
      m: M, availableCollateral: 0.102, collateralPriceUsd: 2820,
      direction: 'short', notional: 2, fixedApr: 0.0662, underlyingApr: 0.1095,
      slippageRate: 0.001121, maxSlippageRate: 0.01,
      nowSec: NOW
    });
    expect(pv!.fees.entryFee).toBeCloseTo(2 * M.takerFee * (19 / 365), 9); // |Size|×Rate×YTM
    expect(pv!.slippageUsd).toBeCloseTo(2 * 0.001121, 9); // تخمینی
    expect(pv!.maxSlippageUsd).toBeCloseTo(2 * 0.01, 9); // حداکثر
    expect(pv!.totalCostUsd).toBeCloseTo(pv!.fees.total + pv!.slippageUsd!, 9);
  });

  it('بدون Order Book → Slippage = N/A (نه ۰ جعلی)', () => {
    const pv = orderPreview({
      m: M, availableCollateral: 0.102, collateralPriceUsd: 2820,
      direction: 'short', notional: 2, fixedApr: 0.0662, underlyingApr: 0.1095,
      slippageRate: null,
      nowSec: NOW
    });
    expect(pv!.slippageUsd).toBeNull();
    expect(pv!.totalCostUsd).toBeNull(); // چون Slippage نامعلوم → Total هم N/A
    expect(pv!.expectedNetPnl).toBeNull();
  });
});
