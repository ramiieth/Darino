import { describe, expect, it } from 'vitest';
import type { ClassifiedTrade } from './types';
import type { MtTrade } from './metatrader';
import type { SymbolExcursions } from './excursions';
import { calcForex, contractSizeFor, isForexSymbol, pipSize, quoteToUsd, suggest } from './forex';

const base = { spreadPips: 0, commissionPerLot: 0, leverage: 100 };

describe('forex sizing', () => {
  it('EURUSD: 1% of $5,000 with a 28-pip stop → 0.17 lots, never above the risk cap', () => {
    const c = calcForex({ symbol: 'EURUSD', direction: 'long', entry: 1.085, stop: 1.0822, target: 1.0905, contractSize: 100_000, capital: 5000, riskPct: 1, ...base });
    expect(c.stopPips).toBeCloseTo(28, 6);
    expect(c.targetPips).toBeCloseTo(55, 6);
    expect(c.pipValuePerLot).toBeCloseTo(10, 9);
    expect(c.lots).toBeCloseTo(0.17, 9);
    expect(c.riskUsd).toBeCloseTo(47.6, 6);
    expect(c.riskUsd!).toBeLessThanOrEqual(50);
    expect(c.rewardUsd).toBeCloseTo(93.5, 6);
    expect(c.rr).toBeCloseTo(93.5 / 47.6, 6);
    expect(c.margin).toBeCloseTo((0.17 * 100_000 * 1.085) / 100, 6);
    expect(c.units).toBeCloseTo(17_000, 6);
    expect(c.problems).toEqual([]);
  });

  it('XAUUSD: spread and commission are included in risk', () => {
    const c = calcForex({ symbol: 'XAUUSD', direction: 'short', entry: 3880, stop: 3895, target: 3850, contractSize: 100, capital: 10_000, riskPct: 1, spreadPips: 3, commissionPerLot: 7, leverage: 100 });
    // ریسک هر لات = ۱۵×۱۰۰ + ۳×(۰٫۱×۱۰۰) + ۷ = ۱۵۳۷
    expect(c.pip).toBe(0.1);
    expect(c.stopPips).toBeCloseTo(150, 6);
    expect(c.lots).toBeCloseTo(0.06, 9);
    expect(c.riskUsd).toBeCloseTo(0.06 * 1537, 6);
    expect(c.rewardUsd).toBeCloseTo(0.06 * (3000 - 37), 6);
  });

  it('flags impossible or incomplete plans', () => {
    const tiny = calcForex({ symbol: 'XAUUSD', direction: 'long', entry: 3880, stop: 3800, target: 3900, contractSize: 100, capital: 500, riskPct: 1, ...base });
    expect(tiny.lots).toBeNull();
    expect(tiny.problems.join()).toContain('حداقل');
    const wrongSide = calcForex({ symbol: 'EURUSD', direction: 'long', entry: 1.08, stop: 1.09, target: 1.07, contractSize: 100_000, capital: 5000, riskPct: 1, ...base });
    expect(wrongSide.problems.length).toBeGreaterThanOrEqual(2);
    const noContract = calcForex({ symbol: 'UKOUSD', direction: 'long', entry: 80, stop: 79, target: 82, contractSize: null, capital: 5000, riskPct: 1, ...base });
    expect(noContract.lots).toBeNull();
    expect(noContract.problems.join()).toContain('Contract size');
    expect(calcForex({ symbol: 'USDJPY', direction: 'long', entry: 150, stop: 149.5, target: 151, contractSize: 100_000, capital: 5000, riskPct: 1, ...base }).problems.join()).toContain('دلار نیست');
  });

  it('pip sizes, contract sizes and symbol detection', () => {
    expect(pipSize('EURUSD')).toBe(0.0001);
    expect(pipSize('USDJPY')).toBe(0.01);
    expect(pipSize('XAUUSD')).toBe(0.1);
    expect(pipSize('UKOUSD')).toBe(0.01);
    expect(isForexSymbol('XAUUSD')).toBe(true);
    expect(isForexSymbol('BTC')).toBe(false);
    const mt = [{ symbol: 'UKOUSD', contractSize: 1000, closeTime: 2 }, { symbol: 'UKOUSD', contractSize: 100, closeTime: 1 }] as MtTrade[];
    expect(contractSizeFor('UKOUSD', mt)).toEqual({ size: 1000, source: 'statement' });
    expect(contractSizeFor('UKOUSD', [])).toEqual({ size: null, source: null });
    expect(contractSizeFor('XAUUSD', [])).toEqual({ size: 100, source: 'default' });
    expect(contractSizeFor('EURUSD', [])).toEqual({ size: 100_000, source: 'default' });
  });
});

describe('suggestion from own history', () => {
  const ex = { symbol: 'XAUUSD', n: 25, enough: true, stop: { level: 0.004, delta: 0, changed: 0 }, target: { level: 0.008, delta: 0, changed: 0 } } as SymbolExcursions;
  const t = (dir: 'long' | 'short', net: number, i: number): ClassifiedTrade => ({ id: String(i), base: 'XAU', direction: dir, netPnl: net, book: 'directional', open: false, truncated: false, openTime: Date.UTC(2026, 9, 1, 14) + i * 86_400_000 } as ClassifiedTrade);

  it('turns MAE/MFE levels into stop and target prices for the chosen side', () => {
    const long = suggest({ symbol: 'XAUUSD', direction: 'long', entry: 4000, now: Date.UTC(2026, 9, 31, 14), tz: 'UTC' }, ex, []);
    expect(long.stop).toBeCloseTo(3984, 6);
    expect(long.target).toBeCloseTo(4032, 6);
    expect(long.enough).toBe(true);
    const short = suggest({ symbol: 'XAUUSD', direction: 'short', entry: 4000, now: 0, tz: 'UTC' }, ex, []);
    expect(short.stop).toBeCloseTo(4016, 6);
    expect(short.target).toBeCloseTo(3968, 6);
  });

  it('warns when the chosen direction or hour has lost money for this trader', () => {
    const trades = [...Array.from({ length: 22 }, (_, i) => t('long', -20, i)), ...Array.from({ length: 22 }, (_, i) => t('short', 30, 100 + i))];
    const s = suggest({ symbol: 'XAUUSD', direction: 'long', entry: 4000, now: Date.UTC(2026, 9, 31, 14), tz: 'UTC' }, ex, trades);
    expect(s.direction).toMatchObject({ n: 22, expectancy: -20, winRate: 0 });
    expect(s.notes.join(' ')).toContain('ضرر');
    expect(s.notes.join(' ')).toContain('جهت مخالف');
    expect(s.hour!.n).toBe(44);
    expect(suggest({ symbol: 'XAUUSD', direction: 'long', entry: null, now: 0, tz: 'UTC' }, undefined, []).notes.join()).toContain('مسیر قیمت');
  });
});

describe('ارزش دلاری ارز دوم', () => {
  it('ین، دلارِ اول، پوند؛ ریسک و ارزش پیپ GBPJPY به دلار', () => {
    expect(quoteToUsd('EURUSD', 1.1, {})).toBe(1);
    expect(quoteToUsd('USDJPY', 160, {})).toBeCloseTo(1 / 160);
    expect(quoteToUsd('GBPJPY', 210, { USDJPY: 160 })).toBeCloseTo(1 / 160);
    expect(quoteToUsd('EURGBP', 0.83, { GBPUSD: 1.3 })).toBe(1.3);
    expect(quoteToUsd('GBPJPY', 210, {})).toBeNull();
    const base = { symbol: 'GBPJPY', direction: 'long' as const, entry: 210, stop: 209.75, target: 210.5, contractSize: 100_000, capital: 10_000, riskPct: 1, leverage: 100, spreadPips: 0, commissionPerLot: 0 };
    const c = calcForex({ ...base, quoteUsd: 1 / 160 });
    // ارزش هر پیپ ≈ ۱۰۰۰ ین ÷ ۱۶۰ = ۶٫۲۵ دلار؛ ۲۵ پیپ استاپ؛ ۱۰۰ دلار ریسک → ۰٫۶۴ لات
    expect(c.pipValuePerLot).toBeCloseTo(6.25);
    expect(c.lots).toBeCloseTo(0.64);
    expect(c.problems.some((p) => p.includes('نرخ تبدیلش را نداریم'))).toBe(false);
    expect(calcForex(base).problems.some((p) => p.includes('نرخ تبدیلش را نداریم'))).toBe(true);
  });
});
