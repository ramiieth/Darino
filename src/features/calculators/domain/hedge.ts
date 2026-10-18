/**
 * ⑦ پوشش ریسک (هج) — دارایی اسپات + پوزیشن Short خطی (USDT-M) روی همان دارایی در فیوچرز
 *
 *   سرمایهٔ اولیهٔ کل      = اسپات S + وثیقهٔ واقعی حساب فیوچرز D + وجه نقد مستقل C
 *   نسبت هج               = ارزش اسمی Short H ÷ S × ۱۰۰
 *   مواجههٔ ناخالص          = S + H        ·   مواجههٔ خالص بازار = S − H   ·   اهرم مؤثر = H ÷ D
 *
 * هر سناریو با تغییر قیمت x (ارزش اسمی ثابت در ورود، قیمت مبنای یکسان):
 *   اسپات نهایی           = S × (۱ + x)
 *   سود/زیان ناخالص Short  = −H × x
 *   کارمزد                = H × کارمزد٪ (ورود) + H × (۱ + x) × کارمزد٪ (خروج)
 *   اسلیپیج               = (H + H × (۱ + x)) × اسلیپیج٪
 *   فاندینگ               = H × نرخ ۸ساعته٪ × ۳ × روز          مثبت = Short دریافت می‌کند
 *   موجودی نهایی فیوچرز   = D + سود Short + فاندینگ − کارمزد − اسلیپیج   (≤ ۰ → لیکویید: ۰، زیان = کل وثیقه)
 *   سرمایهٔ نهایی کل       = اسپات نهایی + موجودی نهایی فیوچرز + C − سایر هزینه‌ها
 *   سود/زیان خالص کل      = سرمایهٔ نهایی − سرمایهٔ اولیه ؛ بازده کل = ÷ سرمایهٔ اولیه
 *   بدون هج (همان سرمایه) = اسپات نهایی + D + C   (D نقد آزاد می‌ماند، بی‌هزینه)
 *   اثر مالی هج            = با هج − بدون هج = سود Short + فاندینگ − کارمزد − اسلیپیج − سایر هزینه‌ها
 *
 * ارزش اسمی Short پول پرداختی نیست و وثیقه هزینه نیست؛ هر قلم فقط یک بار شمرده می‌شود.
 * وثیقهٔ نامعلوم (null) از روی ارزش اسمی حدس زده نمی‌شود: سرمایهٔ اولیه، نهایی و بازده null می‌مانند.
 * مارجین نگهداری صرافی مدل نشده؛ لیکویید واقعی کمی زودتر از صفر شدن موجودی است —
 * مگر قیمت لیکویید صرافی (liquidationRisePct) از حساب متصل آمده باشد.
 */
import { toEnDigits } from '@/shared/utils/formatters';
import { D, round12, type Decimal } from './money';

export type Coin = { symbol: string; name: string; color: string; logo: string };

export type HedgeInput = {
  /** ارزش فعلی دارایی اسپات (دلار) */
  spot: number;
  /** ارزش اسمی پوزیشن Short (دلار) */
  shortNotional: number;
  /** موجودی/وثیقهٔ واقعی واریزشده به حساب فیوچرز (دلار)؛ null = نامشخص */
  futuresCollateral: number | null;
  /** وجه نقد مستقل بیرون از حساب فیوچرز (دلار) */
  cash: number;
  dropPct: number;
  risePct: number;
  /** کارمزد هر معاملهٔ Short (٪ از ارزش) — ورود و خروج */
  feePct: number;
  /** اسلیپیج هر معامله (٪ از ارزش) */
  slippagePct: number;
  /** میانگین نرخ فاندینگ هر ۸ ساعت (٪)؛ مثبت = Short دریافت می‌کند */
  fundingPct8h: number;
  holdDays: number;
  /** واریز، برداشت، گس و … (دلار) */
  otherCosts: number;
  /** رشد قیمت (٪) تا قیمت لیکویید گزارش‌شدهٔ صرافی؛ وقتی معلوم است بر «صفر شدن موجودی» مقدم است */
  liquidationRisePct?: number | null;
};

export type HedgeScenario = {
  /** تغییر قیمت با علامت (٪) */
  movePct: number;
  spotEnd: number;
  /** سود/زیان ناخالص Short پیش از هزینه (با لیکویید، محدود به وثیقه) */
  shortGross: number;
  entryFee: number;
  exitFee: number;
  fees: number;
  slippage: number;
  /** مثبت = دریافتی */
  funding: number;
  otherCosts: number;
  /** null وقتی وثیقه نامشخص است */
  futuresEnd: number | null;
  cashEnd: number;
  totalEnd: number | null;
  net: number | null;
  roiPct: number | null;
  /** بازده پوزیشن Short روی وثیقه (٪) */
  shortRoePct: number | null;
  /** موجودی فیوچرز در این سناریو به صفر می‌رسد */
  liquidated: boolean;
  unhedgedEnd: number | null;
  unhedgedNet: number | null;
  unhedgedRoiPct: number | null;
  /** اثر مالی هج پیش از هزینه = سود/زیان ناخالص Short */
  hedgeEffectGross: number;
  /** اثر مالی خالص هج = با هج − بدون هج */
  hedgeEffectNet: number;
  /** بازده با هج − بازده بدون هج (واحد درصد، مبنای هر دو: سرمایهٔ اولیهٔ کل) */
  roiDiffPp: number | null;
};

export type HedgeResult = {
  /** null وقتی اسپات صفر است */
  ratioPct: number | null;
  spot: number;
  shortNotional: number;
  futuresCollateral: number | null;
  cash: number;
  totalStart: number | null;
  grossExposure: number;
  netExposure: number;
  /** H ÷ D؛ null بدون وثیقه یا Short */
  effectiveLeverage: number | null;
  /** رشد قیمتی (٪) که موجودی فیوچرز را بدون هزینه‌ها صفر می‌کند؛ null = نامعلوم یا بدون Short */
  collateralWipeoutPct: number | null;
  /** هزینه‌های تخمینی استراتژی بدون تغییر قیمت (کارمزد + اسلیپیج + سایر − فاندینگ) */
  baseCosts: { fees: number; slippage: number; funding: number; otherCosts: number; total: number };
  drop: HedgeScenario;
  rise: HedgeScenario;
};

/** ورودی متنی (ارقام فارسی/عربی/لاتین، جداکنندهٔ هزارگان) → عدد؛ خالی یا نامعتبر = ۰ */
export function toNumber(v: string): number {
  const t = toEnDigits(v ?? '').replace(/[,\s٬]/g, '').replace('٫', '.');
  if (t === '') return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

const nonNeg = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);
const finite = (v: number): number => (Number.isFinite(v) ? v : 0);
const r = (v: Decimal): number => round12(v);

function scenario(i: HedgeInput, S: number, H: number, Dc: number | null, C: number, movePct: number): HedgeScenario {
  const x = D(movePct).div(100);
  const exitFactor = D(1).plus(x);
  const fee = D(nonNeg(i.feePct)).div(100);
  const slip = D(nonNeg(i.slippagePct)).div(100);
  const spotEnd = D(S).mul(exitFactor);
  const grossRaw = D(H).mul(x).neg();
  const entryFee = D(H).mul(fee);
  const exitFeeRaw = D(H).mul(exitFactor).mul(fee);
  const slippageRaw = D(H).plus(D(H).mul(exitFactor)).mul(slip);
  const funding = D(H).mul(finite(i.fundingPct8h)).div(100).mul(3).mul(nonNeg(i.holdDays));
  const other = D(nonNeg(i.otherCosts));

  // لیکویید فقط با وثیقهٔ معلوم قابل تشخیص است
  const futuresRaw = Dc === null ? null : D(Dc).plus(grossRaw).plus(funding).minus(entryFee).minus(exitFeeRaw).minus(slippageRaw);
  const liqRise = i.liquidationRisePct;
  const hitsExchangeLiq = liqRise !== null && liqRise !== undefined && Number.isFinite(liqRise) && movePct > 0 && movePct >= liqRise;
  const liquidated = H > 0 && futuresRaw !== null && (futuresRaw.lte(0) || hitsExchangeLiq);
  // لیکویید: کل وثیقه از دست می‌رود؛ خروج دستی (کارمزد/اسلیپیج خروج) رخ نمی‌دهد
  const exitFee = liquidated ? D(0) : exitFeeRaw;
  const slippage = liquidated ? D(H).mul(slip) : slippageRaw;
  const futuresEnd = futuresRaw === null ? null : liquidated ? D(0) : futuresRaw;
  const fees = entryFee.plus(exitFee);
  const shortGross = liquidated ? D(Dc!).plus(funding).minus(fees).minus(slippage).neg() : grossRaw;

  const hedgeEffectNet = shortGross.plus(funding).minus(fees).minus(slippage).minus(other);
  const totalStart = Dc === null ? null : D(S).plus(Dc).plus(C);
  const totalEnd = futuresEnd === null ? null : spotEnd.plus(futuresEnd).plus(C).minus(other);
  const unhedgedEnd = Dc === null ? null : spotEnd.plus(Dc).plus(C);
  const pctOf = (v: Decimal | null, base: Decimal | null) => (v === null || base === null || base.lte(0) ? null : r(v.div(base).mul(100)));
  const net = totalEnd === null || totalStart === null ? null : totalEnd.minus(totalStart);
  const unhedgedNet = unhedgedEnd === null || totalStart === null ? null : unhedgedEnd.minus(totalStart);
  const roiPct = pctOf(net, totalStart);
  const unhedgedRoiPct = pctOf(unhedgedNet, totalStart);

  return {
    movePct,
    spotEnd: r(spotEnd),
    shortGross: r(shortGross),
    entryFee: r(entryFee),
    exitFee: r(exitFee),
    fees: r(fees),
    slippage: r(slippage),
    funding: r(funding),
    otherCosts: r(other),
    futuresEnd: futuresEnd === null ? null : r(futuresEnd),
    cashEnd: C,
    totalEnd: totalEnd === null ? null : r(totalEnd),
    net: net === null ? null : r(net),
    roiPct,
    shortRoePct: futuresEnd === null || !(Dc! > 0) ? null : r(futuresEnd.minus(Dc!).div(Dc!).mul(100)),
    liquidated,
    unhedgedEnd: unhedgedEnd === null ? null : r(unhedgedEnd),
    unhedgedNet: unhedgedNet === null ? null : r(unhedgedNet),
    unhedgedRoiPct,
    hedgeEffectGross: r(shortGross),
    hedgeEffectNet: r(hedgeEffectNet),
    roiDiffPp: roiPct === null || unhedgedRoiPct === null ? null : r(D(roiPct).minus(unhedgedRoiPct))
  };
}

/** ورودی پاک‌شده: منفی/NaN = ۰، وثیقهٔ نامعلوم = null */
function holdings(input: HedgeInput) {
  return {
    S: nonNeg(input.spot),
    H: nonNeg(input.shortNotional),
    Dc: input.futuresCollateral === null || !Number.isFinite(input.futuresCollateral) ? null : nonNeg(input.futuresCollateral),
    C: nonNeg(input.cash)
  };
}

export interface PayoffPoint {
  movePct: number;
  /** ارزش نهایی کل با هج؛ null = وثیقه نامشخص */
  hedged: number | null;
  /** ارزش نهایی کل بدون هج با همان سرمایه؛ null = وثیقه نامشخص */
  unhedged: number | null;
  liquidated: boolean;
}

/** منحنی ارزش پرتفوی با و بدون هج — همان مدل سناریو در چند تغییر قیمت (ریزش بیش از ۱۰۰٪ کنار گذاشته می‌شود) */
export function hedgePayoff(input: HedgeInput, moves: readonly number[]): PayoffPoint[] {
  const { S, H, Dc, C } = holdings(input);
  return [...new Set(moves)]
    .filter((m) => Number.isFinite(m) && m >= -100)
    .sort((a, b) => a - b)
    .map((movePct) => {
      const s = scenario(input, S, H, Dc, C, movePct);
      return { movePct, hedged: s.totalEnd, unhedged: s.unhedgedEnd, liquidated: s.liquidated };
    });
}

export function calcHedge(input: HedgeInput): HedgeResult {
  const { S, H, Dc, C } = holdings(input);
  // ریزش حداکثر ۱۰۰٪ (قیمت منفی نمی‌شود)؛ رشد سقف ندارد
  const drop = Math.min(nonNeg(input.dropPct), 100);
  const rise = nonNeg(input.risePct);

  const flat = scenario(input, S, H, Dc, C, 0);
  const baseTotal = D(flat.fees).plus(flat.slippage).plus(flat.otherCosts).minus(flat.funding);

  return {
    ratioPct: S > 0 ? r(D(H).div(S).mul(100)) : null,
    spot: S,
    shortNotional: H,
    futuresCollateral: Dc,
    cash: C,
    totalStart: Dc === null ? null : r(D(S).plus(Dc).plus(C)),
    grossExposure: r(D(S).plus(H)),
    netExposure: r(D(S).minus(H)),
    effectiveLeverage: Dc !== null && Dc > 0 && H > 0 ? r(D(H).div(Dc)) : null,
    collateralWipeoutPct:
      input.liquidationRisePct != null && Number.isFinite(input.liquidationRisePct) && H > 0
        ? r(D(input.liquidationRisePct))
        : Dc !== null && H > 0
          ? r(D(Dc).div(H).mul(100))
          : null,
    baseCosts: { fees: flat.fees, slippage: flat.slippage, funding: flat.funding, otherCosts: flat.otherCosts, total: r(baseTotal) },
    drop: scenario(input, S, H, Dc, C, -drop),
    rise: scenario(input, S, H, Dc, C, rise)
  };
}
