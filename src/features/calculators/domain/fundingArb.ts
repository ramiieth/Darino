/**
 * ⑨ آربیتراژ فاندینگ «واقعی» — سرمایهٔ هر طرف، تاریخچهٔ تسویه‌شده، اسلیپیج دفتر سفارش و هزینهٔ انتقال
 *
 * اسپرد هر ساعت (کسری)   = نرخ صرافی Short − نرخ صرافی Long          (نرخ مثبت → لانگ می‌پردازد)
 * ارزش هر طرف            = سرمایهٔ هر طرف × اهرم
 * فاندینگ دوره           = ارزش × اسپرد پیش‌بینی × ساعت
 * کارمزد                 = ارزش × ۲ × (کارمزد Long + کارمزد Short)      باز و بسته‌کردن
 * اسلیپیج                = ارزش × ۲ × (اسلیپیج Long + اسلیپیج Short)    خروج هم‌اندازهٔ ورود فرض می‌شود
 * سود خالص               = فاندینگ − کارمزد − اسلیپیج − هزینهٔ انتقال      (deltaLedger؛ سود قیمت = ۰ با فرض اختلاف قیمت ثابت)
 * سرمایهٔ نهایی           = سرمایهٔ هر دو طرف + سود خالص
 * سربه‌سر اسپرد            = همهٔ هزینه‌ها ÷ (ارزش × ساعت) → سالانه
 *
 * «اسپرد پیش‌بینی» عمداً میانگین نرخ‌های تسویه‌شدهٔ ۷ روز است، نه نرخ لحظه‌ای؛
 * نرخ لحظه‌ای فقط وقتی جایگزین می‌شود که تاریخچهٔ کافی نباشد (و برچسب می‌خورد).
 */
import { liquidationMovePct } from './deltaNeutral';
import { deltaLedger } from './deltaLedger';

const HOUR_MS = 3_600_000;
const HOURS_PER_YEAR = 8760;

/** نرخ فاندینگ یک ساعت (کسری)؛ hour = ابتدای ساعت به میلی‌ثانیه */
export interface RatePoint {
  hour: number;
  rate: number;
}

/** یک سطح دفتر سفارش؛ ترتیب از بهترین قیمت */
export interface BookLevel {
  price: number;
  size: number;
}

export const floorHour = (ms: number): number => Math.floor(ms / HOUR_MS) * HOUR_MS;
export const hourlyToApr = (hourly: number): number => hourly * HOURS_PER_YEAR * 100;

/** اسپرد ساعت‌به‌ساعت (Short − Long) — فقط ساعت‌هایی که هر دو صرافی نرخ دارند، صعودی */
export function alignSpread(shortLeg: readonly RatePoint[], longLeg: readonly RatePoint[]): RatePoint[] {
  const longByHour = new Map<number, number>();
  for (const p of longLeg) if (Number.isFinite(p.rate)) longByHour.set(floorHour(p.hour), p.rate);
  const out = new Map<number, number>();
  for (const p of shortLeg) {
    const h = floorHour(p.hour);
    const l = longByHour.get(h);
    if (l !== undefined && Number.isFinite(p.rate)) out.set(h, p.rate - l);
  }
  return [...out].sort((a, b) => a[0] - b[0]).map(([hour, rate]) => ({ hour, rate }));
}

export interface SpreadStats {
  /** ساعت‌های دارای داده در بازه */
  hours: number;
  /** میانگین اسپرد سالانه (٪)؛ null بدون داده */
  avgApr: number | null;
  /** سهم ساعت‌هایی که اسپرد به نفع این جهت بوده (۰ تا ۱) */
  profitableShare: number | null;
  /** تعداد تغییر علامت اسپرد (ساعت‌های صفر نادیده) */
  reversals: number;
}

export function spreadStats(series: readonly RatePoint[], windowHours: number, now: number): SpreadStats {
  const from = floorHour(now) - windowHours * HOUR_MS;
  const rows = series.filter((p) => p.hour >= from && p.hour <= now);
  if (!rows.length) return { hours: 0, avgApr: null, profitableShare: null, reversals: 0 };
  let sum = 0;
  let wins = 0;
  let reversals = 0;
  let lastSign = 0;
  for (const p of rows) {
    sum += p.rate;
    if (p.rate > 0) wins++;
    const sign = Math.sign(p.rate);
    if (sign !== 0) {
      if (lastSign !== 0 && sign !== lastSign) reversals++;
      lastSign = sign;
    }
  }
  return { hours: rows.length, avgApr: hourlyToApr(sum / rows.length), profitableShare: wins / rows.length, reversals };
}

/** وسط بهترین خرید و فروش */
export function midPrice(bids: readonly BookLevel[], asks: readonly BookLevel[]): number | null {
  const b = bids[0]?.price;
  const a = asks[0]?.price;
  return b && a && b > 0 && a > 0 ? (a + b) / 2 : null;
}

/**
 * اسلیپیج یک‌طرفهٔ سفارش بازار به ارزش notional (٪ از قیمت وسط)
 * levels = سمتی که سفارش با آن پر می‌شود (خرید → asks، فروش → bids)؛ null اگر عمق کافی نباشد
 */
export function slippagePct(levels: readonly BookLevel[], notionalUsd: number, mid: number | null): number | null {
  if (!mid || !(mid > 0)) return null;
  if (!(notionalUsd > 0)) return 0;
  let remaining = notionalUsd;
  let qty = 0;
  for (const l of levels) {
    if (!(l.price > 0) || !(l.size > 0)) continue;
    const value = l.price * l.size;
    const take = Math.min(value, remaining);
    qty += take / l.price;
    remaining -= take;
    if (remaining <= 1e-9) break;
  }
  if (remaining > 1e-9 || qty <= 0) return null;
  const vwap = notionalUsd / qty;
  return (Math.abs(vwap - mid) / mid) * 100;
}

export type Stability = 'high' | 'medium' | 'low' | 'unknown';

/** برچسب ساده برای کاربر: بیشتر ساعت‌ها سودده و کم‌چرخش = پایدار (چرخش به ازای هر ۲۴ ساعت داده) */
export function stabilityOf(s: SpreadStats): Stability {
  if (s.profitableShare === null || s.hours < 48) return 'unknown';
  const flipsPerDay = (s.reversals / s.hours) * 24;
  if (s.profitableShare >= 0.8 && flipsPerDay <= 1) return 'high';
  if (s.profitableShare >= 0.6 && flipsPerDay <= 4) return 'medium';
  return 'low';
}

export interface RealNetInput {
  /** سرمایه (مارجین) هر طرف — دلار */
  capitalPerSide: number;
  leverage: number;
  holdDays: number;
  /** کل هزینهٔ واریز، برداشت، پل و گس — دلار */
  transferCostUsd: number;
  /** اسپرد ساعتی پیش‌بینی (کسری)، به نفع این جهت = مثبت */
  spreadHourly: number;
  longFeePct: number;
  shortFeePct: number;
  /** اسلیپیج یک‌طرفه (٪)؛ null = عمق ناکافی/نامعلوم → محاسبه نمی‌شود */
  longSlipPct: number | null;
  shortSlipPct: number | null;
  longMmf: number;
  shortMmf: number;
}

export interface RealNetResult {
  /** ارزش اسمی هر طرف = سرمایهٔ هر طرف × اهرم (در معرض بازار، نه پول پرداختی) */
  notional: number;
  /** سرمایهٔ هر دو طرف = مارجین هر دو صرافی = سرمایهٔ مبنا */
  capital: number;
  funding: number;
  fees: number;
  slippage: number | null;
  transfer: number;
  /** کارمزد + اسلیپیج + انتقال؛ null وقتی اسلیپیج معلوم نیست */
  costs: number | null;
  /** null وقتی اسلیپیج معلوم نیست — عدد ناقص نمایش داده نمی‌شود */
  net: number | null;
  /** سرمایه + سود خالص پس از بستن هر دو طرف و برگشت پول */
  finalEquity: number | null;
  returnPct: number | null;
  aprOnCapital: number | null;
  /** روز لازم تا فاندینگ همهٔ هزینه‌ها را جبران کند؛ null = هرگز */
  breakEvenDays: number | null;
  /** حداقل اختلاف فاندینگ سالانه (٪) که هزینه‌های همین مدت را جبران کند؛ null = نامعلوم */
  breakEvenSpreadApr: number | null;
  /** هزینهٔ هر ۰٫۰۱٪ کارمزد یا اسلیپیج اضافه در ۴ معامله (باز و بسته دو طرف) */
  costPerBp: number;
  /** نزدیک‌ترین حرکت قیمت تا لیکویید (٪) */
  liquidationPct: number | null;
}

const pos = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);

export function realDeltaNet(i: RealNetInput): RealNetResult {
  const capitalPerSide = pos(i.capitalPerSide);
  const lev = pos(i.leverage);
  const days = pos(i.holdDays);
  const notional = capitalPerSide * lev;
  const capital = capitalPerSide * 2;
  const spread = Number.isFinite(i.spreadHourly) ? i.spreadHourly : 0;
  const funding = notional * spread * days * 24;
  const fees = notional * 2 * (pos(i.longFeePct) + pos(i.shortFeePct)) / 100;
  const slippage = i.longSlipPct === null || i.shortSlipPct === null ? null : (notional * 2 * (pos(i.longSlipPct) + pos(i.shortSlipPct))) / 100;
  const transfer = pos(i.transferCostUsd);
  // قیمت خنثی فرض می‌شود (ارزش برابر، اختلاف قیمت ثابت) → سود قیمت صفر
  const ledger = slippage === null ? null : deltaLedger({ baseCapital: capital, grossTrading: 0, funding, fees, slippage, otherCosts: transfer });
  const net = ledger?.net ?? null;
  const costs = fees + (slippage ?? 0) + transfer;
  const fundingPerDay = notional * spread * 24;
  const exposureHours = notional * days * 24;
  const liqs = [liquidationMovePct('long', lev, i.longMmf), liquidationMovePct('short', lev, i.shortMmf)].filter((v): v is number => v !== null);
  return {
    notional,
    capital,
    funding,
    fees,
    slippage,
    transfer,
    costs: ledger?.totalCosts ?? null,
    net,
    finalEquity: ledger?.finalEquity ?? null,
    returnPct: net !== null && capital > 0 ? (net / capital) * 100 : null,
    aprOnCapital: net !== null && capital > 0 && days > 0 ? (net / capital) * (365 / days) * 100 : null,
    breakEvenDays: fundingPerDay > 0 ? costs / fundingPerDay : costs === 0 ? 0 : null,
    breakEvenSpreadApr: ledger && exposureHours > 0 ? hourlyToApr(ledger.totalCosts / exposureHours) : null,
    costPerBp: notional * 4 * 0.0001,
    liquidationPct: liqs.length ? Math.min(...liqs) : null
  };
}
