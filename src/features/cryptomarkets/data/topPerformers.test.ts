/**
 * تست‌ها — محاسبه بازده ۶۰/۹۰ روزه از بایگانی قیمت روزانه
 */
import { describe, expect, it } from 'vitest';
import {
  priceAt,
  returnsFromChart,
  mapLimit,
  CHART_ID_ALIAS,
  rankRows,
  simulateInvestment,
  type ChartPoint,
  type PerfCoin
} from '@/features/cryptomarkets/data/useTopPerformers';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

/** سری روزانه ساده: از ۹۰ روز پیش تا امروز با رشد ثابت ۰.۱٪ در روز */
function dailySeries(): ChartPoint[] {
  const pts: ChartPoint[] = [];
  const start = NOW - 90 * DAY;
  let price = 100;
  for (let i = 0; i <= 90; i++) {
    pts.push({ timestamp: start + i * DAY, price });
    price *= 1.001;
  }
  return pts;
}

describe('returnsFromChart — بازده ۶۰/۹۰ روزه', () => {
  it('بازده ۹۰ روزه را از اولین/آخرین نقطه محاسبه میکند', () => {
    const { ret90 } = returnsFromChart(dailySeries(), NOW);
    expect(ret90).not.toBeNull();
    // رشد ۰.۱٪ روزانه در ۹۰ روز ≈ ۹.۴٪
    expect(ret90).toBeGreaterThan(8.5);
    expect(ret90).toBeLessThan(10);
    // ۳۰ روزه هم از همین سری
    const { ret30 } = returnsFromChart(dailySeries(), NOW);
    expect(ret30).toBeGreaterThan(2.5);
    expect(ret30).toBeLessThan(3.5);
  });

  it('بازده ۶۰ روزه را از نقطه ۶۰ روز پیش محاسبه میکند', () => {
    const { ret60 } = returnsFromChart(dailySeries(), NOW);
    expect(ret60).not.toBeNull();
    expect(ret60).toBeGreaterThan(5.5);
    expect(ret60).toBeLessThan(7);
  });

  it('برای سری با کمتر از ۲ نقطه null برمیگرداند', () => {
    const empty = { ret1: null, ret7: null, ret30: null, ret60: null, ret90: null };
    expect(returnsFromChart([], NOW)).toEqual(empty);
    expect(returnsFromChart([{ timestamp: NOW, price: 10 }], NOW)).toEqual(empty);
  });

  it('برای قیمت نامعتبر/صفر null برمیگرداند (بازه‌های دور)', () => {
    const bad: ChartPoint[] = [
      { timestamp: NOW - 90 * DAY, price: 0 },
      { timestamp: NOW, price: 10 }
    ];
    const r = returnsFromChart(bad, NOW);
    expect(r.ret30).toBeNull();
    expect(r.ret60).toBeNull();
    expect(r.ret90).toBeNull();
    // ret1 با سری ۲نقطه‌ای: نزدیک‌ترین نقطه به ۱ روز پیش = خود نقطه آخر → ۰٪
    expect(r.ret1).toBe(0);
  });

  it('سری نامرتب را مرتب میکند', () => {
    const pts = [...dailySeries()].reverse();
    const { ret90 } = returnsFromChart(pts, NOW);
    expect(ret90).toBeGreaterThan(8);
  });

  it('بازده منفی در بازار نزولی درست محاسبه میشود', () => {
    const pts: ChartPoint[] = [
      { timestamp: NOW - 90 * DAY, price: 200 },
      { timestamp: NOW - 60 * DAY, price: 150 },
      { timestamp: NOW - 30 * DAY, price: 120 },
      { timestamp: NOW, price: 100 }
    ];
    const { ret30, ret60, ret90 } = returnsFromChart(pts, NOW);
    expect(ret90).toBeCloseTo(-50, 1);
    expect(ret60).toBeCloseTo(-33.33, 1);
    expect(ret30).toBeCloseTo(-16.67, 1);
  });

  it('بدون نقطه ۳۰ روز پیش → ret30 برابر null است', () => {
    const pts: ChartPoint[] = [
      { timestamp: NOW - 90 * DAY, price: 200 },
      { timestamp: NOW, price: 100 }
    ];
    const { ret30 } = returnsFromChart(pts, NOW);
    expect(ret30).toBeNull();
  });
});

describe('priceAt — نزدیک‌ترین نقطه روزانه', () => {
  it('نقطه نزدیک به هدف را انتخاب میکند', () => {
    const pts: ChartPoint[] = [
      { timestamp: NOW - 61 * DAY, price: 10 },
      { timestamp: NOW - 59 * DAY, price: 20 }
    ];
    expect(priceAt(pts, NOW - 60 * DAY)).toBe(20); // ۱ روز فاصله vs ۱ روز — اولین برخورد با فاصله مساوی
  });

  it('برای فاصله بیش از ۳ روز null برمیگرداند', () => {
    const pts: ChartPoint[] = [{ timestamp: NOW - 10 * DAY, price: 10 }];
    expect(priceAt(pts, NOW - 60 * DAY)).toBeNull();
  });

  it('برای سری خالی null برمیگرداند', () => {
    expect(priceAt([], NOW)).toBeNull();
  });
});

describe('mapLimit — اجرای محدود همزمان', () => {
  it('همه آیتمها را پردازش میکند', async () => {
    const out = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => n * 2);
    expect(out).toEqual([2, 4, 6, 8, 10, 12]);
  });

  it('بیش از حد مجاز درخواست همزمان ندارد', async () => {
    let concurrent = 0;
    let peak = 0;
    await mapLimit(Array.from({ length: 10 }), 3, async () => {
      concurrent++;
      peak = Math.max(peak, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      concurrent--;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('خطای یک آیتم بقیه را متوقف نمیکند', async () => {
    const out = await mapLimit([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('x');
      return n;
    });
    expect(out[0]).toBe(1);
    expect(out[1]).toBeUndefined();
    expect(out[2]).toBe(3);
  });
});

describe('simulateInvestment — شبیه‌سازی نمایشی سرمایه', () => {
  const CAPITAL = 23_126;

  it('رشد +۱۵٪ → سود +۳٬۴۶۸.۹۰ و ارزش نهایی ۲۶٬۵۹۴.۹۰', () => {
    const { profit, finalValue } = simulateInvestment(CAPITAL, 15);
    expect(profit).toBeCloseTo(3468.9, 1);
    expect(finalValue).toBeCloseTo(26594.9, 1);
  });

  it('افت -۲۰٪ → ضرر -۴٬۶۲۵.۲۰ و ارزش نهایی ۱۸٬۵۰۰.۸۰', () => {
    const { profit, finalValue } = simulateInvestment(CAPITAL, -20);
    expect(profit).toBeCloseTo(-4625.2, 1);
    expect(finalValue).toBeCloseTo(18500.8, 1);
  });

  it('بازده null → نتیجه null (بدون محاسبه)', () => {
    expect(simulateInvestment(CAPITAL, null)).toEqual({ profit: null, finalValue: null });
  });

  it('سرمایه صفر → سود صفر', () => {
    const { profit, finalValue } = simulateInvestment(0, 10);
    expect(profit).toBe(0);
    expect(finalValue).toBe(0);
  });
});

describe('rankRows — رتبه‌بندی بیشترین رشد/افت', () => {
  const coins: PerfCoin[] = [
    { symbol: 'A', id: 'a', nameFa: 'A', price: 1, marketCap: null, kind: 'crypto' },
    { symbol: 'B', id: 'b', nameFa: 'B', price: 1, marketCap: null, kind: 'crypto' },
    { symbol: 'C', id: 'c', nameFa: 'C', price: 1, marketCap: null, kind: 'tradfi' },
    { symbol: 'D', id: 'd', nameFa: 'D', price: 1, marketCap: null, kind: 'tokenized' }
  ];
  const perf = { A: 10, B: -5, C: 25, D: -20 };

  it('۵ بیشترین رشد و ۵ بیشترین افت مرتب', () => {
    const { gainers, losers } = rankRows(coins, perf, 5);
    expect(gainers.map((r) => r.coin.symbol)).toEqual(['C', 'A', 'B', 'D']); // sorted desc
    expect(losers[0].coin.symbol).toBe('D');
  });

  it('نمادهای بدون داده حذف می‌شوند', () => {
    const { gainers } = rankRows(coins, { A: 5, Z: 99 }, 5);
    expect(gainers).toHaveLength(1);
    expect(gainers[0].coin.symbol).toBe('A');
  });

  it('محدودیت n اعمال می‌شود', () => {
    const { gainers, losers } = rankRows(coins, perf, 2);
    expect(gainers).toHaveLength(2);
    expect(losers).toHaveLength(2);
  });
});

describe('CHART_ID_ALIAS — شناسه‌های جایگزین بایگانی', () => {
  it('مپ Polygon (MATIC→POL) و TON را دارد', () => {
    expect(CHART_ID_ALIAS['matic-network']).toBe('polygon-ecosystem-token');
    expect(CHART_ID_ALIAS['toncoin']).toBe('the-open-network');
  });
});

describe('returnsFromChart — بازده ۱/۷ روزه (جدید)', () => {
  it('سری روزانه صعودی ۰.۱٪: ret1 ≈ +۰.۱٪ و ret7 ≈ +۰.۷٪', () => {
    const pts: ChartPoint[] = [];
    const DAY = 86_400_000;
    let price = 100;
    for (let i = 90; i >= 0; i--) {
      pts.push({ timestamp: NOW - i * DAY, price });
      price *= 1.001;
    }
    const { ret1, ret7 } = returnsFromChart(pts, NOW);
    expect(ret1).toBeGreaterThan(0.05);
    expect(ret1).toBeLessThan(0.2);
    expect(ret7).toBeGreaterThan(0.6);
    expect(ret7).toBeLessThan(0.9);
  });

  it('بازار نزولی: ret1/ret7 منفی', () => {
    const pts: ChartPoint[] = [
      { timestamp: NOW - 7 * DAY_MS2(), price: 200 },
      { timestamp: NOW - 1 * DAY_MS2(), price: 180 },
      { timestamp: NOW, price: 170 }
    ];
    const { ret1, ret7 } = returnsFromChart(pts, NOW);
    expect(ret1).toBeCloseTo(-5.56, 1);  // 170/180 − 1
    expect(ret7).toBeCloseTo(-15, 1);    // 170/200 − 1
  });
});

/** میلی‌ثانیه روز برای تست بالا */
function DAY_MS2(): number {
  return 86_400_000;
}

describe('rankRows — ۳۰ نماد بیشترین رشد/افت', () => {
  const coins = Array.from({ length: 40 }, (_, i) => ({
    symbol: `C${i}`,
    id: `c${i}`,
    nameFa: `Coin ${i}`,
    price: 1,
    marketCap: 1,
    kind: 'crypto' as const
  }));
  const perf: Record<string, number | null> = {};
  coins.forEach((c, i) => {
    perf[c.symbol] = i - 20; // -20 .. +19
  });

  it('دقیقاً ۳۰ نماد بیشترین رشد برمیگرداند', () => {
    const { gainers } = rankRows(coins, perf, 30);
    expect(gainers).toHaveLength(30);
    expect(gainers[0].pct).toBe(19); // بالاترین
    expect(gainers[29].pct).toBe(-10); // سی‌ام
  });

  it('دقیقاً ۳۰ نماد بیشترین افت برمیگرداند', () => {
    const { losers } = rankRows(coins, perf, 30);
    expect(losers).toHaveLength(30);
    expect(losers[0].pct).toBe(-20); // بیشترین افت اول
  });

  it('مقادیر null فیلتر میشوند', () => {
    const p2 = { ...perf, C39: null };
    const { gainers } = rankRows(coins, p2, 30);
    expect(gainers.every((r) => r.pct !== null)).toBe(true);
  });

  it('پیش‌فرض بدون n = ۵ (سازگاری)', () => {
    const { gainers } = rankRows(coins, perf);
    expect(gainers).toHaveLength(5);
  });
});
