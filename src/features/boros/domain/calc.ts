/** ============================================================
 * لایه سازگاری (Backward-compat) — همه محاسبات به BorosCalculationEngine واگذار می‌شود.
 * UI فقط: Input → Engine → Output — هیچ فرمولی اینجا نیست.
 * ============================================================ */
import type { BorosDirection, BorosMarket } from './types';
import { BorosCalculationEngine, liquidityEstimate, historicalAprOf } from './engine';
import { MarginCalculator, YTM_FLOOR_DEFAULT } from './engine/margin';
import {
  LongPnLCalculator,
  ShortPnLCalculator,
  calcDirectionalPnl,
  calcBreakEven,
  calcRateSensitivity,
  daysToMaturity,
  ytmOf,
  timeFraction
} from './engine/pnl';
import { FeeCalculator, type FeeBreakdown } from './engine/fees';
import { ScenarioCalculator, buildScenarioRates, scenarioNetPnl, type ScenarioRates } from './engine/scenario';
import { RiskCalculator, riskLevel, aprVolatility } from './engine/risk';
import { OpportunityCalculator, longSpread, shortSpread, normalizeSpread, rankScore, relativeDeviation as relDev } from './engine/opportunity';
import { mean, sampleStdDev, zScore, extremeLevel, turnoverRatio, percentile } from './engine/stats';

export * from './engine';
export { BorosCalculationEngine, liquidityEstimate, historicalAprOf };

/* ---------- توابع سازگاری (همان امضاهای قبلی — delegate به engine) ---------- */

export const calcMargin = MarginCalculator.calc;
export const calcMarketMargin = MarginCalculator.calcMarket;
export const calcPnl = calcDirectionalPnl;
export const calcSettlement = (
  direction: BorosDirection,
  size: number,
  fixedRate: number,
  floatingRate: number,
  paymentPeriodSec: number
): number => {
  const periodYear = paymentPeriodSec / 86_400 / 365;
  return calcDirectionalPnl(direction, size, fixedRate, floatingRate, periodYear * 365);
};

export function calcGrossProfit(
  direction: BorosDirection,
  size: number,
  fixedRate: number,
  floatingRate: number,
  days: number,
  paymentPeriodSec: number
): number {
  const nSettle = Math.max(1, Math.floor(days / (paymentPeriodSec / 86_400)));
  const periodic = nSettle * calcSettlement(direction, size, fixedRate, floatingRate, paymentPeriodSec);
  const remaining = days - nSettle * (paymentPeriodSec / 86_400);
  return periodic + calcDirectionalPnl(direction, size, fixedRate, floatingRate, Math.max(0, remaining));
}

export interface FeeInputCompat {
  size: number;
  markApr: number;
  takerFee: number;
  settleFeeRate: number;
  settlementsCount: number;
  priceImpact: number;
  gasUsd: number;
}

export function calcFees(f: FeeInputCompat): FeeBreakdown {
  // برای سازگاری: تبدیل به بازار حداقلی (اگر m موجود نبود از فیلدها)
  const m: BorosMarket = {
    marketId: 0,
    name: '',
    symbol: '',
    venue: '',
    asset: '',
    fundingRateSymbol: '',
    maturity: Math.floor(Date.now() / 1000) + 365 * 86_400,
    marginFloor: 0,
    tickStep: 2,
    iTickThresh: 0,
    maxLeverage: 1,
    isUiWhitelisted: true,
    kIM: 0.5,
    kMM: 0.25,
    takerFee: f.takerFee,
    otcFee: f.takerFee,
    settleFeeRate: f.settleFeeRate,
    paymentPeriod: 28800,
    hardOICap: 0,
    softOICap: 0,
    maxRateDeviationFactorBase1e4: 0,
    liqBase: 0,
    liqSlope: 0,
    liqFeeRate: 0,
    markApr: f.markApr,
    lastTradedApr: f.markApr,
    midApr: f.markApr,
    floatingApr: f.markApr,
    longYieldApr: 0,
    notionalOI: 0,
    volume24h: 0,
    nextSettlementTime: 0,
    settlementsToMaturity: f.settlementsCount,
    rateSensitivity: 0,
    dailyVolatility: null,
    bestBid: 0,
    bestAsk: 0,
    assetMarkPrice: 0,
    ohlcv: []
  };
  return FeeCalculator.calc({
    m,
    size: f.size,
    nowSec: Math.floor(Date.now() / 1000),
    slippageRate: f.priceImpact || null,
    gasUsd: f.gasUsd
  });
}

export const calcNetProfit = (gross: number, totalFees: number) => gross - totalFees;
export const calcRoi = (net: number, margin: number) => (margin > 0 ? (net / margin) * 100 : 0);
export const calcRealizedApr = (net: number, capital: number, days: number) =>
  capital > 0 && days > 0 ? (net / capital) * (365 / days) * 100 : 0;
export const calcRateSensitivityCompat = calcRateSensitivity;
export { calcRateSensitivity };

/* ---------- Break-even (فرمول درست اسپک Part A-6/7) ---------- */
export function calcBreakEvenCompat(
  direction: BorosDirection,
  fixedRate: number,
  totalCosts: number,
  size: number,
  days: number
): number {
  return calcBreakEven(direction, fixedRate, totalCosts, size, days);
}

/* ---------- سناریو (Percentile های تاریخی) ---------- */
export function runScenario(
  m: BorosMarket,
  direction: BorosDirection,
  size: number,
  fixedRate: number,
  days: number,
  gasUsd: number,
  priceImpact: number,
  label: string,
  floatingRate: number
) {
  const settlements = Math.max(1, Math.floor(days / (m.paymentPeriod / 86_400)));
  const fees = calcFees({ size, markApr: m.markApr, takerFee: m.takerFee, settleFeeRate: m.settleFeeRate, settlementsCount: settlements, priceImpact, gasUsd });
  const gross = calcGrossProfit(direction, size, fixedRate, floatingRate, days, m.paymentPeriod);
  const net = calcNetProfit(gross, fees.total);
  const margin = calcMarketMargin(m, size, fixedRate);
  return {
    label,
    floatingRate,
    gross,
    fees,
    net,
    margin,
    roi: calcRoi(net, margin),
    apr: calcRealizedApr(net, margin, days),
    breakEven: calcBreakEven(direction, fixedRate, fees.total, size, days)
  };
}

export function runScenarios(
  m: BorosMarket,
  direction: BorosDirection,
  size: number,
  fixedRate: number,
  days: number,
  gasUsd: number,
  priceImpact: number
) {
  const hist = historicalAprOf(m);
  const rates = buildScenarioRates(hist, m.floatingApr);
  if (!rates) {
    // داده تاریخی کافی نیست → فقط سناریوی Base با نرخ فعلی (برچسب «پایه») — بدون Bear/Bull ساختگی
    const base = runScenario(m, direction, size, fixedRate, days, gasUsd, priceImpact, 'پایه (Base)', m.floatingApr);
    return [base];
  }
  const mk = (label: string, r: number) =>
    runScenario(m, direction, size, fixedRate, days, gasUsd, priceImpact, label, r);
  return [
    mk('بدبینانه (Adverse)', rates.bear),
    mk('واقع‌بینانه (Base)', rates.base),
    mk('خوش‌بینانه (Favorable)', rates.bull)
  ];
}

/* ---------- نمره‌ها ---------- */
export const calcOpportunityScore = OpportunityCalculator.score;
export const calcRiskScore = (vol: number | null, liq: number, instab: number, volScore: number) =>
  RiskCalculator.score({ volatility: vol, liquidityScore: liq, aprInstability: instab, slippageRisk: 0.5, dataQuality: 0.7 });
export { riskLevel };

/* ---------- مقایسه و تحلیل بازار ---------- */
export function compareMarkets(markets: BorosMarket[], size: number, daysOverride?: number, nowSec?: number) {
  return markets.map((m) => {
    const a = BorosCalculationEngine.analyze({ m, size, nowSec: nowSec ?? Math.floor(Date.now() / 1000) });
    return {
      m,
      expectedReturn: a.totalLongPnl, // جهت Long
      margin: a.marginRequired,
      riskScore: a.riskScore,
      risk: a.riskLevel,
      liquidityScore: a.liquidityScore,
      netApr: a.markApr * 100,
      opportunity: Math.max(a.longScore, a.shortScore)
    };
  });
}

export const yieldAdvantageOf = (m: BorosMarket) => normalizeSpread(m.floatingApr - m.markApr, true);
export const liquidityScoreOf = (m: BorosMarket) => liquidityEstimate(m);
export const stabilityOf = (m: BorosMarket) => {
  const hist = historicalAprOf(m);
  return hist.length >= 2 ? Math.max(0, Math.min(1, 1 - sampleStdDev(hist) / 0.05)) : 0.5;
};
export const volumeScoreOf = (m: BorosMarket) => Math.min(1, m.volume24h / 5000);
export const aprInstabilityOf = (m: BorosMarket) => {
  const hist = historicalAprOf(m);
  return hist.length >= 2 ? sampleStdDev(hist) : 0.01;
};

export const avgApr7d = (m: BorosMarket) => {
  const hist = historicalAprOf(m);
  return hist.length > 0 ? mean(hist.slice(-7)) : null;
};
export const avgApr30d = (m: BorosMarket) => {
  const hist = historicalAprOf(m);
  return hist.length > 0 ? mean(hist.slice(-30)) : null;
};
export const historicalDeviation = (m: BorosMarket) => relDev(m.markApr, avgApr7d(m));

export { daysToMaturity, ytmOf, timeFraction, longSpread, shortSpread, rankScore, zScore, extremeLevel, turnoverRatio, percentile, mean, sampleStdDev, aprVolatility };
export { LongPnLCalculator, ShortPnLCalculator, FeeCalculator, ScenarioCalculator, buildScenarioRates, scenarioNetPnl, YTM_FLOOR_DEFAULT };
