import { describe, expect, it } from 'vitest';
import {
  aprToHourly,
  cleanFunding,
  DAY_MS,
  gridConfigs,
  HOUR_MS,
  liquidationDistance,
  monthlyFunding,
  runStudy,
  segmentMetrics,
  simulate,
  type CostParams,
  type FundingPoint,
  type PriceBar
} from './engine';
import { deflatedSharpe, expectedMaxSharpe, moments, normCdf, normInv } from './stats';

const T0 = Date.UTC(2025, 0, 1);
const FREE: CostParams = { leverage: 1, mmrPct: 1, perpFeePct: 0, spotFeePct: 0, slippagePct: 0, hurdleApr: 0, idleEarnsHurdle: false };

const hoursOf = (n: number, rate: (i: number) => number): FundingPoint[] => Array.from({ length: n }, (_, i) => ({ hour: T0 + (i + 1) * HOUR_MS, rate: rate(i) }));
/** کندل ۴ساعته با قیمت ثابت (یا تابع) که پیش از اولین ساعت بسته شده */
const barsOf = (n: number, px: (k: number) => { high: number; close: number } = () => ({ high: 100, close: 100 })): PriceBar[] =>
  Array.from({ length: Math.ceil(n / 4) + 1 }, (_, k) => ({ end: T0 + k * 4 * HOUR_MS, ...px(k) }));

describe('stats', () => {
  it('normCdf و normInv معکوس هم‌اند', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    for (const p of [0.01, 0.2, 0.5, 0.9, 0.999]) expect(normCdf(normInv(p))).toBeCloseTo(p, 5);
  });

  it('moments: نرمال تقریبی کشیدگی ≈ ۳ و چولگی ≈ ۰ دارد', () => {
    const xs = Array.from({ length: 2001 }, (_, i) => normInv((i + 0.5) / 2001));
    const m = moments(xs)!;
    expect(m.mean).toBeCloseTo(0, 6);
    expect(m.skew).toBeCloseTo(0, 6);
    expect(m.kurt).toBeGreaterThan(2.8);
    expect(m.kurt).toBeLessThan(3.1);
  });

  it('بیشترین شارپ تصادفی با تعداد آزمون رشد می‌کند', () => {
    expect(expectedMaxSharpe(0.01, 1)).toBe(0);
    const a = expectedMaxSharpe(0.01, 10);
    const b = expectedMaxSharpe(0.01, 1000);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
  });

  it('DSR: آزمون‌های بیشتر احتمال را پایین می‌آورد', () => {
    const r = Array.from({ length: 400 }, (_, i) => 0.001 + 0.01 * Math.sin(i * 1.7));
    const few = deflatedSharpe(r, 0.002, 2)!;
    const many = deflatedSharpe(r, 0.002, 5000)!;
    expect(many.dsr).toBeLessThan(few.dsr);
    expect(deflatedSharpe(Array(50).fill(0.001), 0.002, 10)).toBeNull();
  });
});

describe('simulate', () => {
  it('فاندینگ ثابت بدون هزینه: بازده = نرخ × ساعت × سهم ناشنال', () => {
    const rate = aprToHourly(10);
    const r = simulate(hoursOf(24 * 30, () => rate), barsOf(24 * 30), { kind: 'always' }, { ...FREE, leverage: 1 });
    // L=1 → نیمی از سرمایه ناشنال است؛ بازده ≈ 0.5 × 10٪ × 30/365
    expect(r.equity[r.equity.length - 1] - 1).toBeCloseTo(0.5 * 0.1 * (720 / 8760), 4);
    expect(r.entries).toBe(1);
    expect(r.hoursIn).toBe(720);
  });

  it('اهرم بالاتر سهم ناشنال را بیشتر می‌کند', () => {
    const rate = aprToHourly(10);
    const r1 = simulate(hoursOf(240, () => rate), barsOf(240), { kind: 'always' }, { ...FREE, leverage: 1 });
    const r3 = simulate(hoursOf(240, () => rate), barsOf(240), { kind: 'always' }, { ...FREE, leverage: 3, mmrPct: 1 });
    expect(r3.breakdown.funding / r1.breakdown.funding).toBeCloseTo(0.75 / 0.5, 2);
  });

  it('هزینهٔ ورود و خروج کسر می‌شود', () => {
    const cost = { ...FREE, perpFeePct: 0.05, spotFeePct: 0.05, slippagePct: 0 };
    const r = simulate(hoursOf(48, () => 0), barsOf(48), { kind: 'always' }, cost);
    // دو بار ۰٫۱٪ روی ناشنال ۰٫۵
    expect(r.breakdown.tradingFees).toBeCloseTo(-2 * 0.5 * 0.001, 6);
  });

  it('بدون نگاه به آینده: آستانه فقط با فاندینگ ساعت‌های قبل فعال می‌شود', () => {
    // ۱۰ ساعت صفر، بعد فاندینگ بالا — با lookback=1، ساعت جهش نباید فاندینگش را بگیرد
    const high = aprToHourly(50);
    const pts = hoursOf(20, (i) => (i >= 10 ? high : 0));
    const r = simulate(pts, barsOf(20), { kind: 'threshold', lookbackH: 1, entryApr: 20, exitApr: 10 }, FREE);
    expect(r.hoursIn).toBe(9); // ساعت‌های ۱۱ تا ۱۹
    expect(r.breakdown.funding).toBeCloseTo(9 * high * 0.5, 10);
  });

  it('ورود و خروج با هیسترزیس', () => {
    const pts = hoursOf(30, (i) => (i < 10 ? aprToHourly(30) : i < 20 ? aprToHourly(8) : aprToHourly(2)));
    const r = simulate(pts, barsOf(30), { kind: 'threshold', lookbackH: 1, entryApr: 10, exitApr: 5 }, FREE);
    // تصمیم ساعت i با نرخ ساعت i−1: ساعت‌های ۱ تا ۱۰ ورود، تا ۲۰ بین ۵ و ۱۰ باز می‌ماند، ۲۱ خروج
    expect(r.entries).toBe(1);
    expect(r.hoursIn).toBe(20);
  });

  it('لیکوئید شورت وقتی بیشترین قیمت از فاصلهٔ لیکوئید بگذرد', () => {
    const L = 5;
    const dist = liquidationDistance(L, 1);
    const bars = barsOf(48, (k) => (k === 3 ? { high: 100 * (1 + dist + 0.01), close: 100 } : { high: 100, close: 100 }));
    const r = simulate(hoursOf(48, () => aprToHourly(10)), bars, { kind: 'always' }, { ...FREE, leverage: L, mmrPct: 1 });
    expect(r.liquidations).toHaveLength(1);
    expect(r.breakdown.liquidation).toBeLessThan(0);
    expect(r.entries).toBe(2); // دوباره وارد می‌شود
  });

  it('ریبالانس روی حرکت بزرگ هزینه دارد ولی لیکوئید نمی‌شود', () => {
    const bars = barsOf(48, (k) => (k >= 3 ? { high: 130, close: 130 } : { high: 100, close: 100 }));
    const cost = { ...FREE, leverage: 2, mmrPct: 1, perpFeePct: 0.05, spotFeePct: 0.05 };
    const r = simulate(hoursOf(48, () => 0), bars, { kind: 'always' }, cost);
    expect(r.liquidations).toHaveLength(0);
    expect(r.breakdown.rebalance).toBeLessThan(0);
  });

  it('رشد سه‌برابری قیمت اهرم مؤثر و فاندینگ را بزرگ نمی‌کند (ریبالانس اندازه را برمی‌گرداند)', () => {
    const n = 24 * 60;
    const rate = aprToHourly(10);
    // قیمت در ۶۰ روز خطی از ۱۰۰ به ۳۰۰
    const bars = barsOf(n, (k) => {
      const p = 100 + (200 * Math.min(k, n / 4)) / (n / 4);
      return { high: p, close: p };
    });
    const r = simulate(hoursOf(n, () => rate), bars, { kind: 'always' }, { ...FREE, leverage: 2, mmrPct: 1 });
    const expected = (2 / 3) * rate * n; // سهم ناشنال × نرخ × ساعت (بدون هزینه)
    expect(r.breakdown.funding).toBeGreaterThan(expected * 0.9);
    expect(r.breakdown.funding).toBeLessThan(expected * 1.15);
    expect(r.liquidations).toHaveLength(0);
  });

  it('بیرون از بازار بازده استیبل می‌گیرد', () => {
    const r = simulate(hoursOf(24 * 365, () => 0), barsOf(24 * 365), { kind: 'threshold', lookbackH: 24, entryApr: 100, exitApr: 50 }, { ...FREE, hurdleApr: 5, idleEarnsHurdle: true });
    expect(r.entries).toBe(0);
    expect(r.equity[r.equity.length - 1] - 1).toBeCloseTo(Math.exp(0.05) - 1, 3);
  });

  it('cleanFunding: تکراری و نامعتبر حذف و مرتب می‌شود', () => {
    const c = cleanFunding([
      { hour: 3, rate: 1 },
      { hour: 1, rate: 2 },
      { hour: 3, rate: 5 },
      { hour: 2, rate: NaN }
    ]);
    expect(c).toEqual([
      { hour: 1, rate: 2 },
      { hour: 3, rate: 5 }
    ]);
  });
});

describe('metrics and study', () => {
  it('segmentMetrics: افت بیشینه و بازده مازاد', () => {
    const m = segmentMetrics([0.1, -0.5, 0.2], 0);
    expect(m.maxDrawdown).toBeCloseTo(-0.5, 6);
    expect(m.totalReturn).toBeCloseTo(1.1 * 0.5 * 1.2 - 1, 6);
  });

  it('شبکه ۲۵ پیکربندی دارد', () => {
    expect(gridConfigs()).toHaveLength(25);
  });

  it('فاندینگ پایدار و بالا → تأیید؛ فاندینگ صفر → بدون لبه', () => {
    const n = 24 * 400;
    const bars = barsOf(n);
    const steady = runStudy(hoursOf(n, (i) => aprToHourly(20 + 4 * Math.sin(i / 50))), bars, { ...FREE, leverage: 2, hurdleApr: 4, idleEarnsHurdle: true });
    expect(steady.days).toBeGreaterThanOrEqual(400);
    expect(steady.folds).toHaveLength(3);
    expect(steady.checks.find((c) => c.id === 'oos')!.pass).toBe(true);
    expect(steady.verdict).toBe('validated');

    const flat = runStudy(hoursOf(n, () => 0), bars, { ...FREE, perpFeePct: 0.045, spotFeePct: 0.07, leverage: 2, hurdleApr: 4 });
    expect(flat.verdict).toBe('no-edge');
  });

  it('دادهٔ کم → ناکافی', () => {
    const s = runStudy(hoursOf(24 * 60, () => aprToHourly(10)), barsOf(24 * 60), FREE);
    expect(s.verdict).toBe('insufficient');
  });

  it('آزمون‌های قبلی DSR را سخت‌گیرتر می‌کند', () => {
    const n = 24 * 300;
    const pts = hoursOf(n, (i) => aprToHourly(6 + 30 * Math.sin(i / 97) + 10 * Math.cos(i / 13)));
    const a = runStudy(pts, barsOf(n), { ...FREE, leverage: 2, hurdleApr: 4 }, 0);
    const b = runStudy(pts, barsOf(n), { ...FREE, leverage: 2, hurdleApr: 4 }, 10_000);
    expect(b.trials).toBeGreaterThan(a.trials);
    if (a.dsr && b.dsr) expect(b.dsr.dsr).toBeLessThanOrEqual(a.dsr.dsr);
  });

  it('monthlyFunding: میانگین سالانه و سهم منفی', () => {
    const pts: FundingPoint[] = [
      { hour: T0, rate: aprToHourly(10) },
      { hour: T0 + HOUR_MS, rate: aprToHourly(-10) },
      { hour: T0 + 40 * DAY_MS, rate: aprToHourly(20) }
    ];
    const m = monthlyFunding(pts);
    expect(m).toHaveLength(2);
    expect(m[0].avgApr).toBeCloseTo(0, 8);
    expect(m[0].negativeShare).toBeCloseTo(0.5, 8);
    expect(m[1].avgApr).toBeCloseTo(20, 8);
  });
});

describe('best selection', () => {
  it('قانونی که هیچ‌وقت وارد نشده «بهترین» انتخاب نمی‌شود حتی اگر بقیه ضرر کنند', () => {
    const n = 24 * 200;
    // فاندینگ کمی مثبت ولی زیر استیبل: هر قانون معامله‌کننده از استیبل عقب است
    const pts = Array.from({ length: n }, (_, i) => ({ hour: T0 + (i + 1) * HOUR_MS, rate: aprToHourly(1) }));
    const s = runStudy(pts, barsOf(n), { ...FREE, perpFeePct: 0.045, spotFeePct: 0.07, leverage: 2, hurdleApr: 4, idleEarnsHurdle: true });
    expect(s.best.sim.entries).toBeGreaterThan(0);
    expect(s.verdict).toBe('no-edge');
    for (const f of s.folds) expect(s.runs.find((r) => r.id === f.chosen)!.sim.entries).toBeGreaterThan(0);
  });
});
