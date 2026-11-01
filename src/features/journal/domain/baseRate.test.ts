import { describe, expect, it } from 'vitest';
import type { Candle } from './excursions';
import { baseRate, ewmaVol, medianHourRange, planCoin, splitEdge, wilson } from './baseRate';

const M = 60_000;
const H = 3_600_000;

/** کندل‌هایی با سقف/کف ±w٪ حول بسته‌شدن */
function series(closes: number[], w = 0, ms = H): Candle[] {
  return closes.map((c, i) => ({ t: i * ms, o: i ? closes[i - 1] : c, h: c * (1 + w), l: c * (1 - w), c }));
}

describe('baseRate', () => {
  it('a steady uptrend hits the long target first, the short stop first', () => {
    const cs = series(Array.from({ length: 60 }, (_, i) => 100 * 1.01 ** i));
    const long = baseRate(cs, { direction: 'long', stopFrac: 0.02, targetFrac: 0.02, horizonBars: 5, intervalMs: H, volScale: false, feeSide: 0 })!;
    expect(long.pTarget).toBe(1);
    expect(long.evR).toBeCloseTo(1);
    const short = baseRate(cs, { direction: 'short', stopFrac: 0.02, targetFrac: 0.02, horizonBars: 5, intervalMs: H, volScale: false, feeSide: 0 })!;
    expect(short.pStop).toBe(1);
    expect(short.evR).toBeCloseTo(-1);
  });

  it('assumes the stop when stop and target are touched in the same candle', () => {
    const cs: Candle[] = [{ t: 0, o: 100, h: 100, l: 100, c: 100 }, { t: H, o: 100, h: 110, l: 90, c: 100 }];
    const r = baseRate(cs, { direction: 'long', stopFrac: 0.05, targetFrac: 0.05, horizonBars: 1, intervalMs: H, volScale: false, feeSide: 0 })!;
    expect(r.trials).toBe(1);
    expect(r.pStop).toBe(1);
  });

  it('closes untouched trials at the horizon price, counting only complete horizons', () => {
    // ۰ → ۱۰۰، بعد ۱۰۱، ۱۰۲ (حرکت کوچک‌تر از استاپ و هدف)
    const cs = series([100, 101, 102]);
    const r = baseRate(cs, { direction: 'long', stopFrac: 0.1, targetFrac: 0.2, horizonBars: 2, intervalMs: H, volScale: false, feeSide: 0 })!;
    expect(r.trials).toBe(1);
    expect(r.pTimeout).toBe(1);
    expect(r.evR).toBeCloseTo(0.02 / 0.1);
    expect(r.rTarget).toBeCloseTo(2);
    expect(r.breakevenWin).toBeCloseTo(1 / 3);
  });

  it('subtracts round-trip fees in R', () => {
    const cs = series([100, 101, 102]);
    const r = baseRate(cs, { direction: 'long', stopFrac: 0.01, targetFrac: 0.5, horizonBars: 2, intervalMs: H, volScale: false, feeSide: 0.0005 })!;
    expect(r.feeR).toBeCloseTo(0.1);
  });

  it('effective sample divides overlapping starts by the horizon', () => {
    const cs = series(Array.from({ length: 1000 }, (_, i) => 100 + Math.sin(i / 7)), 0.002);
    const r = baseRate(cs, { direction: 'long', stopFrac: 0.01, targetFrac: 0.01, horizonBars: 24, intervalMs: H, volScale: false })!;
    expect(r.trials).toBe(976);
    expect(r.effective).toBe(40);
    expect(r.enough).toBe(true);
    expect(r.pTarget + r.pStop + r.pTimeout).toBeCloseTo(1);
  });

  it('volatility scaling widens past distances when the past was calmer', () => {
    // نیمهٔ اول آرام، نیمهٔ دوم پرنوسان: استاپ امروز در گذشتهٔ آرام کوچک‌تر می‌شود → استاپ بیشتر
    const closes: number[] = [];
    let p = 100;
    for (let i = 0; i < 400; i++) { p *= 1 + (i < 200 ? 0.001 : 0.01) * (i % 2 ? 1 : -1); closes.push(p); }
    const cs = series(closes, 0, 15 * M);
    const args = { direction: 'long' as const, stopFrac: 0.012, targetFrac: 0.05, horizonBars: 8, intervalMs: 15 * M, feeSide: 0 };
    const raw = baseRate(cs, { ...args, volScale: false })!;
    const scaled = baseRate(cs, { ...args, volScale: true })!;
    expect(scaled.pStop).toBeGreaterThan(raw.pStop);
  });

  it('returns null for invalid geometry or too few candles', () => {
    const cs = series([100, 101, 102]);
    expect(baseRate(cs, { direction: 'long', stopFrac: 0, targetFrac: 0.1, horizonBars: 1, intervalMs: H })).toBeNull();
    expect(baseRate(cs, { direction: 'long', stopFrac: 0.1, targetFrac: 0.1, horizonBars: 5, intervalMs: H })).toBeNull();
  });
});

describe('helpers', () => {
  it('wilson interval contains p and narrows with n', () => {
    const [a, b] = wilson(0.4, 30);
    const [c, d] = wilson(0.4, 300);
    expect(a).toBeLessThan(0.4);
    expect(b).toBeGreaterThan(0.4);
    expect(d - c).toBeLessThan(b - a);
  });

  it('ewmaVol is causal and positive after warm-up', () => {
    const cs = series(Array.from({ length: 50 }, (_, i) => 100 + (i % 2)), 0, H);
    const v = ewmaVol(cs, H);
    expect(Number.isNaN(v[10])).toBe(true);
    expect(v[30]).toBeGreaterThan(0);
  });

  it('median one-hour range aggregates sub-hour candles', () => {
    const cs = series(Array.from({ length: 24 }, () => 100), 0.005, 5 * M);
    expect(medianHourRange(cs, 5 * M)).toBeCloseTo(0.01);
  });

  it('splits expected value into structure and trend', () => {
    const { structureR, trendR } = splitEdge(-0.52, 0.4);
    expect(structureR).toBeCloseTo(-0.06);
    expect(trendR).toBeCloseTo(-0.46);
    expect(structureR + trendR).toBeCloseTo(-0.52);
  });

  it('in a steady trend the structure part is direction-neutral', () => {
    const cs = series(Array.from({ length: 80 }, (_, i) => 100 * 1.01 ** i));
    const args = { stopFrac: 0.02, targetFrac: 0.02, horizonBars: 5, intervalMs: H, volScale: false, feeSide: 0 } as const;
    const l = baseRate(cs, { ...args, direction: 'long' })!;
    const s = baseRate(cs, { ...args, direction: 'short' })!;
    const e = splitEdge(l.evR, s.evR);
    expect(e.structureR).toBeCloseTo(0);
    expect(e.trendR).toBeCloseTo(1);
  });

  it('maps plan symbols to candle coins', () => {
    expect(planCoin('BTC-PERP', 'crypto')).toBe('BTC');
    expect(planCoin('xyz:GOLD', 'crypto')).toBe('xyz:GOLD');
    expect(planCoin('XAUUSD', 'mt')).toBe('xyz:GOLD');
    expect(planCoin('GBPJPY', 'mt')).toBeNull();
    expect(planCoin(' ', 'crypto')).toBeNull();
  });
});
