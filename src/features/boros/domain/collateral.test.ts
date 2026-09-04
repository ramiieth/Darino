/**
 * MASTER — Deposit-Aware Simulator · Collateral Scaling · Liquidation A-E
 *
 *  ۱) Test A-E حیاتی Liquidation (§49)
 *  ۲) Collateral Scaling (§50): 0.102 → 0.25 → 0.5 → 1 ETH
 *  ۳) verifyNotionalScaling / verifyMarginScaling
 *  ۴) verifyOpportunityRanking (User Capital — چندبعدی)
 *  ۵) verifyReasonEngine (Why/Why-not)
 *  ۶) Liquidation فقط با مقدار رسمی Boros (هرگز از خودمان)
 */
import { describe, expect, it } from 'vitest';
import {
  userCapitalOpportunity,
  rankUserCapitalOpportunities,
  DEFAULT_SIMULATION_COLLATERAL_ETH,
  marginPerUnitUsd
} from '@/features/boros/domain/collateral';
import { BorosCalculationEngine } from '@/features/boros/domain/engine';
import { explainOpportunity } from '@/features/boros/domain/engine/reason';
import { isLiquidationAPRAvailable, makePositionLiquidationAPR } from '@/features/boros/domain/liquidationApr';
import type { BorosMarket } from '@/features/boros/domain/types';

const NOW = 1_750_000_000;
const M: BorosMarket = {
  marketId: 101,
  name: 'Hyperliquid ETHUSDT',
  symbol: 'HYPERLIQUID-ETHUSDT',
  venue: 'Hyperliquid',
  asset: 'ETH',
  fundingRateSymbol: 'ETHUSDT',
  maturity: NOW + 19 * 86_400,
  marginFloor: 0.06,
  ytmFloor: 0.014,
  tickStep: 2,
  iTickThresh: 583,
  maxLeverage: 30,
  isUiWhitelisted: true,
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
  markApr: 0.0662, // Fixed 6.62%
  lastTradedApr: 0.0662,
  midApr: 0.066,
  floatingApr: 0.1095, // Underlying 10.95%
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
    ts: NOW - (59 - i) * 3600, // آخرین نقطه = NOW (داده تازه)
    c: 0.06 + (i % 6) * 0.003
  }))
};

/* ================= Test A-E حیاتی Liquidation (§49) ================= */
describe('Liquidation — Test A تا E (§49)', () => {
  it('Test A — بدون Deposit/Position → liquidationAPR = null', () => {
    const a = BorosCalculationEngine.analyze({ m: M, size: 1000, nowSec: NOW });
    expect(a).not.toHaveProperty('liquidationApr'); // Scanner هرگز Liquidation ندارد
    expect(a).not.toHaveProperty('liquidationAPR');
  });

  it('Test B — Simulation Collateral 0.102 ETH بدون Position واقعی → null', () => {
    const o = userCapitalOpportunity({
      m: M, direction: 'long', collateralAsset: 0.102, collateralPriceUsd: 2820, nowSec: NOW
    });
    expect(o!.liquidationApr.value).toBeNull();
    expect(o!.liquidationApr.status).toBe('position-required');
    expect(isLiquidationAPRAvailable(o!.liquidationApr)).toBe(false);
  });

  it('Test C — Boros Preview API مقدار 78.23% → نمایش با source=boros_preview', () => {
    const o = userCapitalOpportunity({
      m: M, direction: 'short', collateralAsset: 0.102, collateralPriceUsd: 2820,
      officialLiquidationApr: 78.23, nowSec: NOW
    });
    expect(o!.liquidationApr.value).toBe(78.23);
    expect(o!.liquidationApr.source).toBe('boros_preview');
    expect(isLiquidationAPRAvailable(o!.liquidationApr)).toBe(true);
  });

  it('Test D — Boros Position API مقدار -67.87% → نمایش با source=boros_position_api', () => {
    const d = makePositionLiquidationAPR({
      value: -67.87, source: 'boros_position_api', collateral: 0.102, notional: 2, direction: 'short'
    });
    expect(d.value).toBe(-67.87);
    expect(d.source).toBe('boros_position_api');
  });

  it('Test E — API بدون فیلد liquidation → N/A (نه ۰، نه calculated)', () => {
    const o = userCapitalOpportunity({
      m: M, direction: 'long', collateralAsset: 0.102, collateralPriceUsd: 2820, nowSec: NOW
    });
    expect(o!.liquidationApr.value).toBeNull();
    expect(o!.liquidationApr.source).toBe('na');
    expect(o!.liquidationApr.value).not.toBe(0);
  });
});

/* ================= Collateral Scaling (§50) ================= */
describe('Collateral Scaling — 0.102 → 0.25 → 0.5 → 1 ETH', () => {
  const collaterals = [0.102, 0.25, 0.5, 1];

  it('Notional با Collateral خطی مقیاس می‌شود (Margin فرمول رسمی)', () => {
    const mpu = marginPerUnitUsd(M, M.markApr, NOW);
    const results = collaterals.map((c) =>
      userCapitalOpportunity({ m: M, direction: 'long', collateralAsset: c, collateralPriceUsd: 2820, nowSec: NOW })!
    );
    for (let i = 0; i < results.length; i++) {
      const expectedNotional = collaterals[i] / mpu; // واحد Collateral (ETH) ÷ MPU (ETH/YU)
      expect(results[i].notional).toBeCloseTo(expectedNotional, 6);
      // Margin = Notional × MPU ≈ CollateralUSD (RoundTrip)
      expect(results[i].marginUsd).toBeCloseTo(collaterals[i] * 2820, 6);
      expect(results[i].marginUtilizationPct).toBeCloseTo(100, 3);
    }
    // مقیاس نسبی: نهional(0.5)/نهional(0.102) ≈ 0.5/0.102
    expect(results[2].notional / results[0].notional).toBeCloseTo(0.5 / 0.102, 6);
  });

  it('PnL و ROI با Collateral مقیاس می‌شوند', () => {
    const results = collaterals.map((c) =>
      userCapitalOpportunity({ m: M, direction: 'long', collateralAsset: c, collateralPriceUsd: 2820, nowSec: NOW })!
    );
    // Settlement متناسب با Notional
    expect(results[2].settlementPnl / results[0].settlementPnl).toBeCloseTo(0.5 / 0.102, 4);
    // ROI تقریباً ثابت (همان بازار — نسبت Net/Margin)
    const rois = results.map((r) => r.roiOnMargin!);
    for (let i = 1; i < rois.length; i++) {
      expect(Math.abs(rois[i] - rois[0])).toBeLessThan(0.5); // اختلاف ناچیز (فقط هزینه ثابت)
    }
  });

  it('Liquidation APR با تغییر Collateral عوض نمی‌شود (بدون Position واقعی → همیشه N/A)', () => {
    for (const c of collaterals) {
      const o = userCapitalOpportunity({ m: M, direction: 'long', collateralAsset: c, collateralPriceUsd: 2820, nowSec: NOW });
      expect(o!.liquidationApr.value).toBeNull();
    }
  });

  it('با Collateral رسمی Boros (78.23%) — مقدار برای هر Collateral از Boros می‌آید نه از ما', () => {
    // حتی اگر Collateral تغییر کند، مقدار فقط از input رسمی می‌آید
    const o1 = userCapitalOpportunity({ m: M, direction: 'short', collateralAsset: 0.102, collateralPriceUsd: 2820, officialLiquidationApr: 78.23, nowSec: NOW });
    const o2 = userCapitalOpportunity({ m: M, direction: 'short', collateralAsset: 1, collateralPriceUsd: 2820, officialLiquidationApr: 78.23, nowSec: NOW });
    expect(o1!.liquidationApr.value).toBe(o2!.liquidationApr.value); // هر دو از Boros
    expect(o1!.liquidationApr.value).toBe(78.23);
  });
});

/* ================= Rate Edge و Settlement (§11-13) ================= */
describe('Rate Edge + Settlement — Long/Short جهت‌دار', () => {
  it('Long: Edge = Underlying − Fixed = +4.33% (Fixed 6.62% / Underlying 10.95%)', () => {
    const o = userCapitalOpportunity({ m: M, direction: 'long', collateralAsset: 0.102, collateralPriceUsd: 2820, nowSec: NOW });
    expect(o!.rateEdge).toBeCloseTo(0.1095 - 0.0662, 9);
    expect(o!.rateEdge).toBeGreaterThan(0);
  });

  it('Short: Edge = Fixed − Underlying = -4.33% (نامطلوب — هرگز فرصت معرفی نمی‌شود)', () => {
    const o = userCapitalOpportunity({ m: M, direction: 'short', collateralAsset: 0.102, collateralPriceUsd: 2820, nowSec: NOW });
    expect(o!.rateEdge).toBeCloseTo(0.0662 - 0.1095, 9);
    expect(o!.rateEdge).toBeLessThan(0);
    // Net منفی → در rank قرار نمی‌گیرد
    const ranked = rankUserCapitalOpportunities([M], 0.102, 2820, { direction: 'short', nowSec: NOW, slippageRate: 0.001 });
    expect(ranked.length).toBe(0);
  });

  it('Settlement = Notional × Edge × YTM (Long)', () => {
    const o = userCapitalOpportunity({ m: M, direction: 'long', collateralAsset: 0.102, collateralPriceUsd: 2820, nowSec: NOW });
    expect(o!.settlementPnl).toBeCloseTo(o!.notional * 0.0433 * (19 / 365), 6);
  });
});

/* ================= Ranking چندبعدی (§54) ================= */
describe('Opportunity Ranking — کاربر-آگاه (چندبعدی)', () => {
  const mkMarket = (id: number, mark: number, floating: number, oi: number, vol: number): BorosMarket => ({
    ...M, marketId: id, venue: `Venue${id}`, markApr: mark, floatingApr: floating,
    notionalOI: oi, volume24h: vol,
    // تاریخچه نزدیک به نرخ شناور — بدون anomaly مصنوعی؛ آخرین نقطه = NOW (تازه)
    ohlcv: Array.from({ length: 60 }, (_, i) => ({
      ts: NOW - (59 - i) * 3600,
      c: Math.max(0.005, floating - 0.008 + (i % 5) * 0.004)
    }))
  });

  it('بازار با Spread عظیم ولی غیرقابل اجرا → هرگز رتبه اول (Spread ≠ Opportunity)', () => {
    // حجم ۲M → ظرفیت اجرای ۱۰۰K YU — برای Collateral 5 ETH (نهional ~2515 YU) کافی است
    const markets = [
      mkMarket(1, 0.0662, 0.1095, 19183, 2_000_000), // Spread +4.33% · قابل اجرا
      mkMarket(2, 0.03, 0.1095, 100, 0)              // Spread +7.95% ولی حجم ۰ → غیرقابل اجرا
    ];
    const ranked = rankUserCapitalOpportunities(markets, 5, 2820, { direction: 'long', nowSec: NOW, slippageRate: 0.0005 });
    expect(ranked.length).toBeGreaterThan(0);
    // بازار غیرقابل اجرا حذف شده
    expect(ranked.every((r) => r.marketId !== 2)).toBe(true);
  });

  it('Net منفی → هرگز Best نیست', () => {
    const neg: BorosMarket = { ...M, marketId: 55, floatingApr: 0.03 }; // Long Edge منفی
    const ranked = rankUserCapitalOpportunities([{ ...M, marketId: 1, volume24h: 2_000_000 }, neg], 5, 2820, { direction: 'long', nowSec: NOW, slippageRate: 0.0005 });
    expect(ranked.every((r) => r.marketId !== neg.marketId)).toBe(true);
  });

  it('Anomaly (Spread > 20%) → حذف از Best', () => {
    const extreme: BorosMarket = { ...M, marketId: 99, markApr: -0.5725, floatingApr: 0.0548, volume24h: 2_000_000 }; // Spread 62.73%
    const ranked = rankUserCapitalOpportunities([{ ...M, volume24h: 2_000_000 }, extreme], 5, 2820, { direction: 'long', nowSec: NOW, slippageRate: 0.0005 });
    expect(ranked.every((r) => r.marketId !== 99)).toBe(true);
  });

  it('رتبه‌بندی بر اساس userScore نزولی است', () => {
    const markets = [
      mkMarket(1, 0.0662, 0.1095, 19183, 2_000_000),
      mkMarket(2, 0.06, 0.08, 20000, 2_000_000),
      mkMarket(3, 0.07, 0.09, 15000, 2_000_000)
    ];
    const ranked = rankUserCapitalOpportunities(markets, 5, 2820, { direction: 'long', nowSec: NOW, slippageRate: 0.0005 });
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].userScore).toBeLessThanOrEqual(ranked[i - 1].userScore);
    }
  });
});

/* ================= Reason Engine (§39) ================= */
describe('verifyReasonEngine — چرا این فرصت؟', () => {
  it('explainOpportunity دلایل مثبت/منفی کمی می‌دهد', () => {
    const a = BorosCalculationEngine.analyze({ m: M, size: 1000, nowSec: NOW });
    const ex = explainOpportunity(a);
    const total = ex.positive.length + ex.negative.length;
    expect(total).toBeGreaterThan(0);
    // دلایل شامل Rate Edge/Net/Liquidity/Freshness
    const joined = [...ex.positive, ...ex.negative].map((r) => r.text).join(' ');
    expect(/نرخ زیرلایه|Settlement|نقدشوندگی|داده/.test(joined)).toBe(true);
  });

  it('بازار نامطلوب → دلیل منفی (Net منفی / Edge منفی)', () => {
    const neg: BorosMarket = { ...M, floatingApr: 0.03 };
    const a = BorosCalculationEngine.analyze({ m: neg, size: 1000, nowSec: NOW });
    const ex = explainOpportunity(a);
    expect(a.statusLong).not.toBe('potential');
    expect(ex.negative.length).toBeGreaterThan(0);
  });
});

/* ================= پیش‌فرض Collateral ================= */
describe('DEFAULT_SIMULATION_COLLATERAL_ETH', () => {
  it('پیش‌فرض = 0.102 ETH (فقط شبیه‌سازی — نه واقعی)', () => {
    expect(DEFAULT_SIMULATION_COLLATERAL_ETH).toBe(0.102);
  });
});
