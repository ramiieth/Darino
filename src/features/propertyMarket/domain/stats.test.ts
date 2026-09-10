/**
 * آمار بازار — میانه/میانگین/صدک (§۱۹ مأموریت)
 */
import { describe, it, expect } from 'vitest';
import { median, mean, percentile, buildAreaStats, buildCityStats, buildNeighborhoodStats } from './stats';
import type { PropertyMarketListing } from './types';

function listing(ppm: number | null, nbKey: string | null = 'a'): PropertyMarketListing {
  return {
    token: `t-${ppm}-${nbKey}-${Math.random()}`,
    url: '',
    city: 'ahvaz',
    cityId: null,
    neighborhood: nbKey,
    neighborhoodKey: nbKey,
    propertyKind: 'apartment',
    areaSqm: 100,
    rooms: 2,
    yearBuilt: 1400,
    floor: 3,
    totalPriceToman: ppm !== null ? ppm * 100 : null,
    pricePerSqmToman: ppm,
    parking: null,
    elevator: null,
    storage: null,
    balcony: null,
    title: null,
    listedAt: null,
    scrapedAt: 1,
    source: 'divar'
  };
}

describe('median / mean / percentile', () => {
  it('میانه فرد/زوج', () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it('داده خالی → null', () => {
    expect(median([])).toBeNull();
    expect(mean([])).toBeNull();
    expect(percentile([], 50)).toBeNull();
  });
  it('میانگین', () => {
    expect(mean([10, 20, 30])).toBeCloseTo(20, 9);
  });
  it('صدک‌ها روی داده ساده', () => {
    const v = [10, 20, 30, 40, 50];
    expect(percentile(v, 25)).toBe(20);
    expect(percentile(v, 50)).toBe(30);
    expect(percentile(v, 75)).toBe(40);
  });
  it('buildAreaStats — شمارش فقط مقادیر معتبر', () => {
    const s = buildAreaStats([50_000_000, 60_000_000, Number.NaN]);
    expect(s.listingCount).toBe(2);
    expect(s.medianTomanPerM2).toBeCloseTo(55_000_000, 6);
  });
});

describe('city / neighborhood aggregation', () => {
  it('میانه شهر روی همه آگهی‌ها (وزن آگهی)', () => {
    const ls = [listing(30e6), listing(40e6), listing(50e6, 'b'), listing(90e6, 'b')];
    const city = buildCityStats(ls);
    expect(city.listingCount).toBe(4);
    expect(city.medianTomanPerM2).toBeCloseTo(45e6, 6);
  });
  it('آمار محله فقط همان محله', () => {
    const ls = [listing(30e6, 'a'), listing(40e6, 'a'), listing(100e6, 'b')];
    const nb = buildNeighborhoodStats(ls, 'a');
    expect(nb.listingCount).toBe(2);
    expect(nb.medianTomanPerM2).toBeCloseTo(35e6, 6);
  });
  it('قیمت‌های null/نامعتبر نادیده گرفته می‌شوند', () => {
    const ls = [listing(null, 'a'), listing(50e6, 'a')];
    const nb = buildNeighborhoodStats(ls, 'a');
    expect(nb.listingCount).toBe(1);
  });
});
