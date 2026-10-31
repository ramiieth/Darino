/**
 * نقطهٔ سربه‌سر دلاری و تورمی کسب‌وکار (مغازه)
 *
 *   fxGrowth          = (نرخ هدف − نرخ خرید) ÷ نرخ خرید
 *   ارزش جایگزینی     = (جنس ÷ نرخ خرید) × نرخ هدف       ← سود نیست؛ فقط پر ماندن قفسه
 *   زیان پول پیش      = (پیش ÷ نرخ خرید − پیش ÷ نرخ هدف) × نرخ هدف
 *   سپر چکی           = بدهی چکی × max(0, fxGrowth − بهرهٔ سالانهٔ بنکدار)
 *   سود ناخالص لازم   = اجاره و هزینهٔ سالانه + max(0, زیان پیش − سپر چکی)
 *   فروش سربه‌سر ماه  = سود ناخالص ماهانهٔ لازم ÷ حاشیهٔ سود
 *
 * همه با decimal.js؛ نرخ خرید صفر → null.
 */
import { D, round12, safeDiv, type Decimal } from './money';

export interface ShopBreakEvenInput {
  /** سرمایهٔ اولیهٔ جنس (تومان) */
  initialInventoryTomans: number;
  /** نرخ دلار روز خرید جنس (تومان) */
  buyExchangeRate: number;
  /** رهن / پول پیش (تومان) */
  depositTomans: number;
  monthlyRentTomans: number;
  /** قبوض، شاگرد، مالیات… (تومان) */
  monthlyOpexTomans: number;
  /** نرخ دلار سال بعد / هدف (تومان) */
  targetExchangeRate: number;
  /** حاشیهٔ سود ناخالص فروش (٪) */
  grossMarginPercent: number;
  /** سهم چکی خرید از بنکدار (٪) */
  creditRatioPercent: number;
  /** تفاوت نقد و چک در سال (٪) */
  annualCreditCostPercent: number;
  /** فروش واقعی ماهانه (تومان) — برای تست بحران */
  actualMonthlySales: number;
}

export interface ShopStressResult {
  actualMonthlyGrossProfit: number;
  /** سود ناخالص واقعی به خط قرمز می‌رسد؟ */
  meetsBreakEven: boolean;
  /** کسری ماهانه تا خط قرمز (تومان، ≥ ۰) */
  monthlyShortfallTomans: number;
  /** همان کسری به دلارِ نرخ هدف */
  monthlyShortfallUSD: number;
  /** سود ناخالص حتی اجاره و هزینه‌ها را نمی‌دهد → این مبلغ هر ماه از اصل پول پیش خورده می‌شود */
  monthlyDepositBurnTomans: number;
  /** چند ماه تا تمام شدن پول پیش با این سرعت (null = خورده نمی‌شود) */
  monthsUntilDepositGone: number | null;
  /** چک در گردش + فروش زیر خط قرمز → خطر برگشت چک */
  chequeRisk: boolean;
}

export interface ShopBreakEvenResult {
  fxGrowthRate: number;
  fxGrowthPercent: number;

  inventoryUSD: number;
  depositUSD: number;
  totalInitialUSD: number;

  replacementCostTomans: number;
  nominalInventoryGap: number;

  depositEndUSD: number;
  depositLossUSD: number;
  depositLossTomans: number;

  creditDebtTomans: number;
  netCreditShieldRate: number;
  creditShieldTomans: number;

  monthlyFixedCosts: number;
  annualFixedCosts: number;
  uncoveredDepositLossTomans: number;
  requiredAnnualGrossProfit: number;
  requiredMonthlyGrossProfit: number;
  requiredMonthlyNetProfit: number;

  /** null وقتی حاشیهٔ سود ≤ ۰ */
  breakEvenMonthlySales: number | null;
  breakEvenDailySales: number | null;
  /** دفعات گردش کالا در سال؛ null وقتی فروش سربه‌سر یا ارزش جایگزینی تعریف نشده */
  requiredAnnualTurnover: number | null;

  stress: ShopStressResult;
}

const max0 = (v: Decimal) => (v.isNegative() ? D(0) : v);

export function calcShopBreakEven(input: ShopBreakEvenInput): ShopBreakEvenResult | null {
  const buy = D(input.buyExchangeRate);
  const target = D(input.targetExchangeRate);
  if (buy.lte(0) || target.lte(0)) return null;

  const inventory = D(input.initialInventoryTomans);
  const deposit = D(input.depositTomans);
  const margin = D(input.grossMarginPercent).div(100);

  // ۱) رشد دلار
  const fxGrowth = target.minus(buy).div(buy);

  // ۲) ارزش دلاری روز اول
  const inventoryUSD = inventory.div(buy);
  const depositUSD = deposit.div(buy);

  // ۳) ارزش جایگزینی جنس
  const replacementCost = inventoryUSD.times(target);
  const nominalGap = replacementCost.minus(inventory);

  // ۴) زیان خواب پول پیش
  const depositEndUSD = deposit.div(target);
  const depositLossUSD = depositUSD.minus(depositEndUSD);
  const depositLossTomans = depositLossUSD.times(target);

  // ۵) سپر تورمی خرید چکی
  const creditDebt = inventory.times(D(input.creditRatioPercent).div(100));
  const shieldRate = max0(fxGrowth.minus(D(input.annualCreditCostPercent).div(100)));
  const creditShield = creditDebt.times(shieldRate);

  // ۶) سود لازم برای سربه‌سر با دلار
  const monthlyFixed = D(input.monthlyRentTomans).plus(input.monthlyOpexTomans);
  const annualFixed = monthlyFixed.times(12);
  const uncovered = max0(depositLossTomans.minus(creditShield));
  const reqAnnualGross = annualFixed.plus(uncovered);
  const reqMonthlyGross = reqAnnualGross.div(12);
  const reqMonthlyNet = uncovered.div(12);

  // ۷) فروش سربه‌سر
  const beMonthly = margin.gt(0) ? reqMonthlyGross.div(margin) : null;
  const beDaily = beMonthly ? beMonthly.div(30) : null;
  const turnover = beMonthly ? safeDiv(beMonthly.times(12), replacementCost) : null;

  // تست بحران
  const actualGross = D(input.actualMonthlySales).times(max0(margin));
  const shortfall = max0(reqMonthlyGross.minus(actualGross));
  const burn = max0(monthlyFixed.minus(actualGross));
  const meets = shortfall.isZero();

  return {
    fxGrowthRate: round12(fxGrowth),
    fxGrowthPercent: round12(fxGrowth.times(100)),
    inventoryUSD: round12(inventoryUSD),
    depositUSD: round12(depositUSD),
    totalInitialUSD: round12(inventoryUSD.plus(depositUSD)),
    replacementCostTomans: round12(replacementCost),
    nominalInventoryGap: round12(nominalGap),
    depositEndUSD: round12(depositEndUSD),
    depositLossUSD: round12(depositLossUSD),
    depositLossTomans: round12(depositLossTomans),
    creditDebtTomans: round12(creditDebt),
    netCreditShieldRate: round12(shieldRate),
    creditShieldTomans: round12(creditShield),
    monthlyFixedCosts: round12(monthlyFixed),
    annualFixedCosts: round12(annualFixed),
    uncoveredDepositLossTomans: round12(uncovered),
    requiredAnnualGrossProfit: round12(reqAnnualGross),
    requiredMonthlyGrossProfit: round12(reqMonthlyGross),
    requiredMonthlyNetProfit: round12(reqMonthlyNet),
    breakEvenMonthlySales: beMonthly ? round12(beMonthly) : null,
    breakEvenDailySales: beDaily ? round12(beDaily) : null,
    requiredAnnualTurnover: turnover ? round12(turnover) : null,
    stress: {
      actualMonthlyGrossProfit: round12(actualGross),
      meetsBreakEven: meets,
      monthlyShortfallTomans: round12(shortfall),
      monthlyShortfallUSD: round12(shortfall.div(target)),
      monthlyDepositBurnTomans: round12(burn),
      monthsUntilDepositGone: burn.gt(0) && deposit.gt(0) ? round12(deposit.div(burn)) : null,
      chequeRisk: !meets && creditDebt.gt(0)
    }
  };
}

/** سناریوهای تورمی سریع: نرخ هدف = نرخ خرید × (۱ + رشد) */
export const SHOP_FX_PRESETS = [90, 110, 140] as const;

export function presetTargetRate(buyExchangeRate: number, growthPercent: number): number {
  return round12(D(buyExchangeRate).times(D(growthPercent).div(100).plus(1)));
}
