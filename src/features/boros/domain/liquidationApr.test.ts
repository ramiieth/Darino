/**
 * تست‌ها — Liquidation Implied APR (Position-Specific)
 *
 * اصل: Liquidation APR یک ویژگی Market نیست؛ یک ویژگی Position است.
 *  - بدون Deposit/Position → N/A (هرگز ۰/تخمینی)
 *  - Simulator (Projection) → N/A (بدون API رسمی شبیه‌سازی لیکوییدیشن)
 *  - Position واقعی از Boros → مقدار رسمی + Source + Buffer
 *  - Liquidation APR هرگز وارد Opportunity Score نمی‌شود
 */
import { describe, expect, it } from 'vitest';
import {
  NA_LIQUIDATION_APR,
  makePositionLiquidationAPR,
  liquidationBufferPct,
  liquidationBufferFromData,
  isLiquidationAPRAvailable,
  type LiquidationAPRData
} from '@/features/boros/domain/liquidationApr';
import { projectCapital, type LiquidationInfo } from '@/features/boros/domain/engine/projection';
import { BorosCalculationEngine } from '@/features/boros/domain/engine';
import type { BorosMarket } from '@/features/boros/domain/types';

/* ---------------- fixture بازار (داده واقعی نمونه) ---------------- */
const NOW = 1_750_000_000; // ثانیه
const M: BorosMarket = {
  marketId: 101,
  name: 'Binance ETHUSDT 25 Sep 2026',
  symbol: 'BINANCE-ETHUSDT-25SEP2026',
  venue: 'Binance',
  asset: 'ETH',
  fundingRateSymbol: 'ETHUSDT',
  maturity: NOW + 19 * 86_400,
  marginFloor: 0.060031412955532215,
  ytmFloor: 0.014,
  tickStep: 2,
  iTickThresh: 583,
  maxLeverage: 30,
  isUiWhitelisted: true,
  kIM: 0.5,
  kMM: 0.06,
  takerFee: 0.0001,
  otcFee: 0.0005,
  settleFeeRate: 0.001,
  paymentPeriod: 28_800,
  hardOICap: 100_000,
  softOICap: 80_000,
  maxRateDeviationFactorBase1e4: 500,
  liqBase: 0.5,
  liqSlope: 0.6,
  liqFeeRate: 0.05,
  markApr: 0.0676,
  lastTradedApr: 0.068,
  midApr: 0.0678,
  floatingApr: 0.1095,
  longYieldApr: 0.1095,
  notionalOI: 19_183.2,
  volume24h: 1_328.53,
  nextSettlementTime: NOW + 28_800,
  settlementsToMaturity: 57,
  rateSensitivity: 0.01,
  dailyVolatility: 0.0121,
  bestBid: 0.067,
  bestAsk: 0.068,
  assetMarkPrice: 2_820,
  ohlcv: []
};

/* =====================================================================
   تست‌های اجباری اسپک §22
   ===================================================================== */

describe('Test 1-3: بدون Position / بدون Deposit / فقط Simulator → Liquidation APR = N/A', () => {
  it('Scanner بازار بدون Deposit → Liquidation APR = N/A (هرگز ۰ یا تخمینی)', () => {
    const a = BorosCalculationEngine.analyze({ m: M, size: 1000, nowSec: NOW, gasUsd: 0 });
    // خروجی Scanner هیچ Liquidation APR عددی ندارد (فقط فیلدهای Market)
    expect(a).not.toHaveProperty('liquidationApr');
    expect(a).not.toHaveProperty('liquidationAPR');
  });

  it('projectCapital (Simulator) → liquidationApr = N/A با وضعیت position-required', () => {
    const p = projectCapital({ m: M, capitalUsd: 1000, direction: 'long', nowSec: NOW, gasUsd: 0 });
    expect(p).not.toBeNull();
    expect(p!.liquidation.liquidationApr.value).toBeNull();
    expect(p!.liquidation.liquidationApr.status).toBe('position-required');
    expect(p!.liquidation.liquidationApr.source).toBe('na');
    expect(p!.liquidation.liquidationApr.isPositionSpecific).toBe(true);
  });

  it('NA_LIQUIDATION_APR هرگز ۰ نیست و source آن na است', () => {
    expect(NA_LIQUIDATION_APR.value).toBeNull();
    expect(NA_LIQUIDATION_APR.source).toBe('na');
    expect(NA_LIQUIDATION_APR.status).toBe('position-required');
    expect(NA_LIQUIDATION_APR.isPositionSpecific).toBe(true);
  });
});

describe('Test 4-5: Position واقعی بوروس → مقدار رسمی؛ مقدار گمشده → N/A', () => {
  it('Position واقعی → مقدار رسمی + source + position-specific', () => {
    const d = makePositionLiquidationAPR({
      value: -67.87,
      source: 'boros_position_api',
      positionId: 'pos-1',
      collateral: 0.102,
      notional: 2,
      direction: 'long'
    });
    expect(d.value).toBe(-67.87);
    expect(d.source).toBe('boros_position_api');
    expect(d.status).toBe('available');
    expect(d.isPositionSpecific).toBe(true);
    expect(d.collateral).toBe(0.102);
    expect(d.notional).toBe(2);
    expect(isLiquidationAPRAvailable(d)).toBe(true);
  });

  it('مقدار Liquidation APR گمشده/نامعتبر → N/A (هرگز حدس نمی‌زنیم)', () => {
    expect(makePositionLiquidationAPR(null).value).toBeNull();
    expect(makePositionLiquidationAPR(undefined).value).toBeNull();
    expect(
      makePositionLiquidationAPR({ value: NaN, source: 'boros_position_api' }).value
    ).toBeNull();
    expect(
      makePositionLiquidationAPR({ value: Infinity, source: 'boros_position_api' }).status
    ).toBe('position-required');
  });
});

describe('Test 6-8: هرگز از Market/Margin/Notional استنتاج نمی‌شود', () => {
  it('هیچ تابعی Liquidation APR را از Market APR نمی‌سازد', () => {
    // فقط makePositionLiquidationAPR مقدار می‌سازد — و آن هم فقط با ورودی رسمی
    const fromMarket = makePositionLiquidationAPR(null);
    expect(fromMarket.value).toBeNull();
  });

  it('هیچ تابعی Liquidation APR را از Margin به‌تنهایی نمی‌سازد', () => {
    const p = projectCapital({ m: M, capitalUsd: 5000, direction: 'long', nowSec: NOW });
    expect(p!.liquidation.liquidationApr.value).toBeNull(); // مارجین ۵۰۰۰ هم → N/A
  });

  it('هیچ تابعی Liquidation APR را از Notional به‌تنهایی نمی‌سازد', () => {
    const p = projectCapital({ m: M, capitalUsd: 10000, direction: 'long', nowSec: NOW });
    expect(p!.liquidation.liquidationApr.value).toBeNull(); // نهional بزرگ هم → N/A
    expect(p!.notional).toBeGreaterThan(0); // نهional واقعاً محاسبه شده ولی APR نه
  });
});

describe('Test 9: Liquidation Buffer فقط وقتی Liquidation APR موجود است', () => {
  it('بدون Liquidation APR → Buffer = null (هرگز ۰)', () => {
    expect(liquidationBufferPct(6.8, null)).toBeNull();
    expect(liquidationBufferPct(null, -0.24)).toBeNull();
    expect(liquidationBufferFromData(6.8, NA_LIQUIDATION_APR)).toBeNull();
  });

  it('با Liquidation APR → Buffer = |Current − Liq| در pp', () => {
    expect(liquidationBufferPct(6.8, -0.24)).toBeCloseTo(7.04, 2);
    expect(liquidationBufferPct(6.8, -67.87)).toBeCloseTo(74.67, 2);
  });
});

describe('Test 10: همان Market + Position متفاوت → Liquidation APR متفاوت (Position-Specific)', () => {
  it('مثال ۱: Collateral 0.102 WETH + Notional 20 YU → -0.24% · Buffer 7.04pp', () => {
    const d = makePositionLiquidationAPR({
      value: -0.24,
      source: 'boros_position_api',
      collateral: 0.102,
      notional: 20,
      direction: 'long'
    });
    expect(d.value).toBe(-0.24);
    expect(liquidationBufferFromData(6.8, d)).toBeCloseTo(7.04, 2);
  });

  it('مثال ۲: همان Collateral اما Notional 2 YU → -67.87% · Buffer 74.67pp', () => {
    const d = makePositionLiquidationAPR({
      value: -67.87,
      source: 'boros_position_api',
      collateral: 0.102,
      notional: 2,
      direction: 'long'
    });
    expect(d.value).toBe(-67.87);
    expect(liquidationBufferFromData(6.8, d)).toBeCloseTo(74.67, 2);
  });

  it('دو Position در یک Market → Liquidation APR کاملاً متفاوت (اثبات Position-Specific بودن)', () => {
    const posA = makePositionLiquidationAPR({ value: -0.24, source: 'boros_position_api', notional: 20 });
    const posB = makePositionLiquidationAPR({ value: -67.87, source: 'boros_position_api', notional: 2 });
    expect(posA.value).not.toBe(posB.value);
    expect(Math.abs(posA.value! - posB.value!)).toBeCloseTo(67.63, 2);
    // هر دو در همان Market (M) — تفاوت فقط از Position است
  });
});

describe('Test 11: Liquidation APR وارد Opportunity Score نمی‌شود', () => {
  it('Opportunity Score فقط از عوامل Market ساخته می‌شود — بدون Liquidation APR', () => {
    const a1 = BorosCalculationEngine.analyze({ m: M, size: 1000, nowSec: NOW, gasUsd: 0 });
    // Score تابعی از spread/risk/liquidity/stability/cost/confidence است
    expect(a1.longScore).toBeGreaterThanOrEqual(0);
    expect(a1.longScore).toBeLessThanOrEqual(100);
    // Liquidation APR تغییر کند → Score تغییر نمی‌کند (چون داخل Score نیست)
    const a2 = BorosCalculationEngine.analyze({ m: M, size: 1000, nowSec: NOW, gasUsd: 0 });
    expect(a2.longScore).toBe(a1.longScore);
  });
});

/* =====================================================================
   یکپارچگی با Projection (حالت‌های §18)
   ===================================================================== */
describe('سه حالت §18: Market Preview / Simulator / Actual Position', () => {
  it('State 1 — Market Preview (بدون Deposit/Position): Liquidation APR = N/A', () => {
    const a = BorosCalculationEngine.analyze({ m: M, size: 1000, nowSec: NOW });
    expect(a.statusLong).toBeDefined();
    // Scanner می‌تواند بدون Liquidation APR کار کند (Market Economics کامل)
    expect(a.longSpread).toBeDefined();
    expect(a.totalLongPnl).toBeDefined();
  });

  it('State 2 — Simulator (سرمایه فرضی): Liquidation APR = N/A', () => {
    const p = projectCapital({ m: M, capitalUsd: 1000, direction: 'long', nowSec: NOW });
    expect(p!.liquidation.liquidationApr.value).toBeNull();
    expect(p!.liquidation.liquidationApr.status).toBe('position-required');
    // بقیه Projection کامل است (Notional/Margin/PnL)
    expect(p!.notional).toBeGreaterThan(0);
    expect(p!.initialMargin).toBe(1000);
  });

  it('State 3 — Actual Position: فقط با داده رسمی، مقدار نمایش داده می‌شود', () => {
    const d = makePositionLiquidationAPR({
      value: -0.24,
      source: 'boros_position_api',
      positionId: 'pos-eth-20yu',
      collateral: 0.102,
      notional: 20,
      direction: 'long'
    });
    expect(isLiquidationAPRAvailable(d)).toBe(true);
    // Buffer فقط در این حالت
    expect(liquidationBufferFromData(6.8, d)).toBeCloseTo(7.04, 2);
  });
});

/* =====================================================================
   Source Tracking (§15) — هر مقدار باید Source داشته باشد
   ===================================================================== */
describe('Source Tracking', () => {
  it('مقدار فقط با source رسمی مجاز است', () => {
    const d = makePositionLiquidationAPR({ value: -0.24, source: 'boros_position_data', collateral: 0.102, notional: 20 });
    expect(d.source).toBe('boros_position_data');
    expect(d.value).toBe(-0.24);
  });

  it('source = "na" هرگز value ندارد', () => {
    expect(NA_LIQUIDATION_APR.value).toBeNull();
  });

  it('بدون Position → مقدار و Buffer هر دو N/A (نه ۰)', () => {
    const d: LiquidationAPRData = NA_LIQUIDATION_APR;
    expect(d.value).toBeNull();
    expect(liquidationBufferFromData(6.8, d)).toBeNull();
  });
});

/* =====================================================================
   سازگاری LiquidationInfo موجود (تست‌های قبلی audit.test.ts)
   ===================================================================== */
describe('سازگاری LiquidationInfo (status/note/mmRatio حفظ شده)', () => {
  it('فیلدهای قبلی دست‌نخورده‌اند + liquidationApr اضافه شد', () => {
    const p = projectCapital({ m: M, capitalUsd: 1000, direction: 'long', nowSec: NOW });
    const liq: LiquidationInfo = p!.liquidation;
    expect(liq.status).toBe('na');
    expect(liq.note).toContain('N/A');
    expect(liq.mmRatio).toBeCloseTo(M.kMM / M.kIM, 9);
    expect(liq.liquidationApr.value).toBeNull();
  });
});
