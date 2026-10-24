/**
 * ⑬ برنامه‌ریز فاندینگ روی یک نماد — هر برنامه = پاهای پرپ (۱ یا ۲) + اسپات اختیاری + قفل نرخ Boros اختیاری
 *
 * واحدها: N = ارزش دلاری هر پا (همهٔ پاها هم‌اندازه)؛ نرخ‌ها APR سادهٔ ۳۶۵ روزه؛ t = روز ÷ ۳۶۵
 *
 *   سرمایهٔ قفل به ازای هر دلار N
 *     اسپات                    ۱
 *     هر پای پرپ                ۱/اهرم + بافر
 *     هر قفل Boros               IM × ضریب وثیقه      IM = max(|K|, RateFloor) × max(YTM, YTMFloor) × kIM   (فرمول رسمی Boros)
 *   N = سرمایه ÷ Σ ضرایب
 *
 *   فاندینگ پای آزاد            جهت × N × f × ضریب سناریو × t        شورت دریافت (+۱)، لانگ پرداخت (−۱)
 *   پای قفل‌شده با Boros         جهت YU × N × K × t                   Short YU: دریافت K، پرداخت شناور = همان فاندینگ پرپ شورت
 *                                                                    Long YU: پرداخت K، دریافت شناور = همان فاندینگ پرپ لانگ
 *     شناور دو طرف دقیقاً هم را خنثی می‌کنند؛ نرخ اسپرد (HL − Gate) هر دو پا را با هم قفل می‌کند.
 *
 *   کارمزد/اسلیپیج              هر پای پرپ و اسپات: ورود + خروج (۲ × N × (کارمزد + اسلیپیج))
 *   کارمزد Boros (مستندات رسمی)  ورود N × takerFee × YTM · تسویه N × settleFeeRate × YTM · خروج در سررسید = ۰
 *   برنامهٔ Boros تا سررسید نگه داشته می‌شود (نرخ فقط تا سررسید قفل است).
 *
 *   تحمل نرخ Boros تا لیکویید    (وثیقه − MM) ÷ (N × YTM)             MM = همان IM با kMM — تقریبی، در لحظهٔ ورود
 */
import { liquidationMovePct } from './deltaNeutral';

const DAYS_PER_YEAR = 365;
/** فاصلهٔ لیکویید پرپ کمتر از این (٪) هشدار می‌گیرد */
export const PLAN_LIQ_WARN_PCT = 15;
/** تحمل نرخ Boros کمتر از این (واحد درصد APR) هشدار می‌گیرد */
export const BOROS_RATE_WARN_PP = 3;

export type PlanSide = 'long' | 'short';
export type PlanKind = 'perpPerp' | 'spotPerp' | 'borosSpot' | 'borosPair' | 'borosSpread';

export interface PlanPerpLeg {
  /** venue:ref */
  key: string;
  venue: string;
  side: PlanSide;
  /** فاندینگ مبنای پیش‌بینی (٪ سالانه)؛ مثبت = لانگ می‌پردازد */
  fundingApr: number;
  /** کارمزد هر معامله (٪) */
  feePct: number;
  /** اسلیپیج هر معامله از دفتر سفارش (٪)؛ null = نامعلوم → اسلیپیج پیش‌فرض کاربر */
  slipPct: number | null;
  maxLeverage: number | null;
  mmf: number;
  /** این پا در صرافی‌های دارینو نیست (مثلاً Gate) */
  external?: boolean;
}

export interface PlanBorosLock {
  marketId: number;
  /** Short YU = دریافت نرخ ثابت · Long YU = پرداخت نرخ ثابت */
  side: PlanSide;
  /** نرخ قابل اجرا (کسری سالانه): Short روی bid، Long روی ask */
  fixedRate: number;
  takerFee: number;
  settleFeeRate: number;
  marginFloor: number;
  kIM: number;
  kMM: number;
  /** سال */
  ytmFloor: number;
  daysToMaturity: number;
  /** اندیس پاهای پرپ که شناورشان قفل می‌شود */
  locks: number[];
}

export interface PlanSpec {
  id: string;
  kind: PlanKind;
  perps: PlanPerpLeg[];
  spot: boolean;
  boros: PlanBorosLock[];
}

export interface PlanInputs {
  capital: number;
  leverage: number;
  /** برای برنامه‌های بدون Boros؛ برنامهٔ Boros تا سررسید */
  holdDays: number;
  /** بافر مارجین پرپ (٪ نوتیونال) */
  bufferPct: number;
  /** وثیقهٔ Boros = این ضریب × مارجین اولیه */
  borosCollateralX: number;
  spotFeePct: number;
  /** اسلیپیج هر معامله وقتی دفتر سفارش نیست (٪) */
  fallbackSlipPct: number;
  transferUsd: number;
  /** ضریب سناریو روی فاندینگ شناور پاهای آزاد (۱ = همان مبنا) */
  fundingFactor: number;
}

export type PlanWarning =
  | 'netNegative'
  | 'overLeverage'
  | 'liquidationNear'
  | 'borosRateNear'
  | 'slipAssumed'
  | 'external'
  | 'shortHold'
  | 'floating';

export interface FundingPlanResult {
  notional: number;
  holdDays: number;
  /** همهٔ فاندینگ پاها قفل است */
  fullyLocked: boolean;
  capital: { spot: number; perpMargin: number; borosMargin: number; total: number };
  income: { floating: number; locked: number; total: number };
  costs: { perpFees: number; perpSlippage: number; spot: number; boros: number; transfer: number; total: number };
  net: number;
  /** سود خالص سالانه روی سرمایه (٪) */
  netAprPct: number | null;
  roiPct: number | null;
  /** APR فاندینگ/ثابت لازم روی نوتیونال برای سود صفر */
  breakEvenAprPct: number | null;
  perpLiquidationPct: (number | null)[];
  /** واحد درصد APR؛ null = Boros ندارد */
  borosRateTolerancePp: number | null;
  warnings: PlanWarning[];
}

const pos = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);
const fin = (v: number): number => (Number.isFinite(v) ? v : 0);
const dirOf = (s: PlanSide) => (s === 'short' ? 1 : -1);

/** مارجین اولیه یا نگهداری Boros به ازای هر دلار نوتیونال (فرمول رسمی) */
export function borosMarginPerUsd(b: PlanBorosLock, k: 'im' | 'mm' = 'im'): number {
  const ytm = pos(b.daysToMaturity) / DAYS_PER_YEAR;
  if (!(ytm > 0)) return 0;
  return Math.max(Math.abs(fin(b.fixedRate)), pos(b.marginFloor)) * Math.max(ytm, pos(b.ytmFloor)) * pos(k === 'im' ? b.kIM : b.kMM);
}

/** کارمزد Boros به ازای هر دلار نوتیونال تا سررسید: ورود + تسویه‌ها (خروج در سررسید صفر است) */
export function borosFeePerUsd(b: PlanBorosLock): number {
  const ytm = pos(b.daysToMaturity) / DAYS_PER_YEAR;
  return (pos(b.takerFee) + pos(b.settleFeeRate)) * ytm;
}

/** روزهای نگهداری برنامه: Boros = کوتاه‌ترین سررسید، وگرنه ورودی کاربر */
export const planHoldDays = (p: PlanSpec, i: Pick<PlanInputs, 'holdDays'>): number =>
  p.boros.length ? Math.min(...p.boros.map((b) => pos(b.daysToMaturity))) : pos(i.holdDays);

export function evaluatePlan(p: PlanSpec, i: PlanInputs): FundingPlanResult {
  const lev = Math.max(1, pos(i.leverage));
  const buffer = pos(i.bufferPct) / 100;
  const perpFactor = 1 / lev + buffer;
  const collX = Math.max(1, pos(i.borosCollateralX));
  const hold = planHoldDays(p, i);
  const t = hold / DAYS_PER_YEAR;

  const borosFactors = p.boros.map((b) => borosMarginPerUsd(b) * collX);
  const factorSum = (p.spot ? 1 : 0) + p.perps.length * perpFactor + borosFactors.reduce((s, f) => s + f, 0);
  const capitalIn = pos(i.capital);
  const N = factorSum > 0 ? capitalIn / factorSum : 0;

  const lockedLegs = new Set(p.boros.flatMap((b) => b.locks));
  let floating = 0;
  p.perps.forEach((l, k) => {
    if (!lockedLegs.has(k)) floating += (dirOf(l.side) * N * fin(l.fundingApr) * fin(i.fundingFactor) * t) / 100;
  });
  const locked = p.boros.reduce((s, b) => s + dirOf(b.side) * N * fin(b.fixedRate) * t, 0);

  let slipAssumed = false;
  let perpFees = 0;
  let perpSlippage = 0;
  for (const l of p.perps) {
    if (l.slipPct === null) slipAssumed = true;
    perpFees += (2 * N * pos(l.feePct)) / 100;
    perpSlippage += (2 * N * pos(l.slipPct ?? i.fallbackSlipPct)) / 100;
  }
  const spot = p.spot ? (2 * N * (pos(i.spotFeePct) + pos(i.fallbackSlipPct))) / 100 : 0;
  const boros = p.boros.reduce((s, b) => s + N * borosFeePerUsd(b), 0);
  const transfer = pos(i.transferUsd);
  const totalCosts = perpFees + perpSlippage + spot + boros + transfer;
  const income = floating + locked;
  const net = income - totalCosts;
  const capitalTotal = N * factorSum;

  const perpLiquidationPct = p.perps.map((l) => liquidationMovePct(l.side, 1 / perpFactor, pos(l.mmf)));
  let borosRateTolerancePp: number | null = null;
  p.boros.forEach((b, k) => {
    const ytm = pos(b.daysToMaturity) / DAYS_PER_YEAR;
    if (!(ytm > 0)) return;
    const tol = ((borosFactors[k] - borosMarginPerUsd(b, 'mm')) / ytm) * 100;
    borosRateTolerancePp = borosRateTolerancePp === null ? tol : Math.min(borosRateTolerancePp, tol);
  });

  const fullyLocked = p.perps.every((_, k) => lockedLegs.has(k));
  const warnings: PlanWarning[] = [];
  if (net < 0) warnings.push('netNegative');
  if (p.perps.some((l) => l.maxLeverage !== null && l.maxLeverage > 0 && lev > l.maxLeverage)) warnings.push('overLeverage');
  if (perpLiquidationPct.some((v) => v !== null && v < PLAN_LIQ_WARN_PCT)) warnings.push('liquidationNear');
  if (borosRateTolerancePp !== null && borosRateTolerancePp < BOROS_RATE_WARN_PP) warnings.push('borosRateNear');
  if (slipAssumed) warnings.push('slipAssumed');
  if (p.perps.some((l) => l.external)) warnings.push('external');
  if (p.boros.length && hold < 3) warnings.push('shortHold');
  if (!fullyLocked) warnings.push('floating');

  return {
    notional: N,
    holdDays: hold,
    fullyLocked,
    capital: { spot: p.spot ? N : 0, perpMargin: N * p.perps.length * perpFactor, borosMargin: N * borosFactors.reduce((s, f) => s + f, 0), total: capitalTotal },
    income: { floating, locked, total: income },
    costs: { perpFees, perpSlippage, spot, boros, transfer, total: totalCosts },
    net,
    netAprPct: capitalTotal > 0 && hold > 0 ? (net / capitalTotal) * (DAYS_PER_YEAR / hold) * 100 : null,
    roiPct: capitalTotal > 0 ? (net / capitalTotal) * 100 : null,
    breakEvenAprPct: N > 0 && t > 0 ? (totalCosts / (N * t)) * 100 : null,
    perpLiquidationPct,
    borosRateTolerancePp,
    warnings
  };
}

/** رتبه‌بندی: APR خالص روی سرمایه، نزولی؛ نامعلوم‌ها آخر */
export function rankPlans<T extends { result: FundingPlanResult }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => (b.result.netAprPct ?? -Infinity) - (a.result.netAprPct ?? -Infinity));
}
