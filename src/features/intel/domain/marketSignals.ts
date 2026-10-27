/**
 * «بازار مشتقات» به زبان تصمیم — به‌جای جدول همهٔ بازارها، فقط جاهایی که چیزی غیرعادی است:
 *   لانگ‌های شلوغ: فاندینگ سالانه ≥ ۲ برابر نرخ پایهٔ هایپرلیکوئید (~۱۱٪) ← لانگ هزینهٔ نگه‌داری بالا می‌دهد
 *                  (آبشار را پیش‌بینی نمی‌کند: در آزمون ۲۰۲۳–۲۰۲۶ فقط ۲ از ۱۷ دورهٔ شلوغ به افت ≥۱۰٪ BTC رسید
 *                  و ۸ از ۱۰ بدترین روز در بازار غیرشلوغ آمد؛ scripts/swing-backtest.ts)،
 *                  شورت پرپ در دلتا نوترال درآمد می‌گیرد
 *   شورت‌های شلوغ: فاندینگ منفی ← شورت پراهرم در معرض جهش (short squeeze)، لانگ پرپ درآمد می‌گیرد
 * فقط بازارهای با OI کافی؛ فاندینگ بازار کم‌عمق نویز است. Pure.
 */

export interface MarketLike {
  coin: string;
  fundingHourly: number;
  openInterestUsd: number;
}

/** نرخ پایهٔ هایپرلیکوئید: ۰٫۰۱٪ هر ۸ ساعت ≈ ۱۱٪ سالانه */
export const BASE_APR = 10.95;
export const CROWDED_LONG_APR = 2 * BASE_APR;
export const MIN_SIGNAL_OI = 5_000_000;
export const MAJORS = ['BTC', 'ETH', 'SOL', 'HYPE'];

export const aprOf = (hourly: number) => hourly * 24 * 365 * 100;

export function fundingExtremes<M extends MarketLike>(markets: M[], limit = 5, minOi = MIN_SIGNAL_OI): { crowdedLong: M[]; crowdedShort: M[] } {
  const liquid = markets.filter((m) => m.openInterestUsd >= minOi);
  return {
    crowdedLong: liquid.filter((m) => aprOf(m.fundingHourly) >= CROWDED_LONG_APR).sort((a, b) => b.fundingHourly - a.fundingHourly).slice(0, limit),
    crowdedShort: liquid.filter((m) => m.fundingHourly < 0).sort((a, b) => a.fundingHourly - b.fundingHourly).slice(0, limit)
  };
}

/** وضعیت فاندینگ برای یک خط توضیح کنار هر بازار اصلی */
export function fundingState(hourly: number): 'crowdedLong' | 'crowdedShort' | 'normal' {
  const apr = aprOf(hourly);
  return apr >= CROWDED_LONG_APR ? 'crowdedLong' : apr < 0 ? 'crowdedShort' : 'normal';
}

/** هزینهٔ فاندینگ روزانه به ٪ حجم پوزیشن برای طرف پرداخت‌کننده */
export const dailyCostPct = (hourly: number) => Math.abs(hourly) * 24 * 100;
