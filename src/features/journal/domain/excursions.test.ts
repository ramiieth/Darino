import { describe, expect, it } from 'vitest';
import type { Trade } from './types';
import { candleCoin, candleNeeds, excursionsFor, inWeekendGap, intervalFor, isMeasured, measure, quantile, ruleDelta, simulate, summarize, type Candle, type CandleSet, type Excursion } from './excursions';

const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 31, 12);
// سه‌شنبه ۲۰ اکتبر ۲۰۲۶، ساعت ۱۰ UTC
const T0 = Date.UTC(2026, 9, 20, 10);

function trade(p: Partial<Trade>): Trade {
  return {
    id: 'mt:1:1', account: 'mt:1', venue: 'metatrader', symbol: 'XAUUSD', base: 'XAU', direction: 'long',
    openTime: T0, closeTime: T0 + 4 * H, open: false, truncated: false, entryPx: 2000, exitPx: 2010,
    maxSize: 50, maxNotional: 100_000, volume: 0, grossPnl: 500, fees: 0, funding: 0, netPnl: 500, fills: 2, liquidated: false, ...p
  };
}

/** کندل ساعتی با قیمت پرپ ۱۰ دلار بالاتر از بروکر (اختلاف پایه) */
const candles = (rows: [number, number, number, number][]): Candle[] => rows.map(([o, h, l, c], i) => ({ t: T0 + i * H, o: o + 10, h: h + 10, l: l + 10, c: c + 10 }));
const set = (cs: Candle[]): CandleSet => ({ coin: 'xyz:GOLD', intervalMs: H, candles: cs });

describe('excursions', () => {
  it('maps MetaTrader symbols to Hyperliquid perps', () => {
    expect(candleCoin({ venue: 'metatrader', symbol: 'XAUUSD' })).toBe('xyz:GOLD');
    expect(candleCoin({ venue: 'metatrader', symbol: 'EURUSD' })).toBe('xyz:EUR');
    expect(candleCoin({ venue: 'metatrader', symbol: 'UKOUSD' })).toBe('xyz:BRENTOIL');
    expect(candleCoin({ venue: 'metatrader', symbol: 'GBPJPY' })).toBeNull();
    expect(candleCoin({ venue: 'hyperliquid', symbol: 'BTC' })).toBe('BTC');
    expect(candleCoin({ venue: 'lighter-mainnet', symbol: 'BTC' })).toBeNull();
  });

  it('picks the finest interval still inside the 5000-candle window', () => {
    expect(intervalFor(NOW - 3 * 86_400_000, NOW)?.key).toBe('5m');
    expect(intervalFor(NOW - 30 * 86_400_000, NOW)?.key).toBe('15m');
    expect(intervalFor(NOW - 100 * 86_400_000, NOW)?.key).toBe('1h');
    expect(intervalFor(NOW - 500 * 86_400_000, NOW)?.key).toBe('4h');
    expect(intervalFor(NOW - 1000 * 86_400_000, NOW)).toBeNull();
  });

  it('measures MAE/MFE relative to the perp path, removing basis', () => {
    const cs = candles([[2000, 2004, 1995, 2002], [2002, 2015, 2001, 2012], [2012, 2013, 2006, 2008], [2008, 2011, 2007, 2010], [2010, 2030, 2010, 2030]]);
    const e = measure(trade({}), set(cs), NOW);
    expect(isMeasured(e)).toBe(true);
    const x = e as Excursion;
    // ۴ کندل داخل معامله (کندل پنجم بعد از بستن است)
    expect(x.path).toHaveLength(4);
    expect(x.mfe).toBeCloseTo((2025 / 2010) - 1, 6);
    expect(x.mae).toBeCloseTo(1 - 2005 / 2010, 6);
    expect(x.realized).toBeCloseTo(0.005, 6);
    // ارزش اسمی مؤثر از سود ÷ حرکت
    expect(x.notional).toBeCloseTo(100_000, 0);
  });

  it('short trades flip favourable and adverse', () => {
    const cs = candles([[2000, 2004, 1990, 1992], [1992, 1996, 1985, 1990], [1990, 1991, 1988, 1990]]);
    const x = measure(trade({ direction: 'short', exitPx: 1990, grossPnl: 500, closeTime: T0 + 3 * H }), set(cs), NOW) as Excursion;
    expect(x.mfe).toBeCloseTo(1 - 1995 / 2010, 6);
    expect(x.mae).toBeCloseTo(2014 / 2010 - 1, 6);
  });

  it('reports why a trade was not measured', () => {
    expect(measure(trade({ symbol: 'GBPJPY' }), undefined, NOW)).toMatchObject({ reason: 'no-source' });
    expect(measure(trade({ openTime: NOW - 1000 * 86_400_000, closeTime: NOW - 999 * 86_400_000 }), undefined, NOW)).toMatchObject({ reason: 'too-old' });
    expect(measure(trade({ closeTime: T0 + H / 2 }), set(candles([[2000, 2001, 1999, 2000]])), NOW)).toMatchObject({ reason: 'too-short' });
    expect(measure(trade({ openTime: T0 - 10 * H }), set(candles([[2000, 2001, 1999, 2000]])), NOW)).toMatchObject({ reason: 'too-old' });
  });

  it('drops the weekend gap for MetaTrader trades only', () => {
    expect(inWeekendGap(Date.UTC(2026, 9, 23, 22))).toBe(true); // جمعه ۲۲:۰۰
    expect(inWeekendGap(Date.UTC(2026, 9, 24, 12))).toBe(true); // شنبه
    expect(inWeekendGap(Date.UTC(2026, 9, 25, 22))).toBe(false); // یکشنبه ۲۲:۰۰
    const fri = Date.UTC(2026, 9, 23, 18);
    const cs: Candle[] = Array.from({ length: 60 }, (_, i) => ({ t: fri + i * H, o: 2000, h: 2001, l: 1999, c: 2000 }));
    cs[20] = { ...cs[20], l: 1900 }; // شنبه: فقط پرپ ۲۴ ساعته
    const t = trade({ openTime: fri, closeTime: fri + 59 * H, exitPx: 2000, grossPnl: 0, netPnl: 0 });
    expect((measure(t, set(cs), NOW) as Excursion).mae).toBeLessThan(0.001);
    expect((measure({ ...t, venue: 'hyperliquid', symbol: 'xyz:GOLD' }, set(cs), NOW) as Excursion).mae).toBeGreaterThan(0.04);
  });

  it('simulates stop, target and breakeven candle by candle (stop wins ties)', () => {
    const e = { realized: 0.01, path: [[0.002, 0.001], [0.006, 0.002], [0.003, 0.004], [0.012, 0.001]] } as Excursion;
    expect(simulate(e, { stop: null, target: null, breakevenAt: null })).toBe(0.01);
    expect(simulate(e, { stop: 0.003, target: null, breakevenAt: null })).toBe(-0.003);
    expect(simulate(e, { stop: null, target: 0.005, breakevenAt: null })).toBe(0.005);
    expect(simulate(e, { stop: null, target: null, breakevenAt: 0.005 })).toBe(0);
    const tie = { realized: 0.01, path: [[0.01, 0.01]] } as Excursion;
    expect(simulate(tie, { stop: 0.005, target: 0.005, breakevenAt: null })).toBe(-0.005);
    const d = ruleDelta([{ ...e, notional: 100_000 }], { stop: 0.003, target: null, breakevenAt: null });
    expect(d.changed).toBe(1);
    expect(d.delta).toBeCloseTo(-1300, 6);
  });

  it('summarizes per symbol and gates suggestions on sample size', () => {
    const mk = (win: boolean, i: number): Excursion => ({
      tradeId: String(i), symbol: 'XAUUSD', coin: 'xyz:GOLD', direction: 'long', win, intervalMs: H,
      mae: win ? 0.002 + i * 0.0001 : 0.01, mfe: win ? 0.02 : 0.006, realized: win ? 0.008 : -0.01,
      entryPx: 2000, notional: 100_000, netPnl: win ? 800 : -1000,
      path: win ? [[0.001, 0.002 + i * 0.0001], [0.02, 0.001]] : [[0.006, 0.001], [0, 0.01]]
    });
    const xs = [...Array.from({ length: 12 }, (_, i) => mk(true, i)), ...Array.from({ length: 10 }, (_, i) => mk(false, 100 + i))];
    const [s] = summarize(xs);
    expect(s).toMatchObject({ symbol: 'XAUUSD', n: 22, winners: 12, losers: 10, enough: true, refPx: 2000 });
    expect(s.loserRealized).toBeCloseTo(0.01);
    expect(s.capture).toBeCloseTo(0.4);
    expect(s.losersOnceUp).toBe(0);
    // استاپ صدک ۹۰ برنده‌ها زیان ۱٪ بازنده‌ها را کوچک می‌کند
    expect(s.stop!.level).toBeLessThan(0.01);
    expect(s.stop!.delta).toBeGreaterThan(0);
    // هدف ۲٪ = MFE برنده‌ها → سود برنده‌ها بیشتر
    expect(s.target!.delta).toBeCloseTo(12 * 0.012 * 100_000, 0);
    expect(summarize(xs.slice(0, 15))[0].enough).toBe(false);
    expect(quantile([], 0.5)).toBeNull();
  });

  it('collects only the candle sets trades need and measures in bulk', () => {
    const ts = [trade({}), trade({ id: 'b', symbol: 'EURUSD', entryPx: 1.1, exitPx: 1.101 }), trade({ id: 'c', open: true, closeTime: null })];
    expect(candleNeeds(ts, NOW).map((n) => `${n.coin}|${n.interval.key}`)).toEqual(['xyz:GOLD|5m', 'xyz:EUR|5m']);
    const r = excursionsFor(ts, new Map(), NOW);
    expect(r.measured).toHaveLength(0);
    expect(r.unmeasured.map((u) => u.reason)).toEqual(['no-data', 'no-data']);
  });
});
