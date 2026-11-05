import { describe, expect, it } from 'vitest';
import { aprToHourly, HOUR_MS, type FundingPoint, type PriceBar } from './engine';
import { alignSpreadSeries, ALWAYS_LOOKBACK_H, runSpreadStudy, simulateSpread, type SpreadCost } from './spread';

const T0 = Date.UTC(2025, 0, 1);
const FREE: SpreadCost = { leverage: 2, mmrPct: 1, feeAPct: 0, feeBPct: 0, slippagePct: 0, transferPct: 0, hurdleApr: 0, idleEarnsHurdle: false };
const pts = (n: number, rate: (i: number) => number): FundingPoint[] => Array.from({ length: n }, (_, i) => ({ hour: T0 + (i + 1) * HOUR_MS, rate: rate(i) }));
const bars = (n: number, px: (k: number) => { high: number; low?: number; close: number } = () => ({ high: 100, low: 100, close: 100 })): PriceBar[] =>
  Array.from({ length: Math.ceil(n / 4) + 1 }, (_, k) => ({ end: T0 + k * 4 * HOUR_MS, ...px(k) }));

describe('spread', () => {
  it('alignSpreadSeries: فقط ساعت‌های مشترک، اسپرد = A − B', () => {
    const s = alignSpreadSeries(
      [
        { hour: 1, rate: 0.3 },
        { hour: 2, rate: 0.5 }
      ],
      [
        { hour: 2, rate: 0.1 },
        { hour: 3, rate: 0.9 }
      ]
    );
    expect(s).toHaveLength(1);
    expect(s[0].hour).toBe(2);
    expect(s[0].spread).toBeCloseTo(0.4, 12);
  });

  it('اسپرد ثابت: درآمد = اسپرد × ساعت × ناشنال (L/2) بعد از گرم شدن', () => {
    const n = 24 * 30;
    const series = alignSpreadSeries(pts(n, () => aprToHourly(20)), pts(n, () => aprToHourly(5)));
    const r = simulateSpread(series, bars(n), { kind: 'always' }, FREE);
    expect(r.hoursIn).toBe(n - ALWAYS_LOOKBACK_H);
    expect(r.breakdown.funding).toBeCloseTo(aprToHourly(15) * (n - ALWAYS_LOOKBACK_H) * 1, 8);
  });

  it('اسپرد منفی → جهت برعکس و باز هم درآمد مثبت', () => {
    const n = 24 * 20;
    const series = alignSpreadSeries(pts(n, () => aprToHourly(2)), pts(n, () => aprToHourly(12)));
    const r = simulateSpread(series, bars(n), { kind: 'always' }, FREE);
    expect(r.breakdown.funding).toBeGreaterThan(0);
  });

  it('عوض شدن علامت اسپرد → بستن و باز کردن برعکس', () => {
    const n = 24 * 40;
    const series = alignSpreadSeries(pts(n, (i) => (i < n / 2 ? aprToHourly(20) : aprToHourly(-20))), pts(n, () => 0));
    const r = simulateSpread(series, bars(n), { kind: 'threshold', lookbackH: 24, entryApr: 5, exitApr: 2.5 }, FREE);
    expect(r.entries).toBe(2);
  });

  it('سقوط قیمت پای لانگ را لیکوئید می‌کند', () => {
    const n = 24 * 20;
    const series = alignSpreadSeries(pts(n, () => aprToHourly(20)), pts(n, () => 0));
    const crash = bars(n, (k) => (k === 60 ? { high: 100, low: 40, close: 100 } : { high: 100, low: 100, close: 100 }));
    const r = simulateSpread(series, crash, { kind: 'always' }, { ...FREE, leverage: 3 });
    expect(r.liquidations).toHaveLength(1);
    expect(r.peakLiqUse).toBe(1);
  });

  it('هیچ اختلافی → بدون لبه', () => {
    const n = 24 * 300;
    const same = pts(n, (i) => aprToHourly(10 + 5 * Math.sin(i / 40)));
    const s = runSpreadStudy(same, same, bars(n), { ...FREE, feeAPct: 0.045, hurdleApr: 4, idleEarnsHurdle: true });
    expect(s.verdict).toBe('no-edge');
  });
});
