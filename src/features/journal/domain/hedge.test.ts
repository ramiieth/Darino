import { describe, expect, it } from 'vitest';
import { commonStep, hedgeBase, openPairs, pairMarkets, planHedge, roundDown, tradeUrl, type HedgeQuote } from './hedge';

const q = (p: Partial<HedgeQuote>): HedgeQuote => ({ venue: 'arcus', base: 'BTC', display: 'BTC-USD', mark: 100_000, fundingHourly: 0, takerPct: 0.025, step: 1e-8, minSize: 0.0001, minNotional: 5, maxLeverage: 20, ...p });
const rh = q({ venue: 'lighterRh', display: 'BTC-USD', step: 1e-4, minSize: 0.0002, minNotional: 10, fundingHourly: 0.00001, takerPct: 0 });
const ar = q({ venue: 'arcus', fundingHourly: 0.00005 });

describe('راهنمای جفت دلتا نوترال', () => {
  it('گام مشترک و گرد کردن به پایین', () => {
    expect(commonStep(1e-4, 1e-8)).toBe(1e-4);
    expect(roundDown(0.0123456, 1e-4)).toBe(0.0123);
    expect(roundDown(3, 1)).toBe(3);
    expect(hedgeBase('BTC-USDC')).toBe('BTC');
    expect(hedgeBase('XAU')).toBe('GOLD');
  });

  it('لانگ روی فاندینگ کمتر، شورت روی بیشتر؛ اندازهٔ یکسان؛ درآمد و سربه‌سر', () => {
    const p = planHedge(rh, ar, 1000)!;
    expect(p.legs.map((l) => [l.venue, l.side])).toEqual([['lighterRh', 'long'], ['arcus', 'short']]);
    expect(p.units).toBe(0.01);
    expect(p.legs[0].units).toBe(p.legs[1].units);
    // (۰٫۰۰۰۰۵ − ۰٫۰۰۰۰۱) × ۲۴ × ۱۰۰۰ = ۰٫۹۶ دلار در روز
    expect(p.dailyUsd).toBeCloseTo(0.96);
    expect(p.roundTripFeesUsd).toBeCloseTo(0.5); // آرکوس ۰٫۰۲۵٪ × ۱۰۰۰ × ۲
    expect(p.breakevenDays).toBeCloseTo(0.52, 1);
    expect(p.legs[0].url).toBe('https://robinhoodchain.lighter.xyz/trade/BTC');
    expect(p.legs[1].url).toBe('https://app.arcus.xyz/trade/BTC-USD');
    const flipped = planHedge(rh, ar, 1000, 'arcus')!;
    expect(flipped.legs[0].venue).toBe('arcus');
    expect(flipped.warnings.some((w) => w.includes('درآمد ندارد'))).toBe(true);
  });

  it('کمتر از حداقل سفارش هشدار می‌دهد؛ مبلغ صفر هیچ', () => {
    expect(planHedge(rh, ar, 15)!.legs[0].belowMin).toBe(true);
    expect(planHedge(rh, ar, 0)).toBeNull();
    expect(planHedge(rh, rh, 1000)).toBeNull();
  });

  it('بازارهای مشترک، بهترین فاندینگ اول', () => {
    const m = pairMarkets([rh, q({ venue: 'lighterRh', base: 'ETH', fundingHourly: 0 })], [ar, q({ base: 'ETH', fundingHourly: 0.0002 }), q({ base: 'SOL' })]);
    expect(m.map((x) => x.base)).toEqual(['ETH', 'BTC']);
    expect(tradeUrl({ venue: 'txflow', base: 'BTC', display: 'BTC-USDC' })).toBe('https://app.txflow.com/trade/BTC-USDC');
  });

  it('یادآور: جفت نامتعادل با سفارش اصلاح دقیق؛ فاندینگ منفی', () => {
    const quotes = new Map([['lighterRh', [rh]], ['arcus', [ar]]] as const);
    const [p] = openPairs([
      { venue: 'lighterRh', account: 'a', symbol: 'BTC', side: 'short', size: 0.05, mark: 100_000 },
      { venue: 'arcus', account: 'b', symbol: 'BTC-USD', side: 'long', size: 0.06, mark: 100_000 }
    ], quotes);
    expect(p.net).toBeCloseTo(0.01);
    expect(p.fix).toMatchObject({ venue: 'lighterRh', side: 'short', units: 0.01 });
    // شورت روی فاندینگ کمتر و لانگ روی بیشتر → هزینه
    expect(p.dailyUsd!).toBeLessThan(0);
    const [ok] = openPairs([
      { venue: 'lighterRh', account: 'a', symbol: 'BTC', side: 'long', size: 0.05, mark: 100_000 },
      { venue: 'arcus', account: 'b', symbol: 'BTC-USD', side: 'short', size: 0.0502, mark: 100_000 }
    ], quotes);
    expect(ok.fix).toBeNull();
    expect(ok.dailyUsd!).toBeGreaterThan(0);
    expect(openPairs([{ venue: 'arcus', account: 'b', symbol: 'ETH-USD', side: 'long', size: 1, mark: 3000 }], quotes)).toHaveLength(0);
  });
});
