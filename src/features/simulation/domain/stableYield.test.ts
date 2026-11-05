import { describe, expect, it } from 'vitest';
import { dayRate, pickStableMarkets, simulateYield, stableBalance, type ChartPoint, type PoolRow } from './stableYield';

const pool = (p: Partial<PoolRow>): PoolRow => ({ pool: 'x', project: 'aave-v3', chain: 'Ethereum', symbol: 'USDC', tvlUsd: 100e6, apy: 5, apyBase: 5, apyReward: 0, stablecoin: true, exposure: 'single', outlier: false, poolMeta: null, ...p });
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 1);
const pt = (day: number, apyBase: number | null, apyReward: number | null = null): ChartPoint => ({ timestamp: new Date(T0 + day * DAY + 3_600_000).toISOString(), apy: (apyBase ?? 0) + (apyReward ?? 0), apyBase, apyReward });

describe('pickStableMarkets', () => {
  it('فقط دلار بازده‌دار تک‌دارایی با TVL کافی؛ هر محصول یک بار با بزرگ‌ترین شبکه', () => {
    const m = pickStableMarkets([
      pool({ pool: 'a', project: 'sky-lending', symbol: 'SUSDS', tvlUsd: 4e9 }),
      pool({ pool: 'b', project: 'sky-lending', symbol: 'SUSDS', chain: 'Arbitrum', tvlUsd: 4e8 }),
      pool({ pool: 'c', symbol: 'STEAKEURCV' }),
      pool({ pool: 'd', exposure: 'multi' }),
      pool({ pool: 'e', tvlUsd: 1e6 }),
      pool({ pool: 'f', apy: 0, apyBase: 0 }),
      pool({ pool: 'g', project: 'hyperliquid-hlp' }),
      pool({ pool: 'h', project: 'ethena-usde', symbol: 'SUSDE', poolMeta: '7 days unstaking' }),
      pool({ pool: 'i', project: 'blackrock-buidl', symbol: 'BUIDL' })
    ]);
    expect(m.map((x) => x.pool)).toEqual(['a', 'h', 'i']);
    expect(m.find((x) => x.pool === 'h')).toMatchObject({ kind: 'synthetic', lockup: '۷ روز' });
    expect(m.find((x) => x.pool === 'i')).toMatchObject({ kind: 'treasury', restricted: true });
    expect(m.find((x) => x.pool === 'a')).toMatchObject({ kind: 'savings', direct: null });
  });

  it('بازار مستقیم یو اس دی سی', () => {
    expect(pickStableMarkets([pool({})])[0]).toMatchObject({ direct: 'USDC', kind: 'lending' });
  });
});

describe('dayRate', () => {
  it('پاداش پیش‌فرض حساب نمی‌شود؛ پاداش‌محض بدون پایه = نامعلوم', () => {
    expect(dayRate(pt(0, 4, 2), false)).toBe(4);
    expect(dayRate(pt(0, 4, 2), true)).toBe(6);
    expect(dayRate({ timestamp: '', apy: 3, apyBase: null, apyReward: 3 }, false)).toBeNull();
    expect(dayRate({ timestamp: '', apy: 3, apyBase: null, apyReward: null }, false)).toBe(3);
  });
});

describe('simulateYield', () => {
  it('۳۶۵ روز با ۵٪ ثابت ≈ ۵.۱۳٪ (مرکب روزانه)', () => {
    const chart = Array.from({ length: 366 }, (_, i) => pt(i, 5));
    const s = simulateYield(chart, T0, T0 + 365 * DAY, false);
    expect(s.growth).toBeCloseTo(Math.pow(1 + 0.05, 1), 4);
    expect(s.coveredDays).toBe(365);
    expect(s.partial).toBe(false);
    expect(s.avgApy).toBeCloseTo(5, 6);
    expect(s.daily).toHaveLength(365);
  });

  it('نبود داده چندروزه با آخرین نرخ پر می‌شود؛ تاریخچهٔ دیرتر از شروع = ناقص', () => {
    const chart = [pt(0, 10), pt(3, 10), pt(4, 10)];
    expect(simulateYield(chart, T0, T0 + 5 * DAY, false).coveredDays).toBe(5);
    const late = simulateYield([pt(30, 5), pt(31, 5)], T0, T0 + 32 * DAY, false);
    expect(late.partial).toBe(true);
    expect(late.firstDay).toBe(T0 + 30 * DAY);
    expect(late.coveredDays).toBe(2);
  });

  it('داده پرت محدود می‌شود', () => {
    const s = simulateYield([pt(0, 100000)], T0, T0 + DAY, false);
    expect(s.growth).toBeCloseTo(Math.pow(3, 1 / 365), 8);
  });
});

describe('stableBalance', () => {
  it('فقط موجودی کیف پول تتر و یو اس دی سی', () => {
    expect(stableBalance([
      { symbol: 'USDT', value: 1000, type: 'wallet' },
      { symbol: 'usdc', value: 250.5, type: 'wallet' },
      { symbol: 'USDC', value: 999, type: 'deposit' },
      { symbol: 'ETH', value: 5000, type: 'wallet' }
    ])).toEqual({ usdt: 1000, usdc: 250.5 });
  });
});
