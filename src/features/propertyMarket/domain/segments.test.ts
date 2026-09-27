/**
 * سن بنا / متراژ / انواع قیمت + معادل دلاری
 */
import { describe, it, expect } from 'vitest';
import { ageBandOf, areaBandOf, buildingAgeYears, jalaliYearOf } from './segments';
import { buildSizeTypeMatrix, toListingViews, type FxInput } from '../service/propertyMarketService';
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
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 20, 21, 40].map(ageBandOf)).toEqual([
      'y0-1', 'y0-1', 'y2', 'y3', 'y4', 'y5', 'y6', 'y7', 'y8-10', 'y8-10', 'y11-20', 'y11-20', 'y21+', 'y21+'
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

const fxAt = (rate: number | null, future: number | null = rate, growth: number | null = null): FxInput => ({
  currentUsdRateToman: rate,
  futureUsdRateToman: future,
  propertyTomanGrowthPct: growth
});

describe('toListingViews / متراژ × نوع', () => {
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

  it('بازه‌های متراژ: ترتیب ثابت، بازه خالی/نامشخص حذف، میانگین هر نوع', () => {
    const rows = buildSizeTypeMatrix(views, fxAt(RATE), 1405);
    expect(rows.map((r) => r.key)).toEqual(['a80-100', 'a150-200']);
    const age1 = rows[0].cells.age1!;
    expect(age1.count).toBe(2);
    expect(age1.ppmToman).toBe(110_000_000);
    expect(age1.ppmUsd).toBeCloseTo(110_000_000 / RATE, 6);
    expect(age1.totalToman).toBe(9_900_000_000);
    // ۱۵۰ متری ۱۵ ساله در هیچ نوعی نیست
    expect(rows[1].count).toBe(1);
    expect(Object.keys(rows[1].cells)).toEqual([]);
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

import { ageFilterOfType, matchesPriceType, PRICE_TYPES } from './segments';
import { buildAreaTypeMatrix, scenarioActive } from '../service/propertyMarketService';

describe('انواع قیمت: کلید اول و ۱ تا ۷ سال ساخت', () => {
  it('ترتیب و برچسب ستون‌ها', () => {
    expect(PRICE_TYPES.map((t) => t.key)).toEqual(['first-key', 'age1', 'age2', 'age3', 'age4', 'age5', 'age6', 'age7']);
    expect(PRICE_TYPES.map((t) => t.label)).toEqual(['کلید اول', '۱ سال', '۲ سال', '۳ سال', '۴ سال', '۵ سال', '۶ سال', '۷ سال']);
    expect(['first-key', 'age1', 'age4'].map((t) => ageFilterOfType(t as never))).toEqual(['first-key', 'y0-1', 'y4']);
  });
  it('matchesPriceType', () => {
    const y = 1405;
    expect(matchesPriceType({ yearBuilt: 1405 }, 'age1', y)).toBe(true); // امسال
    expect(matchesPriceType({ yearBuilt: 1404 }, 'age1', y)).toBe(true);
    expect(matchesPriceType({ yearBuilt: 1403 }, 'age2', y)).toBe(true);
    expect(matchesPriceType({ yearBuilt: 1398 }, 'age7', y)).toBe(true);
    expect(matchesPriceType({ yearBuilt: 1397 }, 'age7', y)).toBe(false);
    expect(matchesPriceType({ yearBuilt: null }, 'age3', y)).toBe(false);
    expect(matchesPriceType({ yearBuilt: 1404, firstKey: true }, 'first-key', y)).toBe(true);
    expect(matchesPriceType({ yearBuilt: 1404, firstKey: null }, 'first-key', y)).toBe(false);
  });
  it('ماتریس مناطق: کل اهواز اول، خانه‌های هر نوع با میانگین تومان/دلار/تعداد', () => {
    const mk = (t: string, key: string, year: number | null, ppm: number, fk = false) => ({ ...l(t, 100, year, ppm), neighborhoodKey: key, firstKey: fk });
    const views = toListingViews(
      [mk('a', 'golestan', 1404, 100e6, true), mk('b', 'golestan', 1403, 90e6), mk('c', 'kianpars-east', 1398, 150e6), mk('d', 'kianpars-west', null, 140e6)],
      250_000,
      1405
    );
    const rows = buildAreaTypeMatrix(views, 'area', fxAt(250_000), 1405);
    expect(rows[0].key).toBe('__city__');
    expect(rows[0].count).toBe(4);
    expect(rows[0].cells['first-key']!.count).toBe(1);
    expect(rows[0].cells.age1!.ppmToman).toBe(100e6);
    expect(rows[0].cells.age1!.ppmUsd).toBe(400);
    expect(rows[0].cells.age2!.totalUsd).toBe(36000);
    expect(rows[0].cells.age7!.count).toBe(1);
    // سطح منطقه: شرقی/غربی کیانپارس در یک ردیف
    const kp = rows.find((r) => r.key === 'kianpars')!;
    expect(kp.count).toBe(2);
    expect(kp.cells.age7!.ppmToman).toBe(150e6);
    expect(kp.cells.age3).toBeUndefined();
    // سناریو غیرفعال → دلار آینده = دلار فعلی
    expect(scenarioActive(fxAt(250_000))).toBe(false);
    expect(rows[0].cells.age1!.futurePpmUsd).toBeCloseTo(400, 6);
  });

  it('سناریو: دلار آینده ۳۲۰ هزار و رشد تومانی ۱۰٪', () => {
    const views = toListingViews([{ ...l('a', 100, 1404, 100e6) }], 250_000, 1405);
    const fx = fxAt(250_000, 320_000, 10);
    expect(scenarioActive(fx)).toBe(true);
    // 110M / 320k = $343.75
    expect(buildAreaTypeMatrix(views, 'area', fx, 1405)[0].cells.age1!.futurePpmUsd).toBeCloseTo(343.75, 6);
  });
});

import { buildExactAreaRows, exactAreaRangeOf } from '../service/propertyMarketService';

describe('متراژ دقیق', () => {
  it('بازه‌ها: ۹۰ تا ۱۷۰ (شامل ۱۷۰) و ۱۷۱ تا ۳۳۰', () => {
    expect([89, 90, 170, 171, 330, 331].map(exactAreaRangeOf)).toEqual(['lt90', '90-170', '90-170', '171-330', '171-330', 'gt330']);
  });
  it('هر متراژ یک ردیف (گرد به متر)، صعودی، با میانگین تومان/دلار', () => {
    const views = toListingViews([l('a', 120, 1400, 100e6), l('b', 120.4, 1400, 80e6), l('c', 95, 1400, 90e6), l('d', null, 1400, 70e6)], 250_000, 1405);
    const rows = buildExactAreaRows(views, 250_000);
    expect(rows.map((r) => r.areaSqm)).toEqual([95, 120]);
    const r120 = rows[1];
    expect(r120.count).toBe(2);
    expect(r120.ppmToman).toBe(90e6);
    expect(r120.ppmUsd).toBe(360);
    expect(r120.range).toBe('90-170');
  });
});
