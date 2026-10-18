/**
 * ⑧ Delta neutral — Long و Short هم‌ارزش (N دلار) روی یک دارایی در دو صرافی پرپ
 *
 * هر دور: باز کردن هر دو طرف با قیمت مارک فعلی → نگهداری → بستن با قیمت سناریو.
 *   نسبت خروج r           = قیمت خروج ÷ قیمت ورود همان طرف
 *     keep     → r_L = r_S = ۱ + حرکت                (اختلاف قیمت دو صرافی ثابت می‌ماند)
 *     converge → r = وسط دو قیمت × (۱ + حرکت) ÷ ورود  (اختلاف قیمت در خروج صفر می‌شود)
 *   سود قیمت Long         = N × (r_L − ۱)      ·  Short = N × (۱ − r_S)
 *   فاندینگ (روی ارزش ورود) = N × ساعت × (f_short − f_long)        نرخ مثبت → لانگ می‌پردازد
 *   کارمزد                 = (N + N × r) × کارمزد هر طرف            باز + بسته
 *   اسلیپیج                = (N + N × r) × اسلیپیج هر طرف           تخمین کاربر، نسبت به قیمت مارک
 *   سود خالص               → deltaLedger (× تعداد دور)
 *   سرمایهٔ لازم (مارجین)   = ۲ × N ÷ اهرم                          وثیقه، نه هزینه
 *   فاصلهٔ لیکویید          از فرمول مارجین ایزوله (liquidationPrice) با Entry = ۱
 *
 * لیکویید در سناریو (محافظه‌کارانه): کل مارجین آن طرف از دست می‌رود، فاندینگ و هزینهٔ خروجش صفر.
 * دلتای دلاری با ارزش برابر صفر است؛ ریسک basis، لیکویید جدا و تغییر فاندینگ با آن حذف نمی‌شود.
 */
import { D, round12 } from './money';
import { liquidationPrice } from './perp';
import { deltaLedger, type Ledger } from './deltaLedger';

export interface DeltaLeg {
  /** کارمزد هر معامله (٪ از ارزش) */
  feePct: number;
  /** نرخ فاندینگ ساعتی (کسری) */
  fundingHourly: number;
  /** کسر مارجین نگهداری */
  maintenanceMarginFraction: number;
  markPrice: number | null;
}

export type ExitBasis = 'keep' | 'converge';

export interface DeltaExitScenario {
  /** تغییر قیمت پایه تا خروج هر دور (٪)؛ ۰ = قیمت ثابت */
  priceMovePct: number;
  basis: ExitBasis;
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
  /** اسلیپیج یک‌طرفهٔ هر معامله (٪ از ارزش)؛ پیش‌فرض ۰ */
  slippagePct?: number;
  /** سناریوی خروج هر دور؛ پیش‌فرض: قیمت ثابت، اختلاف قیمت ثابت */
  exit?: DeltaExitScenario;
  /** کل سرمایهٔ کنار گذاشته (دلار)؛ خالی/۰ = همان مارجین لازم */
  availableCapital?: number | null;
}

export interface DeltaLegResult {
  /** ارزش ورود */
  notional: number;
  /** مقدار دارایی = ارزش ÷ قیمت مارک؛ null بدون قیمت */
  quantity: number | null;
  entryPrice: number | null;
  /** قیمت خروج سناریو؛ null بدون قیمت مارک */
  exitPrice: number | null;
  exitNotional: number;
  /** دلتای دلاری ورود: + برای Long، − برای Short */
  deltaUsd: number;
  margin: number;
  /** مجموع کارمزد ورود و خروج همهٔ دورها */
  fees: number;
  entryFees: number;
  exitFees: number;
  slippage: number;
  /** مثبت = دریافتی، منفی = پرداختی */
  funding: number;
  /** سود/زیان قیمت همهٔ دورها (پیش از هزینه) */
  pricePnl: number;
  volume: number;
  /** حرکت قیمت (٪) تا لیکویید شدن این طرف؛ null = لیکویید نمی‌شود */
  liquidationMovePct: number | null;
  /** این طرف در سناریوی خروج لیکویید می‌شود */
  liquidatedAtExit: boolean;
  /** موجودی این صرافی پس از بستن = مارجین + سود قیمت + فاندینگ − کارمزد − اسلیپیج */
  closingBalance: number;
}

export interface DeltaResult {
  /** ارزش هر طرف */
  notional: number;
  /** مجموع ارزش اسمی دو طرف (در معرض بازار، نه پول پرداختی) */
  grossExposure: number;
  /** مارجین لازم هر دو طرف */
  capital: number;
  volume: number;
  fees: number;
  entryFees: number;
  exitFees: number;
  slippage: number;
  funding: number;
  /** سود/زیان قیمت (ناخالص معاملاتی) */
  pricePnl: number;
  /** فاندینگ − کارمزد − اسلیپیج (بدون سود قیمت) */
  carry: number;
  net: number;
  /** سود خالص ÷ مارجین (٪) */
  returnPct: number;
  /** بازده سالانهٔ carry روی مارجین (٪)؛ سود قیمت سالانه نمی‌شود؛ null اگر مدت صفر باشد */
  aprOnCapital: number | null;
  /** اختلاف فاندینگ سالانه (٪)؛ مثبت = به نفع این جهت */
  spreadApr: number;
  /** هزینهٔ کارمزد به ازای هر ۱٬۰۰۰٬۰۰۰ دلار حجم */
  costPerMillion: number;
  /** هزینهٔ هر ۰٫۰۱٪ کارمزد یا اسلیپیج اضافه در همهٔ معامله‌ها */
  costPerBp: number;
  /** ساعت لازم تا فاندینگ کارمزد و اسلیپیج یک دور را جبران کند؛ null = هرگز */
  breakEvenHours: number | null;
  /** حداقل ارزش پوینت برای سربه‌سر شدن (۰ اگر سودده باشد) */
  breakEvenPoints: number;
  /** (قیمت Short ÷ قیمت Long − ۱) × ۱۰۰ ؛ مثبت = گران‌تر فروخته‌اید */
  basisPct: number | null;
  /** حالت اختلاف قیمت اعمال‌شده؛ converge بدون قیمت مارک → keep */
  exitBasis: ExitBasis;
  /** دلتای دلاری خالص ورود (Long + Short) */
  netDeltaUsd: number;
  /** (مقدار Long − مقدار Short) ÷ میانگین دو مقدار × ۱۰۰ ؛ null بدون قیمت */
  quantityImbalancePct: number | null;
  /** نزدیک‌ترین فاصلهٔ لیکویید بین دو طرف (٪) */
  nearestLiquidationPct: number | null;
  liquidated: boolean;
  /** سرمایهٔ مبنا − مارجین؛ منفی = سرمایه کافی نیست */
  freeCapital: number;
  capitalShortfall: boolean;
  ledger: Ledger;
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

const validPrice = (p: number | null): p is number => p !== null && Number.isFinite(p) && p > 0;

export function calcDeltaNeutral(input: DeltaInput): DeltaResult {
  const N = nonNeg(input.notional);
  const lev = nonNeg(input.leverage);
  const hours = nonNeg(input.holdHours);
  const cycles = Math.floor(nonNeg(input.cycles));
  const fL = finite(input.long.fundingHourly);
  const fS = finite(input.short.fundingHourly);
  const slip = nonNeg(input.slippagePct ?? 0);
  const move = finite(input.exit?.priceMovePct ?? 0) / 100;
  const lm = input.long.markPrice;
  const sm = input.short.markPrice;
  const hasMarks = validPrice(lm) && validPrice(sm);
  const exitBasis: ExitBasis = input.exit?.basis === 'converge' && hasMarks ? 'converge' : 'keep';

  // نسبت قیمت خروج به ورود هر طرف (قیمت منفی ممکن نیست)
  const keepRatio = Math.max(0, 1 + move);
  const exitMid = hasMarks ? Math.max(0, ((lm + sm) / 2) * (1 + move)) : 0;
  const ratioOf = (mark: number | null) => (exitBasis === 'converge' && validPrice(mark) ? exitMid / mark : keepRatio);

  const leg = (side: 'long' | 'short', q: DeltaLeg, fundingPerHour: number): DeltaLegResult => {
    const ratio = ratioOf(q.markPrice);
    const margin = lev > 0 ? round12(D(N).div(lev)) : 0;
    const liqMove = liquidationMovePct(side, lev, q.maintenanceMarginFraction);
    const adverse = (side === 'long' ? 1 - ratio : ratio - 1) * 100;
    const liquidated = N > 0 && liqMove !== null && adverse >= liqMove;
    const exitNotional = liquidated ? 0 : round12(D(N).mul(ratio));
    const fee = nonNeg(q.feePct);
    const entryFees = round12(D(N).mul(fee).div(100).mul(cycles));
    const exitFees = round12(D(exitNotional).mul(fee).div(100).mul(cycles));
    const slippage = round12(D(N).plus(exitNotional).mul(slip).div(100).mul(cycles));
    const funding = liquidated ? 0 : round12(D(N).mul(fundingPerHour).mul(hours).mul(cycles));
    const perCyclePnl = liquidated ? D(margin).neg() : D(N).mul(side === 'long' ? ratio - 1 : 1 - ratio);
    const pricePnl = round12(perCyclePnl.mul(cycles));
    const fees = round12(D(entryFees).plus(exitFees));
    return {
      notional: N,
      quantity: validPrice(q.markPrice) ? round12(D(N).div(q.markPrice)) : null,
      entryPrice: validPrice(q.markPrice) ? q.markPrice : null,
      exitPrice: validPrice(q.markPrice) ? round12(D(q.markPrice).mul(ratio)) : null,
      exitNotional,
      deltaUsd: side === 'long' ? N : -N,
      margin,
      fees,
      entryFees,
      exitFees,
      slippage,
      funding,
      pricePnl,
      volume: round12(D(N).plus(exitNotional).mul(cycles)),
      liquidationMovePct: liqMove,
      liquidatedAtExit: liquidated,
      closingBalance: round12(D(margin).plus(pricePnl).plus(funding).minus(fees).minus(slippage))
    };
  };
  // لانگ نرخ مثبت را می‌پردازد؛ شورت همان نرخ را دریافت می‌کند
  const long = leg('long', input.long, -fL);
  const short = leg('short', input.short, fS);

  const sum = (pick: (l: DeltaLegResult) => number) => round12(D(pick(long)).plus(pick(short)));
  const capital = sum((l) => l.margin);
  const volume = sum((l) => l.volume);
  const fees = sum((l) => l.fees);
  const slippage = sum((l) => l.slippage);
  const funding = sum((l) => l.funding);
  const pricePnl = sum((l) => l.pricePnl);
  const carry = round12(D(funding).minus(fees).minus(slippage));
  const available = nonNeg(input.availableCapital ?? 0);
  const baseCapital = available > 0 ? available : capital;
  const ledger = deltaLedger({ baseCapital, grossTrading: pricePnl, funding, fees, slippage, otherCosts: 0 });
  const net = ledger.net;
  const totalHours = hours * cycles;

  const costPerCycle = cycles > 0 ? (fees + slippage) / cycles : 0;
  const fundingPerHour = N * (fS - fL);
  const liqs = [long.liquidationMovePct, short.liquidationMovePct].filter((v): v is number => v !== null);

  return {
    notional: N,
    grossExposure: round12(D(N).mul(2)),
    capital,
    volume,
    fees,
    entryFees: sum((l) => l.entryFees),
    exitFees: sum((l) => l.exitFees),
    slippage,
    funding,
    pricePnl,
    carry,
    net,
    returnPct: capital > 0 ? round12(D(net).div(capital).mul(100)) : 0,
    aprOnCapital: capital > 0 && totalHours > 0 ? round12(D(carry).div(capital).mul(8760).div(totalHours).mul(100)) : null,
    spreadApr: round12(D(fS).minus(fL).mul(8760).mul(100)),
    costPerMillion: volume > 0 ? round12(D(fees).div(volume).mul(1_000_000)) : 0,
    costPerBp: round12(D(volume).mul(0.0001)),
    breakEvenHours: fundingPerHour > 0 ? round12(D(costPerCycle).div(fundingPerHour)) : costPerCycle === 0 ? 0 : null,
    breakEvenPoints: net < 0 ? round12(D(net).neg()) : 0,
    basisPct: hasMarks ? round12(D(sm).div(lm).minus(1).mul(100)) : null,
    exitBasis,
    netDeltaUsd: long.deltaUsd + short.deltaUsd,
    quantityImbalancePct:
      long.quantity !== null && short.quantity !== null && long.quantity + short.quantity > 0
        ? round12(D(long.quantity).minus(short.quantity).div(D(long.quantity).plus(short.quantity).div(2)).mul(100))
        : null,
    nearestLiquidationPct: liqs.length ? Math.min(...liqs) : null,
    liquidated: long.liquidatedAtExit || short.liquidatedAtExit,
    freeCapital: round12(D(baseCapital).minus(capital)),
    capitalShortfall: available > 0 && available < capital,
    ledger,
    long,
    short
  };
}

/* ---------------- حساسیت ---------------- */

export type DeltaDriver = 'price' | 'funding' | 'fees' | 'slippage';

export interface DeltaSensitivity {
  /** سود خالص در چند حرکت قیمت (با همان حالت اختلاف قیمت کاربر) */
  priceMoves: { movePct: number; net: number; liquidated: boolean }[];
  /** سود خالص با مدت نگهداری متفاوت هر دور */
  holds: { hours: number; net: number }[];
  /** بزرگ‌ترین قلم (قدر مطلق) در نتیجهٔ فعلی؛ null اگر همه صفرند */
  driver: DeltaDriver | null;
}

export function deltaSensitivity(
  input: DeltaInput,
  moves: readonly number[] = [-25, -10, 0, 10, 25],
  holds: readonly number[] = [8, 24, 168, 720]
): DeltaSensitivity {
  const basis = input.exit?.basis ?? 'keep';
  const base = calcDeltaNeutral(input);
  const items: [DeltaDriver, number][] = [
    ['price', base.pricePnl],
    ['funding', base.funding],
    ['fees', base.fees],
    ['slippage', base.slippage]
  ];
  const top = items.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a));
  return {
    priceMoves: moves.map((movePct) => {
      const r = calcDeltaNeutral({ ...input, exit: { priceMovePct: movePct, basis } });
      return { movePct, net: r.net, liquidated: r.liquidated };
    }),
    holds: holds.map((hours) => ({ hours, net: calcDeltaNeutral({ ...input, holdHours: hours }).net })),
    driver: Math.abs(top[1]) > 0 ? top[0] : null
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
