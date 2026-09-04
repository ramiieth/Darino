/**
 * ۲) ماشین‌حساب سرمایه‌گذاری دوره‌ای (DCA):
 *   Total Invested = Σ contributions
 *   Total Units    = Σ (Contribution ÷ Price)
 *   Average Cost   = Total Invested ÷ Total Units
 *   Current Value  = Current Price × Total Units
 *   Profit         = Current Value − Total Invested
 *   Return %       = (Profit ÷ Total Invested) × 100
 *   CAGR           = (Final ÷ Initial)^(1/Years) − 1
 */
import { D, Decimal, round12, safeDiv } from './money';
import { calcCagr } from './cagr';

export interface DcaPurchase {
  index: number;
  /** تاریخ خرید (ms) */
  date: number;
  /** مبلغ پرداختی */
  amount: number;
  /** قیمت در روز خرید */
  price: number;
  /** واحد خریداری‌شده = amount / price */
  units: number;
}

export interface DcaInput {
  /** مبلغ ثابت هر دوره */
  amount: number;
  /** تاریخ شروع (ms) */
  startDate: number;
  /** تاریخ پایان (ms) */
  endDate: number;
  /** فاصله بین خریدها (روز) */
  frequencyDays: number;
  /** قیمت‌های خرید — یک قیمت برای هر خرید (از داده تاریخی) */
  purchasePrices: number[];
  /** قیمت فعلی */
  currentPrice: number | null;
  /** کارمزد هر خرید (اختیاری) */
  feePerPurchase?: number;
}

export interface DcaResult {
  /** تعداد کل خریدها */
  purchaseCount: number;
  /** کل سرمایه پرداخت‌شده */
  totalInvested: number;
  /** کل واحد خریداری‌شده */
  totalUnits: number;
  /** میانگین قیمت خرید = Total Invested ÷ Total Units */
  averageCost: number | null;
  /** ارزش فعلی = Current Price × Total Units */
  currentValue: number | null;
  /** سود = Current Value − Total Invested */
  profit: number | null;
  /** درصد بازده */
  returnPct: number | null;
  /** بازده سالانه مرکب */
  cagr: number | null;
  /** جدول خریدها */
  purchases: DcaPurchase[];
}

export type DcaFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly';

export const FREQUENCY_DAYS: Record<DcaFrequency, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  quarterly: 91
};

/** تولید تاریخ‌های خرید بین شروع و پایان (Pure) */
export function purchaseDates(startDate: number, endDate: number, frequencyDays: number): number[] {
  const dates: number[] = [];
  if (endDate <= startDate) return dates;
  let t = startDate;
  while (t <= endDate) {
    dates.push(t);
    t += frequencyDays * 86_400_000;
  }
  return dates;
}

/**
 * محاسبه DCA با قیمت‌های خرید (یک به یک).
 * اگر تعداد قیمت‌ها کمتر از خریدها باشد، از آخرین قیمت موجود استفاده می‌شود.
 */
export function calcDca(input: DcaInput): DcaResult {
  const dates = purchaseDates(input.startDate, input.endDate, input.frequencyDays);
  const amount = D(input.amount);
  const fee = D(input.feePerPurchase ?? 0);

  let totalInvested = new Decimal(0);
  let totalUnits = new Decimal(0);
  const purchases: DcaPurchase[] = [];

  dates.forEach((date, i) => {
    const price = input.purchasePrices[Math.min(i, input.purchasePrices.length - 1)];
    if (price === undefined || !Number.isFinite(price) || price <= 0) return;
    const units = amount.div(D(price));
    const invested = amount.plus(fee);
    totalInvested = totalInvested.plus(invested);
    totalUnits = totalUnits.plus(units);
    purchases.push({
      index: i + 1,
      date,
      amount: round12(invested),
      price,
      units: round12(units)
    });
  });

  const averageCost = safeDiv(totalInvested, totalUnits);
  const currentValue =
    input.currentPrice !== null && input.currentPrice !== undefined && !totalUnits.isZero()
      ? D(input.currentPrice).mul(totalUnits)
      : null;

  const profit = currentValue !== null ? currentValue.minus(totalInvested) : null;
  const returnPct = profit !== null ? safeDiv(profit, totalInvested) : null;
  const cagr =
    currentValue !== null && totalInvested.gt(0)
      ? calcCagr({
          initialValue: Number(totalInvested),
          finalValue: Number(currentValue),
          startDate: input.startDate,
          endDate: input.endDate
        })
      : null;

  return {
    purchaseCount: purchases.length,
    totalInvested: round12(totalInvested),
    totalUnits: round12(totalUnits),
    averageCost: averageCost === null ? null : round12(averageCost),
    currentValue: currentValue === null ? null : round12(currentValue),
    profit: profit === null ? null : round12(profit),
    returnPct: returnPct === null ? null : round12(returnPct.mul(100)),
    cagr: cagr === null ? null : round12(cagr * 100),
    purchases
  };
}

/** منحنی ارزش پرتفوی DCA روی سری قیمت (برای نمودار) */
export function dcaValueSeries(
  input: DcaInput,
  series: { t: number; price: number }[]
): { t: number; units: number; invested: number; value: number; avgCost: number }[] {
  const dates = purchaseDates(input.startDate, input.endDate, input.frequencyDays);
  const amount = D(input.amount);
  const fee = D(input.feePerPurchase ?? 0);
  const out: { t: number; units: number; invested: number; value: number; avgCost: number }[] = [];

  let units = new Decimal(0);
  let invested = new Decimal(0);
  let di = 0;
  const priceAt = (t: number): Decimal => {
    // نزدیک‌ترین نقطه سری قبل از t
    let best = series[0];
    for (const p of series) {
      if (p.t <= t) best = p;
      else break;
    }
    return best ? D(best.price) : D(0);
  };

  for (const p of series) {
    // اعمال خریدهای رسیده تا این تاریخ
    while (di < dates.length && dates[di] <= p.t) {
      const price = priceAt(dates[di]);
      if (!price.isZero()) {
        units = units.plus(amount.div(price));
        invested = invested.plus(amount).plus(fee);
      }
      di++;
    }
    const priceNow = D(p.price);
    const value = units.mul(priceNow);
    const avg = safeDiv(invested, units);
    out.push({
      t: p.t,
      units: round12(units),
      invested: round12(invested),
      value: round12(value),
      avgCost: avg === null ? 0 : round12(avg)
    });
  }
  return out;
}
