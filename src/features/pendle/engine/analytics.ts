/** ============================================================
 * Pendle Analytics Engine — خروجی تصمیم‌گیری (نه فقط محاسبه)
 * همه فرمول‌ها Pure و قابل تست؛ بدون وابستگی UI
 * ============================================================ */
import type { PendleMarketView } from '@/features/pendle/domain/pendle';

const DAY = 86_400_000;

/* ---------- پایه ---------- */
export function tokenAmount(investment: number, price: number): number {
  if (price <= 0) return 0;
  return investment / price;
}
export function currentValue(amount: number, price: number): number {
  return amount * price;
}
/** ارزش اسمی در سررسید = PT Amount × Redemption Price (معمولاً ۱) */
export function redeemValue(ptAmount: number, redemptionPrice = 1): number {
  return ptAmount * redemptionPrice;
}
export function profit(redeem: number, investment: number): number {
  return redeem - investment;
}
export function roiPct(p: number, investment: number): number {
  return investment > 0 ? (p / investment) * 100 : 0;
}

/* ---------- زمان ---------- */
export function daysBetween(fromTs: number, toTs: number): number {
  return Math.max(1, Math.round((toTs - fromTs) / DAY));
}
export function daysToMaturity(maturityIso: string, fromTs = Date.now()): number {
  const t = new Date(maturityIso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(1, Math.round((t - fromTs) / DAY));
}

/* ---------- Yield ---------- */
export function simpleYield(redeem: number, investment: number): number {
  return investment > 0 ? redeem / investment - 1 : 0;
}
export function annualizedReturn(yieldSimple: number, days: number): number {
  return days > 0 ? (yieldSimple * 365) / days : 0;
}
/** Effective APY = (1 + Yield)^(365/days) − 1 */
export function effectiveApy(yieldSimple: number, days: number): number {
  if (days <= 0) return 0;
  if (1 + yieldSimple <= 0) return -1;
  return Math.pow(1 + yieldSimple, 365 / days) - 1;
}

/* ---------- PT ---------- */
export function ptDiscount(ptPrice: number): number {
  return 1 - ptPrice;
}
export function ptFixedYield(ptPrice: number): number {
  return ptPrice > 0 ? 1 / ptPrice - 1 : 0;
}
export function ptFixedApy(ptPrice: number, days: number): number {
  if (ptPrice <= 0 || days <= 0) return 0;
  return Math.pow(1 / ptPrice, 365 / days) - 1;
}
/** قیمت سر به سر: قیمتی که سود صفر می‌شود (پس از هزینه‌ها) */
export function breakEvenPrice(investment: number, netCost: number, redemption = 1): number {
  return netCost > 0 ? (investment / netCost) * redemption : 0;
}

/* ---------- LP ---------- */
export function lpValue(lpAmount: number, lpPrice: number): number {
  return lpAmount * lpPrice;
}
export function tradingFeeIncome(volume: number, feeRate: number): number {
  return volume * feeRate;
}
export function rewardIncome(rewardAprPct: number, investment: number, days: number): number {
  return (rewardAprPct / 100) * investment * (days / 365);
}
export function underlyingIncome(underlyingApyPct: number, investment: number, days: number): number {
  return (underlyingApyPct / 100) * investment * (days / 365);
}
export function lpProfit(underlying: number, fees: number, rewards: number): number {
  return underlying + fees + rewards;
}

/* ---------- YT ---------- */
export function ytYieldIncome(underlyingApyPct: number, rewardAprPct: number, investment: number, days: number): number {
  return underlyingIncome(underlyingApyPct, investment, days) + rewardIncome(rewardAprPct, investment, days);
}
/** Break-even APY = YT Cost ÷ Days × 365 (کسری از سرمایه) */
export function ytBreakEvenApy(ytPrice: number, days: number): number {
  if (days <= 0) return 0;
  return (ytPrice / days) * 365;
}

/* ---------- هزینه‌ها ---------- */
export function swapFeeCost(investment: number, swapFeePct: number): number {
  return investment * (swapFeePct / 100);
}
export function slippageCost(investment: number, slippagePct: number): number {
  return investment * (slippagePct / 100);
}
export function priceImpactCost(investment: number, impactPct: number): number {
  return investment * (impactPct / 100);
}

/* ---------- سود واقعی (مهم‌ترین بخش) ---------- */
export function netProfit(gross: number, gas: number, swap: number, slippage: number): number {
  return gross - gas - swap - slippage;
}
export function realRoi(net: number, investment: number): number {
  return investment > 0 ? net / investment : 0;
}
/** Real APY = (1 + Net Profit/Investment)^(365/days) − 1 */
export function realApy(net: number, investment: number, days: number): number {
  if (investment <= 0 || days <= 0) return 0;
  const base = 1 + net / investment;
  if (base <= 0) return -1;
  return Math.pow(base, 365 / days) - 1;
}

/* ---------- مقایسه ---------- */
export function diff(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return a - b;
}

/* ---------- نرمال‌سازی ۰ تا ۱۰۰ ---------- */
export function normalize(v: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100));
}

/* ---------- Opportunity Score ---------- */
export interface ScoreInput {
  realApyPct: number;
  tvl: number;
  liquidity: number;
  volume: number;
  rewardAprPct: number;
  /** ۱ (کم‌ریسک) تا ۱۰۰ (پرریسک) */
  riskScore: number;
}

export function opportunityScore(
  i: ScoreInput,
  bounds: { tvl: [number, number]; liq: [number, number]; vol: [number, number]; reward: [number, number]; apy: [number, number] }
): number {
  const apyS = normalize(i.realApyPct, bounds.apy[0], bounds.apy[1]);
  const tvlS = normalize(i.tvl, bounds.tvl[0], bounds.tvl[1]);
  const liqS = normalize(i.liquidity, bounds.liq[0], bounds.liq[1]);
  const volS = normalize(i.volume, bounds.vol[0], bounds.vol[1]);
  const rewS = normalize(i.rewardAprPct, bounds.reward[0], bounds.reward[1]);
  const riskS = 100 - i.riskScore; // ریسک کمتر = امتیاز بیشتر
  return apyS * 0.35 + tvlS * 0.2 + liqS * 0.15 + volS * 0.1 + rewS * 0.1 + riskS * 0.1;
}

export function riskAdjustedReturn(realApyPct: number, riskScore: number): number {
  return riskScore > 0 ? realApyPct / riskScore : 0;
}

/** ریسک ساده از داده بازار (نقدشوندگی + TVL + زمان تا سررسید) */
export function riskScoreOf(m: Pick<PendleMarketView, 'details' | 'daysToExpiry'>): number {
  const tvl = m.details.totalTvl ?? 0;
  const liq = m.details.liquidity ?? 0;
  let score = 50;
  if (tvl >= 50_000_000) score -= 15;
  else if (tvl >= 10_000_000) score -= 8;
  else if (tvl < 1_000_000) score += 15;
  if (liq >= 20_000_000) score -= 10;
  else if (liq < 2_000_000) score += 10;
  const days = m.daysToExpiry ?? 90;
  if (days < 30) score += 10; // نزدیک سررسید = ریسک دوباره‌خرید
  if (days > 180) score -= 5;
  return Math.max(1, Math.min(100, score));
}

/* ---------- سناریوها ---------- */
export interface ScenarioInput {
  investment: number;
  ptPrice: number;
  days: number;
  apyPct: number; // APY تبلیغاتی
  rewardPct: number;
  tvl: number;
  gas: number;
  swapFeePct: number;
  slippagePct: number;
}

export interface ScenarioResult {
  label: string;
  gross: number;
  net: number;
  realApyPct: number;
}

export function scenarios(i: ScenarioInput): ScenarioResult[] {
  const base = runScenario(i, 1, 1, 1, 1);
  return [
    { ...base, label: 'پایه (نگه‌داری تا سررسید)' },
    runScenario(i, 1.25, 1, 1, 1, 'اگر APY ۲۵٪ بیشتر شود'),
    runScenario(i, 1, 0.5, 1, 1, 'اگر Reward نصف شود'),
    runScenario(i, 1, 1, 2, 1, 'اگر TVL دو برابر شود'),
    runScenario(i, 1, 1, 1, 0.95, 'اگر قیمت PT ۵٪ کاهش یابد'),
    runScenario(i, 1, 1, 1, 1, 'خروج زودهنگام در نیمی از مدت', 0.5)
  ];
}

function runScenario(
  i: ScenarioInput,
  apyMul: number,
  rewMul: number,
  _tvlMul: number,
  ptMul: number,
  label = '',
  holdFraction = 1
): ScenarioResult {
  const days = Math.max(1, i.days * holdFraction);
  const yieldAmount = (i.apyPct / 100) * i.investment * (days / 365) * apyMul;
  const reward = (i.rewardPct / 100) * i.investment * (days / 365) * rewMul;
  const ptLoss = i.ptPrice > 0 ? (1 - ptMul) * (i.investment / i.ptPrice) * i.ptPrice : 0;
  const gross = yieldAmount + reward - ptLoss;
  const net = netProfit(gross, i.gas, swapFeeCost(i.investment, i.swapFeePct), slippageCost(i.investment, i.slippagePct));
  return { label, gross, net, realApyPct: realApy(net, i.investment, days) * 100 };
}

/* ---------- Projection ---------- */
export interface ProjectionResult {
  ptAmount: number;
  output: number;
  totalProfit: number;
  dailyProfit: number;
  weeklyProfit: number;
  monthlyProfit: number;
  realApyPct: number;
}

export function projection(investment: number, ptPrice: number, days: number, netPct: number): ProjectionResult {
  const amt = tokenAmount(investment, ptPrice);
  const output = redeemValue(amt) * (1 + netPct / 100 / 100); // netPct به‌صورت درصد از سرمایه
  const total = output - investment;
  const d = Math.max(1, days);
  return {
    ptAmount: amt,
    output,
    totalProfit: total,
    dailyProfit: total / d,
    weeklyProfit: (total / d) * 7,
    monthlyProfit: (total / d) * 30,
    realApyPct: realApy(total, investment, d) * 100
  };
}

/* ---------- محاسبه PT کامل ---------- */
export interface PtCalcInput {
  investment: number;
  ptPrice: number;
  maturityIso: string;
  entryTs?: number;
  gas?: number;
  swapFeePct?: number;
  slippagePct?: number;
  /**
   * قیمت بازخرید هر PT در سررسید (قیمت لحظه‌ای دارایی پایه از API).
   * - برای استیبل‌کوین‌ها معمولاً ۱ دلار است.
   * - برای دارایی‌های غیراستیبل (مثل سهام توکن‌ایز/xStocks) باید قیمت
   *   واقعی دارایی پایه از API ارسال شود؛ وگرنه اعداد گمراه‌کننده می‌شود.
   * اگر ارسال نشود، پیش‌فرض ۱ (فقط معتبر برای استیبل‌ها) اعمال می‌شود.
   */
  redemptionPrice?: number | null;
}

export interface PtCalcResult {
  ptAmount: number;
  redeemValueUsd: number;
  grossProfit: number;
  roiPct: number;
  holdingDays: number;
  simpleYield: number;
  annualizedPct: number;
  effectiveApyPct: number;
  ptDiscountPct: number;
  fixedYieldPct: number;
  fixedApyPct: number;
  netProfitUsd: number;
  realRoiPct: number;
  realApyPct: number;
  /** قیمت بازخرید استفاده‌شده (۱ = فرض استیبل) */
  redemptionPriceUsed: number;
}

export function calcPt(i: PtCalcInput): PtCalcResult {
  const days = daysToMaturity(i.maturityIso, i.entryTs ?? Date.now());
  const amt = tokenAmount(i.investment, i.ptPrice);
  // قیمت بازخرید: قیمت واقعی دارایی پایه اگر از API آمده باشد؛ وگرنه ۱ (فقط استیبل)
  const redemption = typeof i.redemptionPrice === 'number' && Number.isFinite(i.redemptionPrice) && i.redemptionPrice > 0
    ? i.redemptionPrice
    : 1;
  const redeem = redeemValue(amt, redemption);
  const gross = profit(redeem, i.investment);
  const simple = simpleYield(redeem, i.investment);
  const gas = i.gas ?? 5;
  const swap = swapFeeCost(i.investment, i.swapFeePct ?? 0);
  const slip = slippageCost(i.investment, i.slippagePct ?? 0);
  const net = netProfit(gross, gas, swap, slip);
  return {
    ptAmount: amt,
    redeemValueUsd: redeem,
    grossProfit: gross,
    roiPct: roiPct(gross, i.investment),
    holdingDays: days,
    simpleYield: simple,
    annualizedPct: annualizedReturn(simple, days) * 100,
    effectiveApyPct: effectiveApy(simple, days) * 100,
    ptDiscountPct: ptDiscount(i.ptPrice) * 100,
    fixedYieldPct: ptFixedYield(i.ptPrice) * 100,
    fixedApyPct: ptFixedApy(i.ptPrice, days) * 100,
    netProfitUsd: net,
    realRoiPct: realRoi(net, i.investment) * 100,
    realApyPct: realApy(net, i.investment, days) * 100,
    redemptionPriceUsed: redemption
  };
}

/* ---------- YT کامل ---------- */
export interface YtCalcResult {
  yieldIncome: number;
  rewardIncomeUsd: number;
  totalIncome: number;
  totalApyPct: number;
  breakEvenApyPct: number;
  maxLoss: number;
  maxProfit: number;
  totalReturnPct: number;
}

export function calcYt(
  investment: number,
  ytPrice: number,
  underlyingApyPct: number,
  rewardAprPct: number,
  days: number
): YtCalcResult {
  const y = underlyingIncome(underlyingApyPct, investment, days);
  const r = rewardIncome(rewardAprPct, investment, days);
  const total = y + r;
  return {
    yieldIncome: y,
    rewardIncomeUsd: r,
    totalIncome: total,
    totalApyPct: (total / investment) * (365 / days) * 100,
    breakEvenApyPct: ytBreakEvenApy(ytPrice, days) * 100,
    maxLoss: investment,
    maxProfit: total,
    totalReturnPct: (total / investment) * 100
  };
}

/* ---------- LP کامل ---------- */
export interface LpCalcResult {
  lpTokens: number;
  underlyingYieldUsd: number;
  ptFixedUsd: number;
  tradingFeesUsd: number;
  rewardUsd: number;
  incentivesUsd: number;
  totalUsd: number;
  totalApyPct: number;
}

export function calcLp(
  investment: number,
  lpPrice: number,
  underlyingApyPct: number,
  ptFixedApyPct: number,
  swapFeeApyPct: number,
  rewardAprPct: number,
  incentiveApyPct: number,
  days: number
): LpCalcResult {
  const tokens = tokenAmount(investment, lpPrice);
  const u = underlyingIncome(underlyingApyPct, investment, days);
  const f = underlyingIncome(ptFixedApyPct, investment, days);
  const fees = underlyingIncome(swapFeeApyPct, investment, days);
  const r = rewardIncome(rewardAprPct, investment, days);
  const inc = underlyingIncome(incentiveApyPct, investment, days);
  const total = u + f + fees + r + inc;
  return {
    lpTokens: tokens,
    underlyingYieldUsd: u,
    ptFixedUsd: f,
    tradingFeesUsd: fees,
    rewardUsd: r,
    incentivesUsd: inc,
    totalUsd: total,
    totalApyPct: (total / investment) * (365 / days) * 100
  };
}

/* ---------- Opportunity Finder / Recommendations ---------- */
export type OpportunityKind = 'pt' | 'lp' | 'yt' | 'stable' | 'eth' | 'btc' | 'lowRisk' | 'highTvl' | 'realApy' | 'riskAdjusted';

export interface Opportunity {
  kind: OpportunityKind;
  market: PendleMarketView;
  score: number;
  realApyPct: number;
  risk: number;
}

const isStable = (m: PendleMarketView) => /USDC|USDT|DAI|USDE|FDUSD|USDS|PYUSD|USD0|USR|TUSD|sUSDe|syrupUSDC/i.test(m.name);
const isEth = (m: PendleMarketView) => /ETH|stETH|wstETH|weETH|ezETH|rsETH/i.test(m.name);
const isBtc = (m: PendleMarketView) => /BTC|WBTC|cbBTC/i.test(m.name);

/** یافتن بهترین فرصت‌ها از همه بازارها (با امتیاز مرکب) */
export function findOpportunities(markets: PendleMarketView[], investment = 10_000): Opportunity[] {
  const valid = markets.filter((m) => m.details.totalTvl > 0);
  if (valid.length === 0) return [];

  const apys = valid.map((m) => m.fixedApyPct ?? m.totalApyPct ?? 0);
  const tvls = valid.map((m) => m.details.totalTvl);
  const liqs = valid.map((m) => m.details.liquidity);
  const vols = valid.map((m) => m.details.tradingVolume);
  const rews = valid.map((m) => m.rewardAprPct ?? 0);

  const bounds = {
    apy: [Math.min(...apys), Math.max(...apys)] as [number, number],
    tvl: [Math.min(...tvls), Math.max(...tvls)] as [number, number],
    liq: [Math.min(...liqs), Math.max(...liqs)] as [number, number],
    vol: [Math.min(...vols), Math.max(...vols)] as [number, number],
    reward: [Math.min(...rews), Math.max(...rews)] as [number, number]
  };

  const scored = valid.map((m) => {
    const apy = m.fixedApyPct ?? m.totalApyPct ?? 0;
    const risk = riskScoreOf(m);
    const score = opportunityScore(
      { realApyPct: apy, tvl: m.details.totalTvl, liquidity: m.details.liquidity, volume: m.details.tradingVolume, rewardAprPct: m.rewardAprPct ?? 0, riskScore: risk },
      bounds
    );
    return { m, apy, risk, score };
  });

  const best = (pred: (m: PendleMarketView) => boolean, kind: OpportunityKind, sortKey: (s: { m: PendleMarketView; apy: number; score: number; risk: number }) => number): Opportunity | null => {
    const list = scored.filter((s) => pred(s.m));
    if (list.length === 0) return null;
    const top = [...list].sort((a, b) => sortKey(b) - sortKey(a))[0];
    return { kind, market: top.m, score: top.score, realApyPct: top.apy, risk: top.risk };
  };

  const out: Opportunity[] = [];
  const push = (o: Opportunity | null) => { if (o) out.push(o); };

  push(best(() => true, 'pt', (s) => s.m.fixedApyPct ?? 0)); // بهترین PT (بالاترین Fixed APY)
  push(best((m) => (m.lpApyPct ?? 0) > 0, 'lp', (s) => s.m.lpApyPct ?? 0));
  push(best((m) => (m.ytApyPct ?? 0) > 0, 'yt', (s) => s.m.ytApyPct ?? 0));
  push(best(isStable, 'stable', (s) => s.apy));
  push(best(isEth, 'eth', (s) => s.apy));
  push(best(isBtc, 'btc', (s) => s.apy));
  push(best(() => true, 'lowRisk', (s) => -s.risk)); // کمترین ریسک
  push(best(() => true, 'highTvl', (s) => s.m.details.totalTvl));
  push(best(() => true, 'realApy', (s) => s.apy)); // بالاترین Real APY
  push(best(() => true, 'riskAdjusted', (s) => s.apy / Math.max(s.risk, 1)));

  return out;
}

/** توصیه بر اساس افق زمانی */
export function recommendByHorizon(markets: PendleMarketView[], horizonDays: number): PendleMarketView | null {
  const list = markets.filter((m) => m.daysToExpiry !== null && m.daysToExpiry <= horizonDays + 10 && (m.fixedApyPct ?? 0) > 0);
  if (list.length === 0) return null;
  return [...list].sort((a, b) => (b.fixedApyPct ?? 0) - (a.fixedApyPct ?? 0))[0];
}

/** توصیه برای سرمایه مشخص */
export function recommendForInvestment(markets: PendleMarketView[], investment: number, horizonDays: number): {
  bestPt: PendleMarketView | null;
  bestLp: PendleMarketView | null;
  bestStable: PendleMarketView | null;
  bestByHorizon: PendleMarketView | null;
  bestRiskReward: PendleMarketView | null;
} {
  const byHorizon = recommendByHorizon(markets, horizonDays);
  const valid = markets.filter((m) => m.details.totalTvl >= Math.min(investment * 10, 1_000_000));
  const bestPt = valid.filter((m) => (m.fixedApyPct ?? 0) > 0).sort((a, b) => (b.fixedApyPct ?? 0) - (a.fixedApyPct ?? 0))[0] ?? null;
  const bestLp = valid.filter((m) => (m.lpApyPct ?? 0) > 0).sort((a, b) => (b.lpApyPct ?? 0) - (a.lpApyPct ?? 0))[0] ?? null;
  const bestStable = valid.filter(isStable).sort((a, b) => (b.fixedApyPct ?? 0) - (a.fixedApyPct ?? 0))[0] ?? null;
  const bestRiskReward = valid
    .map((m) => ({ m, rr: (m.fixedApyPct ?? 0) / Math.max(riskScoreOf(m), 1) }))
    .sort((a, b) => b.rr - a.rr)[0]?.m ?? null;
  return { bestPt, bestLp, bestStable, bestByHorizon: byHorizon, bestRiskReward };
}

/* ---------- Break-even (مرحله ۵) ---------- */
/** قیمت سر به سر: قیمتی که سرمایه اولیه برمی‌گردد */
export function breakEvenTokenPrice(investment: number, tokenAmount: number): number {
  return tokenAmount > 0 ? investment / tokenAmount : 0;
}
/** Break-even APY: نرخ سالانه لازم برای جبران هزینه‌ها */
export function breakEvenApyPct(costs: number, investment: number, days: number): number {
  if (investment <= 0 || days <= 0) return 0;
  return (costs / investment) * (365 / days) * 100;
}

/* ---------- مقایسه فرصت‌ها (مرحله ۶) ---------- */
export interface ComparatorMetric {
  market: PendleMarketView;
  profit: number;
  roiPct: number;
  apyPct: number;
  tvl: number;
  volume: number;
  liquidity: number;
  rewardAprPct: number;
  underlyingApyPct: number;
  remainingDays: number;
  riskScore: number;
  realApyPct: number;
  opportunityScore: number;
  isBest: boolean;
}

/** محاسبه همه شاخص‌ها برای یک لیست بازار + انتخاب بهترین (Real APY) */
export function compareMarkets(
  markets: PendleMarketView[],
  investment: number,
  gas = 5,
  swapFeePct = 0.1,
  slippagePct = 0.1
): ComparatorMetric[] {
  if (markets.length === 0) return [];

  const valid = markets.filter((m) => (m.fixedApyPct ?? 0) > 0 || (m.totalApyPct ?? 0) > 0);
  const list = valid.length > 0 ? valid : markets;

  const apys = list.map((m) => m.fixedApyPct ?? m.totalApyPct ?? 0);
  const tvls = list.map((m) => m.details.totalTvl);
  const liqs = list.map((m) => m.details.liquidity);
  const vols = list.map((m) => m.details.tradingVolume);
  const rews = list.map((m) => m.rewardAprPct ?? 0);
  const bounds = {
    apy: [Math.min(...apys), Math.max(...apys)] as [number, number],
    tvl: [Math.min(...tvls), Math.max(...tvls)] as [number, number],
    liq: [Math.min(...liqs), Math.max(...liqs)] as [number, number],
    vol: [Math.min(...vols), Math.max(...vols)] as [number, number],
    reward: [Math.min(...rews), Math.max(...rews)] as [number, number]
  };

  const metrics: ComparatorMetric[] = list.map((m) => {
    const apy = m.fixedApyPct ?? m.totalApyPct ?? 0;
    const days = Math.max(1, m.daysToExpiry ?? 90);
    const gross = (apy / 100) * investment * (days / 365);
    const net = netProfit(gross, gas, swapFeeCost(investment, swapFeePct), slippageCost(investment, slippagePct));
    const risk = riskScoreOf(m);
    const score = opportunityScore(
      { realApyPct: apy, tvl: m.details.totalTvl, liquidity: m.details.liquidity, volume: m.details.tradingVolume, rewardAprPct: m.rewardAprPct ?? 0, riskScore: risk },
      bounds
    );
    return {
      market: m,
      profit: net,
      roiPct: realRoi(net, investment) * 100,
      apyPct: apy,
      tvl: m.details.totalTvl,
      volume: m.details.tradingVolume,
      liquidity: m.details.liquidity,
      rewardAprPct: m.rewardAprPct ?? 0,
      underlyingApyPct: m.underlyingApyPct ?? 0,
      remainingDays: m.daysToExpiry ?? 0,
      riskScore: risk,
      realApyPct: realApy(net, investment, days) * 100,
      opportunityScore: score,
      isBest: false
    };
  });

  // بهترین بر اساس Real APY
  const best = [...metrics].sort((a, b) => b.realApyPct - a.realApyPct)[0];
  if (best) best.isBest = true;
  return metrics;
}
