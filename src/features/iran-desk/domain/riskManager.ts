/**
 * موتور محاسباتی واقعی Agent 5: مدیر ریسک (Risk Manager)
 *
 * محاسبات دقیق با Decimal.js (بدون عدد ساختگی):
 *   ۱) حجم مجاز معامله = (سرمایه کل × درصد ریسک مجاز) ÷ (قیمت ورود − حد ضرر)
 *   ۲) نسبت ریسک به ریوارد (R:R): کمتر از ۱ به ۲ → رد قطعی معامله
 *   ۳) ریسک صف فروش و نقدشوندگی: حجم موقعیت > ۵٪ میانگین ارزش معاملات روزانه → هشدار صریح
 *   ۴) دامنه نوسان: اگر فاصله حد ضرر بیشتر از دامنه نوسان یک روز باشد → هشدار عدم امکان خروج به‌موقع
 *   ۵) تمرکز پرتفوی: بررسی سهم معامله از کل سبد (سقف ۲۰٪) و تمرکز در همان صنعت/نماد
 *
 * خروجی نهایی صرفاً یکی از دو وضعیت:
 *   ✅ تأیید با حجم پیشنهادی X
 *   ❌ رد معامله با ذکر دلیل
 */
import Decimal from 'decimal.js';
import type { RiskManagerInput, RiskManagerResult } from './types';

export function evaluateTradeRisk(input: RiskManagerInput): RiskManagerResult {
  const rejectionReasons: string[] = [];
  const warnings: string[] = [];

  if (!(input.totalCapitalRial > 0)) {
    rejectionReasons.push('سرمایه کل معتبر وارد نشده است.');
  }
  if (!(input.maxRiskPct > 0 && input.maxRiskPct <= 2)) {
    rejectionReasons.push('حداکثر ریسک مجاز هر معامله طبق سیاست سیستم باید بین ۰.۱٪ تا ۲٪ سرمایه کل باشد.');
  }
  if (!(input.entryPriceRial > 0) || !(input.stopLossRial > 0) || !(input.targetPriceRial > 0)) {
    rejectionReasons.push('قیمت ورود، حد ضرر و هدف قیمتی هر سه باید اعداد مثبت معتبر باشند.');
  }
  if (input.stopLossRial >= input.entryPriceRial) {
    rejectionReasons.push('قیمت حد ضرر باید پایین‌تر از قیمت ورود باشد.');
  }
  if (input.targetPriceRial <= input.entryPriceRial) {
    rejectionReasons.push('هدف قیمتی باید بالاتر از قیمت ورود باشد.');
  }

  if (rejectionReasons.length > 0) {
    return {
      approved: false,
      verdictTitleFa: `❌ رد معامله با ذکر دلیل: ${rejectionReasons[0]}`,
      verdictBadge: 'rejected',
      allowedRiskRial: 0,
      stopDistanceRial: 0,
      stopDistancePct: 0,
      recommendedShares: 0,
      positionValueRial: 0,
      portfolioWeightPct: 0,
      riskRewardRatio: 0,
      avgDailyVolumeSharePct: null,
      liquidityWarningFa: null,
      dailyLimitWarningFa: null,
      concentrationWarningFa: null,
      rejectionReasons,
      warnings,
      formulasFa: []
    };
  }

  const capital = new Decimal(input.totalCapitalRial);
  const riskPct = new Decimal(input.maxRiskPct);
  const entry = new Decimal(input.entryPriceRial);
  const stop = new Decimal(input.stopLossRial);
  const target = new Decimal(input.targetPriceRial);

  // ۱) حجم مجاز معامله
  const allowedRisk = capital.times(riskPct).div(100);
  const stopDistance = entry.minus(stop);
  const stopDistancePct = stopDistance.div(entry).times(100);
  const rawShares = allowedRisk.div(stopDistance).floor();
  const recommendedShares = Math.max(0, rawShares.toNumber());
  const positionValue = new Decimal(recommendedShares).times(entry);
  const portfolioWeightPct = positionValue.div(capital).times(100);

  if (recommendedShares <= 0) {
    rejectionReasons.push('با ریسک مجاز و فاصله حد ضرر فعلی، حتی خرید ۱ سهم/واحد نیز از سقف ریسک فراتر می‌رود.');
  }

  // ۲) نسبت ریسک به ریوارد (سیاست قطعی: کمتر از ۱ به ۲ = رد)
  const rewardDistance = target.minus(entry);
  const rr = rewardDistance.div(stopDistance);
  if (rr.lt(2)) {
    rejectionReasons.push(
      `نسبت ریسک به ریوارد (${rr.toFixed(2)} به ۱) کمتر از حداقل مجاز ۱ به ۲ است؛ طبق سیاست سیستم معامله رد می‌شود.`
    );
  }

  // ۳) ریسک صف فروش و نقدشوندگی (> ۵٪ میانگین ارزش معاملات روزانه)
  let avgDailyVolumeSharePct: number | null = null;
  let liquidityWarningFa: string | null = null;
  if (input.avgDailyTradeValueRial !== null && input.avgDailyTradeValueRial > 0) {
    const share = positionValue.div(input.avgDailyTradeValueRial).times(100).toNumber();
    avgDailyVolumeSharePct = Number(share.toFixed(2));
    if (share > 5) {
      liquidityWarningFa = `هشدار ریسک صف فروش و نقدشوندگی: ارزش موقعیت شما (${avgDailyVolumeSharePct}٪) بیشتر از سقف ۵٪ میانگین ارزش معاملات روزانه نماد است و در زمان صف فروش خروج دشوار خواهد بود.`;
      warnings.push(liquidityWarningFa);
    }
  } else {
    warnings.push('میانگین ارزش معاملات روزانه نماد در دسترس نیست؛ ریسک صف فروش قابل سنجش دقیق نبود.');
  }

  // ۴) دامنه نوسان روزانه
  let dailyLimitWarningFa: string | null = null;
  if (input.dailyPriceLimitPct > 0 && stopDistancePct.gt(input.dailyPriceLimitPct)) {
    dailyLimitWarningFa = `هشدار دامنه نوسان: فاصله حد ضرر (${stopDistancePct.toFixed(2)}٪) بزرگ‌تر از دامنه نوسان یک روز (${input.dailyPriceLimitPct}٪) است؛ در صورت تشکیل صف فروش ممکن است خروج به‌موقع در قیمت حد ضرر امکان‌پذیر نباشد.`;
    warnings.push(dailyLimitWarningFa);
  }

  // ۵) تمرکز پرتفوی (بیش از ۲۰٪ کل سبد یا تمرکز بالای صنعت)
  let concentrationWarningFa: string | null = null;
  const totalWithExisting = portfolioWeightPct.toNumber() + Math.max(0, input.existingPortfolioExposurePct);
  if (portfolioWeightPct.gt(20) || totalWithExisting > 20) {
    concentrationWarningFa = `هشدار تمرکز پرتفوی: وزن این موقعیت (${portfolioWeightPct.toFixed(1)}٪ از کل سبد${
      input.existingPortfolioExposurePct > 0 ? ` و مجموع ${totalWithExisting.toFixed(1)}٪ با موقعیت قبلی` : ''
    }) از سقف ۲۰٪ کل سبد فراتر می‌رود.`;
    warnings.push(concentrationWarningFa);
  }
  if (input.sameSectorExposurePct + portfolioWeightPct.toNumber() > 35) {
    warnings.push(
      `تمرکز صنعت/گروه پس از این معامله به ${(input.sameSectorExposurePct + portfolioWeightPct.toNumber()).toFixed(1)}٪ می‌رسد.`
    );
  }

  if (input.bearStrongerThanBull) {
    warnings.push('تحلیلگر بدبین دلایل مخالفت قوی‌تری نسبت به خوشبین مطرح کرده است؛ پیش از تصمیم، این دلایل را بازبینی کنید.');
  }

  const approved = rejectionReasons.length === 0;
  const verdictTitleFa = approved
    ? `✅ تأیید با حجم پیشنهادی ${recommendedShares.toLocaleString('en-US')} سهم/واحد`
    : `❌ رد معامله با ذکر دلیل: ${rejectionReasons[0]}`;

  return {
    approved,
    verdictTitleFa,
    verdictBadge: approved ? 'approved' : 'rejected',
    allowedRiskRial: Math.round(allowedRisk.toNumber()),
    stopDistanceRial: Math.round(stopDistance.toNumber()),
    stopDistancePct: Number(stopDistancePct.toFixed(2)),
    recommendedShares,
    positionValueRial: Math.round(positionValue.toNumber()),
    portfolioWeightPct: Number(portfolioWeightPct.toFixed(2)),
    riskRewardRatio: Number(rr.toFixed(2)),
    avgDailyVolumeSharePct,
    liquidityWarningFa,
    dailyLimitWarningFa,
    concentrationWarningFa,
    rejectionReasons,
    warnings,
    formulasFa: [
      `ریسک مجاز = ${Math.round(capital.toNumber()).toLocaleString('en-US')} × ${input.maxRiskPct}٪ = ${Math.round(allowedRisk.toNumber()).toLocaleString('en-US')} ریال`,
      `فاصله حد ضرر = ${input.entryPriceRial.toLocaleString('en-US')} − ${input.stopLossRial.toLocaleString('en-US')} = ${Math.round(stopDistance.toNumber()).toLocaleString('en-US')} ریال (${stopDistancePct.toFixed(2)}٪)`,
      `حجم مجاز = ریسک مجاز ÷ فاصله حد ضرر = ${recommendedShares.toLocaleString('en-US')} سهم/واحد`,
      `نسبت ریسک به ریوارد = (${input.targetPriceRial.toLocaleString('en-US')} − ${input.entryPriceRial.toLocaleString('en-US')}) ÷ فاصله حد ضرر = ۱ به ${rr.toFixed(2)}`
    ]
  };
}
