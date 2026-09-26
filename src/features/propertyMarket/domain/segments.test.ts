/**
 * دسته‌بندی سن بنا / متراژ + معادل دلاری
 */
import { describe, it, expect } from 'vitest';
import { ageBandOf, areaBandOf, buildingAgeYears, jalaliYearOf } from './segments';
import { buildSegmentRows, toListingViews } from '../service/propertyMarketService';
import { resolveEffectiveRate } from '../presentation/UsdtRateField';
import type { PropertyMarketListing } from './types';

function l(token: string, area: number | null, year: number | null, ppm: number): PropertyMarketListing {
  return {
    token, url: '', city: 'ahvaz', cityId: '7', neighborhood: 'گلستان', neighborhoodKey: 'golestan',
    propertyKind: 'apartment', areaSqm: area, rooms: 2, yearBuilt: year, floor: 1,
    totalPriceToman: area ? area * ppm : null, pricePerSqmToman: ppm, parking: null, elevator: null,
    storage: null, balcony: null, title: null, listedAt: null, scrapedAt: 1, source: 'divar'
  };
}

describe('سن بنا', () => {
  it('سال جاری − سال ساخت؛ پیش‌فروش → ۰؛ نامعتبر → null', () => {
    expect(buildingAgeYears(1401, 1405)).toBe(4);
    expect(buildingAgeYears(1406, 1405)).toBe(0);
    expect(buildingAgeYears(null, 1405)).toBeNull();
    expect(buildingAgeYears(87, 1405)).toBeNull();
  });
  it('دسته‌ها دقیقاً ۱، ۲، ۳، ۴ سال و بازه‌ها', () => {
    expect([0, 1, 2, 3, 4, 5, 10, 11, 20, 21, 40].map(ageBandOf)).toEqual([
      'y0-1', 'y0-1', 'y2', 'y3', 'y4', 'y5-10', 'y5-10', 'y11-20', 'y11-20', 'y21+', 'y21+'
    ]);
    expect(ageBandOf(null)).toBe('unknown');
  });
  it('سال شمسی', () => {
    expect(jalaliYearOf(Date.parse('2026-09-26T12:00:00Z'))).toBe(1405);
    expect(jalaliYearOf(Date.parse('2026-03-10T12:00:00Z'))).toBe(1404);
    expect(jalaliYearOf(Date.parse('2026-03-25T12:00:00Z'))).toBe(1405);
  });
});

describe('متراژ', () => {
  it('مرزها', () => {
    expect([45, 60, 79.5, 80, 100, 119, 120, 150, 199, 200, 400].map(areaBandOf)).toEqual([
      'a0-60', 'a60-80', 'a60-80', 'a80-100', 'a100-120', 'a100-120', 'a120-150', 'a150-200', 'a150-200', 'a200+', 'a200+'
    ]);
    expect(areaBandOf(null)).toBe('unknown');
    expect(areaBandOf(0)).toBe('unknown');
  });
});

describe('toListingViews / buildSegmentRows', () => {
  const RATE = 233_000;
  const views = toListingViews(
    [l('a', 90, 1404, 100_000_000), l('b', 90, 1404, 120_000_000), l('c', 150, 1390, 60_000_000), l('d', null, null, 80_000_000)],
    RATE,
    1405
  );

  it('معادل دلاری هر آگهی (هر متر و کل) با نرخ تتر', () => {
    const a = views.find((v) => v.token === 'a')!;
    expect(a.ageYears).toBe(1);
    expect(a.ageBand).toBe('y0-1');
    expect(a.areaBand).toBe('a80-100');
    expect(a.pricePerSqmUsd).toBeCloseTo(100_000_000 / RATE, 6);
    expect(a.totalPriceUsd).toBeCloseTo((90 * 100_000_000) / RATE, 6);
    expect(views.find((v) => v.token === 'd')!.totalPriceUsd).toBeNull();
  });

  it('بدون نرخ → دلار null (نه صفر)', () => {
    const v = toListingViews([l('x', 90, 1400, 1e8)], null, 1405)[0];
    expect(v.pricePerSqmUsd).toBeNull();
    expect(v.totalPriceUsd).toBeNull();
  });

  it('ردیف‌های سن بنا: ترتیب ثابت، نامشخص آخر، میانه‌ها و سهم', () => {
    const rows = buildSegmentRows(views, 'age', RATE);
    expect(rows.map((r) => r.key)).toEqual(['y0-1', 'y11-20', 'unknown']);
    const r0 = rows[0];
    expect(r0.count).toBe(2);
    expect(r0.medianPpmToman).toBe(110_000_000);
    expect(r0.medianPpmUsd).toBeCloseTo(110_000_000 / RATE, 6);
    expect(r0.medianTotalToman).toBe(9_900_000_000);
    expect(r0.medianTotalUsd).toBeCloseTo(9_900_000_000 / RATE, 6);
    expect(r0.sharePct).toBe(50);
  });

  it('ردیف‌های متراژ', () => {
    const rows = buildSegmentRows(views, 'area', RATE);
    expect(rows.map((r) => r.key)).toEqual(['a80-100', 'a150-200', 'unknown']);
  });
});

describe('resolveEffectiveRate', () => {
  const now = 1_000_000_000;
  it('تتر زنده مقدم است', () => {
    const r = resolveEffectiveRate({ quote: { priceToman: 233000, source: 'wallex', fetchedAt: now - 1000 }, status: 'live' }, 1_480_000, now);
    expect(r).toMatchObject({ rate: 233000, kind: 'live', source: 'wallex' });
  });
  it('تتر قدیمی → stale (هنوز تتر، نه نرخ دستی)', () => {
    const r = resolveEffectiveRate({ quote: { priceToman: 230000, source: 'bitpin', fetchedAt: now - 3_600_000 }, status: 'live' }, 1_480_000, now);
    expect(r).toMatchObject({ rate: 230000, kind: 'stale' });
  });
  it('بدون تتر → نرخ دستی با برچسب manual؛ هیچ‌کدام → none', () => {
    expect(resolveEffectiveRate({ quote: null, status: 'unavailable' }, 1_480_000, now)).toMatchObject({ rate: 1_480_000, kind: 'manual' });
    expect(resolveEffectiveRate({ quote: null, status: 'unavailable' }, null, now)).toMatchObject({ rate: null, kind: 'none' });
  });
});
