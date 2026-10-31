import { describe, expect, it } from 'vitest';
import { calcShopBreakEven, presetTargetRate, type ShopBreakEvenInput } from '@/features/calculators/domain';

const BASE: ShopBreakEvenInput = {
  initialInventoryTomans: 3_000_000_000,
  buyExchangeRate: 108_800,
  depositTomans: 2_000_000_000,
  monthlyRentTomans: 200_000_000,
  monthlyOpexTomans: 25_000_000,
  targetExchangeRate: 228_480, // +۱۱۰٪
  grossMarginPercent: 30,
  creditRatioPercent: 30,
  annualCreditCostPercent: 42,
  actualMonthlySales: 800_000_000
};

describe('نقطهٔ سربه‌سر دلاری مغازه', () => {
  it('پیش‌فرض‌ها با رشد ۱۱۰٪', () => {
    const r = calcShopBreakEven(BASE)!;
    expect(r.fxGrowthPercent).toBeCloseTo(110, 9);
    expect(r.replacementCostTomans).toBeCloseTo(6_300_000_000, 3);
    expect(r.nominalInventoryGap).toBeCloseTo(3_300_000_000, 3);
    expect(r.depositLossTomans).toBeCloseTo(2_200_000_000, 3);
    expect(r.creditDebtTomans).toBe(900_000_000);
    expect(r.netCreditShieldRate).toBeCloseTo(0.68, 12);
    expect(r.creditShieldTomans).toBeCloseTo(612_000_000, 3);
    expect(r.uncoveredDepositLossTomans).toBeCloseTo(1_588_000_000, 3);
    expect(r.annualFixedCosts).toBe(2_700_000_000);
    expect(r.requiredMonthlyGrossProfit).toBeCloseTo(4_288_000_000 / 12, 3);
    expect(r.requiredMonthlyNetProfit).toBeCloseTo(1_588_000_000 / 12, 3);
    expect(r.breakEvenMonthlySales).toBeCloseTo(4_288_000_000 / 12 / 0.3, 3);
    expect(r.breakEvenDailySales).toBeCloseTo(4_288_000_000 / 12 / 0.3 / 30, 3);
    expect(r.requiredAnnualTurnover).toBeCloseTo((4_288_000_000 / 0.3) / 6_300_000_000, 9);
  });

  it('تست بحران: کسری هست ولی اجاره پوشش داده می‌شود؛ چک در خطر', () => {
    const s = calcShopBreakEven(BASE)!.stress;
    expect(s.actualMonthlyGrossProfit).toBe(240_000_000);
    expect(s.meetsBreakEven).toBe(false);
    expect(s.monthlyShortfallTomans).toBeCloseTo(4_288_000_000 / 12 - 240_000_000, 3);
    expect(s.monthlyDepositBurnTomans).toBe(0);
    expect(s.monthsUntilDepositGone).toBeNull();
    expect(s.chequeRisk).toBe(true);
  });

  it('فروش زیر اجاره → پول پیش خورده می‌شود', () => {
    const s = calcShopBreakEven({ ...BASE, actualMonthlySales: 500_000_000 })!.stress;
    expect(s.monthlyDepositBurnTomans).toBe(75_000_000);
    expect(s.monthsUntilDepositGone).toBeCloseTo(2_000_000_000 / 75_000_000, 9);
  });

  it('بهرهٔ چک بیشتر از رشد دلار → سپر صفر؛ خرید نقدی → بدون ریسک چک', () => {
    const r = calcShopBreakEven({ ...BASE, targetExchangeRate: 130_000 })!;
    expect(r.creditShieldTomans).toBe(0);
    const cash = calcShopBreakEven({ ...BASE, creditRatioPercent: 0 })!;
    expect(cash.stress.chequeRisk).toBe(false);
  });

  it('ورودی نامعتبر', () => {
    expect(calcShopBreakEven({ ...BASE, buyExchangeRate: 0 })).toBeNull();
    const r = calcShopBreakEven({ ...BASE, grossMarginPercent: 0 })!;
    expect(r.breakEvenMonthlySales).toBeNull();
    expect(r.requiredAnnualTurnover).toBeNull();
  });

  it('دکمه‌های سناریو', () => {
    expect(presetTargetRate(108_800, 90)).toBe(206_720);
    expect(presetTargetRate(108_800, 140)).toBe(261_120);
  });
});
