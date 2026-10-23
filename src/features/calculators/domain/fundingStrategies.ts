/**
 * ⑩ موتور مشترک استراتژی‌های آربیتراژ فاندینگ — هر استراتژی فقط داده است (دو پا + پیش‌فرض‌ها)
 *
 * قرارداد سالانه‌سازی: همهٔ نرخ‌ها APR سادهٔ ۳۶۵ روزه (۸۷۶۰ ساعت) روی نوتیونال؛ APY ورودی با ترکیب روزانه به APR تبدیل می‌شود.
 *
 *   ضریب قفل هر پا       اسپات/سپرده = ۱ · مشتقه یا اسپات قرضی = ۱/اهرم + بافر · کوین‌مارجین با وثیقهٔ اسپات = بافر
 *   نوتیونال (N)         = سرمایه ÷ Σ ضریب قفل   (یا مقدار کاربر)
 *   فاندینگ پرپ          = ± N × APR فاندینگ صرافی آن پا × روزهای وزن‌دار سناریو ÷ ۳۶۵      شورت دریافت، لانگ پرداخت
 *   بیسیس سررسیددار      = N × بیسیس ÷ روز تا سررسید × روز   (دورهٔ اول قفل است؛ رول‌ها تابع سناریو + هزینهٔ رول)
 *   بهرهٔ لندینگ/استیک    = N × APR × روز ÷ ۳۶۵   ·   بهرهٔ قرض = همان با APR قرض (هزینه)
 *   سود بیسیس اجرا        = N × (بیسیس ورود − بیسیس خروج)      بیسیس = قیمت پای شورت − پای لانگ (٪)
 *   کارمزد/اسلیپیج        = ۴ رویداد (ورود و خروج دو پا)؛ خروج روی ارزش پس از حرکت قیمت
 *   سود خالص             → deltaLedger؛ مخرج بازده = بیشینهٔ (سرمایه، سرمایهٔ قفل‌شده)
 *
 * لیکویید در سناریو (محافظه‌کارانه، مثل calcDeltaNeutral): کل وثیقهٔ آن پا از دست می‌رود و فاندینگش صفر می‌شود.
 */
import { validateNum } from './money';
import { liquidationMovePct } from './deltaNeutral';
import { deltaLedger } from './deltaLedger';

const HOURS_PER_YEAR = 8760;
const DAYS_PER_YEAR = 365;
/** فاصلهٔ لیکویید کمتر از این (٪) هشدار می‌گیرد */
export const LIQUIDATION_WARN_PCT = 15;

export type FundingInterval = 1 | 4 | 8;
export const FUNDING_INTERVALS: readonly FundingInterval[] = [1, 4, 8];
export type Instrument = 'spot' | 'perp' | 'dated';
export type Severity = 'low' | 'medium' | 'high';
export type ScenarioKind = 'best' | 'base' | 'stress';

export interface LegSpec {
  side: 'long' | 'short';
  instrument: Instrument;
  /** فاندینگ پرپ از نرخ همین صرافی خوانده می‌شود */
  venue: 'A' | 'B';
  yield?: 'lend' | 'stake';
  /** اسپات قرض‌گرفته و فروخته‌شده → بهرهٔ قرض */
  borrowed?: boolean;
  /** قرارداد کوین‌مارجین (inverse) */
  inverse?: boolean;
}

export interface LegCosts {
  feeEntryPct: number;
  feeExitPct: number;
  slipEntryPct: number;
  slipExitPct: number;
}

export interface StrategyInputs {
  capital: number;
  /** اهرم پاهای مشتقه */
  leverage: number;
  /** نوتیونال هر پا؛ null/۰ = بیشینهٔ ممکن با سرمایه */
  notional: number | null;
  holdDays: number;
  entryPrice: number;
  /** نرخ فاندینگ هر بازه (٪)؛ مثبت = لانگ می‌پردازد */
  fundingA: number;
  intervalA: FundingInterval;
  fundingB: number;
  intervalB: FundingInterval;
  lendApy: number;
  borrowApr: number;
  stakeApy: number;
  /** اختلاف قیمت فیوچرز با اسپات (٪) */
  futuresBasisPct: number;
  daysToExpiry: number;
  basisEntryPct: number;
  basisExitPct: number;
  transferUsd: number;
  gasUsd: number;
  rebalanceUsd: number;
  /** وثیقهٔ اضافه روی مارجین اولیه (٪ نوتیونال) */
  marginBufferPct: number;
  maintenancePct: number;
  riskFreeApr: number;
  legCosts: [LegCosts, LegCosts];
}

export type NumericInputKey = Exclude<keyof StrategyInputs, 'legCosts' | 'notional'>;

/** تغییرات نسبی سناریو روی ورودی‌های کاربر */
export interface StressSpec {
  /** ضریب درآمد carry (فاندینگ/بیسیس رول) تا لحظهٔ برگشت */
  carryFactor?: number;
  /** از این روز به بعد ضریب flipFactor اعمال می‌شود */
  flipAfterDays?: number;
  /** نسبت به نرخ پایه؛ −۱ = دقیقاً برعکس */
  flipFactor?: number;
  yieldFactor?: number;
  /** حرکت قیمت دارایی (٪)؛ مثبت = بالا */
  priceMovePct?: number;
  /** گسترش بیسیس خروج علیه موقعیت (واحد ٪) */
  basisShiftPct?: number;
  /** افت LST نسبت به دارایی پایه (٪) */
  depegPct?: number;
  /** روزهای اضافه (قطعی صرافی/فریز برداشت) */
  extraHoldDays?: number;
}

export interface LegResult {
  spec: LegSpec;
  locked: number;
  /** فاندینگ یا بیسیس سررسیددار؛ مثبت = دریافتی */
  carry: number;
  liquidationMovePct: number | null;
  liquidationPrice: number | null;
  liquidated: boolean;
  /** وثیقهٔ لازم برای برگرداندن فاصلهٔ لیکویید پس از حرکت قیمت (هزینه نیست، نیاز سرمایه است) */
  marginTopUp: number;
}

export type StrategyWarning = 'netNegative' | 'breakEvenBeyondHold' | 'liquidationNear' | 'intervalMismatch' | 'capitalShortfall' | 'liquidated';

export interface StrategyResult {
  notional: number;
  capitalLocked: number;
  baseCapital: number;
  /** نوتیونال هج‌شده ÷ سرمایهٔ قفل‌شده (٪) */
  capitalEfficiencyPct: number | null;
  holdDays: number;
  grossFunding: number;
  futuresCarry: number;
  yieldIncome: number;
  costs: { fees: number; slippage: number; borrow: number; transfer: number; basis: number };
  totalCosts: number;
  /** سود/زیان بیسیس اجرا (علامت‌دار) */
  basisPnl: number;
  /** سود/زیان قیمت: ۰ در هج سالم؛ لیکویید و دیپگ */
  pricePnl: number;
  net: number;
  netAprPct: number | null;
  netApyPct: number | null;
  roiPct: number | null;
  opportunityCost: number;
  netAfterOpportunity: number;
  /** carry سالانه (فاندینگ یا اسپرد) لازم برای سود خالص صفر */
  breakEvenCarryAprPct: number | null;
  breakEvenDays: number | null;
  nearestLiquidationPct: number | null;
  marginTopUp: number;
  legs: [LegResult, LegResult];
  warnings: StrategyWarning[];
}

const pos = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);
const fin = (v: number | undefined): number => (v !== undefined && Number.isFinite(v) ? v : 0);

export const intervalToApr = (ratePct: number, intervalHours: number): number =>
  intervalHours > 0 ? (fin(ratePct) / intervalHours) * HOURS_PER_YEAR : 0;
export const aprToInterval = (aprPct: number, intervalHours: number): number => (fin(aprPct) / HOURS_PER_YEAR) * intervalHours;
export function apyToApr(apyPct: number): number {
  const a = fin(apyPct) / 100;
  return a > -1 ? (Math.pow(1 + a, 1 / DAYS_PER_YEAR) - 1) * DAYS_PER_YEAR * 100 : -100;
}
export function aprToApy(aprPct: number): number {
  const d = fin(aprPct) / 100 / DAYS_PER_YEAR;
  return d > -1 ? (Math.pow(1 + d, DAYS_PER_YEAR) - 1) * 100 : -100;
}

/** Σ ضریب carry روی روزهای [from, to) */
export function carryDays(from: number, to: number, s: StressSpec = {}): number {
  if (!(to > from)) return 0;
  const k = s.carryFactor ?? 1;
  const flip = s.flipAfterDays;
  if (flip === undefined || !(flip < to)) return (to - from) * k;
  const cut = Math.max(from, flip);
  return (cut - from) * k + (to - cut) * (s.flipFactor ?? 0);
}

/** ٪ حرکت تا لیکویید قرارداد کوین‌مارجین با وثیقهٔ کوین؛ اهرم ≤ ۱ در شورت = عملاً لیکویید نمی‌شود */
export function inverseLiquidationMovePct(side: 'long' | 'short', leverage: number, mmf: number): number | null {
  if (!(leverage > 0)) return null;
  const m = pos(mmf);
  if (side === 'short') return leverage > 1 ? ((1 - m) * leverage / (leverage - 1) - 1) * 100 : null;
  return Math.max(0, (1 - ((1 + m) * leverage) / (leverage + 1)) * 100);
}

const spotCollateral = (leg: LegSpec, partner: LegSpec) =>
  !!leg.inverse && partner.instrument === 'spot' && partner.side === 'long' && !partner.borrowed;

function lockFactor(leg: LegSpec, partner: LegSpec, lev: number, buffer: number): number {
  if (leg.instrument === 'spot' && !leg.borrowed) return 1;
  if (spotCollateral(leg, partner)) return buffer;
  return 1 / lev + buffer;
}

export function evaluateStrategy(legs: readonly [LegSpec, LegSpec], i: StrategyInputs, stress: StressSpec = {}): StrategyResult {
  const lev = Math.max(1, pos(i.leverage));
  const buffer = pos(i.marginBufferPct) / 100;
  const mmf = pos(i.maintenancePct) / 100;
  const capital = pos(i.capital);
  const hold = pos(i.holdDays) + pos(fin(stress.extraHoldDays));
  const move = fin(stress.priceMovePct);
  const factors = [lockFactor(legs[0], legs[1], lev, buffer), lockFactor(legs[1], legs[0], lev, buffer)];
  const lockSum = factors[0] + factors[1];
  const maxNotional = lockSum > 0 ? capital / lockSum : 0;
  const N = pos(i.notional ?? 0) || maxNotional;
  const capitalLocked = N * lockSum;
  const baseCapital = Math.max(capital, capitalLocked);
  const yearFrac = hold / DAYS_PER_YEAR;

  const legResult = (k: 0 | 1): LegResult => {
    const spec = legs[k];
    const partner = legs[k === 0 ? 1 : 0];
    const locked = N * factors[k];
    let liq: number | null = null;
    if (spec.instrument !== 'spot' || spec.borrowed) {
      if (spotCollateral(spec, partner)) liq = inverseLiquidationMovePct(spec.side, 1 / (1 + buffer), mmf);
      else if (spec.inverse) liq = inverseLiquidationMovePct(spec.side, 1 / factors[k], mmf);
      else liq = liquidationMovePct(spec.side, 1 / factors[k], mmf);
    }
    const adverse = spec.side === 'short' ? move : -move;
    const liquidated = N > 0 && liq !== null && adverse > 0 && adverse >= liq;
    const dir = spec.side === 'short' ? 1 : -1;
    let carry = 0;
    if (!liquidated && spec.instrument === 'perp') {
      const apr = intervalToApr(spec.venue === 'A' ? i.fundingA : i.fundingB, spec.venue === 'A' ? i.intervalA : i.intervalB);
      carry = (dir * N * apr) / 100 / DAYS_PER_YEAR * carryDays(0, hold, stress);
    } else if (!liquidated && spec.instrument === 'dated' && pos(i.daysToExpiry) > 0) {
      const daily = (fin(i.futuresBasisPct) / 100 / i.daysToExpiry) * N * dir;
      const locked1 = Math.min(hold, i.daysToExpiry);
      carry = daily * (locked1 + carryDays(locked1, hold, stress));
    }
    return {
      spec,
      locked,
      carry,
      liquidationMovePct: liq,
      liquidationPrice: liq === null || !(i.entryPrice > 0) ? null : i.entryPrice * (1 + (dir * liq) / 100),
      liquidated,
      marginTopUp: liquidated || spec.instrument === 'spot' || spotCollateral(spec, partner) ? 0 : Math.max(0, (N * adverse) / 100)
    };
  };
  const legRes: [LegResult, LegResult] = [legResult(0), legResult(1)];

  let grossFunding = 0;
  let futuresCarry = 0;
  let yieldIncome = 0;
  let borrow = 0;
  let fees = 0;
  let slippage = 0;
  let pricePnl = 0;
  const exitN = N * Math.max(0, 1 + move / 100);
  legRes.forEach((r, k) => {
    const s = r.spec;
    const c = i.legCosts[k];
    if (s.instrument === 'perp') grossFunding += r.carry;
    if (s.instrument === 'dated') futuresCarry += r.carry;
    if (s.yield) yieldIncome += N * (apyToApr(s.yield === 'lend' ? i.lendApy : i.stakeApy) / 100) * (stress.yieldFactor ?? 1) * yearFrac;
    if (s.borrowed) borrow += N * (pos(i.borrowApr) / 100) * yearFrac;
    if (s.yield === 'stake') pricePnl -= (N * pos(fin(stress.depegPct))) / 100;
    fees += (N * pos(c.feeEntryPct) + (r.liquidated ? 0 : exitN * pos(c.feeExitPct))) / 100;
    slippage += (N * pos(c.slipEntryPct) + (r.liquidated ? 0 : exitN * pos(c.slipExitPct))) / 100;
    if (s.instrument === 'dated' && i.daysToExpiry > 0 && !r.liquidated) {
      const rolls = Math.max(0, Math.ceil(hold / i.daysToExpiry - 1e-9) - 1);
      fees += (rolls * N * (pos(c.feeEntryPct) + pos(c.feeExitPct))) / 100;
      slippage += (rolls * N * (pos(c.slipEntryPct) + pos(c.slipExitPct))) / 100;
    }
    if (r.liquidated) {
      const other = legRes[k === 0 ? 1 : 0];
      pricePnl += -r.locked + (N * (other.spec.side === 'long' ? move : -move)) / 100;
    }
  });
  const basisPnl = (N * (fin(i.basisEntryPct) - fin(i.basisExitPct) - fin(stress.basisShiftPct))) / 100;
  const transfer = pos(i.transferUsd) + pos(i.gasUsd) + pos(i.rebalanceUsd);

  const ledger = deltaLedger({
    baseCapital,
    grossTrading: pricePnl + basisPnl,
    funding: grossFunding + futuresCarry + yieldIncome,
    fees,
    slippage,
    otherCosts: borrow + transfer
  });
  const net = ledger.net;
  const netAprPct = baseCapital > 0 && hold > 0 ? (net / baseCapital) * (DAYS_PER_YEAR / hold) * 100 : null;
  const carry = grossFunding + futuresCarry;
  const nonCarry = net - carry;
  const oneOff = fees + slippage + transfer + Math.max(0, -basisPnl);
  const dailyCarry = hold > 0 ? (carry + yieldIncome - borrow) / hold : 0;
  const breakEvenDays = dailyCarry > 0 ? oneOff / dailyCarry : oneOff === 0 ? 0 : null;
  const liqs = legRes.map((r) => r.liquidationMovePct).filter((v): v is number => v !== null);
  const nearestLiquidationPct = liqs.length ? Math.min(...liqs) : null;
  const opportunityCost = (baseCapital * pos(i.riskFreeApr)) / 100 * yearFrac;

  const warnings: StrategyWarning[] = [];
  if (net < 0) warnings.push('netNegative');
  if (breakEvenDays === null || breakEvenDays > hold) warnings.push('breakEvenBeyondHold');
  if (nearestLiquidationPct !== null && nearestLiquidationPct < LIQUIDATION_WARN_PCT) warnings.push('liquidationNear');
  if (legs.every((l) => l.instrument === 'perp') && i.intervalA !== i.intervalB) warnings.push('intervalMismatch');
  if (capital < capitalLocked - 1e-9) warnings.push('capitalShortfall');
  if (legRes.some((r) => r.liquidated)) warnings.push('liquidated');

  return {
    notional: N,
    capitalLocked,
    baseCapital,
    capitalEfficiencyPct: capitalLocked > 0 ? (N / capitalLocked) * 100 : null,
    holdDays: hold,
    grossFunding,
    futuresCarry,
    yieldIncome,
    costs: { fees, slippage, borrow, transfer, basis: Math.max(0, -basisPnl) },
    totalCosts: ledger.totalCosts,
    basisPnl,
    pricePnl,
    net,
    netAprPct,
    netApyPct: netAprPct === null ? null : aprToApy(netAprPct),
    roiPct: ledger.roiPct,
    opportunityCost,
    netAfterOpportunity: net - opportunityCost,
    breakEvenCarryAprPct: N > 0 && hold > 0 ? (-nonCarry / (N * yearFrac)) * 100 : null,
    breakEvenDays,
    nearestLiquidationPct,
    marginTopUp: legRes.reduce((s, r) => s + r.marginTopUp, 0),
    legs: legRes,
    warnings
  };
}

/** APR خالص (٪) در شبکهٔ «مقدار ورودی محرک × روز نگهداری» */
export function strategySensitivity(
  legs: readonly [LegSpec, LegSpec],
  i: StrategyInputs,
  key: NumericInputKey,
  values: readonly number[],
  days: readonly number[],
  stress: StressSpec = {}
): (number | null)[][] {
  return values.map((v) => days.map((d) => evaluateStrategy(legs, { ...i, [key]: v, holdDays: d }, stress).netAprPct));
}

/* ---------------- مقایسه و ریسک ---------------- */

export const SEVERITY_POINTS: Record<Severity, number> = { low: 1, medium: 2, high: 3 };

/** ۱ + مجموع امتیاز شدت ریسک‌ها ÷ ۱۰ */
export const riskWeight = (risks: readonly { severity: Severity }[]): number =>
  1 + risks.reduce((s, r) => s + SEVERITY_POINTS[r.severity], 0) / 10;

export interface StrategyDef {
  id: string;
  legs: readonly [LegSpec, LegSpec];
  defaults: StrategyInputs;
  risks: readonly { severity: Severity }[];
}

export interface CompareRow {
  id: string;
  result: StrategyResult;
  riskWeight: number;
  riskAdjusted: number | null;
  rankByApr: number;
  rankByRisk: number;
}

/** همان سرمایه، مدت و اهرم روی پیش‌فرض‌های هر استراتژی؛ مرتب بر اساس APR خالص */
export function compareStrategies(defs: readonly StrategyDef[], shared: Pick<StrategyInputs, 'capital' | 'holdDays' | 'leverage'>): CompareRow[] {
  const rows = defs.map((d) => {
    const result = evaluateStrategy(d.legs, { ...d.defaults, ...shared, notional: null });
    const w = riskWeight(d.risks);
    return { id: d.id, result, riskWeight: w, riskAdjusted: result.netAprPct === null ? null : result.netAprPct / w, rankByApr: 0, rankByRisk: 0 };
  });
  const order = (pick: (r: CompareRow) => number | null) =>
    [...rows].sort((a, b) => (pick(b) ?? -Infinity) - (pick(a) ?? -Infinity));
  order((r) => r.riskAdjusted).forEach((r, k) => (r.rankByRisk = k + 1));
  const byApr = order((r) => r.result.netAprPct);
  byApr.forEach((r, k) => (r.rankByApr = k + 1));
  return byApr;
}

/* ---------------- اعتبارسنجی ---------------- */

export function validateStrategyInputs(i: StrategyInputs): Partial<Record<keyof StrategyInputs, string>> {
  const e: Partial<Record<keyof StrategyInputs, string>> = {};
  const check = (k: keyof StrategyInputs, msg: string | null) => {
    if (msg) e[k] = msg;
  };
  const range = (k: NumericInputKey, min: number, max: number) => {
    const v = i[k] as number;
    check(k, validateNum(v, { min, allowZero: true }) ?? (v > max ? `حداکثر ${max}` : null));
  };
  check('capital', validateNum(i.capital, { positive: true }));
  check('holdDays', validateNum(i.holdDays, { positive: true }));
  check('entryPrice', validateNum(i.entryPrice, { positive: true }));
  range('leverage', 1, 125);
  range('marginBufferPct', 0, 100);
  range('maintenancePct', 0, 50);
  range('daysToExpiry', 1, 730);
  for (const k of ['lendApy', 'borrowApr', 'stakeApy', 'riskFreeApr', 'transferUsd', 'gasUsd', 'rebalanceUsd'] as const) range(k, 0, Infinity);
  for (const k of ['fundingA', 'fundingB'] as const) check(k, validateNum(i[k], { allowZero: true }) ?? (Math.abs(i[k]) > 5 ? 'نرخ هر بازه بیش از ۵٪ غیرعادی است' : null));
  for (const k of ['intervalA', 'intervalB'] as const) if (!FUNDING_INTERVALS.includes(i[k])) e[k] = 'بازه ۱، ۴ یا ۸ ساعت';
  if (i.notional !== null && i.notional < 0) e.notional = 'نمی‌تواند منفی باشد';
  if (i.legCosts.some((c) => Object.values(c).some((v) => !(v >= 0 && v <= 5)))) e.legCosts = 'کارمزد و اسلیپیج بین ۰ تا ۵٪';
  return e;
}
