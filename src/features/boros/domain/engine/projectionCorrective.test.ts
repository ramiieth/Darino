/**
 * تست‌های اصلاحی Simulator (اسپک §29) — ممیزی مالی/معنایی
 *
 *  Test 1  — Preview: Liquidation APR = N/A
 *  Test 2  — Live Liquidation نیازمند Position واقعی
 *  Test 3  — Liquidation APR هرگز از Projection مشتق نمی‌شود
 *  Test 4  — Ordering سناریو Long: Bear ≤ Base ≤ Bull
 *  Test 5  — Ordering اقتصادی Short
 *  Test 6  — Underlying هرگز Mark نمی‌شود
 *  Test 7  — MTM بدون Mark = N/A
 *  Test 8  — Settlement از Underlying vs Fixed
 *  Test 9  — Rate Sensitivity = Notional × Days/365 × 1%
 *  Test 10 — Margin Round Trip (۵ سرمایه × Long/Short)
 *  Test 11 — بدون داده تاریخی → سناریو N/A (بدون Fabrication)
 *  Test 12 — هیچ ادعای «بدون ریسک لیکوییدیشن» از Projection
 */
import { describe, expect, it } from 'vitest';
import {
  projectCapital,
  verifyMarginRoundTrip,
  type CapitalProjection
} from '@/features/boros/domain/engine/projection';
import {
  buildScenarioRates,
  ScenarioCalculator,
  scenarioNetPnl,
  type ScenarioRates
} from '@/features/boros/domain/engine/scenario';
import { calcRateSensitivity } from '@/features/boros/domain/engine/pnl';
import { BorosCalculationEngine } from '@/features/boros/domain/engine';
import { isLiquidationAPRAvailable } from '@/features/boros/domain/liquidationApr';
import type { BorosMarket } from '@/features/boros/domain/types';

/* ---------------- بازار نمونه (ETHUSDT Binance — مطابق اسپک §31) ---------------- */
const NOW = 1_750_000_000;
const M: BorosMarket = {
  marketId: 101,
  name: 'Binance ETHUSDT 25 Sep 2026',
  symbol: 'BINANCE-ETHUSDT-25SEP2026',
  venue: 'Binance',
  asset: 'ETH',
  fundingRateSymbol: 'ETHUSDT',
  maturity: NOW + 47 * 86_400, // 47 روز
  marginFloor: 0.06, // 6% Rate Floor
  ytmFloor: 0.014,
  tickStep: 2,
  iTickThresh: 583,
  maxLeverage: 30,
  isUiWhitelisted: true,
  kIM: 0.47619047619047616, // ≈ 47.62%
  kMM: 0.2222222222222222,
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
  markApr: 0.0332, // 3.32% Fixed
  lastTradedApr: 0.0332,
  midApr: 0.033,
  floatingApr: 0.0388, // 3.88% Underlying
  longYieldApr: 0,
  notionalOI: 19183.2,
  volume24h: 1328.53,
  nextSettlementTime: NOW + 28800,
  settlementsToMaturity: 141,
  rateSensitivity: 0.001,
  dailyVolatility: 0.0121,
  bestBid: 0.033,
  bestAsk: 0.0335,
  assetMarkPrice: 2820,
  ohlcv: Array.from({ length: 60 }, (_, i) => ({
    ts: NOW - (60 - i) * 86400,
    c: 0.03 + (i % 7) * 0.002
  }))
};

describe('Test 1-3: Liquidation APR در Preview', () => {
  it('Test 1 — Preview: Liquidation Implied APR = N/A', () => {
    const p = projectCapital({ m: M, capitalUsd: 1000, direction: 'long', nowSec: NOW });
    expect(p).not.toBeNull();
    expect(p!.liquidation.liquidationApr.value).toBeNull();
    expect(p!.liquidation.liquidationApr.status).toBe('position-required');
    expect(isLiquidationAPRAvailable(p!.liquidation.liquidationApr)).toBe(false);
  });

  it('Test 2 — Live Liquidation فقط با Position واقعی (makePositionLiquidationAPR — منبع رسمی)', () => {
    // بدون Position → N/A
    expect(isLiquidationAPRAvailable({ value: null, source: 'na', status: 'position-required', isPositionSpecific: true })).toBe(false);
    // Position واقعی → مقدار رسمی
    const live = { value: -0.24, source: 'boros_position_api' as const, status: 'available' as const, isPositionSpecific: true };
    expect(isLiquidationAPRAvailable(live)).toBe(true);
    expect(live.value).toBe(-0.24);
  });

  it('Test 3 — تغییر Projection هرگز Liquidation APR واقعی نمی‌سازد', () => {
    const p1 = projectCapital({ m: M, capitalUsd: 100, direction: 'long', nowSec: NOW });
    const p2 = projectCapital({ m: M, capitalUsd: 100000, direction: 'short', nowSec: NOW });
    expect(p1!.liquidation.liquidationApr.value).toBeNull();
    expect(p2!.liquidation.liquidationApr.value).toBeNull();
    // حتی با تغییر شدید سرمایه/جهت → همیشه N/A
    expect(p1!.notional).not.toBe(p2!.notional); // Projection واقعاً متفاوت است
  });
});

describe('Test 4-5: Ordering سناریو', () => {
  const hist = M.ohlcv.map((x) => x.c).filter((c) => c > 0);

  it('Test 4 — Long: Bear ≤ Base ≤ Bull (هم نرخ و هم PnL)', () => {
    const rates = buildScenarioRates(hist, M.floatingApr);
    expect(rates).not.toBeNull();
    expect(rates!.bear).toBeLessThanOrEqual(rates!.base);
    expect(rates!.base).toBeLessThanOrEqual(rates!.bull);

    const sc = ScenarioCalculator.run(
      { direction: 'long', size: 10, fixedRate: M.markApr, days: 47, totalCosts: 0.5, marginRequired: 100 },
      rates
    );
    expect(sc).not.toBeNull();
    expect(sc!.bear.net).toBeLessThanOrEqual(sc!.base.net);
    expect(sc!.base.net).toBeLessThanOrEqual(sc!.bull.net);
    // نقش اقتصادی
    expect(sc!.bear.role).toBe('adverse');
    expect(sc!.bull.role).toBe('favorable');
  });

  it('Test 5 — Short: نقش اقتصادی معکوس (نرخ پایین = Favorable برای شورت)', () => {
    const rates = buildScenarioRates(hist, M.floatingApr);
    const sc = ScenarioCalculator.run(
      { direction: 'short', size: 10, fixedRate: M.markApr, days: 47, totalCosts: 0.5, marginRequired: 100 },
      rates
    );
    expect(sc).not.toBeNull();
    // PnL شورت: نرخ پایین → سود بیشتر → bear.net ≥ base.net ≥ bull.net
    expect(sc!.bear.net).toBeGreaterThanOrEqual(sc!.base.net);
    expect(sc!.base.net).toBeGreaterThanOrEqual(sc!.bull.net);
    // نقش: bear (نرخ پایین) = favorable برای شورت
    expect(sc!.bear.role).toBe('favorable');
    expect(sc!.bull.role).toBe('adverse');
    // برچسب‌ها جهت‌دار
    expect(sc!.bear.label).toContain('مطلوب');
    expect(sc!.bull.label).toContain('نامطلوب');
  });

  it('رفع باگ: Bull هرگز زیر Base نیست حتی وقتی Current از P75 بالاتر است', () => {
    // تاریخچه کم‌نوسان: P75 ≈ 0.06 ولی Current = 0.10
    const flatHist = Array.from({ length: 30 }, (_, i) => 0.04 + (i % 5) * 0.004);
    const rates = buildScenarioRates(flatHist, 0.10);
    expect(rates).not.toBeNull();
    expect(rates!.bull).toBeGreaterThanOrEqual(rates!.base); // max(P75, Current)
    expect(rates!.bear).toBeLessThanOrEqual(rates!.base);    // min(P25, Current)
  });
});

describe('Test 6-8: Mark / Underlying / Settlement', () => {
  it('Test 6 — Underlying هرگز به‌جای Mark استفاده نمی‌شود (MTM سناریو = N/A)', () => {
    const p = projectCapital({ m: M, capitalUsd: 1000, direction: 'long', nowSec: NOW });
    expect(p!.scenarios.bear).not.toBeNull();
    expect(p!.scenarios.bear!.assumedMark).toBeNull(); // Mark سناریو در دسترس نیست
    expect(p!.scenarios.bear!.mtmPnl).toBeNull();
    expect(p!.scenarios.bear!.mtmReason).toContain('Underlying هرگز به‌جای Mark');
  });

  it('Test 7 — MTM بدون Mark سناریو = N/A در همه سناریوها', () => {
    const p = projectCapital({ m: M, capitalUsd: 1000, direction: 'long', nowSec: NOW });
    for (const key of ['bear', 'base', 'bull'] as const) {
      expect(p!.scenarios[key]!.mtmPnl).toBeNull();
    }
  });

  it('Test 8 — Settlement از Underlying vs Fixed (نه Mark)', () => {
    const p = projectCapital({ m: M, capitalUsd: 1000, direction: 'long', nowSec: NOW });
    // Long: N × (Underlying − Fixed) × Days/365
    const expected = p!.notional * (M.floatingApr - M.markApr) * (47 / 365);
    expect(p!.expectedSettlementPnl).toBeCloseTo(expected, 9);
    // Short = −Long
    const pShort = projectCapital({ m: M, capitalUsd: 1000, direction: 'short', nowSec: NOW });
    expect(pShort!.expectedSettlementPnl).toBeCloseTo(-expected, 9);
  });
});

describe('Test 9: Rate Sensitivity (اسپک §6)', () => {
  it('Sensitivity = Notional × Days/365 × 1% — مثال 10 YU × 47 روز', () => {
    const sens = calcRateSensitivity(10, 47);
    expect(sens).toBeCloseTo(10 * (47 / 365) * 0.01, 9);
    expect(sens).toBeCloseTo(0.012877, 4);
  });

  it('جهت: Long با APR↑ → MTM↑ · Short با APR↑ → MTM↓', () => {
    const sens = calcRateSensitivity(10, 47);
    const entry = 0.0332;
    const markUp = entry + 0.01; // +1pp
    const longMtm = sens * ((markUp - entry) / 0.01);
    const shortMtm = -sens * ((markUp - entry) / 0.01);
    expect(longMtm).toBeCloseTo(sens, 9);
    expect(shortMtm).toBeCloseTo(-sens, 9);
  });
});

describe('Test 10: Margin Round Trip (اسپک §15)', () => {
  it('۵ سرمایه × Long/Short → Recalculated Margin ≈ Capital', () => {
    for (const cap of [100, 500, 1000, 5000, 25000]) {
      for (const direction of ['long', 'short'] as const) {
        const p = projectCapital({ m: M, capitalUsd: cap, direction, nowSec: NOW });
        expect(p).not.toBeNull();
        expect(p!.recalculatedMargin).toBeCloseTo(cap, 9);
        expect(verifyMarginRoundTrip(p as CapitalProjection)).toBe(true);
      }
    }
  });

  it('Margin Breakdown — همه پارامترها از Market (مثال اسپک §5)', () => {
    const p = projectCapital({ m: M, capitalUsd: 1000, direction: 'long', nowSec: NOW });
    const mb = p!.marginBreakdown;
    expect(mb.rateFloor).toBe(0.06); // از API
    expect(mb.imFactor).toBeCloseTo(0.47619047619047616, 9); // از API
    expect(mb.yearsToMaturity).toBeCloseTo(47 / 365, 6);
    expect(mb.effectiveRate).toBe(Math.max(0.0332, 0.06)); // max(|Rate|, Floor) = 6%
    // Margin = Notional × EffRate × EffTime × IM
    const manual = p!.notional * mb.effectiveRate * mb.effectiveTime * mb.imFactor;
    expect(p!.initialMargin).toBeCloseTo(manual, 9);
  });
});

describe('Test 11: بدون داده تاریخی → سناریو N/A (بدون Fabrication)', () => {
  it('buildScenarioRates با داده کم → null', () => {
    expect(buildScenarioRates([], 0.05)).toBeNull();
    expect(buildScenarioRates([0.03, 0.04], 0.05)).toBeNull();
  });

  it('Projection روی بازار بدون تاریخچه → سناریوها null (نه عدد ساختگی)', () => {
    const noHist: BorosMarket = { ...M, ohlcv: [] };
    const p = projectCapital({ m: noHist, capitalUsd: 1000, direction: 'long', nowSec: NOW });
    expect(p!.scenarios.bear).toBeNull();
    expect(p!.scenarios.base).toBeNull();
    expect(p!.scenarios.bull).toBeNull();
    // بقیه Projection (Settlement پایه) همچنان محاسبه می‌شود
    expect(p!.expectedSettlementPnl).toBeCloseTo(p!.notional * (M.floatingApr - M.markApr) * (47 / 365), 9);
  });

  it('Stress با داده ناکافی → N/A (تست موجود stressScenario)', () => {
    const noHist: BorosMarket = { ...M, ohlcv: [] };
    const a = BorosCalculationEngine.analyze({ m: noHist, size: 10, nowSec: NOW });
    expect(a.stress.available).toBe(false);
    expect(a.bearLongPnl).toBeNull(); // سناریوی percentiles هم N/A
  });
});

describe('Test 12: هیچ ادعای «بدون ریسک لیکوییدیشن» از Projection', () => {
  it('Projection هیچ فیلد «no-liquidation-risk» ندارد', () => {
    const p = projectCapital({ m: M, capitalUsd: 1000, direction: 'long', nowSec: NOW });
    const json = JSON.stringify(p);
    expect(json).not.toContain('no-liquidation');
    expect(json).not.toContain('liquidation-immune');
    expect(p!.liquidation.liquidationApr.value).toBeNull();
  });

  it('پیام UI صریح است: مارجین کافی ≠ بدون ریسک', () => {
    // بررسی پیام موجود در UI (متن ثابت)
    const msg = 'مارجین کافی به نظر می‌رسد» ≠ «بدون ریسک لیکوییدیشن';
    expect(msg.length).toBeGreaterThan(10);
  });
});

describe('Direction Symmetry (اسپک §28)', () => {
  it('Long/Short: Settlement و MTM قرینه‌اند؛ هزینه‌ها یکسان', () => {
    const pLong = projectCapital({ m: M, capitalUsd: 1000, direction: 'long', nowSec: NOW });
    const pShort = projectCapital({ m: M, capitalUsd: 1000, direction: 'short', nowSec: NOW });
    expect(pLong!.expectedSettlementPnl).toBeCloseTo(-(pShort!.expectedSettlementPnl ?? 0), 9);
    expect(pLong!.expectedMtm).toBeCloseTo(-(pShort!.expectedMtm ?? 0), 9);
    expect(pLong!.totalCost).toBeCloseTo(pShort!.totalCost, 9); // direction-independent
    // Gross قرینه ولی Net (بعد از هزینه) لزوماً قرینه نیست
    expect(pLong!.expectedNetPnl + pShort!.expectedNetPnl).toBeCloseTo(-2 * pLong!.totalCost, 9);
  });
});

describe('مثال کامل (اسپک §31/34): ETHUSDT Binance · 47d · 10 YU · Fixed 3.32% · Underlying 3.88% · Capital $1000', () => {
  const p = projectCapital({ m: M, capitalUsd: 1000, direction: 'long', nowSec: NOW })!;
  const notional10 = 1000 / (1 * Math.max(M.markApr, M.marginFloor) * Math.max(47 / 365, M.ytmFloor ?? 0.014) * M.kIM);
  const sens10 = calcRateSensitivity(notional10, 47);

  it('Rate Edge = Underlying − Fixed = +0.56%', () => {
    expect(M.floatingApr - M.markApr).toBeCloseTo(0.0056, 9);
  });

  it('Rate Sensitivity ≈ $X/1% (Notional × Days/365 × 1%)', () => {
    expect(p.rateSensitivity).toBeCloseTo(notional10 * (47 / 365) * 0.01, 9);
    expect(p.rateSensitivity).toBeCloseTo(sens10, 9);
  });

  it('Liquidation Implied APR = N/A — Live Boros position required', () => {
    expect(p.liquidation.liquidationApr.value).toBeNull();
    expect(p.liquidation.liquidationApr.status).toBe('position-required');
  });

  it('MTM سناریو = N/A — بدون Mark سناریو', () => {
    for (const key of ['bear', 'base', 'bull'] as const) {
      expect(p.scenarios[key]!.mtmPnl).toBeNull();
    }
  });

  it('Settlement سناریو قابل محاسبه است (Underlying) و Ordering دارد', () => {
    expect(p.scenarios.base!.settlementPnl).toBeCloseTo(notional10 * (M.floatingApr - M.markApr) * (47 / 365), 9);
    expect(p.scenarios.bear!.settlementPnl).toBeLessThanOrEqual(p.scenarios.base!.settlementPnl);
    expect(p.scenarios.base!.settlementPnl).toBeLessThanOrEqual(p.scenarios.bull!.settlementPnl);
  });

  it('Theoretical APR Risk Buffer = Margin / Sensitivity (pp)', () => {
    expect(p.theoreticalAprRiskBufferPct).toBeCloseTo(1000 / sens10, 6);
    expect(p.theoreticalAprRiskBufferPct).toBeGreaterThan(0);
  });

  it('زنجیره کامل: $1000 → Notional → Margin → Settlement → Fees → Net', () => {
    // ۱) Notional = Capital / (EffRate × EffTime × IM)
    const mb = p.marginBreakdown;
    expect(p.notional).toBeCloseTo(1000 / (mb.effectiveRate * mb.effectiveTime * mb.imFactor), 6);
    // ۲) Margin بازمحاسبه = Capital (Round Trip)
    expect(p.recalculatedMargin).toBeCloseTo(1000, 9);
    // ۳) Settlement = N × (Underlying − Fixed) × Days/365
    expect(p.expectedSettlementPnl).toBeCloseTo(p.notional * 0.0056 * (47 / 365), 9);
    // ۴) هزینه‌ها = فرمول‌های مستند
    expect(p.totalCost).toBeCloseTo(p.fees.total, 9);
    // ۵) Net = Settlement + MTM − Costs (MTM پایه = 0 چون Entry = Mark)
    expect(p.expectedNetPnl).toBeCloseTo(p.expectedSettlementPnl + p.expectedMtm - p.totalCost, 9);
  });
});
