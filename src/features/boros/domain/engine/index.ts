/** ============================================================
 * BorosCalculationEngine — فاساد واحد (نسخه ممیزی‌شده)
 *
 * اصلاحات (طبق اسپک اصلاح فوری):
 *  ۱) APR ها همیشه Decimal Rate (0.0791) — فقط در UI به درصد تبدیل می‌شوند
 *  ۲) Long/Short PnL جدا با جهت مخالف — هرگز یکسان نمی‌شوند
 *  ۳) MTM PnL جدا از Settlement PnL (Mark APR ≠ Underlying APR)
 *  ۴) Break-Even با Sanity Check — اگر نامعتبر → N/A (هرگز ۱۷۶۵٪ نمایش داده نمی‌شود)
 *  ۵) Fees فقط از API/config واقعی؛ بدون داده → N/A (هرگز تخمین جعلی)
 *  ۶) Sanity Checks (Fees<=Notional، جهت مخالف، Notional=0، Days<=0)
 *  ۷) Status: potential / not-attractive / insufficient-data (هرگز BUY/SELL)
 *  ۸) Ranking دو مرحله‌ای: Eligibility Filter ← Opportunity Score
 * ============================================================ */
import type { BorosDirection, BorosMarket } from '../types';
import { MarginCalculator, YTM_FLOOR_DEFAULT } from './margin';
import { LongPnLCalculator, ShortPnLCalculator, calcRateSensitivity, daysToMaturity, ytmOf } from './pnl';
import { FeeCalculator, type FeeBreakdown } from './fees';
import { ScenarioCalculator, buildScenarioRates, type ScenarioRates } from './scenario';
import { RiskCalculator, riskLevel, aprVolatility, type RiskLevel } from './risk';
import {
  OpportunityCalculator,
  longSpread,
  shortSpread,
  deviation7d,
  deviation30d,
  normalizeSpread,
  rankScore,
  type RankFactors
} from './opportunity';
import { mean, sampleStdDev, zScore, extremeLevel, turnoverRatio, percentile, relativeDeviation } from './stats';
import {
  constantRateScenario,
  meanReversionScenario,
  stressScenario,
  classifyRobustness,
  type Robustness
} from './scenarioModels';
import { detectAnomaly, assessLiquidity, assessFreshness, type AnomalyInfo, type LiquidityReality, type DataFreshness } from './anomaly';

export * from './margin';
export * from './pnl';
export * from './fees';
export * from './scenario';
export * from './risk';
export * from './opportunity';
export * from './stats';
export * from './audit';
export * from './projection';
export * from './scenarioModels';
export * from './anomaly';
export * from './reason';

/** وضعیت یک فرصت — سه مرحله (هرگز BUY/SELL/ENTER — فقط تحلیلی)
 *  Stage 1: valid market → Stage 2: positive economics → Stage 3: attractive
 */
export type OpportunityStatus =
  | 'potential' // Potential Opportunity
  | 'conditional' // Conditional Opportunity
  | 'not-attractive' // Not Attractive
  | 'insufficient-data' // Insufficient Data
  | 'anomaly-detected'; // Anomaly Detected
export type OpportunityStage = 'stage1-valid' | 'stage2-positive' | 'stage3-attractive' | 'invalid';

/** خروجی کامل تحلیل یک بازار — Long و Short کاملاً جدا */
export interface MarketAnalysis {
  /* شناسه */
  /** شناسه یکتای بازار (API) — برای کلید ردیف‌ها (دو بازار می‌توانند symbol/سررسید یکسان داشته باشند) */
  marketId: number;
  asset: string;
  venue: string;
  maturity: number;
  daysToMaturity: number;
  /* نرخ‌ها (همیشه Decimal Rate) */
  impliedApr: number;
  markApr: number;
  underlyingApr: number;
  /* Spread (Decimal) */
  longSpread: number;
  shortSpread: number;
  /* نقدشوندگی و نوسان */
  openInterest: number;
  volume24h: number;
  turnoverRatio: number | null;
  liquidityScore: number;
  volatility: number | null;
  /* تاریخچه */
  avg7d: number | null;
  avg30d: number | null;
  dev7d: number | null;
  dev30d: number | null;
  relDev7d: number | null;
  zScore: number | null;
  extreme: 'normal' | 'high' | 'low';
  /* مالی — Long */
  marginRequired: number;
  fees: FeeBreakdown | null; // null = داده واقعی در دسترس نیست (N/A)
  feesSource: 'api-config' | 'na';
  grossLongPnl: number;
  netLongPnl: number;
  grossShortPnl: number;
  netShortPnl: number;
  /* MTM (جدا از Settlement) — علامت جهت‌دار */
  mtmLongPnl: number;
  mtmShortPnl: number;
  /* تفکیک Realized / Unrealized / Total (Long) */
  realizedLongPnl: number;
  unrealizedLongPnl: number;
  totalLongPnl: number;
  realizedShortPnl: number;
  unrealizedShortPnl: number;
  totalShortPnl: number;
  /* Break-Even (Decimal یا null=N/A) */
  breakEvenLong: number | null;
  breakEvenShort: number | null;
  /* سناریو (percentiles) — جدا Long/Short · null = N/A (داده تاریخی کافی نیست) */
  bearLongPnl: number | null;
  baseLongPnl: number | null;
  bullLongPnl: number | null;
  bearShortPnl: number | null;
  baseShortPnl: number | null;
  bullShortPnl: number | null;
  /* ROI — جدا · null = N/A */
  roiLongMargin: number | null;
  roiLongNotional: number | null;
  roiShortMargin: number | null;
  roiShortNotional: number | null;
  annualizedLongReturn: number;
  /* ریسک و نمره */
  riskScore: number;
  riskLevel: RiskLevel;
  confidence: number;
  longScore: number;
  shortScore: number;
  /* رتبه‌بندی و وضعیت */
  rankLong: number;
  rankShort: number;
  riskAdjustedReturn: number;
  statusLong: OpportunityStatus;
  statusShort: OpportunityStatus;
  stageLong: OpportunityStage;
  stageShort: OpportunityStage;
  /** حداقل لبه اقتصادی اعمال‌شده */
  minEconomicEdge: number;
  /* ---------- مدل‌های سناریو (Master §3-5) ---------- */
  constantRateScenario: {
    label: string;
    floatingRate: number;
    settlementPnl: number;
    netPnl: number;
    roiOnMargin: number;
  };
  meanReversion: {
    available: boolean;
    targetRate: number | null;
    netPnl: number | null;
    note: string;
  };
  stress: {
    available: boolean;
    stressAmount: number | null;
    stressSource: string;
    bearNet: number | null;
    baseNet: number | null;
    bullNet: number | null;
  };
  /* ---------- ناهنجاری / نقدشوندگی / تازگی داده ---------- */
  anomaly: AnomalyInfo;
  liquidity: LiquidityReality;
  freshness: DataFreshness;
  robustness: Robustness;
  /* ---------- Maker Fee (جدا از Taker — Master §9) ---------- */
  makerEntryFee: { amount: number | null; source: string; note: string };
  /** معتبر بودن برای Ranking (Eligibility Filter) */
  valid: boolean;
  invalidReason: string | null;
}

/** حداقل لبه اقتصادی قابل‌تنظیم — Net PnL زیر این مقدار «فرصت» نیست
 *  (حتی اگر مثبت باشد؛ چون خطای داده/اسپرد/اسلیپج می‌تواند آن را از بین ببرد)
 */
export interface EconomicEdgeConfig {
  /** حداقل مطلق (دلار) */
  minUsd: number;
  /** حداقل نسبی به‌صورت کسر نotional (مثلاً 0.001 = ۰.۱٪) */
  minRatioOfNotional: number;
}

export const DEFAULT_ECONOMIC_EDGE: EconomicEdgeConfig = { minUsd: 1, minRatioOfNotional: 0.001 };

/** محاسبه حداقل لبه اقتصادی برای یک بازار */
export function minEconomicEdge(size: number, config: EconomicEdgeConfig = DEFAULT_ECONOMIC_EDGE): number {
  return Math.max(config.minUsd, size * config.minRatioOfNotional);
}

export interface AnalyzeInput {
  m: BorosMarket;
  size: number;
  nowSec?: number;
  /** گس — فقط اگر داده واقعی دارید؛ پیش‌فرض ۰ (هرگز حدس نمی‌زنیم) */
  gasUsd?: number;
  /** نرخ اسلیپج (از Order Book/شبیه‌سازی) — null اگر داده نیست */
  slippageRate?: number | null;
  /** پیکربندی حداقل لبه اقتصادی (پیش‌فرض: ۱ دلار یا ۰.۱٪ نotional) */
  economicEdge?: EconomicEdgeConfig;
}

/** سری APR تاریخی بازار (از OHLCV) — Decimal Rate */
export function historicalAprOf(m: BorosMarket): number[] {
  return (m.ohlcv ?? []).map((p) => p.c).filter((c) => c > 0);
}

/** Sanity Check ها (Part 15) */
export interface SanityResult {
  valid: boolean;
  reason: string | null;
}

export function sanityChecks(
  m: BorosMarket,
  size: number,
  days: number,
  feesTotal: number | null
): SanityResult {
  // Check 6: Days <= 0 → حذف
  if (days <= 0) return { valid: false, reason: 'سررسید گذشته (Days<=0)' };
  // Check 5: Notional = 0 → PnL صفر (ولی valid است — فقط صفر)
  if (size <= 0) return { valid: false, reason: 'حجم نامعتبر' };
  // Check 1: Fees <= Notional (اگر fee معتبر است)
  if (feesTotal !== null && feesTotal > size) {
    return { valid: false, reason: `INVALID_COST_MODEL (Fees ${feesTotal.toFixed(2)} > Notional ${size})` };
  }
  // APR معتبر
  if (!Number.isFinite(m.markApr) || !Number.isFinite(m.floatingApr)) {
    return { valid: false, reason: 'APR نامعتبر' };
  }
  return { valid: true, reason: null };
}

/** بررسی جهت مخالف Long/Short (Check 4) — اگر یکسان → خطا */
export function verifyOppositeDirections(grossLong: number, grossShort: number): boolean {
  if (grossLong === 0 && grossShort === 0) return true;
  return Math.sign(grossLong) === -Math.sign(grossShort);
}

export class BorosCalculationEngine {
  /** تحلیل کامل یک بازار — همه فیلدهای خروجی (Long/Short جدا) */
  static analyze(input: AnalyzeInput): MarketAnalysis {
    const { m, size } = input;
    const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);
    const days = daysToMaturity(m, nowSec);
    const ytm = ytmOf(m, nowSec);
    const hist = historicalAprOf(m);
    const nSettle = Math.max(1, Math.floor(days / (m.paymentPeriod / 86_400)));

    /* ---------- نرخ‌ها (Decimal) ---------- */
    const underlying = m.floatingApr; // Underlying APR — برای Settlement/Scenario
    const implied = m.markApr; // Mark APR — برای MTM/Liquidation

    /* ---------- هزینه‌ها: فرمول‌های مستندات رسمی Boros (docs/Mechanics/Fees) ---------- */
    // گس پیش‌فرض ۰ — هرگز هزینه را حدس نمی‌زنیم
    const fees: FeeBreakdown | null = FeeCalculator.calc({
      m,
      size,
      nowSec,
      slippageRate: input.slippageRate ?? null,
      gasUsd: input.gasUsd ?? 0
    });
    // اگر همه نرخ‌ها صفر و gas=0 → داده fee واقعی نیست → N/A
    const feesNa =
      m.takerFee <= 0 && m.settleFeeRate <= 0 && (input.gasUsd ?? 0) <= 0 && (input.slippageRate ?? 0) <= 0;
    const feesOut: FeeBreakdown | null = feesNa ? null : fees;
    const totalCosts = feesOut?.total ?? 0;

    /* ---------- Sanity Checks ---------- */
    const sanity = sanityChecks(m, size, days, feesOut?.total ?? null);
    const invalidReason = sanity.valid ? null : sanity.reason;

    /* ---------- Settlement PnL (Part 2/3) — Long و Short با جهت مخالف ---------- */
    // Long:  size × (Floating − Fixed) × (days/365)
    // Short: size × (Fixed − Floating) × (days/365)
    const grossLongPnl = LongPnLCalculator.gross(size, implied, underlying, days);
    const grossShortPnl = ShortPnLCalculator.gross(size, implied, underlying, days);
    // Check 4: جهت مخالف
    if (!verifyOppositeDirections(grossLongPnl, grossShortPnl) && !invalidReason) {
      // خطای موتور — باید ثبت شود
      console.error('[BorosEngine] FAIL: Long/Short PnL same direction', { grossLongPnl, grossShortPnl });
    }

    /* ---------- MTM PnL (Part 5) — Mark APR، نه Underlying ---------- */
    // Rate Sensitivity = size × days/365 × 1%
    const sensitivity = calcRateSensitivity(size, days);
    const entryFixed = implied;
    // Long MTM ≈ sensitivity × (Mark APR − Entry Fixed)/1%
    const mtmLongPnl = sensitivity * ((m.markApr - entryFixed) / 0.01);
    const mtmShortPnl = -mtmLongPnl;

    /* ---------- Net PnL = Gross Settlement + MTM − Costs (بدون Double Counting) ---------- */
    // برای سادگی و شفافیت: Settlement PnL به‌عنوان Realized، MTM به‌عنوان Unrealized
    const realizedLongPnl = grossLongPnl;
    const unrealizedLongPnl = mtmLongPnl;
    const totalLongPnl = realizedLongPnl + unrealizedLongPnl - totalCosts;
    const realizedShortPnl = grossShortPnl;
    const unrealizedShortPnl = mtmShortPnl;
    const totalShortPnl = realizedShortPnl + unrealizedShortPnl - totalCosts;

    /* ---------- Break-Even (Part 14) — با Sanity ---------- */
    const rawBeLong = LongPnLCalculator.breakEven(implied, totalCosts, size, days);
    const rawBeShort = ShortPnLCalculator.breakEven(implied, totalCosts, size, days);
    const beValid = (be: number) => Number.isFinite(be) && Math.abs(be) <= 1; // حداکثر ±۱۰۰٪
    const breakEvenLong = beValid(rawBeLong) ? rawBeLong : null;
    const breakEvenShort = beValid(rawBeShort) ? rawBeShort : null;

    /* ---------- سناریوها (Part 11) — percentiles تاریخی، جدا Long/Short ---------- */
    const rates: ScenarioRates | null = buildScenarioRates(hist, underlying);
    const scenLong = ScenarioCalculator.run(
      { direction: 'long', size, fixedRate: implied, days, totalCosts, marginRequired: marginCalc() },
      rates
    );
    const scenShort = ScenarioCalculator.run(
      { direction: 'short', size, fixedRate: implied, days, totalCosts, marginRequired: marginCalc() },
      rates
    );
    function marginCalc(): number {
      return MarginCalculator.calcMarket(m, size, implied, nowSec);
    }
    const margin = marginCalc();

    /* ---------- ریسک و نمره فرصت ---------- */
    const vol = m.dailyVolatility ?? (hist.length >= 2 ? aprVolatility(hist) : null);
    const instab = hist.length >= 2 ? sampleStdDev(hist) : 0.01;
    const liq = liquidityEstimate(m);
    const slippageRisk = 0.5; // بدون Order Book → برآورد محافظه‌کارانه (برچسب Estimated)
    const dataQuality = hist.length >= 10 ? 0.9 : hist.length >= 2 ? 0.6 : 0.3;
    const riskScore = RiskCalculator.score({
      volatility: vol,
      liquidityScore: liq,
      aprInstability: instab,
      slippageRisk,
      dataQuality
    });
    const stability = hist.length >= 2 ? Math.max(0, Math.min(1, 1 - sampleStdDev(hist) / 0.05)) : 0.5;
    const costEff =
      feesOut && size > 0
        ? Math.max(0, Math.min(1, 1 - feesOut.total / (size * 0.01 + 1)))
        : 0.5; // بدون fee → خنثی
    const lSpread = longSpread(underlying, implied);
    const sSpread = shortSpread(implied, underlying);

    const longScore = OpportunityCalculator.score({
      expectedReturn: normalizeSpread(lSpread, true),
      riskScore,
      liquidityScore: liq,
      stabilityScore: stability,
      costEfficiency: costEff,
      dataConfidence: dataQuality
    });
    const shortScore = OpportunityCalculator.score({
      expectedReturn: normalizeSpread(sSpread, false),
      riskScore,
      liquidityScore: liq,
      stabilityScore: stability,
      costEfficiency: costEff,
      dataConfidence: dataQuality
    });

    /* ---------- Minimum Economic Edge (قابل تنظیم) ---------- */
    const edge = minEconomicEdge(size, input.economicEdge);
    const edgeLong = totalLongPnl > edge;
    const edgeShort = totalShortPnl > edge;

    /* ---------- سه مدل سناریو (Master §3-5) ---------- */
    const constScenario = constantRateScenario({
      direction: 'long',
      size,
      fixedRate: implied,
      currentFloating: underlying,
      days,
      totalCosts,
      margin
    });
    const mr = meanReversionScenario({
      direction: 'long',
      size,
      fixedRate: implied,
      currentFloating: underlying,
      days,
      totalCosts,
      margin,
      avg7d: hist.length > 0 ? mean(hist.slice(-7)) : null,
      avg30d: hist.length > 0 ? mean(hist.slice(-30)) : null,
      avg90d: hist.length > 7 ? mean(hist.slice(-90)) : null
    });
    const stress = stressScenario({
      direction: 'long',
      size,
      fixedRate: implied,
      currentFloating: underlying,
      days,
      totalCosts,
      margin,
      historicalApr: hist
    });

    /* ---------- Anomaly / Liquidity / Freshness ---------- */
    const anomaly = detectAnomaly({ m, nowSec });
    const liquidity = assessLiquidity(m, size);
    const freshness = assessFreshness(m, nowSec);

    /* ---------- Robustness (Master §26) ---------- */
    const robustness = classifyRobustness({
      bearNet: stress ? stress.bear.netPnl : null,
      baseNet: stress ? stress.base.netPnl : null,
      bullNet: stress ? stress.bull.netPnl : null
    });

    /* ---------- Maker Fee (Master §9 — طبق مستندات: maker سفارش‌دهنده هزینه ندارد) ---------- */
    const makerEntryFee = {
      amount: 0 as number | null,
      source: 'documentation',
      note: 'طبق مستندات Boros (docs/Mechanics/Fees): Maker orders هنگام ثبت هزینه ندارند — تأیید رسمی'
    };

    /* ---------- Status (Part 16/19 + Economic Edge + Anomaly) ---------- */
    const statusOf = (netPnl: number, score: number, edgeOk: boolean): OpportunityStatus => {
      if (invalidReason) return 'insufficient-data';
      if (anomaly.detected && anomaly.kind === 'extreme-dislocation') return 'anomaly-detected';
      if (netPnl <= 0 || !edgeOk) return 'not-attractive';
      // Conditional: Base مثبت ولی Bear منفی
      if (stress && stress.bear.netPnl <= 0) return 'conditional';
      return score > 0 ? 'potential' : 'not-attractive';
    };
    const statusLong = statusOf(totalLongPnl, longScore, edgeLong);
    const statusShort = statusOf(totalShortPnl, shortScore, edgeShort);

    /* ---------- Stage سه‌مرحله‌ای (Part 6 + Edge) ---------- */
    const stageOf = (status: OpportunityStatus, net: number, score: number, edgeOk: boolean): OpportunityStage => {
      if (!sanity.valid) return 'invalid';
      if (net > 0 && edgeOk) {
        // Stage 3: Attractive — Net > MinEdge + ریسک/نقدشوندگی/هزینه منطقی
        const riskOk = riskScore < 66;
        const liqOk = liq >= 0.25;
        const costOk = totalCosts <= Math.abs(net) * 2 + 1e-9; // هزینه نسبت به بازده منطقی
        if (riskOk && liqOk && costOk && score > 0) return 'stage3-attractive';
        return 'stage2-positive';
      }
      return 'stage1-valid';
    };
    const stageLong = stageOf(statusLong, totalLongPnl, longScore, edgeLong);
    const stageShort = stageOf(statusShort, totalShortPnl, shortScore, edgeShort);

    /* ---------- رتبه‌بندی (Part 17 — فقط برای موارد valid) ---------- */
    const rankFactorsLong: RankFactors = {
      spread: lSpread,
      expectedNetPnl: totalLongPnl,
      riskScore,
      liquidityScore: liq,
      stabilityScore: stability,
      fees: totalCosts,
      marginEfficiency: margin > 0 ? 1 - Math.min(1, margin / size) : 0,
      scenarioDownside: scenLong ? Math.abs(scenLong.bear.net) : null
    };
    const rankFactorsShort: RankFactors = {
      spread: sSpread,
      expectedNetPnl: totalShortPnl,
      riskScore,
      liquidityScore: liq,
      stabilityScore: stability,
      fees: totalCosts,
      marginEfficiency: margin > 0 ? 1 - Math.min(1, margin / size) : 0,
      scenarioDownside: scenShort ? Math.abs(scenShort.bear.net) : null
    };
    const rankLong = sanity.valid ? rankScore(rankFactorsLong) : 0;
    const rankShort = sanity.valid ? rankScore(rankFactorsShort) : 0;

    const annualizedLong =
      margin > 0 && days > 0 ? (totalLongPnl / margin) * (365 / days) * 100 : 0;

    return {
      marketId: m.marketId,
      asset: m.asset,
      venue: m.venue,
      maturity: m.maturity,
      daysToMaturity: days,
      impliedApr: implied,
      markApr: m.markApr,
      underlyingApr: underlying,
      longSpread: lSpread,
      shortSpread: sSpread,
      openInterest: m.notionalOI,
      volume24h: m.volume24h,
      turnoverRatio: turnoverRatio(m.volume24h, m.notionalOI),
      liquidityScore: liq,
      volatility: vol,
      avg7d: hist.length > 0 ? mean(hist.slice(-7)) : null,
      avg30d: hist.length > 0 ? mean(hist.slice(-30)) : null,
      dev7d: deviation7d(underlying, hist.length > 0 ? mean(hist.slice(-7)) : null),
      dev30d: deviation30d(underlying, hist.length > 0 ? mean(hist.slice(-30)) : null),
      relDev7d: relativeDeviation(underlying, hist.length > 0 ? mean(hist.slice(-7)) : null),
      zScore: zScore(underlying, hist),
      extreme: extremeLevel(zScore(underlying, hist)),
      marginRequired: margin,
      fees: feesOut,
      feesSource: feesNa ? 'na' : 'api-config',
      grossLongPnl,
      netLongPnl: totalLongPnl,
      grossShortPnl,
      netShortPnl: totalShortPnl,
      mtmLongPnl,
      mtmShortPnl,
      realizedLongPnl,
      unrealizedLongPnl,
      totalLongPnl,
      realizedShortPnl,
      unrealizedShortPnl,
      totalShortPnl,
      breakEvenLong,
      breakEvenShort,
      bearLongPnl: scenLong ? scenLong.bear.net : null,
      baseLongPnl: scenLong ? scenLong.base.net : null,
      bullLongPnl: scenLong ? scenLong.bull.net : null,
      bearShortPnl: scenShort ? scenShort.bear.net : null,
      baseShortPnl: scenShort ? scenShort.base.net : null,
      bullShortPnl: scenShort ? scenShort.bull.net : null,
      roiLongMargin: scenLong ? scenLong.base.roi : null,
      roiLongNotional: scenLong ? scenLong.base.roiNotional : null,
      roiShortMargin: scenShort ? scenShort.base.roi : null,
      roiShortNotional: scenShort ? scenShort.base.roiNotional : null,
      annualizedLongReturn: annualizedLong,
      riskScore,
      riskLevel: riskLevel(riskScore),
      // اعمال penalty ناهنجاری/تازگی داده روی Confidence (Master §22/34)
      confidence: Math.max(0, Math.min(100, Math.round(dataQuality * 100 * (1 - anomaly.confidencePenalty) * freshness.confidenceFactor))),
      longScore,
      shortScore,
      rankLong,
      rankShort,
      riskAdjustedReturn: OpportunityCalculator.riskAdjustedReturn(totalLongPnl, riskScore),
      statusLong,
      statusShort,
      stageLong,
      stageShort,
      minEconomicEdge: edge,
      constantRateScenario: {
        label: constScenario.label,
        floatingRate: constScenario.floatingRate,
        settlementPnl: constScenario.settlementPnl,
        netPnl: constScenario.netPnl,
        roiOnMargin: constScenario.roiOnMargin
      },
      meanReversion: {
        available: mr.available,
        targetRate: mr.targetRate,
        netPnl: mr.netPnl,
        note: mr.note
      },
      stress: {
        available: stress !== null,
        stressAmount: stress?.stressAmount ?? null,
        stressSource: stress?.stressSource ?? '',
        bearNet: stress?.bear.netPnl ?? null,
        baseNet: stress?.base.netPnl ?? null,
        bullNet: stress?.bull.netPnl ?? null
      },
      anomaly,
      liquidity,
      freshness,
      robustness,
      makerEntryFee,
      valid: sanity.valid,
      invalidReason
    };
  }

  /** تحلیل همه بازارها — فقط موارد valid (Eligibility Filter) برای رتبه‌بندی */
  static analyzeAll(markets: BorosMarket[], size = 1000): MarketAnalysis[] {
    return markets
      .map((m) => BorosCalculationEngine.analyze({ m, size }))
      .filter((a) => a.valid); // Check 6: Days<=0 و ... حذف می‌شوند
  }
}

/** برآورد نقدشوندگی ۰..۱ (Part D-22 — بدون Order Book = Estimated) */
export function liquidityEstimate(m: BorosMarket): number {
  const oi = Math.min(1, m.notionalOI / 20_000);
  const vol = Math.min(1, m.volume24h / 5_000);
  const spreadScore =
    m.bestAsk > 0 && m.bestBid > 0 && m.midApr > 0
      ? Math.max(0, Math.min(1, 1 - (m.bestAsk - m.bestBid) / Math.max(0.005, m.midApr)))
      : 0.5;
  return Math.max(0, Math.min(1, oi * 0.4 + vol * 0.3 + spreadScore * 0.3));
}

export { YTM_FLOOR_DEFAULT, percentile };
