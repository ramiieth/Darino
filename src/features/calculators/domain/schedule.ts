/**
 * ۲ب) برنامهٔ خرید دوره‌ای با پیش‌بینی قیمت (DCA Plan)
 *
 *  - تاریخ‌ها تقویمی‌اند (ماهانه = همان روز ماه بعد، نه ۳۰ روز ثابت)
 *  - قیمت هر خرید: داده تاریخی (گذشته) · پیش‌بینی کاربر (درون‌یابی خطی بین نقاط) ·
 *    قیمت فعلی (بدون پیش‌بینی) · یا قیمت دستی همان ردیف
 *  - مبلغ هر خرید: ثابت، افزایشی (٪ رشد در هر دوره) یا دستی برای هر ردیف
 *  - بازده سالانه با XIRR (پول‌محور) — CAGR روی کل سرمایه برای DCA غلط است
 *    چون همهٔ پول از روز اول سرمایه‌گذاری نشده است.
 */
import { D, Decimal, round12, safeDiv } from './money';
import { calcXirr } from './xirr';

export type ScheduleFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly';

export const SCHEDULE_FREQUENCY_LABELS: Record<ScheduleFrequency, string> = {
  daily: 'روزانه',
  weekly: 'هفتگی',
  biweekly: 'دوهفته‌ای',
  monthly: 'ماهانه',
  quarterly: 'سه‌ماهه',
  semiannual: 'شش‌ماهه',
  yearly: 'سالانه'
};

/** تعداد دوره در سال (برای تبدیل نرخ سالانه به نرخ دوره) */
export const PERIODS_PER_YEAR: Record<ScheduleFrequency, number> = {
  daily: 365,
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  yearly: 1
};

const DAY = 86_400_000;
const MAX_ROWS = 2000;

/** افزودن n ماه با حفظ روز ماه (۳۱ فروردین/ژانویه → آخرین روز ماه کوتاه‌تر) */
function addMonths(ts: number, n: number, anchorDay: number): number {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = d.getMonth() + n;
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(anchorDay, last), d.getHours(), d.getMinutes()).getTime();
}

/** تاریخ‌های خرید بین شروع و پایان (شامل هر دو) — Pure */
export function scheduleDates(start: number, end: number, freq: ScheduleFrequency): number[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const out: number[] = [];
  const anchorDay = new Date(start).getDate();
  const monthStep = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 } as Partial<Record<ScheduleFrequency, number>>;
  const dayStep = { daily: 1, weekly: 7, biweekly: 14 } as Partial<Record<ScheduleFrequency, number>>;
  for (let i = 0; out.length < MAX_ROWS; i++) {
    const t = monthStep[freq] ? addMonths(start, i * (monthStep[freq] as number), anchorDay) : start + i * (dayStep[freq] as number) * DAY;
    if (t > end) break;
    out.push(t);
  }
  return out;
}

export interface PriceAnchor {
  date: number;
  price: number;
}

/**
 * قیمت در زمان t از روی نقاط پیش‌بینی: درون‌یابی خطی بین دو نقطهٔ مجاور،
 * و بیرون از بازه، ثابت ماندن روی نزدیک‌ترین نقطه.
 */
export function priceFromAnchors(anchors: PriceAnchor[], t: number): number | null {
  const pts = anchors.filter((a) => Number.isFinite(a.date) && Number.isFinite(a.price) && a.price > 0).sort((a, b) => a.date - b.date);
  if (pts.length === 0) return null;
  if (t <= pts[0].date) return pts[0].price;
  const last = pts[pts.length - 1];
  if (t >= last.date) return last.price;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (t <= b.date) {
      if (b.date === a.date) return b.price;
      const w = D(t - a.date).div(b.date - a.date);
      return round12(D(a.price).plus(D(b.price).minus(a.price).mul(w)));
    }
  }
  return last.price;
}

/** آخرین قیمت سری تاریخی تا زمان t (یا null اگر t قبل از سری است) */
export function priceFromSeries(series: { t: number; price: number }[] | null | undefined, t: number): number | null {
  if (!series || series.length === 0 || t < series[0].t - 3 * DAY) return null;
  let best: number | null = null;
  for (const p of series) {
    if (p.t <= t) best = p.price;
    else break;
  }
  return best ?? series[0].price;
}

/** مبلغ ردیف i: ثابت یا با رشد مرکب g٪ در هر دوره */
export function scheduledAmount(base: number, growthPctPerPeriod: number, index: number): number {
  if (!growthPctPerPeriod) return base;
  return round12(D(base).mul(D(1).plus(D(growthPctPerPeriod).div(100)).pow(index)));
}

export type PriceSource = 'history' | 'forecast' | 'current' | 'manual';

export interface PlanRowInput {
  date: number;
  amount: number;
  price: number | null;
  priceSource: PriceSource;
  /** ردیف دستی (خرید اضافه خارج از برنامه) */
  extra?: boolean;
}

export interface PlanRow extends PlanRowInput {
  index: number;
  units: number;
  fee: number;
  cumInvested: number;
  cumUnits: number;
  avgCost: number | null;
  /** ارزش سبد با قیمت همان روز */
  valueAtDate: number | null;
}

export interface PlanInput {
  rows: PlanRowInput[];
  /** کارمزد ثابت هر خرید (دلار) */
  feeFixed?: number;
  /** کارمزد درصدی هر خرید (٪ از مبلغ) */
  feePct?: number;
  /** قیمت ارزیابی پایان */
  finalPrice: number | null;
  /** تاریخ ارزیابی پایان (برای XIRR) */
  finalDate: number;
}

export interface PlanResult {
  purchaseCount: number;
  /** کل پول خارج‌شده از جیب (مبلغ + کارمزد) */
  totalInvested: number;
  totalFees: number;
  totalUnits: number;
  /** میانگین قیمت تمام‌شده (با کارمزد) = نقطهٔ سربه‌سر */
  averageCost: number | null;
  finalValue: number | null;
  profit: number | null;
  returnPct: number | null;
  /** بازده سالانهٔ پول‌محور (٪) */
  xirrPct: number | null;
  /** میانگین ساده قیمت‌های خرید — برای نمایش اثر DCA */
  simpleAvgPrice: number | null;
  /** ردیف‌های بدون قیمت (حذف از محاسبه) */
  skipped: number;
  rows: PlanRow[];
}

export function calcPlan(input: PlanInput): PlanResult {
  const feeFixed = D(input.feeFixed ?? 0);
  const feePct = D(input.feePct ?? 0).div(100);
  const sorted = [...input.rows].sort((a, b) => a.date - b.date);

  let invested = new Decimal(0);
  let units = new Decimal(0);
  let fees = new Decimal(0);
  let priceSum = new Decimal(0);
  let skipped = 0;
  const rows: PlanRow[] = [];
  const flows: { date: number; amount: number }[] = [];

  for (const r of sorted) {
    if (r.price === null || !Number.isFinite(r.price) || r.price <= 0 || !Number.isFinite(r.amount) || r.amount <= 0) {
      skipped++;
      continue;
    }
    const amount = D(r.amount);
    const fee = feeFixed.plus(amount.mul(feePct));
    // کارمزد از روی مبلغ برداشته نمی‌شود؛ جداگانه پرداخت می‌شود
    const u = amount.div(D(r.price));
    invested = invested.plus(amount).plus(fee);
    units = units.plus(u);
    fees = fees.plus(fee);
    priceSum = priceSum.plus(r.price);
    const avg = safeDiv(invested, units);
    rows.push({
      ...r,
      index: rows.length + 1,
      units: round12(u),
      fee: round12(fee),
      cumInvested: round12(invested),
      cumUnits: round12(units),
      avgCost: avg === null ? null : round12(avg),
      valueAtDate: round12(units.mul(r.price))
    });
    flows.push({ date: r.date, amount: -Number(amount.plus(fee)) });
  }

  const avg = safeDiv(invested, units);
  const finalValue = input.finalPrice !== null && input.finalPrice > 0 && !units.isZero() ? units.mul(input.finalPrice) : null;
  const profit = finalValue === null ? null : finalValue.minus(invested);
  const ret = profit === null ? null : safeDiv(profit, invested);

  let xirrPct: number | null = null;
  if (finalValue !== null && rows.length > 0) {
    const endDate = Math.max(input.finalDate, rows[rows.length - 1].date);
    // حداقل ~یک هفته فاصله تا نرخ سالانه معنا داشته باشد
    if (endDate - rows[0].date >= 7 * DAY) {
      const x = calcXirr([...flows, { date: endDate, amount: Number(finalValue) }]);
      xirrPct = x.xirr === null ? null : round12(x.xirr * 100);
    }
  }

  return {
    purchaseCount: rows.length,
    totalInvested: round12(invested),
    totalFees: round12(fees),
    totalUnits: round12(units),
    averageCost: avg === null ? null : round12(avg),
    finalValue: finalValue === null ? null : round12(finalValue),
    profit: profit === null ? null : round12(profit),
    returnPct: ret === null ? null : round12(ret.mul(100)),
    xirrPct,
    simpleAvgPrice: rows.length ? round12(priceSum.div(rows.length)) : null,
    skipped,
    rows
  };
}

/* ============================================================
 *  پیش‌بینی رشد با نرخ سالانه + واریز دوره‌ای (برای «رشد سالانه»)
 * ============================================================ */

export interface GrowthProjectionInput {
  initial: number;
  /** واریز هر دوره */
  contribution: number;
  frequency: ScheduleFrequency;
  /** رشد مبلغ واریز در هر سال (٪) */
  contributionGrowthPct: number;
  /** نرخ بازده سالانه مورد انتظار (٪) */
  annualReturnPct: number;
  years: number;
  /** واریز ابتدای دوره (true) یا انتهای دوره */
  atStart?: boolean;
}

export interface GrowthProjectionPoint {
  period: number;
  /** سال (کسری) */
  t: number;
  contributed: number;
  value: number;
}

export interface GrowthProjectionResult {
  finalValue: number;
  totalContributed: number;
  profit: number;
  multiple: number | null;
  points: GrowthProjectionPoint[];
  /** ارزش در پایان هر سال (و پایان مدت اگر سال کامل نباشد) */
  yearly: { year: number; contributed: number; value: number }[];
}

export function projectGrowth(input: GrowthProjectionInput): GrowthProjectionResult {
  const n = PERIODS_PER_YEAR[input.frequency];
  const periods = Math.max(0, Math.min(Math.round(input.years * n), 50 * 365));
  // نرخ معادل دوره از نرخ سالانهٔ مؤثر
  const r = D(1).plus(D(input.annualReturnPct).div(100)).pow(D(1).div(n)).minus(1);
  let value = D(input.initial);
  let contributed = D(input.initial);
  const points: GrowthProjectionPoint[] = [{ period: 0, t: 0, contributed: round12(contributed), value: round12(value) }];
  const yearly: { year: number; contributed: number; value: number }[] = [];
  const every = Math.max(1, Math.ceil(periods / 120));
  for (let p = 1; p <= periods; p++) {
    const yearIdx = Math.floor((p - 1) / n);
    const c = D(input.contribution).mul(D(1).plus(D(input.contributionGrowthPct).div(100)).pow(yearIdx));
    if (input.atStart) value = value.plus(c).mul(D(1).plus(r));
    else value = value.mul(D(1).plus(r)).plus(c);
    contributed = contributed.plus(c);
    if (p % every === 0 || p === periods) points.push({ period: p, t: p / n, contributed: round12(contributed), value: round12(value) });
    if (p % n === 0 || p === periods) yearly.push({ year: Math.ceil(p / n), contributed: round12(contributed), value: round12(value) });
  }
  const profit = value.minus(contributed);
  const multiple = safeDiv(value, contributed);
  return {
    finalValue: round12(value),
    totalContributed: round12(contributed),
    profit: round12(profit),
    multiple: multiple === null ? null : round12(multiple),
    points,
    yearly
  };
}
