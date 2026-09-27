/**
 * PropertyMarketService — سناریوی دلار + ماتریس انواع قیمت از Snapshot
 */
import { describe, it, expect } from 'vitest';
import {
  CITY_ROW_KEY,
  applyPropertyGrowth,
  areaTypeMatrixFromSnapshot,
  fxInputFromScenario,
  futureUsdOf,
  scenarioActive
} from './propertyMarketService';
import type { AreaPriceStats, PropertyMarketSnapshot } from '../domain/types';

describe('futureUsdOf — سناریوی دلار آینده', () => {
  it('کیان‌پارس: 50M @ 100K = $500؛ آینده @ 120K = $416.67', () => {
    expect(futureUsdOf(50_000_000, { currentUsdRateToman: 100_000, futureUsdRateToman: 120_000 })).toBeCloseTo(416.6667, 3);
  });
  it('رشد تومانی +10٪: آینده 55M @ 125K = $440', () => {
    expect(
      futureUsdOf(50_000_000, { currentUsdRateToman: 100_000, futureUsdRateToman: 125_000, propertyTomanGrowthPct: 10 })
    ).toBeCloseTo(440, 6);
  });
  it('نرخ ناموجود → null (هرگز صفر/جعلی)', () => {
    expect(futureUsdOf(50_000_000, { currentUsdRateToman: null, futureUsdRateToman: null })).toBeNull();
    expect(futureUsdOf(null, { currentUsdRateToman: 100_000, futureUsdRateToman: 100_000 })).toBeNull();
  });
});

describe('fxInputFromScenario + applyPropertyGrowth + scenarioActive', () => {
  it('سناریوی خالی → نرخ آینده = نرخ فعلی و غیرفعال', () => {
    const fx = fxInputFromScenario(null, 100_000);
    expect(fx.futureUsdRateToman).toBe(100_000);
    expect(fx.propertyTomanGrowthPct).toBeNull();
    expect(scenarioActive(fx)).toBe(false);
  });
  it('نرخ آینده متفاوت یا رشد تومانی → فعال', () => {
    expect(scenarioActive(fxInputFromScenario({ futureUsdRateToman: 150_000, propertyTomanGrowthPct: null, updatedAt: 0 }, 100_000))).toBe(true);
    expect(scenarioActive(fxInputFromScenario({ futureUsdRateToman: null, propertyTomanGrowthPct: 5, updatedAt: 0 }, 100_000))).toBe(true);
  });
  it('اعمال رشد تومانی', () => {
    expect(applyPropertyGrowth(50_000_000, 10)).toBeCloseTo(55_000_000, 6);
    expect(applyPropertyGrowth(50_000_000, null)).toBe(50_000_000);
  });
});

describe('areaTypeMatrixFromSnapshot', () => {
  const st = (count: number, byType: AreaPriceStats['byType']): AreaPriceStats => ({
    medianTomanPerM2: 1,
    meanTomanPerM2: 1,
    p25TomanPerM2: 1,
    p75TomanPerM2: 1,
    listingCount: count,
    byType
  });
  const snap: PropertyMarketSnapshot = {
    id: 's',
    dateTs: 1,
    dateLabel: '',
    city: 'ahvaz',
    source: 'divar',
    fxRateAtSnapshotToman: 250_000,
    cityStats: st(10, { 'first-key': { count: 3, medianPpm: 90e6, meanPpm: 100e6, medianTotal: null, meanTotal: 10e9 } }),
    neighborhoodStats: [
      { neighborhoodKey: 'golestan', displayName: 'گلستان', stats: st(4, { age2: { count: 4, medianPpm: 70e6, meanPpm: 75e6, medianTotal: null, meanTotal: null } }) },
      { neighborhoodKey: 'kianpars-east', displayName: 'کیانپارس شرقی', stats: st(6, {}) }
    ],
    groupStats: [{ neighborhoodKey: 'kianpars', displayName: 'کیانپارس', stats: st(6, {}) }],
    cleaning: { raw: 0, normalized: 0, valid: 0, deduplicated: 0, outliersRemoved: 0, market: 10, rejectReasons: {} },
    createdAt: 1
  };

  it('کل اهواز اول؛ میانگین ذخیره‌شده (نه میانه) با نرخ فعلی', () => {
    const rows = areaTypeMatrixFromSnapshot(snap, 'area', { currentUsdRateToman: 250_000, futureUsdRateToman: 250_000 });
    expect(rows[0].key).toBe(CITY_ROW_KEY);
    expect(rows[0].cells['first-key']!.ppmToman).toBe(100e6);
    expect(rows[0].cells['first-key']!.ppmUsd).toBe(400);
    expect(rows[0].cells['first-key']!.totalUsd).toBe(40_000);
    // منطقه: گروه کیانپارس + گلستان مستقل؛ به ترتیب تعداد آگهی
    expect(rows.slice(1).map((r) => r.key)).toEqual(['kianpars', 'golestan']);
    expect(rows[2].cells.age2!.ppmToman).toBe(75e6);
  });
});
