/**
 * تست‌های دلتا نوترال — فاندینگ، کارمزد، سربه‌سر، لیکویید و اسکنر اختلاف فاندینگ
 */
import { describe, expect, it } from 'vitest';
import { calcDeltaNeutral, fundingSpreads, liquidationMovePct, type DeltaInput } from '@/features/calculators/domain';

// Long روی Ondo (فاندینگ پایه ۵٫۵٪ سالانه) · Short روی Arcus (حدود ۸۷٪ سالانه)
const BASE: DeltaInput = {
  notional: 10_000,
  leverage: 3,
  holdHours: 24,
  cycles: 1,
  long: { feePct: 0.01, fundingHourly: 0.0000063, maintenanceMarginFraction: 0.05, markPrice: 142.2 },
  short: { feePct: 0, fundingHourly: 0.0000998, maintenanceMarginFraction: 0.03, markPrice: 142.5 }
};

describe('دلتا نوترال — آربیتراژ فاندینگ', () => {
  const r = calcDeltaNeutral(BASE);

  it('فاندینگ: شورت دریافت می‌کند، لانگ می‌پردازد', () => {
    expect(r.short.funding).toBeCloseTo(23.952, 9);
    expect(r.long.funding).toBeCloseTo(-1.512, 9);
    expect(r.funding).toBeCloseTo(22.44, 9);
  });

  it('کارمزد باز و بسته‌کردن هر دو طرف', () => {
    expect(r.long.fees).toBeCloseTo(2, 9);
    expect(r.short.fees).toBe(0);
    expect(r.fees).toBeCloseTo(2, 9);
    expect(r.net).toBeCloseTo(20.44, 9);
    expect(r.breakEvenPoints).toBe(0);
  });

  it('سرمایه، حجم و هزینهٔ هر میلیون دلار حجم', () => {
    expect(r.capital).toBeCloseTo(6666.666666666667, 6);
    expect(r.volume).toBe(40_000);
    expect(r.costPerMillion).toBeCloseTo(50, 9);
  });

  it('اختلاف فاندینگ سالانه و ساعت سربه‌سر', () => {
    expect(r.spreadApr).toBeCloseTo(81.906, 6);
    expect(r.breakEvenHours).toBeCloseTo(2 / 0.935, 9);
    expect(r.aprOnCapital).toBeCloseTo((20.44 / 6666.666666666667) * 365 * 100, 6);
  });

  it('basis: شورت گران‌تر فروخته شده', () => {
    expect(r.basisPct).toBeCloseTo((142.5 / 142.2 - 1) * 100, 9);
  });

  it('فاصلهٔ لیکویید هر طرف (مارجین ایزوله)', () => {
    expect(r.long.liquidationMovePct).toBeCloseTo((1 - (1 - 1 / 3) / 0.95) * 100, 9);
    expect(r.short.liquidationMovePct).toBeCloseTo(((1 + 1 / 3) / 1.03 - 1) * 100, 9);
    expect(r.nearestLiquidationPct).toBe(Math.min(r.long.liquidationMovePct!, r.short.liquidationMovePct!));
  });
});

describe('دلتا نوترال — فارم حجم و حالت‌های مرزی', () => {
  it('فاندینگ برابر: فقط کارمزد می‌ماند و حداقل ارزش پوینت = زیان', () => {
    const r = calcDeltaNeutral({
      ...BASE,
      holdHours: 0.25,
      cycles: 10,
      long: { ...BASE.long, feePct: 0.025, fundingHourly: 0.0000125 },
      short: { ...BASE.short, feePct: 0.0225, fundingHourly: 0.0000125 }
    });
    expect(r.funding).toBeCloseTo(0, 9);
    expect(r.fees).toBeCloseTo(10_000 * 2 * (0.025 + 0.0225) / 100 * 10, 9);
    expect(r.net).toBeCloseTo(-r.fees, 9);
    expect(r.breakEvenPoints).toBeCloseTo(r.fees, 9);
    expect(r.breakEvenHours).toBeNull();
    expect(r.volume).toBe(400_000);
    // ۹۵ دلار کارمزد روی ۴۰۰ هزار دلار حجم مجموع دو صرافی
    expect(r.costPerMillion).toBeCloseTo(237.5, 9);
  });

  it('جهت اشتباه: اختلاف منفی و سربه‌سر ناممکن', () => {
    const r = calcDeltaNeutral({ ...BASE, long: BASE.short, short: BASE.long });
    expect(r.spreadApr).toBeLessThan(0);
    expect(r.funding).toBeLessThan(0);
    expect(r.breakEvenHours).toBeNull();
  });

  it('ورودی صفر یا نامعتبر: بدون تقسیم بر صفر', () => {
    const r = calcDeltaNeutral({ ...BASE, notional: 0, leverage: 0, holdHours: Number.NaN, cycles: -2 });
    expect(r.capital).toBe(0);
    expect(r.returnPct).toBe(0);
    expect(r.aprOnCapital).toBeNull();
    expect(r.costPerMillion).toBe(0);
    expect(r.long.liquidationMovePct).toBeNull();
    expect(r.basisPct).not.toBeNull();
  });

  it('بدون قیمت مارک، basis گزارش نمی‌شود', () => {
    expect(calcDeltaNeutral({ ...BASE, long: { ...BASE.long, markPrice: null } }).basisPct).toBeNull();
  });

  it('اهرم ۱ برای لانگ عملاً لیکویید نمی‌شود', () => {
    expect(liquidationMovePct('long', 1, 0.05)).toBeNull();
    expect(liquidationMovePct('short', 1, 0.05)).toBeCloseTo((2 / 1.05 - 1) * 100, 9);
  });
});

describe('اسکنر اختلاف فاندینگ', () => {
  const a = [
    { base: 'MSTR', fundingHourly: 0.0000998, venue: 'arcus' },
    { base: 'BTC', fundingHourly: 0.0000125, venue: 'arcus' },
    { base: 'AAPL', fundingHourly: null, venue: 'arcus' },
    { base: 'ONLYA', fundingHourly: 0.001, venue: 'arcus' }
  ];
  const b = [
    { base: 'mstr', fundingHourly: 0.0000063, venue: 'ondo' },
    { base: 'BTC', fundingHourly: 0.0000125, venue: 'ondo' },
    { base: 'AAPL', fundingHourly: 0.0001, venue: 'ondo' },
    { base: 'META', fundingHourly: 0.0002, venue: 'ondo' }
  ];

  it('فقط بازارهای مشترک با فاندینگ معلوم، مرتب بر اساس اختلاف', () => {
    const s = fundingSpreads(a, b);
    expect(s.map((x) => x.base)).toEqual(['MSTR', 'BTC']);
    expect(s[0].spreadApr).toBeCloseTo(81.906, 6);
    expect(s[0].shortOn).toBe('a');
    expect(s[0].b.venue).toBe('ondo');
    expect(s[1].spreadApr).toBe(0);
  });

  it('Short روی صرافی با فاندینگ بالاتر', () => {
    expect(fundingSpreads(b, a)[0].shortOn).toBe('b');
  });
});
