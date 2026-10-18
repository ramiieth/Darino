/**
 * ⑪ اجرا و پایش دلتا — «محاسبهٔ ساده» در برابر «اجرای ربات Tread.fi» + پایش پوزیشن‌های واقعی
 *
 * قواعد Tread.fi (مستندات عمومی docs.tread.fi/bots/delta-neutral-bot):
 *   Notional کل، ۵۰٪ به هر طرف · اجرای هر دو طرف با TWAP · Duration حداکثر ۱ روز و با پایانش پوزیشن بسته می‌شود
 *   حداقل Duration = زمان پر شدن طرفِ کندتر با ۵۰٪ حجم بازار (POV)
 *   Net Exposure = (Long − Short) ÷ (Long + Short)؛ بیش از ۱٪ → «Unbalanced»
 *   حد ضرر ۵۰/۷۵/۹۰٪ یا بدون سقف، روی مارجینِ مقدار پرشده؛ با فعال شدن هر دو طرف بسته می‌شوند
 *
 * مستندات روشن نکرده‌اند Duration زمان پر شدن است یا کل عمر ربات؛ هر دو حالت محاسبه می‌شود:
 *   پر شدن سریع   پر شدن خطی در «حداقل Duration»، سپس نگهداری کامل تا پایان
 *   پر شدن کل مدت  پر شدن خطی در کل Duration (میانگین مواجهه = نصف)
 *   ساعت‌های مواجههٔ کامل = زمان پر شدن ÷ ۲ + (Duration − زمان پر شدن)
 * فرمول حد ضرر هم دوپهلوست (مارجین یا خود قیمت)؛ هر دو آستانه کنار قیمت لیکویید گزارش می‌شود.
 */
import { D, round12 } from './money';
import { calcDeltaNeutral, liquidationMovePct, type DeltaResult } from './deltaNeutral';

export const TREAD_MAX_DURATION_HOURS = 24;
export const TREAD_MIN_POV = 0.5;
export const TREAD_UNBALANCED_PCT = 1;

export interface ExecutionLeg {
  /** کارمزد میکر هر معامله (٪) */
  feePct: number;
  /** builder fee هر معامله (٪) — طبق صفحهٔ ربات فقط Extended/Hyperliquid/Pacifica؛ پیش‌فرض ۰ */
  builderFeePct: number;
  /** نرخ فاندینگ ساعتی (کسری)؛ مثبت = لانگ می‌پردازد */
  fundingHourly: number;
  /** حجم ۲۴ساعتهٔ بازار (دلار)؛ null = صرافی نمی‌دهد */
  volume24hUsd: number | null;
  maintenanceMarginFraction: number;
  markPrice: number | null;
}

export interface ExecutionInput {
  /** Notional کل؛ نصفش به هر طرف */
  totalNotional: number;
  leverage: number;
  durationHours: number;
  long: ExecutionLeg;
  short: ExecutionLeg;
  /** ٪ از مارجین (۵۰/۷۵/۹۰)؛ null = بدون سقف */
  stopLossPct: number | null;
  /** آزمون فشار: طرف کندتر چند درصد از مقدار هدف عقب می‌ماند */
  lagPct: number;
  /** آزمون فشار: حرکت قیمت (٪، قدر مطلق) */
  stressMovePct: number;
}

export interface FillCase {
  /** ساعت پر شدن؛ null = نامعلوم (حجم بازار در دسترس نیست) */
  fillHours: number | null;
  /** ساعت‌های معادل مواجههٔ کامل */
  exposureHours: number | null;
  funding: number | null;
  fees: number;
  net: number | null;
}

export interface StopSide {
  /** حرکت قیمت تا حد ضرر اگر مبنا مارجین باشد (SL ÷ اهرم) */
  marginBasedMovePct: number | null;
  /** حرکت قیمت تا حد ضرر اگر فرمول روی خود قیمت باشد */
  priceBasedMovePct: number | null;
  liquidationMovePct: number | null;
}

export interface ExecutionResult {
  legNotional: number;
  marginPerLeg: number;
  totalMargin: number;
  /** سهم لازم از حجم بازار در طول Duration (٪)؛ null = حجم نامعلوم */
  pov: { long: number | null; short: number | null };
  /** حداقل Duration طبق قاعدهٔ ۵۰٪ POV (ساعت)؛ null = حجم یکی از دو طرف نامعلوم */
  minDurationHours: number | null;
  durationTooShort: boolean;
  durationTooLong: boolean;
  fees: { maker: number; builder: number; total: number };
  /** فاندینگ هر ساعت با مواجههٔ کامل */
  fundingPerHour: number;
  /** محاسبهٔ ساده = همان ماشین‌حساب دلتا نوترال با نصف Notional هر طرف */
  simple: DeltaResult;
  quickFill: FillCase;
  wholeFill: FillCase;
  imbalance: { netExposureUsd: number; netExposurePct: number; unbalanced: boolean; worstCaseUsd: number };
  stop: { long: StopSide; short: StopSide };
}

const nonNeg = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);
const finite = (v: number): number => (Number.isFinite(v) ? v : 0);
const r = round12;

/** ٪ حجم بازار که این طرف در این مدت باید بگیرد */
const povOf = (legNotional: number, volume24h: number | null, hours: number): number | null =>
  volume24h !== null && volume24h > 0 && hours > 0 ? r(D(legNotional).div(D(volume24h).mul(hours).div(24)).mul(100)) : null;

/** ساعت لازم برای پر شدن با ۵۰٪ حجم بازار */
const minHoursOf = (legNotional: number, volume24h: number | null): number | null =>
  volume24h !== null && volume24h > 0 ? r(D(legNotional).div(D(volume24h).div(24).mul(TREAD_MIN_POV))) : null;

export function calcExecution(i: ExecutionInput): ExecutionResult {
  const total = nonNeg(i.totalNotional);
  const leg = r(D(total).div(2));
  const lev = nonNeg(i.leverage);
  const hours = nonNeg(i.durationHours);
  const fL = finite(i.long.fundingHourly);
  const fS = finite(i.short.fundingHourly);

  const mins = [minHoursOf(leg, i.long.volume24hUsd), minHoursOf(leg, i.short.volume24hUsd)];
  const minDurationHours = mins.includes(null) ? null : Math.max(mins[0]!, mins[1]!);

  // هر طرف یک بار باز و یک بار بسته می‌شود
  const maker = r(D(leg).mul(2).mul(nonNeg(i.long.feePct) + nonNeg(i.short.feePct)).div(100));
  const builder = r(D(leg).mul(2).mul(nonNeg(i.long.builderFeePct) + nonNeg(i.short.builderFeePct)).div(100));
  const fees = r(D(maker).plus(builder));
  const fundingPerHour = r(D(leg).mul(D(fS).minus(fL)));

  const fillCase = (fillHours: number | null): FillCase => {
    if (fillHours === null) return { fillHours: null, exposureHours: null, funding: null, fees, net: null };
    const fill = Math.min(fillHours, hours);
    const exposureHours = r(D(fill).div(2).plus(hours - fill));
    const funding = r(D(fundingPerHour).mul(exposureHours));
    return { fillHours: fill, exposureHours, funding, fees, net: r(D(funding).minus(fees)) };
  };

  const lag = Math.min(nonNeg(i.lagPct), 100) / 100;
  const netExposureUsd = r(D(leg).mul(lag));
  const grossFilled = D(leg).mul(2 - lag);
  const netExposurePct = grossFilled.gt(0) ? r(D(netExposureUsd).div(grossFilled).mul(100)) : 0;

  const sl = i.stopLossPct === null || !Number.isFinite(i.stopLossPct) ? null : nonNeg(i.stopLossPct);
  const stopSide = (side: 'long' | 'short', mmf: number): StopSide => ({
    marginBasedMovePct: sl !== null && lev > 0 ? r(D(sl).div(lev)) : null,
    priceBasedMovePct: sl,
    liquidationMovePct: liquidationMovePct(side, lev, mmf)
  });

  return {
    legNotional: leg,
    marginPerLeg: lev > 0 ? r(D(leg).div(lev)) : 0,
    totalMargin: lev > 0 ? r(D(leg).mul(2).div(lev)) : 0,
    pov: { long: povOf(leg, i.long.volume24hUsd, hours), short: povOf(leg, i.short.volume24hUsd, hours) },
    minDurationHours,
    durationTooShort: minDurationHours !== null && hours < minDurationHours,
    durationTooLong: hours > TREAD_MAX_DURATION_HOURS,
    fees: { maker, builder, total: fees },
    fundingPerHour,
    simple: calcDeltaNeutral({
      notional: leg,
      leverage: lev,
      holdHours: hours,
      cycles: 1,
      long: { feePct: i.long.feePct, fundingHourly: fL, maintenanceMarginFraction: i.long.maintenanceMarginFraction, markPrice: i.long.markPrice },
      short: { feePct: i.short.feePct, fundingHourly: fS, maintenanceMarginFraction: i.short.maintenanceMarginFraction, markPrice: i.short.markPrice }
    }),
    quickFill: fillCase(minDurationHours),
    wholeFill: fillCase(hours),
    imbalance: {
      netExposureUsd,
      netExposurePct,
      unbalanced: netExposurePct > TREAD_UNBALANCED_PCT,
      worstCaseUsd: r(D(netExposureUsd).mul(nonNeg(i.stressMovePct)).div(100))
    },
    stop: { long: stopSide('long', i.long.maintenanceMarginFraction), short: stopSide('short', i.short.maintenanceMarginFraction) }
  };
}

/* ---------------- پایش پوزیشن‌های واقعی ---------------- */

export interface LiveLeg {
  side: 'long' | 'short';
  /** ارزش اسمی فعلی (دلار، مثبت)؛ null = قیمت نامعلوم */
  notional: number | null;
  unrealizedPnl: number | null;
}

export interface PairExposure {
  longUsd: number;
  shortUsd: number;
  totalUsd: number;
  /** مثبت = Long بیشتر */
  netUsd: number;
  netPct: number | null;
  unbalanced: boolean;
  /** null وقتی سود/زیان یکی از طرف‌ها گزارش نشده */
  unrealizedPnl: number | null;
  /** ارزش یکی از طرف‌ها نامعلوم است؛ اعداد ناقص‌اند */
  partial: boolean;
}

export function pairExposure(legs: readonly LiveLeg[]): PairExposure {
  let longUsd = D(0);
  let shortUsd = D(0);
  let pnl: ReturnType<typeof D> | null = D(0);
  let partial = false;
  for (const l of legs) {
    if (l.notional === null) partial = true;
    else if (l.side === 'long') longUsd = longUsd.plus(Math.abs(l.notional));
    else shortUsd = shortUsd.plus(Math.abs(l.notional));
    pnl = pnl === null || l.unrealizedPnl === null ? null : pnl.plus(l.unrealizedPnl);
  }
  const totalUsd = longUsd.plus(shortUsd);
  const netUsd = longUsd.minus(shortUsd);
  const netPct = totalUsd.gt(0) ? r(netUsd.div(totalUsd).mul(100)) : null;
  return {
    longUsd: r(longUsd),
    shortUsd: r(shortUsd),
    totalUsd: r(totalUsd),
    netUsd: r(netUsd),
    netPct,
    unbalanced: netPct !== null && Math.abs(netPct) > TREAD_UNBALANCED_PCT,
    unrealizedPnl: pnl === null ? null : r(pnl),
    partial
  };
}
