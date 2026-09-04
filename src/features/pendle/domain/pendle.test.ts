/**
 * تست‌های دامنه Pendle — محاسبات APY، نوع بازار، تخفیف PT، سررسید
 */
import { describe, expect, it } from 'vitest';
import {
  sumApyCategories,
  marketTypeOf,
  daysUntil,
  toMarketView,
  sortValue,
  chainName,
  fmtExpiry,
  type RawPendleMarket
} from '@/features/pendle/domain/pendle';

const baseMarket = (over: Partial<RawPendleMarket> = {}): RawPendleMarket => ({
  name: 'Test Market',
  protocol: 'Test Protocol',
  address: '0xabc',
  chainId: 1,
  expiry: '2026-12-31T00:00:00.000Z',
  pt: '1-0xpt',
  yt: '1-0xyt',
  sy: '1-0xsy',
  underlyingAsset: '1-0xunder',
  timestamp: '',
  details: {
    liquidity: 1000,
    totalTvl: 2000,
    tradingVolume: 500,
    underlyingApy: 0.05,
    swapFeeApy: 0.01,
    pendleApy: 0.02,
    ytFloatingApy: 0.1,
    impliedApy: 0.15,
    feeRate: 0.001,
    aggregatedApy: 0.2,
    maxBoostedApy: 0.3,
    ytRoi: 1,
    ptRoi: 0.5
  },
  lpApyBreakdown: { categories: [] },
  ytApyBreakdown: { categories: [] },
  lpRewardApyBreakdown: { categories: [] },
  underlyingRewardApyBreakdown: { categories: [] },
  rewardTokens: [],
  points: {},
  categoryIds: [],
  ...over
});

describe('Pendle domain', () => {
  it('جمع APY دسته‌ها', () => {
    expect(sumApyCategories([{ apy: 0.1 }, { apy: 0.2 }])).toBeCloseTo(0.3, 6);
    expect(sumApyCategories([])).toBeNull();
    expect(sumApyCategories(undefined)).toBeNull();
  });

  it('تشخیص نوع بازار (داده‌محور)', () => {
    expect(marketTypeOf(baseMarket())).toBe('LP'); // همه فیلدها دارند → LP
    expect(marketTypeOf(baseMarket({ details: { ...baseMarket().details, ytFloatingApy: 0, impliedApy: 0, underlyingApy: 0 } }))).toBe('LP');
  });

  it('روز مانده تا سررسید', () => {
    const future = new Date(Date.now() + 10 * 86_400_000).toISOString();
    expect(daysUntil(future)).toBe(10);
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil('bad-date')).toBeNull();
  });

  it('تبدیل به نمای بازار با درصدها و تخفیف PT', () => {
    const m = toMarketView(
      baseMarket({
        lpApyBreakdown: { categories: [{ label: 'A', apy: 0.05, items: [] }, { label: 'B', apy: 0.03, items: [] }] }
      }),
      { '1-0xpt': 0.9, '1-0xunder': 1.0 }
    );
    expect(m.fixedApyPct).toBeCloseTo(15, 6); // 0.15*100
    expect(m.underlyingApyPct).toBeCloseTo(5, 6);
    expect(m.lpApyPct).toBeCloseTo(0.08, 6);
    expect(m.ptDiscountPct).toBeCloseTo(10, 6); // (1 - 0.9/1.0)*100
    expect(m.daysToExpiry).not.toBeNull();
  });

  it('تخفیف PT با قیمت ناموجود → null', () => {
    const m = toMarketView(baseMarket(), {});
    expect(m.ptDiscountPct).toBeNull();
  });

  it('مرتب‌سازی: TVL و سررسید', () => {
    const a = toMarketView(baseMarket({ details: { ...baseMarket().details, totalTvl: 100 } }), {});
    const b = toMarketView(baseMarket({ details: { ...baseMarket().details, totalTvl: 500 } }), {});
    expect(sortValue(b, 'tvl')).toBeGreaterThan(sortValue(a, 'tvl'));
    // maturity: نزدیک‌تر = مقدار کمتر
    const near = toMarketView(baseMarket({ expiry: new Date(Date.now() + 5 * 86_400_000).toISOString() }), {});
    const far = toMarketView(baseMarket({ expiry: new Date(Date.now() + 300 * 86_400_000).toISOString() }), {});
    expect(sortValue(near, 'maturity')).toBeLessThan(sortValue(far, 'maturity'));
  });

  it('نام زنجیره و تاریخ', () => {
    expect(chainName(1)).toBe('اتریوم');
    expect(chainName(999999)).toContain('999999');
    expect(fmtExpiry(null)).toBe('—');
    expect(fmtExpiry('2026-12-31T00:00:00.000Z')).not.toBe('—');
  });
});
