import { describe, expect, it } from 'vitest';
import {
  compareMarket, endpointOf, inflationAnalysis, overview, realReturn, returnAnalysis, summarize, twr, valueAt, xirr, yearlyRows, DAY_MS
} from './engine';
import { activeMarkets, analyzePeriod, geminiPayload } from './analysis';
import { BASE_MARKETS } from './markets';
import { parseBlsCpi, parseHlCandles, parseTgju, parseWorldBank, parseYahooChart } from './parsers';
import type { ExternalFlow, PerfSettings, Series, ValueRecord } from './types';

// ⚠️ اعداد زیر فقط ورودی آزمون هستند (نه داده‌ای که در اپ ذخیره شود)
const D = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 8);
const rec = (id: string, ts: number, usd: number, rate: number | null): ValueRecord => ({
  id, dateTs: ts, usd, rateToman: rate, rateSource: rate ? 'manual' : null, toman: rate ? usd * rate : null, note: '', origin: 'manual', createdAt: ts, updatedAt: ts
});
const series = (id: string, pts: [number, number][], frequency: Series['frequency'] = 'daily', unit: Series['unit'] = 'usd'): Series => ({
  id, points: pts, unit, frequency, source: 'test', fetchedAt: 0
});
const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);
const def = (id: string) => BASE_MARKETS.find((m) => m.id === id)!;

describe('valueAt', () => {
  const daily = series('btc', [[day(2025, 1, 1), 100], [day(2025, 1, 3), 110]]);
  it('daily: last point on/before date within tolerance', () => {
    expect(valueAt(daily, D(2025, 1, 2))?.value).toBe(100);
    expect(valueAt(daily, D(2025, 1, 3))?.value).toBe(110);
    expect(valueAt(daily, D(2025, 1, 12))?.value).toBe(110);
    expect(valueAt(daily, D(2025, 2, 1))).toBeNull();
    expect(valueAt(daily, D(2024, 12, 1))).toBeNull();
  });
  it('annual: geometric interpolation, no extrapolation', () => {
    const a = series('cpi', [[day(2024, 7, 1), 100], [day(2025, 7, 1), 144]], 'annual', 'index');
    const mid = valueAt(a, day(2025, 1, 1))!;
    expect(mid.interpolated).toBe(true);
    expect(mid.value).toBeGreaterThan(119);
    expect(mid.value).toBeLessThan(121);
    expect(valueAt(a, day(2025, 12, 1))).toBeNull();
  });
  it('snapshot: accepts a point up to 15 days after', () => {
    const s = series('car', [[day(2025, 3, 10), 1000]], 'snapshot', 'toman');
    expect(valueAt(s, D(2025, 3, 1))?.value).toBe(1000);
    expect(valueAt(s, D(2025, 2, 1))).toBeNull();
  });
});

describe('overview', () => {
  it('is null when nothing is recorded (empty first run)', () => {
    expect(overview([])).toBeNull();
  });
  it('changes vs previous, one year, max/min', () => {
    const rs = [rec('a', D(2025, 1, 10), 30_000, 80_000), rec('b', D(2026, 1, 12), 36_000, 120_000), rec('c', D(2026, 2, 13), 34_000, 130_000)];
    const o = overview(rs)!;
    expect(o.latest.id).toBe('c');
    expect(o.changeUsd).toBe(-2000);
    expect(o.changeToman).toBe(34_000 * 130_000 - 36_000 * 120_000);
    expect(o.yearBase?.id).toBe('a');
    expect(o.yearChangePctUsd).toBeCloseTo(34 / 30 - 1, 10);
    expect(o.max.id).toBe('b');
    expect(o.min.id).toBe('a');
  });
  it('ignores soft-deleted records', () => {
    const rs = [rec('a', D(2025, 1, 1), 1, 1), { ...rec('b', D(2025, 2, 1), 2, 1), deleted: true }];
    expect(overview(rs)!.count).toBe(1);
  });
});

describe('compareMarket', () => {
  const s = endpointOf(rec('s', D(2025, 1, 1), 10_000, 80_000));
  const e = endpointOf(rec('e', D(2026, 1, 1), 12_000, 120_000));
  it('usd market: same capital, same dates', () => {
    const r = compareMarket(def('btc'), series('btc', [[day(2025, 1, 1), 50], [day(2026, 1, 1), 100]]), s, e);
    expect(r.status).toBe('ok');
    expect(r.endUsd).toBe(20_000);
    expect(r.endToman).toBe(20_000 * 120_000);
    expect(r.returnUsd).toBe(1);
    expect(r.vsPortfolioUsd).toBe(-8000);
    expect(r.opportunityUsd).toBe(8000);
  });
  it('toman market: converts start capital with that day rate', () => {
    const r = compareMarket(def('ir_gold18'), series('g', [[day(2025, 1, 1), 4_000_000], [day(2026, 1, 1), 10_000_000]], 'daily', 'toman'), s, e);
    expect(r.startToman).toBe(800_000_000);
    expect(r.endToman).toBe(2_000_000_000);
    expect(r.endUsd).toBeCloseTo(2_000_000_000 / 120_000, 6);
    expect(r.returnToman).toBeCloseTo(1.5, 10);
  });
  it('no data → insufficient, never a number', () => {
    const r = compareMarket(def('btc'), series('btc', [[day(2025, 6, 1), 50], [day(2026, 1, 1), 100]]), s, e);
    expect(r.status).toBe('insufficient');
    expect(r.endUsd).toBeNull();
    expect(r.reason).toContain('داده کافی موجود نیست');
  });
  it('market with no series yet → insufficient', () => {
    expect(compareMarket(def('spx'), undefined, s, e).status).toBe('insufficient');
  });
  it('toman market without start rate is insufficient', () => {
    const s2 = endpointOf(rec('s', D(2025, 1, 1), 10_000, null));
    const r = compareMarket(def('ir_sekee'), series('k', [[day(2025, 1, 1), 1], [day(2026, 1, 1), 2]]), s2, e);
    expect(r.status).toBe('insufficient');
  });
  it('summary: best, beaten, lagged', () => {
    const rows = [
      compareMarket(def('btc'), series('btc', [[day(2025, 1, 1), 50], [day(2026, 1, 1), 100]]), s, e),
      compareMarket(def('eth'), series('eth', [[day(2025, 1, 1), 100], [day(2026, 1, 1), 90]]), s, e),
      compareMarket(def('spx'), undefined, s, e)
    ];
    const sm = summarize(rows);
    expect(sm.best?.id).toBe('btc');
    expect(sm.beaten.map((r) => r.id)).toEqual(['eth']);
    expect(sm.lagged.map((r) => r.id)).toEqual(['btc']);
    expect(sm.insufficient).toBe(1);
  });
});

describe('inflation', () => {
  it('real return formula', () => {
    expect(realReturn(0.5, 0.25)).toBeCloseTo(0.2, 10);
  });
  it('splits toman change into usd-value and fx effects (additive)', () => {
    const s = endpointOf(rec('s', D(2025, 1, 1), 10_000, 80_000));
    const e = endpointOf(rec('e', D(2026, 1, 1), 12_000, 120_000));
    const cpi = series('ir', [[day(2024, 12, 15), 100], [day(2026, 1, 15), 140]], 'monthly', 'index');
    const a = inflationAnalysis(s, e, { iranCpi: cpi });
    expect(a.fx!.fromRate + a.fx!.fromUsdValue).toBeCloseTo(a.fx!.total, 6);
    expect(a.fx!.fromRate).toBe(10_000 * 40_000);
    expect(a.iran).not.toBeNull();
    expect(a.realToman).toBeCloseTo(realReturn(a.nominalToman!, a.iran!.cumulative), 12);
    expect(a.us).toBeNull();
    expect(a.realUsd).toBeNull();
  });
});

describe('returns with cash flows', () => {
  const rs = [rec('a', D(2025, 1, 1), 10_000, 1), rec('b', D(2025, 7, 1), 21_000, 1), rec('c', D(2026, 1, 1), 22_000, 1)];
  const flows: ExternalFlow[] = [{ id: 'f', dateTs: D(2025, 7, 1) - DAY_MS, usd: 10_000, note: '', createdAt: 0, updatedAt: 0 }];
  it('TWR removes the effect of the deposit', () => {
    const r = twr(rs, flows)!;
    // زیربازهٔ اول ≈ +۱۰٪ (با وزن ناچیز واریز)، دوم ≈ +۴.۷٪
    expect(r).toBeGreaterThan(0.14);
    expect(r).toBeLessThan(0.16);
  });
  it('without confirmed flows only value change is reported', () => {
    const a = returnAnalysis(rs, 'a', 'c', flows, false)!;
    expect(a.valueChangeUsd).toBe(12_000);
    expect(a.twr).toBeNull();
    expect(a.xirr).toBeNull();
    expect(a.qualified).toBe(false);
  });
  it('with confirmed flows: TWR, XIRR and investment gain', () => {
    const a = returnAnalysis(rs, 'a', 'c', flows, true)!;
    expect(a.investmentGainUsd).toBe(2000);
    expect(a.twr).not.toBeNull();
    expect(a.xirr).not.toBeNull();
  });
  it('xirr of a simple doubling in one year ≈ 100%', () => {
    expect(xirr([{ ts: 0, amount: -100 }, { ts: 365 * DAY_MS, amount: 200 }])!).toBeCloseTo(1, 4);
  });
});

describe('yearlyRows', () => {
  it('missing years stay null', () => {
    const s = series('g', [[day(2024, 3, 20), 100], [day(2025, 3, 21), 150], [day(2025, 11, 1), 180]], 'daily', 'toman');
    const rows = yearlyRows(s, [2023, 2024, 2025], (y) => Date.UTC(y, 2, 21), day(2025, 11, 1));
    expect(rows[0].value).toBeNull();
    expect(rows[1].value).toBe(100);
    expect(rows[2].value).toBe(150);
    expect(rows[2].change).toBeCloseTo(0.5, 10);
    expect(rows[3].value).toBe(180);
  });
});

describe('analysis + gemini payload', () => {
  const settings: PerfSettings = { enabledMarkets: ['btc', 'car', 'property'], extraCoins: ['AAVE'], carModelId: null, carModelIds: [], manualPrices: [], neighborhoods: ['golestan'], flowsComplete: false, iranCpi: [] };
  it('builds markets incl. car without model as no-source', () => {
    const ms = activeMarkets(settings, { neighborhoods: { golestan: 'گلستان' } });
    expect(ms.map((m) => m.id)).toEqual(['car', 'btc', 'prop:golestan', 'coin:AAVE']);
    expect(ms.find((m) => m.id === 'car')!.kind).toBe('none');
  });
  it('payload carries only computed numbers and marks unqualified returns', () => {
    const rs = [rec('a', D(2025, 1, 1), 10_000, 80_000), rec('b', D(2026, 1, 1), 12_000, 120_000)];
    const ms = activeMarkets(settings, { neighborhoods: {} });
    const a = analyzePeriod(rs[0], rs[1], rs, [], settings, ms, { btc: series('btc', [[day(2025, 1, 1), 1], [day(2026, 1, 1), 2]]) });
    const p = geminiPayload(a, rs, [], () => 'j', D(2026, 1, 2));
    expect(p.returnQualified).toBe(false);
    expect(p.markets.find((m) => m.name === 'بیت‌کوین')?.returnUsd).toBe(1);
    expect(p.markets.find((m) => m.name === 'AAVE')?.status).toBe('insufficient');
    expect(p.history).toHaveLength(2);
  });
});

describe('parsers', () => {
  it('tgju rial → toman, ascending', () => {
    const pts = parseTgju({ data: [['', '', '', '1,200,000', '', '', '2025/01/02', ''], ['', '', '', '1,000,000', '', '', '2025/01/01', ''], ['x']] });
    expect(pts).toEqual([[day(2025, 1, 1), 100_000], [day(2025, 1, 2), 120_000]]);
  });
  it('hyperliquid candles', () => {
    expect(parseHlCandles([{ t: day(2025, 1, 1), c: '42.5' }, { t: 'x', c: '1' }])).toEqual([[day(2025, 1, 1), 42.5]]);
  });
  it('yahoo chart skips nulls', () => {
    const b = { chart: { result: [{ timestamp: [day(2025, 1, 1) / 1000 + 3600, day(2025, 1, 2) / 1000], indicators: { quote: [{ close: [10, null] }] } }] } };
    expect(parseYahooChart(b)).toEqual([[day(2025, 1, 1), 10]]);
  });
  it('bls monthly at mid-month, annual rows ignored', () => {
    const b = { Results: { series: [{ data: [{ year: '2026', period: 'M09', value: '336.9' }, { year: '2025', period: 'M13', value: '1' }] }] } };
    expect(parseBlsCpi(b)).toEqual([[Date.UTC(2026, 8, 15), 336.9]]);
  });
  it('world bank annual at mid-year, null values dropped', () => {
    expect(parseWorldBank([{}, [{ date: '2025', value: 4030.3 }, { date: '2026', value: null }]])).toEqual([[Date.UTC(2025, 6, 1), 4030.3]]);
  });
});
