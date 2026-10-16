/**
 * ⑧ Delta neutral — Long و Short هم‌اندازه روی یک دارایی در دو صرافی پرپ
 *
 * قیمت حذف می‌شود؛ آنچه می‌ماند فاندینگ و کارمزد است:
 *   فاندینگ خالص (دریافتی) = N × ساعت × (f_short − f_long)        نرخ مثبت → لانگ می‌پردازد
 *   کارمزد                  = N × ۲ × (fee_long + fee_short)       باز و بسته‌کردن هر دو طرف
 *   سود خالص                = فاندینگ − کارمزد   (× تعداد دور)
 *   سرمایهٔ لازم            = ۲ × N ÷ اهرم                         مارجین جدا در هر صرافی
 *   حجم ساخته‌شده           = ۴ × N × دور                          (هر طرف: باز + بسته)
 *   فاصلهٔ لیکویید           از فرمول مارجین ایزوله (liquidationPrice) با Entry = ۱
 *
 * اختلاف قیمت ورود (basis) فقط گزارش می‌شود و در سود خالص نیست — همگرایی‌اش تضمینی نیست.
 */
import { D, round12 } from './money';
import { liquidationPrice } from './perp';

export interface DeltaLeg {
  /** کارمزد هر معامله (٪ از ارزش) */
  feePct: number;
  /** نرخ فاندینگ ساعتی (کسری) */
  fundingHourly: number;
  /** کسر مارجین نگهداری */
  maintenanceMarginFraction: number;
  markPrice: number | null;
}

export interface DeltaInput {
  /** ارزش هر طرف (دلار) */
  notional: number;
  /** اهرم یکسان دو طرف */
  leverage: number;
  /** مدت نگهداری هر دور (ساعت) */
  holdHours: number;
  /** تعداد دور باز و بسته‌کردن */
  cycles: number;
  long: DeltaLeg;
  short: DeltaLeg;
}

export interface DeltaLegResult {
  margin: number;
  fees: number;
  /** مثبت = دریافتی، منفی = پرداختی */
  funding: number;
  volume: number;
  /** حرکت قیمت (٪) تا لیکویید شدن این طرف؛ null = لیکویید نمی‌شود */
  liquidationMovePct: number | null;
}

export interface DeltaResult {
  capital: number;
  volume: number;
  fees: number;
  funding: number;
  net: number;
  /** سود خالص ÷ سرمایه (٪) */
  returnPct: number;
  /** بازده سالانه روی سرمایه (٪)؛ null اگر مدت صفر باشد */
  aprOnCapital: number | null;
  /** اختلاف فاندینگ سالانه (٪)؛ مثبت = به نفع این جهت */
  spreadApr: number;
  /** هزینهٔ کارمزد به ازای هر ۱٬۰۰۰٬۰۰۰ دلار حجم */
  costPerMillion: number;
  /** ساعت لازم تا فاندینگ کارمزد یک دور را جبران کند؛ null = هرگز */
  breakEvenHours: number | null;
  /** حداقل ارزش پوینت برای سربه‌سر شدن (۰ اگر سودده باشد) */
  breakEvenPoints: number;
  /** (قیمت Short ÷ قیمت Long − ۱) × ۱۰۰ ؛ مثبت = گران‌تر فروخته‌اید */
  basisPct: number | null;
  /** نزدیک‌ترین فاصلهٔ لیکویید بین دو طرف (٪) */
  nearestLiquidationPct: number | null;
  long: DeltaLegResult;
  short: DeltaLegResult;
}

const nonNeg = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);
const finite = (v: number): number => (Number.isFinite(v) ? v : 0);

/** ٪ حرکت قیمت تا لیکویید یک طرف (Entry = ۱، Notional = ۱) */
export function liquidationMovePct(side: 'long' | 'short', leverage: number, mmf: number): number | null {
  if (!(leverage > 0)) return null;
  const liq = liquidationPrice(side, D(1), D(1), D(1).div(leverage), D(nonNeg(mmf)));
  if (liq === null) return null;
  return round12(liq.minus(1).abs().mul(100));
}

export function calcDeltaNeutral(input: DeltaInput): DeltaResult {
  const N = nonNeg(input.notional);
  const lev = nonNeg(input.leverage);
  const hours = nonNeg(input.holdHours);
  const cycles = Math.floor(nonNeg(input.cycles));
  const fL = finite(input.long.fundingHourly);
  const fS = finite(input.short.fundingHourly);

  const leg = (feePct: number, fundingPerHour: number, side: 'long' | 'short', mmf: number): DeltaLegResult => ({
    margin: lev > 0 ? round12(D(N).div(lev)) : 0,
    fees: round12(D(N).mul(2).mul(nonNeg(feePct)).div(100).mul(cycles)),
    funding: round12(D(N).mul(fundingPerHour).mul(hours).mul(cycles)),
    volume: round12(D(N).mul(2).mul(cycles)),
    liquidationMovePct: liquidationMovePct(side, lev, mmf)
  });
  // لانگ نرخ مثبت را می‌پردازد؛ شورت همان نرخ را دریافت می‌کند
  const long = leg(input.long.feePct, -fL, 'long', input.long.maintenanceMarginFraction);
  const short = leg(input.short.feePct, fS, 'short', input.short.maintenanceMarginFraction);

  const capital = round12(D(long.margin).plus(short.margin));
  const volume = round12(D(long.volume).plus(short.volume));
  const fees = round12(D(long.fees).plus(short.fees));
  const funding = round12(D(long.funding).plus(short.funding));
  const net = round12(D(funding).minus(fees));
  const totalHours = hours * cycles;

  const feePerCycle = cycles > 0 ? fees / cycles : 0;
  const fundingPerHour = N * (fS - fL);
  const lm = input.long.markPrice;
  const sm = input.short.markPrice;
  const liqs = [long.liquidationMovePct, short.liquidationMovePct].filter((v): v is number => v !== null);

  return {
    capital,
    volume,
    fees,
    funding,
    net,
    returnPct: capital > 0 ? round12(D(net).div(capital).mul(100)) : 0,
    aprOnCapital: capital > 0 && totalHours > 0 ? round12(D(net).div(capital).mul(8760).div(totalHours).mul(100)) : null,
    spreadApr: round12(D(fS).minus(fL).mul(8760).mul(100)),
    costPerMillion: volume > 0 ? round12(D(fees).div(volume).mul(1_000_000)) : 0,
    breakEvenHours: fundingPerHour > 0 ? round12(D(feePerCycle).div(fundingPerHour)) : feePerCycle === 0 ? 0 : null,
    breakEvenPoints: net < 0 ? round12(D(net).neg()) : 0,
    basisPct: lm && sm && lm > 0 && sm > 0 ? round12(D(sm).div(lm).minus(1).mul(100)) : null,
    nearestLiquidationPct: liqs.length ? Math.min(...liqs) : null,
    long,
    short
  };
}

/* ---------------- اسکنر اختلاف فاندینگ ---------------- */

export interface FundingQuote {
  base: string;
  fundingHourly: number | null;
}

export interface FundingSpread<T extends FundingQuote> {
  base: string;
  a: T;
  b: T;
  /** |f_a − f_b| سالانه (٪) */
  spreadApr: number;
  /** صرافی‌ای که Short در آن فاندینگ بیشتری می‌گیرد */
  shortOn: 'a' | 'b';
}

/** بازارهای مشترک دو صرافی (بر اساس نماد پایه)، مرتب‌شده بر اساس بیشترین اختلاف فاندینگ */
export function fundingSpreads<T extends FundingQuote>(a: readonly T[], b: readonly T[]): FundingSpread<T>[] {
  const byBase = new Map<string, T>();
  for (const q of b) if (q.fundingHourly !== null && Number.isFinite(q.fundingHourly)) byBase.set(q.base.toUpperCase(), q);
  const out: FundingSpread<T>[] = [];
  const seen = new Set<string>();
  for (const qa of a) {
    const key = qa.base.toUpperCase();
    const qb = byBase.get(key);
    if (!qb || seen.has(key) || qa.fundingHourly === null || !Number.isFinite(qa.fundingHourly)) continue;
    seen.add(key);
    out.push({
      base: qa.base,
      a: qa,
      b: qb,
      spreadApr: round12(D(qa.fundingHourly).minus(qb.fundingHourly!).abs().mul(8760).mul(100)),
      shortOn: qa.fundingHourly >= qb.fundingHourly! ? 'a' : 'b'
    });
  }
  return out.sort((x, y) => y.spreadApr - x.spreadApr);
}
