/**
 * تست‌های اجباری — BorosCalculationEngine (Part 36)
 * مثال رسمی: Size=222, Rate=6.32%, RateFloor=8%, YTM=0.055, YTMFloor=0.014, IMRatio=0.476 → Margin ≈ 0.465569
 * + ۱۸ سناریوی فهرست‌شده در اسپک
 */
import { describe, expect, it } from 'vitest';
import { BorosCalculationEngine, MarginCalculator, YTM_FLOOR_DEFAULT, verifyOppositeDirections } from '@/features/boros/domain/engine';
import {
  LongPnLCalculator,
  ShortPnLCalculator,
  calcRateSensitivity,
  calcBreakEven,
  daysToMaturity,
  ytmOf
} from '@/features/boros/domain/engine/pnl';
import { FeeCalculator } from '@/features/boros/domain/engine/fees';
import { ScenarioCalculator, buildScenarioRates, scenarioNetPnl, DEFAULT_SCENARIO_CONFIG } from '@/features/boros/domain/engine/scenario';
import { RiskCalculator, riskLevel, DEFAULT_RISK_WEIGHTS, aprVolatility } from '@/features/boros/domain/engine/risk';
import { OpportunityCalculator, longSpread, shortSpread, rankScore } from '@/features/boros/domain/engine/opportunity';
import { mean, sampleStdDev, zScore, extremeLevel, percentile, turnoverRatio, relativeDeviation } from '@/features/boros/domain/engine/stats';
import type { BorosMarket } from '@/features/boros/domain/types';

/* ---------- بازار نمونه با پارامترهای واقعی API ---------- */
const m: BorosMarket = {
  marketId: 101,
  name: 'Binance ETHUSDT 25 Sep 2026',
  symbol: 'BINANCE-ETHUSDT-25SEP2026',
  venue: 'Binance',
  asset: 'ETH',
  fundingRateSymbol: 'ETHUSDT',
  maturity: 1790294400,
  marginFloor: 0.06,
  tickStep: 2,
  iTickThresh: 583,
  maxLeverage: 2.1,
  isUiWhitelisted: true,
  kIM: 0.47619047619047616,
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
  markApr: 0.03324,
  lastTradedApr: 0.03324,
  midApr: 0.03252,
  floatingApr: 0.0983,
  longYieldApr: 0,
  notionalOI: 1054.25,
  volume24h: 20,
  nextSettlementTime: 1786147200,
  settlementsToMaturity: 145,
  rateSensitivity: 0.00132,
  dailyVolatility: 0.00187,
  bestBid: 0.03148,
  bestAsk: 0.03355,
  assetMarkPrice: 3100,
  ohlcv: Array.from({ length: 60 }, (_, i) => ({
    ts: 1786000000 - (60 - i) * 86_400,
    // ۰.۰۵ تا ۰.۱۳ — p25 ≈ ۰.۰۷ ، p75 ≈ ۰.۱۱۲ ، current = ۰.۰۹۸۳ → bear < base < bull
    c: 0.05 + 0.0014 * i
  }))
};

const NOW = m.maturity - 20 * 86_400; // ۲۰ روز مانده

/* ================= ۱) Margin Calculator (مثال اجباری) ================= */
describe('MarginCalculator — مثال رسمی اسپک', () => {
  it('222 × max(6.32%, 8%) × max(0.055, 0.014) × 0.476 ≈ 0.465569 (اسپک: تقریبی)', () => {
    const margin = MarginCalculator.calc({
      size: 222,
      rate: 0.0632,
      rateFloor: 0.08,
      ytm: 0.055,
      ytmFloor: 0.014,
      imRatio: 0.476
    });
    // فرمول دقیق: 222 × 0.08 × 0.055 × 0.476 = 0.4649568 — اسپک ≈ 0.465569 (تلورانس ~۱.۳٪)
    expect(margin).toBeCloseTo(222 * 0.08 * 0.055 * 0.476, 12);
    expect(margin).toBeCloseTo(0.465569, 2);
  });

  it('RateFloor > Rate → از RateFloor استفاده می‌شود', () => {
    const m1 = MarginCalculator.calc({ size: 222, rate: 0.05, rateFloor: 0.08, ytm: 0.055, ytmFloor: 0.014, imRatio: 0.476 });
    const m2 = MarginCalculator.calc({ size: 222, rate: 0.08, rateFloor: 0.08, ytm: 0.055, ytmFloor: 0.014, imRatio: 0.476 });
    expect(m1).toBeCloseTo(m2, 12);
  });

  it('YTMFloor > YTM → از YTMFloor استفاده می‌شود', () => {
    const m1 = MarginCalculator.calc({ size: 100, rate: 0.06, rateFloor: 0.06, ytm: 0.001, ytmFloor: 0.014, imRatio: 0.5 });
    const m2 = MarginCalculator.calc({ size: 100, rate: 0.06, rateFloor: 0.06, ytm: 0.014, ytmFloor: 0.014, imRatio: 0.5 });
    expect(m1).toBeCloseTo(m2, 12);
  });

  it('پارامترها از Market Parameters خوانده می‌شوند (kIM, marginFloor, ytmFloor)', () => {
    const margin = MarginCalculator.calcMarket(m, 222, m.markApr, NOW);
    expect(margin).toBeCloseTo(222 * Math.max(m.markApr, m.marginFloor) * Math.max((20 / 365), (m.ytmFloor ?? YTM_FLOOR_DEFAULT)) * m.kIM, 6);
  });
});

/* ================= ۲/۳) Long / Short PnL ================= */
describe('Long/Short PnL', () => {
  it('Long: spread مثبت → سود', () => {
    expect(LongPnLCalculator.gross(222, 0.0622, 0.10, 20)).toBeCloseTo(222 * 0.0378 * 20 / 365, 6);
  });
  it('Long: spread منفی → زیان', () => {
    expect(LongPnLCalculator.gross(100, 0.08, 0.04, 30)).toBeLessThan(0);
  });
  it('Long: spread صفر → صفر', () => {
    expect(LongPnLCalculator.gross(222, 0.05, 0.05, 20)).toBeCloseTo(0, 10);
  });
  it('Short: fixed > floating → سود', () => {
    expect(ShortPnLCalculator.gross(222, 0.08, 0.05, 20)).toBeCloseTo(222 * 0.03 * 20 / 365, 6);
  });
  it('Short: fixed < floating → زیان', () => {
    expect(ShortPnLCalculator.gross(222, 0.03, 0.10, 20)).toBeLessThan(0);
  });
});

/* ================= ۵) Rate Sensitivity ================= */
describe('Rate Sensitivity (1%)', () => {
  it('222 × 0.01 × 20/365', () => {
    expect(calcRateSensitivity(222, 20)).toBeCloseTo(222 * 0.01 * 20 / 365, 6);
  });
});

/* ================= ۶/۷) Break-Even (فرمول اسپک) ================= */
describe('Break-Even (Part A-6/7)', () => {
  it('Long: Fixed + Costs/(Size × Days/365)', () => {
    const be = LongPnLCalculator.breakEven(0.06, 10, 1000, 30);
    expect(be).toBeCloseTo(0.06 + 10 / (1000 * 30 / 365), 6);
  });
  it('Short: Fixed − Costs/(Size × Days/365)', () => {
    const be = ShortPnLCalculator.breakEven(0.06, 10, 1000, 30);
    expect(be).toBeCloseTo(0.06 - 10 / (1000 * 30 / 365), 6);
  });
  it('هزینه بالا → Break-even دورتر', () => {
    expect(LongPnLCalculator.breakEven(0.05, 100, 100, 30)).toBeGreaterThan(LongPnLCalculator.breakEven(0.05, 10, 100, 30));
  });
});

/* ================= ۸-۱۰) Fee Calculator — فرمول‌های مستند رسمی Boros ================= */
describe('FeeCalculator — مطابق docs.pendle.finance/boros-dev/Mechanics/Fees', () => {
  // بازار کمکی با YTM مشخص (۹۰ روز = 0.2466 سال) برای تطبیق با مثال رسمی
  const m90: BorosMarket = {
    ...m,
    maturity: NOW + 90 * 86_400,
    paymentPeriod: 28800,
    settlementsToMaturity: 270
  };

  it('مثال رسمی Taker Fee: 100 × 0.0005 × 0.2466 = 0.01233', () => {
    const fee = FeeCalculator.openingFee(100, 0.0005, 90 / 365);
    expect(fee).toBeCloseTo(100 * 0.0005 * (90 / 365), 6);
    expect(fee).toBeCloseTo(0.01233, 4);
  });

  it('مثال رسمی Settlement Fee: 50 × 0.002 × 0.000913 = 0.0000913 (هر دوره)', () => {
    const periodY = 28800 / (365 * 24 * 3600); // 8h → سال
    expect(periodY).toBeCloseTo(0.000913, 5);
    const fee = FeeCalculator.settlementFee(50, 0.002, periodY, 1);
    expect(fee).toBeCloseTo(50 * 0.002 * periodY, 9);
    expect(fee).toBeCloseTo(0.0000913, 6);
  });

  it('Entry = |Size| × takerFee × YTM (زمان‌مقیاس)', () => {
    const fees = FeeCalculator.calc({ m: m90, size: 1000, nowSec: NOW, gasUsd: 0 });
    const ytm = 90 / 365;
    expect(fees.entryFee).toBeCloseTo(1000 * m.takerFee * ytm, 9);
    expect(fees.exitFee).toBeCloseTo(1000 * m.takerFee * ytm, 9);
  });

  it('Settlement = |Size| × settleFeeRate × Period × تعداد تسویه (پایه: Size نه Gross)', () => {
    const fees = FeeCalculator.calc({ m: m90, size: 1000, nowSec: NOW });
    const periodY = 28800 / (365 * 24 * 3600);
    expect(fees.settlementCost).toBeCloseTo(1000 * m.settleFeeRate * periodY * 270, 9);
  });

  it('با داده Order Book → Slippage = Notional × |exec − ref|', () => {
    const f2 = FeeCalculator.calc({ m: m90, size: 1000, nowSec: NOW, slippageRate: 0.052 });
    expect(f2.slippageCost).toBeCloseTo(1000 * Math.abs(0.052 - m.markApr), 6);
  });

  it('نرخ‌های صفر → هزینه صفر', () => {
    const zero: BorosMarket = { ...m, takerFee: 0, settleFeeRate: 0 };
    const f3 = FeeCalculator.calc({ m: zero, size: 100, nowSec: NOW, gasUsd: 0, slippageRate: null });
    expect(f3.total).toBe(0);
  });
});

/* ================= F) Scenario (Percentile) ================= */
describe('ScenarioCalculator (Part F)', () => {
  const hist = m.ohlcv.map((p) => p.c).filter((c) => c > 0);
  it('Bear=min(P25,Current), Base=Current, Bull=max(P75,Current) — با Ordering تضمین‌شده', () => {
    const rates = buildScenarioRates(hist, m.floatingApr, DEFAULT_SCENARIO_CONFIG);
    expect(rates).not.toBeNull();
    expect(rates!.base).toBe(m.floatingApr);
    expect(rates!.bear).toBeLessThanOrEqual(rates!.base);
    expect(rates!.base).toBeLessThanOrEqual(rates!.bull);
    // Bull = max(P75, Current) — اگر Current از P75 بالاتر است، Bull = Current (رفع باگ Bull<Base)
    expect(rates!.bull).toBeGreaterThanOrEqual(percentile(hist, 75) as number);
    expect(rates!.bear).toBeLessThanOrEqual(percentile(hist, 25) as number);
  });
  it('داده تاریخی ناکافی → N/A (null) — هرگز عدد ساختگی تولید نمی‌شود (اصلاح ممیزی §19)', () => {
    const rates = buildScenarioRates([], 0.05);
    expect(rates).toBeNull();
    const rates2 = buildScenarioRates([0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11], 0.05);
    expect(rates2).toBeNull(); // 9 نقطه < 10
  });
  it('Ordering تضمین‌شده: Bear ≤ Base ≤ Bull حتی وقتی Current از P75 بالاتر است (رفع باگ Bull<Base)', () => {
    // تاریخچه‌ای که Current (0.10) از P75 (0.06) بالاتر است
    const hist = Array.from({ length: 30 }, (_, i) => 0.04 + (i % 5) * 0.005); // ~0.04..0.06
    const rates = buildScenarioRates(hist, 0.10);
    expect(rates).not.toBeNull();
    expect(rates!.bear).toBeLessThanOrEqual(rates!.base);
    expect(rates!.base).toBeLessThanOrEqual(rates!.bull);
    expect(rates!.bull).toBeGreaterThanOrEqual(0.10); // bull هرگز زیر Current نیست
  });
  it('Scenario PnL = Gross − Total Costs', () => {
    const net = scenarioNetPnl('long', 1000, 0.05, 0.10, 30, 5);
    expect(net).toBeCloseTo(1000 * 0.05 * 30 / 365 - 5, 6);
  });
  it('Scenario ROI = Net / Margin × 100', () => {
    const sc = ScenarioCalculator.run(
      { direction: 'long', size: 1000, fixedRate: 0.05, days: 30, totalCosts: 5, marginRequired: 100 },
      { bear: 0, base: 0.1, bull: 0.2 }
    );
    expect(sc).not.toBeNull();
    expect(sc!.base.roi).toBeCloseTo((1000 * 0.05 * 30 / 365 - 5) / 100 * 100, 6);
    expect(sc!.bull.net).toBeGreaterThan(sc!.bear.net);
    // نقش اقتصادی Long: bear=Adverse, bull=Favorable
    expect(sc!.bear.role).toBe('adverse');
    expect(sc!.bull.role).toBe('favorable');
  });
});

/* ================= E) Risk (۰..۱۰۰) ================= */
describe('RiskCalculator (Part E-23)', () => {
  it('مقیاس ۰..۱۰۰ — وزن‌ها Configurable', () => {
    const low = RiskCalculator.score({ volatility: 0.001, liquidityScore: 0.9, aprInstability: 0.001, slippageRisk: 0.1, dataQuality: 0.9 });
    const high = RiskCalculator.score({ volatility: 0.05, liquidityScore: 0.05, aprInstability: 0.05, slippageRisk: 0.9, dataQuality: 0.1 });
    expect(low).toBeLessThan(high);
    expect(low).toBeGreaterThanOrEqual(0);
    expect(high).toBeLessThanOrEqual(100);
    // وزن‌های سفارشی
    const custom = RiskCalculator.score({ volatility: 1, liquidityScore: 0, aprInstability: 1, slippageRisk: 1, dataQuality: 0 }, { volatility: 1, liquidity: 0, aprInstability: 0, slippage: 0, dataQuality: 0 });
    expect(custom).toBe(100);
  });
  it('سطوح ریسک کم/متوسط/زیاد', () => {
    expect(riskLevel(10)).toBe('کم');
    expect(riskLevel(50)).toBe('متوسط');
    expect(riskLevel(90)).toBe('زیاد');
  });
  it('APR Volatility = انحراف معیار نمونه', () => {
    const xs = [0.01, 0.02, 0.03, 0.04, 0.05];
    expect(aprVolatility(xs)).toBeCloseTo(sampleStdDev(xs), 10);
  });
});

/* ================= E) Opportunity (Long/Short جدا) ================= */
describe('OpportunityCalculator (Part E-24/25 + G-31)', () => {
  it('Long Score و Short Score مستقل‌اند', () => {
    const inLong = { expectedReturn: 0.8, riskScore: 20, liquidityScore: 0.8, stabilityScore: 0.8, costEfficiency: 0.8, dataConfidence: 0.9 };
    const inShort = { ...inLong, expectedReturn: 0.2 };
    expect(OpportunityCalculator.score(inLong)).toBeGreaterThan(OpportunityCalculator.score(inShort));
  });
  it('Spread بزرگ با ریسک/نقدشوندگی بد → امتیاز پایین (قانون ۳۱)', () => {
    const riskyHighSpread = OpportunityCalculator.score({ expectedReturn: 1, riskScore: 95, liquidityScore: 0.05, stabilityScore: 0.1, costEfficiency: 0.2, dataConfidence: 0.3 });
    const safeLowSpread = OpportunityCalculator.score({ expectedReturn: 0.4, riskScore: 20, liquidityScore: 0.9, stabilityScore: 0.9, costEfficiency: 0.8, dataConfidence: 0.9 });
    expect(safeLowSpread).toBeGreaterThan(riskyHighSpread);
  });
  it('Risk-Adjusted Return = Net / max(1, risk)', () => {
    expect(OpportunityCalculator.riskAdjustedReturn(50, 100)).toBeCloseTo(0.5, 10);
    expect(OpportunityCalculator.riskAdjustedReturn(50, 0)).toBe(50); // تقسیم بر حداقل ۱
  });
  it('Long/Short Spread', () => {
    expect(longSpread(0.10, 0.06)).toBeCloseTo(0.04, 10);
    expect(shortSpread(0.10, 0.06)).toBeCloseTo(0.04, 10);
    expect(longSpread(0.04, 0.10)).toBeLessThan(0);
  });
  it('RankScore: spread به تنهایی کافی نیست', () => {
    const bad = rankScore({ spread: 0.2, expectedNetPnl: 5, riskScore: 90, liquidityScore: 0.1, stabilityScore: 0.1, fees: 3, marginEfficiency: 0.2, scenarioDownside: 40 });
    const good = rankScore({ spread: 0.07, expectedNetPnl: 10, riskScore: 20, liquidityScore: 0.9, stabilityScore: 0.9, fees: 0.5, marginEfficiency: 0.8, scenarioDownside: 5 });
    expect(good).toBeGreaterThan(bad);
  });
});

/* ================= آمار (Part C) ================= */
describe('آمار تاریخی (Part C-17..20 + D-21)', () => {
  const xs = [0.01, 0.02, 0.03, 0.04, 0.05];
  it('میانگین و انحراف معیار نمونه', () => {
    expect(mean(xs)).toBeCloseTo(0.03, 10);
    expect(sampleStdDev(xs)).toBeCloseTo(Math.sqrt(0.00025), 6);
  });
  it('Z-Score و Extreme', () => {
    const z = zScore(0.09, xs);
    expect(z).toBeGreaterThan(2);
    expect(extremeLevel(z)).toBe('high');
    expect(extremeLevel(zScore(0.03, xs))).toBe('normal');
    expect(extremeLevel(zScore(-0.01, xs))).toBe('low');
  });
  it('Z-Score با داده ناکافی → null (بدون سیگنال)', () => {
    expect(zScore(0.05, [0.05])).toBeNull();
  });
  it('Turnover = Volume/OI', () => {
    expect(turnoverRatio(500, 1000)).toBeCloseTo(0.5, 10);
    expect(turnoverRatio(0, 0)).toBeNull();
  });
  it('Relative Deviation — نزدیک صفر → N/A', () => {
    expect(relativeDeviation(0.05, 0.03)).toBeCloseTo(66.666, 2);
    expect(relativeDeviation(0.05, 0)).toBeNull();
  });
});

/* ================= Engine یکپارچه (Part 32/33) ================= */
describe('BorosCalculationEngine.analyze — خروجی کامل (نسخه ممیزی‌شده)', () => {
  it('همه فیلدهای خروجی حاضرند و مقادیر منطقی‌اند', () => {
    const a = BorosCalculationEngine.analyze({ m, size: 1000, nowSec: NOW, gasUsd: 2 });
    expect(a.asset).toBe('ETH');
    expect(a.venue).toBe('Binance');
    expect(a.daysToMaturity).toBe(20);
    expect(a.longSpread).toBeGreaterThan(0); // floating > mark در بازار نمونه
    expect(a.shortSpread).toBeLessThan(0);
    expect(a.longScore).toBeGreaterThanOrEqual(0);
    expect(a.longScore).toBeLessThanOrEqual(100);
    expect(a.shortScore).toBeGreaterThanOrEqual(0);
    expect(a.riskScore).toBeGreaterThanOrEqual(0);
    expect(a.riskScore).toBeLessThanOrEqual(100);
    expect(a.marginRequired).toBeGreaterThan(0);
    expect(a.fees?.total).toBeGreaterThan(0);
    expect(a.bearLongPnl as number).toBeLessThanOrEqual(a.bullLongPnl as number);
    expect(typeof a.roiLongMargin).toBe('number'); // با داده کافی سناریو ساخته می‌شود
    expect(typeof a.annualizedLongReturn).toBe('number');
    expect(a.rankLong).toBeGreaterThanOrEqual(0);
    expect(a.rankShort).toBeGreaterThanOrEqual(0);
    expect(a.valid).toBe(true);
  });

  it('Long و Short جهت مخالف دارند (Check 4) — هرگز PnL یکسان', () => {
    const a = BorosCalculationEngine.analyze({ m, size: 1000, nowSec: NOW });
    expect(a.grossLongPnl).toBeGreaterThan(0); // floating > fixed → Long سود
    expect(a.grossShortPnl).toBeLessThan(0); // Short زیان
    expect(Math.sign(a.grossLongPnl)).toBe(-Math.sign(a.grossShortPnl));
    expect(a.totalLongPnl).not.toBe(a.totalShortPnl);
  });

  it('Break-even خروجی: Long = Fixed + costs/… ، Short = Fixed − costs/…', () => {
    const a = BorosCalculationEngine.analyze({ m, size: 1000, nowSec: NOW, gasUsd: 0 });
    const adj = (a.fees?.total ?? 0) / (1000 * a.daysToMaturity / 365);
    expect(a.breakEvenLong).toBeCloseTo(a.markApr + adj, 8);
    expect(a.breakEvenShort).toBeCloseTo(a.markApr - adj, 8);
  });

  it('سناریوهای درصدی: Bear < Base < Bull (جدا Long/Short)', () => {
    const a = BorosCalculationEngine.analyze({ m, size: 1000, nowSec: NOW });
    expect(a.bearLongPnl as number).toBeLessThanOrEqual(a.baseLongPnl as number);
    expect(a.baseLongPnl as number).toBeLessThanOrEqual(a.bullLongPnl as number);
    // Short: نقش اقتصادی معکوس — نرخ پایین برای شورت مطلوب است
    expect(a.bearShortPnl as number).toBeGreaterThanOrEqual(a.baseShortPnl as number);
    expect(a.baseShortPnl as number).toBeGreaterThanOrEqual(a.bullShortPnl as number);
  });

  it('MTM PnL جدا از Settlement — با علامت جهت', () => {
    const a = BorosCalculationEngine.analyze({ m, size: 1000, nowSec: NOW });
    // Long MTM = sensitivity × (Mark − Entry)/1% — Entry=Mark فعلی → تقریباً ۰
    expect(Math.abs(a.mtmLongPnl)).toBeLessThan(1e-6);
    expect(a.mtmShortPnl).toBeCloseTo(-a.mtmLongPnl, 10);
    // Total = Realized + Unrealized − Costs
    expect(a.totalLongPnl).toBeCloseTo(a.realizedLongPnl + a.unrealizedLongPnl - (a.fees?.total ?? 0), 6);
  });

  it('daysToMaturity و YTM دقیق از timestamp', () => {
    expect(daysToMaturity(m, NOW)).toBe(20);
    expect(ytmOf(m, NOW)).toBeCloseTo(20 / 365, 10);
  });
});

/* ================= تست نمونه HYPE (Part 21) ================= */
describe('تست نمونه HYPE — Implied 7.91٪ / Underlying 10.95٪ / 19 Days', () => {
  const hype: BorosMarket = {
    ...m,
    marketId: 999,
    name: 'Hyperliquid HYPEUSDT',
    symbol: 'HYPEUSDT',
    venue: 'Hyperliquid',
    asset: 'HYPE',
    markApr: 0.0791,
    lastTradedApr: 0.0791,
    midApr: 0.078,
    floatingApr: 0.1095,
    maturity: 1786000000 + 19 * 86_400,
    volume24h: 50039,
    notionalOI: 1324634,
    settleFeeRate: 0.001,
    ohlcv: Array.from({ length: 30 }, (_, i) => ({
      ts: 1786000000 - (30 - i) * 86_400,
      c: 0.09 + 0.0005 * i
    }))
  };
  const NOW_H = hype.maturity - 19 * 86_400;

  it('APR ها Decimal هستند (0.0791 و 0.1095)', () => {
    expect(hype.markApr).toBeCloseTo(0.0791, 10);
    expect(hype.floatingApr).toBeCloseTo(0.1095, 10);
  });

  it('Spread: Long = +3.04٪ ، Short = −3.04٪', () => {
    const a = BorosCalculationEngine.analyze({ m: hype, size: 1000, nowSec: NOW_H });
    expect(a.longSpread).toBeCloseTo(0.0304, 6);
    expect(a.shortSpread).toBeCloseTo(-0.0304, 6);
  });

  it('Long PnL مثبت و Short PnL منفی — هرگز یکسان', () => {
    const a = BorosCalculationEngine.analyze({ m: hype, size: 1000, nowSec: NOW_H });
    expect(a.grossLongPnl).toBeCloseTo(1000 * 0.0304 * (19 / 365), 6);
    expect(a.grossLongPnl).toBeGreaterThan(0);
    expect(a.grossShortPnl).toBeCloseTo(-1000 * 0.0304 * (19 / 365), 6);
    expect(a.grossShortPnl).toBeLessThan(0);
    expect(a.grossLongPnl).not.toBeCloseTo(a.grossShortPnl, 6);
  });

  it('Break-Even معتبر است (نه ۱۷۶۵٪)', () => {
    const a = BorosCalculationEngine.analyze({ m: hype, size: 1000, nowSec: NOW_H, gasUsd: 0 });
    // break-even = fixed ± costs/(size×days/365) — باید کوچک و معقول باشد
    expect(a.breakEvenLong).not.toBeNull();
    expect(a.breakEvenShort).not.toBeNull();
    if (a.breakEvenLong !== null) {
      expect(Math.abs(a.breakEvenLong)).toBeLessThanOrEqual(1); // حداکثر ۱۰۰٪
      expect(a.breakEvenLong).toBeLessThan(0.2); // محدوده معقول
    }
  });

  it('Status Long = potential (Net > 0) — Short = not-attractive', () => {
    const a = BorosCalculationEngine.analyze({ m: hype, size: 1000, nowSec: NOW_H, gasUsd: 0 });
    expect(a.statusLong).toBe('potential');
    expect(a.statusShort).toBe('not-attractive');
  });
});

/* ================= Sanity Checks (Part 15) ================= */
describe('Sanity Checks — جلوگیری از خطای مالی', () => {
  it('Check 1: Fees > Notional → INVALID_COST_MODEL و حذف از Ranking', () => {
    // fee = size × takerFee × YTM → برای اینکه > notional شود با YTM=20/365:
    // 10 × takerFee × 0.0548 > 10 → takerFee > 18.25
    const bad = { ...m, takerFee: 50 }; // fee = 10 × 50 × 0.0548 = 27.4 > 10
    const a = BorosCalculationEngine.analyze({ m: bad, size: 10, nowSec: NOW });
    expect(a.valid).toBe(false);
    expect(a.invalidReason).toContain('INVALID_COST_MODEL');
  });

  it('Check 5: Notional = 0 → نامعتبر', () => {
    const a = BorosCalculationEngine.analyze({ m, size: 0, nowSec: NOW });
    expect(a.valid).toBe(false);
    expect(a.invalidReason).toContain('حجم');
  });

  it('Check 6: Days <= 0 → حذف از Scanner', () => {
    const expired = { ...m, maturity: NOW - 1000 };
    const a = BorosCalculationEngine.analyze({ m: expired, size: 1000, nowSec: NOW });
    expect(a.valid).toBe(false);
    expect(a.invalidReason).toContain('سررسید');
  });

  it('Check 4: Long/Short جهت مخالف — verifyOppositeDirections', () => {
    expect(verifyOppositeDirections(5, -5)).toBe(true);
    expect(verifyOppositeDirections(5, 5)).toBe(false);
    expect(verifyOppositeDirections(0, 0)).toBe(true);
  });

  it('analyzeAll فقط موارد valid را برمی‌گرداند (Eligibility Filter)', () => {
    const expired = { ...m, maturity: Math.floor(Date.now() / 1000) - 1000 };
    const all = BorosCalculationEngine.analyzeAll([m, expired], 1000);
    expect(all.every((a) => a.valid)).toBe(true);
    expect(all).toHaveLength(1);
  });
});
