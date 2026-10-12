/**
 * ۶) ماشین‌حساب قرارداد دائمی (Perpetual) — مارجین ایزوله
 *
 *   Notional        = Margin × Leverage
 *   Size            = Notional ÷ Entry
 *   Maintenance     = Size × Price × MMF
 *   Liq (Long)      = (Entry − Margin÷Size) ÷ (1 − MMF)
 *   Liq (Short)     = (Entry + Margin÷Size) ÷ (1 + MMF)
 *       (از برابری: Margin + PnL(P) = Size × P × MMF)
 *   Price PnL       = Size × (Exit − Entry) × dir
 *   Funding         = Notional × RateHourly × Hours × dir   (مثبت = پرداختی کاربر)
 *       نرخ مثبت → لانگ‌ها به شورت‌ها می‌پردازند
 *   Net PnL         = Price PnL − Fees − Funding
 *   ROE             = Net PnL ÷ Margin
 */
import { D, Decimal, round12, safeDiv } from './money';

export type PerpSide = 'long' | 'short';

export interface PerpInput {
  /** مارجین (وثیقهٔ ایزوله) — دلار */
  margin: number;
  leverage: number;
  entryPrice: number;
  /** قیمت خروج / هدف (اختیاری) */
  exitPrice: number | null;
  /** کسر مارجین نگهداری (مثلاً 0.0125) */
  maintenanceMarginFraction: number;
  /** کارمزد هر طرف معامله (٪ از ارزش) */
  feePct: number;
  /** نرخ فاندینگ ساعتی (کسری؛ 0.0000125 = ۰٫۰۰۱۲۵٪ در ساعت) */
  fundingRateHourly: number;
  /** مدت نگهداری (ساعت) */
  holdHours: number;
}

export interface PerpSideResult {
  side: PerpSide;
  notional: number;
  size: number;
  /** null یعنی با این اهرم عملاً لیکویید نمی‌شود (قیمت ≤ ۰) */
  liquidationPrice: number | null;
  /** فاصلهٔ قیمت لیکویید از ورود (٪، همیشه مثبت) */
  liquidationDistancePct: number | null;
  /** قیمت لیکویید پس از کسر فاندینگ دورهٔ نگهداری از مارجین */
  liquidationPriceAfterFunding: number | null;
  maintenanceMargin: number;
  openFee: number;
  closeFee: number;
  /** مثبت = پرداختی، منفی = دریافتی */
  funding: number;
  pricePnl: number | null;
  netPnl: number | null;
  roePct: number | null;
  /** قیمتی که در آن سود خالص صفر است (با کارمزد و فاندینگ) */
  breakEvenPrice: number | null;
  /** آیا قیمت خروج از قیمت لیکویید عبور کرده است */
  liquidatedAtExit: boolean;
}

const dirOf = (s: PerpSide) => (s === 'long' ? 1 : -1);

export function liquidationPrice(side: PerpSide, entry: Decimal, size: Decimal, collateral: Decimal, mmf: Decimal): Decimal | null {
  if (size.lte(0) || entry.lte(0)) return null;
  if (collateral.lte(0)) return entry; // بدون وثیقه = لیکویید فوری
  const perUnit = collateral.div(size);
  if (side === 'long') {
    const denom = D(1).minus(mmf);
    if (denom.lte(0)) return null;
    const p = entry.minus(perUnit).div(denom);
    return p.gt(0) ? p : null;
  }
  return entry.plus(perUnit).div(D(1).plus(mmf));
}

export function calcPerp(input: PerpInput, side: PerpSide): PerpSideResult {
  const dir = dirOf(side);
  const margin = D(input.margin);
  const lev = D(input.leverage);
  const entry = D(input.entryPrice);
  const mmf = D(input.maintenanceMarginFraction);
  const fee = D(input.feePct).div(100);

  const notional = margin.mul(lev);
  const size = safeDiv(notional, entry) ?? new Decimal(0);
  const openFee = notional.mul(fee);
  const funding = notional.mul(D(input.fundingRateHourly)).mul(D(input.holdHours)).mul(dir);

  const liq = liquidationPrice(side, entry, size, margin, mmf);
  const liqAfter = liquidationPrice(side, entry, size, margin.minus(funding), mmf);
  const liqDist = liq === null ? null : safeDiv(liq.minus(entry).abs(), entry);

  let pricePnl: Decimal | null = null;
  let netPnl: Decimal | null = null;
  let closeFee = new Decimal(0);
  let liquidatedAtExit = false;
  if (input.exitPrice !== null && Number.isFinite(input.exitPrice) && input.exitPrice > 0 && size.gt(0)) {
    const exit = D(input.exitPrice);
    closeFee = size.mul(exit).mul(fee);
    pricePnl = size.mul(exit.minus(entry)).mul(dir);
    netPnl = pricePnl.minus(openFee).minus(closeFee).minus(funding);
    if (liqAfter !== null) liquidatedAtExit = side === 'long' ? exit.lte(liqAfter) : exit.gte(liqAfter);
    // ضرر در ایزوله به مارجین محدود است
    if (liquidatedAtExit || netPnl.lt(margin.neg())) netPnl = margin.neg();
  }

  // سربه‌سر: Size×(BE−Entry)×dir = openFee + closeFee(BE) + funding ؛ closeFee = Size×BE×fee
  let breakEven: Decimal | null = null;
  if (size.gt(0)) {
    const k = openFee.plus(funding);
    const denom = side === 'long' ? D(1).minus(fee) : D(1).plus(fee);
    const num = side === 'long' ? entry.plus(k.div(size)) : entry.minus(k.div(size));
    const be = safeDiv(num, denom);
    breakEven = be !== null && be.gt(0) ? be : null;
  }

  const roe = netPnl === null ? null : safeDiv(netPnl, margin);
  const r = (v: Decimal | null) => (v === null ? null : round12(v));

  return {
    side,
    notional: round12(notional),
    size: round12(size),
    liquidationPrice: r(liq),
    liquidationDistancePct: liqDist === null ? null : round12(liqDist.mul(100)),
    liquidationPriceAfterFunding: r(liqAfter),
    maintenanceMargin: round12(size.mul(entry).mul(mmf)),
    openFee: round12(openFee),
    closeFee: round12(closeFee),
    funding: round12(funding),
    pricePnl: r(pricePnl),
    netPnl: r(netPnl),
    roePct: roe === null ? null : round12(roe.mul(100)),
    breakEvenPrice: r(breakEven),
    liquidatedAtExit
  };
}

/** تبدیل نرخ ساعتی به دوره‌های رایج (٪) */
export function fundingPeriods(hourly: number): { h1: number; h8: number; day: number; apr: number } {
  const h = D(hourly).mul(100);
  return { h1: round12(h), h8: round12(h.mul(8)), day: round12(h.mul(24)), apr: round12(h.mul(24 * 365)) };
}

/** جدول سناریو: سود خالص هر دو طرف برای درصدهای تغییر قیمت */
export function perpScenarios(
  input: PerpInput,
  movesPct: number[]
): { movePct: number; price: number; long: PerpSideResult; short: PerpSideResult }[] {
  return movesPct.map((m) => {
    const price = round12(D(input.entryPrice).mul(D(1).plus(D(m).div(100))));
    const next = { ...input, exitPrice: price };
    return { movePct: m, price, long: calcPerp(next, 'long'), short: calcPerp(next, 'short') };
  });
}
