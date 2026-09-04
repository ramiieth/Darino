/**
 * تست‌های موتور محاسبات مالی — فرمول‌ها، Edge Cases و اعتبارسنجی
 */
import { describe, expect, it } from 'vitest';
import {
  calcPnl,
  cumulativeProfitSeries,
  calcDca,
  purchaseDates,
  FREQUENCY_DAYS,
  dcaValueSeries,
  calcCagr,
  calcCagrFull,
  calcXirr,
  calcCompare,
  validateNum,
  round12
} from '@/features/calculators/domain';

describe('۱) سود و زیان (P&L) — فرمول‌های رسمی', () => {
  it('محاسبه کامل: Value = Price×Qty، TotalCost = Buy×Qty−Fee، Profit = Net−Cost', () => {
    const r = calcPnl({ quantity: 2, buyPrice: 100, currentPrice: 150, buyFee: 5, sellFee: 10 });
    expect(r.currentValue).toBe(300); // 150×2
    expect(r.initialInvestment).toBe(200); // 100×2
    expect(r.totalCost).toBe(195); // 200−5
    expect(r.netValue).toBe(290); // 300−10
    expect(r.profit).toBe(95); // 290−195
    expect(r.returnPct).toBeCloseTo(48.7179487179, 6); // 95/195×100
  });

  it('قیمت فعلی null → همه خروجی‌های وابسته null (N/A بدون کرش)', () => {
    const r = calcPnl({ quantity: 1, buyPrice: 50, currentPrice: null, buyFee: 0, sellFee: 0 });
    expect(r.currentValue).toBeNull();
    expect(r.profit).toBeNull();
    expect(r.returnPct).toBeNull();
    expect(r.initialInvestment).toBe(50);
  });

  it('تقسیم بر صفر: TotalCost=0 → returnPct null', () => {
    const r = calcPnl({ quantity: 0, buyPrice: 0, currentPrice: 100, buyFee: 0, sellFee: 0 });
    expect(r.returnPct).toBeNull();
  });

  it('دقت بالا: نتیجه با ۱۲ رقم اعشار گرد می‌شود', () => {
    const r = calcPnl({ quantity: 3, buyPrice: 33.33, currentPrice: 44.44, buyFee: 0.99, sellFee: 1.5 });
    expect(Number.isFinite(r.profit)).toBe(true);
    expect(String(r.profit)).toMatch(/^\d+\.\d{1,12}$/);
  });

  it('سری سود تجمعی: (price_i − buy)×qty − fee', () => {
    const s = cumulativeProfitSeries(100, 2, 5, [
      { t: 1, price: 100 },
      { t: 2, price: 120 }
    ]);
    expect(s[0].value).toBe(-5);
    expect(s[1].value).toBe(35);
  });
});

describe('۲) DCA — سرمایه‌گذاری دوره‌ای', () => {
  const day = 86_400_000;
  const start = new Date(2024, 0, 1).getTime();
  const end = start + 3 * 30 * day;

  it('تعداد خریدها بر اساس فرکانس درست است', () => {
    expect(purchaseDates(start, end, FREQUENCY_DAYS.monthly)).toHaveLength(4);
    expect(purchaseDates(start, end, FREQUENCY_DAYS.daily).length).toBeGreaterThan(80);
  });

  it('محاسبه: Units=Σ(amount/price)، AvgCost=Total/Units، Value=Cur×Units', () => {
    const r = calcDca({
      amount: 1000,
      startDate: start,
      endDate: end,
      frequencyDays: FREQUENCY_DAYS.monthly,
      purchasePrices: [100, 100, 100, 100],
      currentPrice: 120
    });
    expect(r.purchaseCount).toBe(4);
    expect(r.totalInvested).toBe(4000);
    expect(r.totalUnits).toBeCloseTo(40, 6);
    expect(r.averageCost).toBeCloseTo(100, 6);
    expect(r.currentValue).toBeCloseTo(4800, 6);
    expect(r.profit).toBeCloseTo(800, 6);
    expect(r.returnPct).toBeCloseTo(20, 6);
  });

  it('میانگین قیمت با قیمت‌های متفاوت', () => {
    const r = calcDca({
      amount: 1000,
      startDate: start,
      endDate: end,
      frequencyDays: FREQUENCY_DAYS.monthly,
      purchasePrices: [100, 200, 50, 100],
      currentPrice: 100
    });
    // units = 10 + 5 + 20 + 10 = 45 ; invested = 4000 ; avg = 88.888…
    expect(r.totalUnits).toBeCloseTo(45, 6);
    expect(r.averageCost).toBeCloseTo(4000 / 45, 6);
  });

  it('بدون قیمت فعلی → ارزش/سود null', () => {
    const r = calcDca({
      amount: 100,
      startDate: start,
      endDate: end,
      frequencyDays: FREQUENCY_DAYS.weekly,
      purchasePrices: [10],
      currentPrice: null
    });
    expect(r.currentValue).toBeNull();
    expect(r.profit).toBeNull();
    expect(r.totalInvested).toBeGreaterThan(0);
  });

  it('سری ارزش DCA رشد می‌کند و avgCost بین قیمت‌هاست', () => {
    const series = [
      { t: start, price: 100 },
      { t: start + day * 30, price: 110 },
      { t: start + day * 60, price: 120 },
      { t: end, price: 130 }
    ];
    const out = dcaValueSeries(
      { amount: 1000, startDate: start, endDate: end, frequencyDays: FREQUENCY_DAYS.monthly, purchasePrices: [100, 110, 120, 130], currentPrice: 130 },
      series
    );
    expect(out.length).toBe(4);
    expect(out[out.length - 1].value).toBeGreaterThan(out[0].value);
  });
});

describe('۳) CAGR — فرمول رسمی', () => {
  it('CAGR = (Final/Initial)^(1/Years) − 1', () => {
    // 100 → 200 در ۲ سال = 41.42%
    const c = calcCagr({ initialValue: 100, finalValue: 200, startDate: 0, endDate: 2 * 365.25 * 86_400_000 });
    expect(c).toBeCloseTo(0.41421356, 5);
  });

  it('سال صفر → null (جلوگیری از تقسیم بر صفر)', () => {
    expect(calcCagr({ initialValue: 100, finalValue: 200, startDate: 0, endDate: 0 })).toBeNull();
  });

  it('سرمایه اولیه صفر → null', () => {
    expect(calcCagr({ initialValue: 0, finalValue: 200, startDate: 0, endDate: 86_400_000 * 365 })).toBeNull();
  });

  it('CagrFull: سود کل و رشد کل', () => {
    const r = calcCagrFull({ initialValue: 100, finalValue: 150, startDate: 0, endDate: 365.25 * 86_400_000 });
    expect(r.totalProfit).toBe(50);
    expect(r.totalGrowthPct).toBeCloseTo(50, 6);
    expect(r.years).toBeCloseTo(1, 6);
    expect(r.cagr).toBeCloseTo(0.5, 6);
  });
});

describe('۴) XIRR — Newton-Raphson + Bisection', () => {
  const day = 86_400_000;
  const t0 = new Date(2024, 0, 1).getTime();

  it('جریان ساده سالانه: ۱۰۰− واریز، ۱۱۰ برداشت بعد از ۱ سال → XIRR ≈ 10%', () => {
    const r = calcXirr([
      { date: t0, amount: -100 },
      { date: t0 + 365 * day, amount: 110 }
    ]);
    expect(r.xirr).not.toBeNull();
    expect(r.xirr!).toBeCloseTo(0.1, 4);
    expect(r.totalProfit).toBeCloseTo(10, 6);
  });

  it('جریان چندواریزه → همگرایی با Newton', () => {
    const r = calcXirr([
      { date: t0, amount: -1000 },
      { date: t0 + 180 * day, amount: -500 },
      { date: t0 + 365 * day, amount: 200 },
      { date: t0 + 730 * day, amount: 1900 }
    ]);
    expect(r.xirr).not.toBeNull();
    expect(r.xirr!).toBeGreaterThan(-1);
  });

  it('عدم همگرایی (فقط جریان مثبت) → null', () => {
    const r = calcXirr([
      { date: t0, amount: 100 },
      { date: t0 + day, amount: 200 }
    ]);
    expect(r.xirr).toBeNull();
  });

  it('کمتر از ۲ جریان → null بدون کرش', () => {
    expect(calcXirr([{ date: t0, amount: -100 }]).xirr).toBeNull();
    expect(calcXirr([]).xirr).toBeNull();
  });
});

describe('۵) مقایسه بازارها', () => {
  it('Return = (Cur−Hist)/Hist×100؛ Profit = Inv×Return؛ Value = Inv+Profit', () => {
    const r = calcCompare(
      { symbol: 'BTC', nameFa: 'بیت‌کوین', investment: 1000, historicalPrice: 100, currentPrice: 150 },
      1
    );
    expect(r.returnPct).toBe(50);
    expect(r.profit).toBe(500);
    expect(r.currentValue).toBe(1500);
    expect(r.cagr).toBeCloseTo(0.5, 4);
  });

  it('قیمت تاریخی صفر → خروجی null (بدون تقسیم بر صفر)', () => {
    const r = calcCompare(
      { symbol: 'X', nameFa: 'X', investment: 100, historicalPrice: 0, currentPrice: 5 },
      1
    );
    expect(r.returnPct).toBeNull();
    expect(r.currentValue).toBeNull();
  });

  it('قیمت تاریخی null (داده موجود نیست) → null با پیام در UI', () => {
    const r = calcCompare(
      { symbol: 'T', nameFa: 'T', investment: 100, historicalPrice: null, currentPrice: 5 },
      1
    );
    expect(r.returnPct).toBeNull();
    expect(r.profit).toBeNull();
  });
});

describe('اعتبارسنجی ورودی (Validation)', () => {
  it('اعداد نامعتبر رد می‌شوند', () => {
    expect(validateNum('abc')).not.toBeNull();
    expect(validateNum(NaN)).not.toBeNull();
    expect(validateNum(undefined)).not.toBeNull();
  });
  it('صفر و منفی با گزینه‌ها', () => {
    expect(validateNum(0, { positive: true })).not.toBeNull();
    expect(validateNum(-5, { min: 0 })).not.toBeNull();
    expect(validateNum(5, { positive: true })).toBeNull();
  });
  it('دقت: round12 محدود به ۱۲ رقم اعشار', () => {
    expect(String(round12(0.1234567890123456789))).toHaveLength('0.123456789012'.length);
  });
});
