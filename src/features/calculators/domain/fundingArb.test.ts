/**
 * تست‌های آربیتراژ فاندینگ واقعی — هم‌ترازی ساعت‌ها، آمار پنجره‌ای، اسلیپیج دفتر سفارش و سود خالص
 */
import { describe, expect, it } from 'vitest';
import { alignSpread, floorHour, realDeltaNet, slippagePct, spreadStats, stabilityOf, type RatePoint } from '@/features/calculators/domain';

const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 17, 12, 30);
const at = (hoursAgo: number) => floorHour(NOW) - hoursAgo * H;

describe('alignSpread', () => {
  it('فقط ساعت‌های مشترک، Short − Long، صعودی', () => {
    const short: RatePoint[] = [
      { hour: at(0) + 1234, rate: 0.00003 },
      { hour: at(1), rate: 0.00002 },
      { hour: at(5), rate: 0.00009 }
    ];
    const long: RatePoint[] = [
      { hour: at(1), rate: 0.00001 },
      { hour: at(0), rate: 0.00001 }
    ];
    const s = alignSpread(short, long);
    expect(s.map((p) => p.hour)).toEqual([at(1), at(0)]);
    expect(s[0].rate).toBeCloseTo(0.00001, 12);
    expect(s[1].rate).toBeCloseTo(0.00002, 12);
  });
});

describe('spreadStats', () => {
  const series: RatePoint[] = [
    { hour: at(30), rate: -0.00001 }, // بیرون از پنجرهٔ ۲۴ ساعته
    { hour: at(4), rate: 0.00002 },
    { hour: at(3), rate: 0 },
    { hour: at(2), rate: -0.00001 },
    { hour: at(1), rate: 0.00002 },
    { hour: at(0), rate: 0.00001 }
  ];

  it('میانگین سالانه، سهم ساعت‌های سودده و چرخش (صفر نادیده)', () => {
    const s = spreadStats(series, 24, NOW);
    expect(s.hours).toBe(5);
    expect(s.avgApr).toBeCloseTo((0.00004 / 5) * 8760 * 100, 9);
    expect(s.profitableShare).toBeCloseTo(3 / 5, 12);
    expect(s.reversals).toBe(2); // + → − → +
  });

  it('پنجرهٔ بزرگ‌تر داده‌های قدیمی را هم می‌گیرد؛ بدون داده null', () => {
    expect(spreadStats(series, 48, NOW).hours).toBe(6);
    expect(spreadStats([], 24, NOW)).toEqual({ hours: 0, avgApr: null, profitableShare: null, reversals: 0 });
  });

  it('برچسب پایداری', () => {
    const steady = Array.from({ length: 100 }, (_, i) => ({ hour: at(i), rate: 0.00002 }));
    expect(stabilityOf(spreadStats(steady, 168, NOW))).toBe('high');
    const choppy = steady.map((p, i) => ({ ...p, rate: i % 2 ? 0.00002 : -0.00001 }));
    expect(stabilityOf(spreadStats(choppy, 168, NOW))).toBe('low');
    expect(stabilityOf(spreadStats(steady.slice(0, 10), 168, NOW))).toBe('unknown');
    // ۷۰٪ ساعت‌ها سودده ولی ۶۷ چرخش در ۷ روز → ناپایدار
    expect(stabilityOf({ hours: 168, avgApr: 39, profitableShare: 0.68, reversals: 67 })).toBe('low');
    expect(stabilityOf({ hours: 168, avgApr: 19, profitableShare: 0.91, reversals: 16 })).toBe('medium');
  });
});

describe('slippagePct', () => {
  const asks = [
    { price: 100, size: 10 }, // ۱۰۰۰ دلار
    { price: 101, size: 10 } // ۱۰۱۰ دلار
  ];

  it('سفارش در سطح اول = فقط نصف اسپرد تا قیمت وسط', () => {
    expect(slippagePct(asks, 500, 99.9)).toBeCloseTo((0.1 / 99.9) * 100, 9);
  });

  it('عبور از چند سطح با میانگین وزنی', () => {
    // ۱۰۰۰ دلار در ۱۰۰ + ۵۰۵ دلار در ۱۰۱ → ۱۵ واحد → vwap = ۱۰۰٫۳۳۳…
    const vwap = 1505 / 15;
    expect(slippagePct(asks, 1505, 100)).toBeCloseTo(((vwap - 100) / 100) * 100, 9);
  });

  it('عمق ناکافی یا قیمت وسط نامعلوم → null؛ ارزش صفر → ۰', () => {
    expect(slippagePct(asks, 5000, 100)).toBeNull();
    expect(slippagePct(asks, 100, null)).toBeNull();
    expect(slippagePct(asks, 0, 100)).toBe(0);
  });
});

describe('realDeltaNet — ۱۰۰۰ دلار هر طرف', () => {
  const base = {
    capitalPerSide: 1000,
    leverage: 2,
    holdDays: 7,
    transferCostUsd: 6,
    spreadHourly: 0.2 / 8760, // ۲۰٪ سالانه
    longFeePct: 0,
    shortFeePct: 0.025,
    longSlipPct: 0.01,
    shortSlipPct: 0.01,
    longMmf: 0.03,
    shortMmf: 0.0125
  };

  it('فاندینگ − کارمزد − اسلیپیج − انتقال', () => {
    const r = realDeltaNet(base);
    expect(r.notional).toBe(2000);
    expect(r.capital).toBe(2000);
    expect(r.funding).toBeCloseTo(2000 * (0.2 / 8760) * 168, 9);
    expect(r.fees).toBeCloseTo(1, 12);
    expect(r.slippage).toBeCloseTo(0.8, 12);
    expect(r.transfer).toBe(6);
    expect(r.net).toBeCloseTo(r.funding - 7.8, 9);
    expect(r.net!).toBeLessThan(0); // ۷ روز با ۶ دلار انتقال هنوز جبران نمی‌شود
    expect(r.breakEvenDays).toBeCloseTo(7.8 / (2000 * (0.2 / 8760) * 24), 9);
    expect(r.liquidationPct).not.toBeNull();
  });

  it('۳۰ روز سودده می‌شود و بازده سالانه روی کل سرمایه است', () => {
    const r = realDeltaNet({ ...base, holdDays: 30 });
    expect(r.net!).toBeGreaterThan(0);
    expect(r.returnPct).toBeCloseTo((r.net! / 2000) * 100, 9);
    expect(r.aprOnCapital).toBeCloseTo((r.net! / 2000) * (365 / 30) * 100, 9);
  });

  it('اسلیپیج نامعلوم → سود خالص نمایش داده نمی‌شود؛ اسپرد منفی → سربه‌سر هرگز', () => {
    expect(realDeltaNet({ ...base, longSlipPct: null }).net).toBeNull();
    expect(realDeltaNet({ ...base, spreadHourly: -0.00001 }).breakEvenDays).toBeNull();
  });
});
