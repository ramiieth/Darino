import { describe, expect, it } from 'vitest';
import { priceAt, recentSymbols, roundPx, stopFractions, stopFrom, targetFrom } from './quick';

const H = 3_600_000;

describe('ورود سریع ژورنال', () => {
  it('نمادهای پرکاربرد کاربر اول (دارایی پایه)، بعد رایج‌ها، بدون تکرار', () => {
    expect(recentSymbols(['SOL', 'sol', 'ETH', 'SOL', 'XAU']).slice(0, 3)).toEqual(['SOL', 'ETH', 'GOLD']);
    expect(recentSymbols(['xyz:GOLD', 'XAU'])[0]).toBe('GOLD');
    expect(new Set(recentSymbols(['BTC', 'BTC'])).size).toBe(recentSymbols(['BTC']).length);
  });


  it('قیمت یک لحظهٔ گذشته از کندل همان لحظه', () => {
    const candles = [0, 1, 2].map((i) => ({ t: i * H, o: 100 + i * 10, h: 0, l: 0, c: 105 + i * 10 }));
    expect(priceAt(candles, 1 * H + 60_000, H)).toBe(110); // اول کندل → باز
    expect(priceAt(candles, 1 * H + 50 * 60_000, H)).toBe(115); // آخر کندل → بسته
    expect(priceAt(candles, -H, H)).toBeNull();
    expect(priceAt(candles, 10 * H, H)).toBeNull();
  });

  it('استاپ از نوسان یک ساعت و هدف به مضرب R', () => {
    const candles = Array.from({ length: 48 }, (_, i) => ({ t: i * H, o: 100, h: 101, l: 99, c: 100 }));
    const f = stopFractions(candles, H)!;
    expect(f.tight).toBeCloseTo(0.02);
    expect(f.normal).toBeCloseTo(0.04);
    const st = stopFrom(100, f.normal, 'long');
    expect(st).toBeCloseTo(96);
    expect(targetFrom(100, st, 2, 'long')).toBeCloseTo(108);
    expect(stopFrom(100, 0.04, 'short')).toBeCloseTo(104);
    expect(targetFrom(100, 104, 2, 'short')).toBeCloseTo(92);
  });

  it('گرد کردن قیمت', () => {
    expect(roundPx(1.0845678)).toBe(1.08457);
    expect(roundPx(64321.987)).toBe(64322);
    expect(roundPx(3412.3456)).toBe(3412.35);
  });


});
