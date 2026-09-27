/**
 * سن بنا / متراژ / انواع قیمت + معادل دلاری
 */
import { describe, it, expect } from 'vitest';
import { ageBandOf, areaBandOf, buildingAgeYears, jalaliYearOf } from './segments';
import { buildSizeTypeMatrix, toListingViews } from '../service/propertyMarketService';
import { resolveEffectiveRate } from '@/shared/store/usdtStore';
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
  it('مرزها — از ۹۰ متر (کمتر از ۹۰ در تحلیل نیست)', () => {
    expect([89, 90, 99.5, 100, 119, 120, 150, 199, 200, 400].map(areaBandOf)).toEqual([
      'unknown', 'a90-100', 'a90-100', 'a100-120', 'a100-120', 'a120-150', 'a150-200', 'a150-200', 'a200+', 'a200+'
    ]);
    expect(areaBandOf(null)).toBe('unknown');
    expect(areaBandOf(0)).toBe('unknown');
  });
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
    expect(a.areaBand).toBe('a90-100');
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
    const rows = buildSizeTypeMatrix(views, RATE, 1405);
    expect(rows.map((r) => r.key)).toEqual(['a90-100', 'a150-200']);
    const age1 = rows[0].cells.age1!;
    expect(age1.count).toBe(2);
    expect(age1.ppmToman).toBe(110_000_000);
    expect(age1.ppmUsd).toBeCloseTo(110_000_000 / RATE, 6);
    expect(age1.totalToman).toBe(9_900_000_000);
    // ۱۵۰ متری ۱۵ ساله در هیچ نوعی نیست → «۰ از ۱»
    expect(rows[1].total).toBe(1);
    expect(rows[1].count).toBe(0);
    expect(Object.keys(rows[1].cells)).toEqual([]);
  });
});

describe('resolveEffectiveRate', () => {
  const now = 1_000_000_000;
  it('تتر زنده مقدم است', () => {
    const r = resolveEffectiveRate({ quote: { priceToman: 233000, source: 'wallex', tradedAt: null, fetchedAt: now - 1000 }, status: 'live' }, now);
    expect(r).toMatchObject({ rate: 233000, kind: 'live', source: 'wallex' });
  });
  it('تتر قدیمی → stale (هنوز تتر، نه نرخ دستی)', () => {
    const r = resolveEffectiveRate({ quote: { priceToman: 230000, source: 'bitpin', tradedAt: null, fetchedAt: now - 3_600_000 }, status: 'live' }, now);
    expect(r).toMatchObject({ rate: 230000, kind: 'stale' });
  });
  it('بدون تتر → none (نرخ دستی وجود ندارد)', () => {
    expect(resolveEffectiveRate({ quote: null, status: 'unavailable' }, now)).toMatchObject({ rate: null, kind: 'none' });
  });
});

import { ageFilterOfType, matchesPriceType, PRICE_TYPES } from './segments';
import { buildAreaTypeMatrix } from '../service/propertyMarketService';

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
    // جدا از هم: آگهی کلید اول در ستون «۱ سال» نمی‌آید
    expect(matchesPriceType({ yearBuilt: 1404, firstKey: true }, 'age1', y)).toBe(false);
  });
  it('ماتریس مناطق: بدون «کل اهواز»، خانه‌های هر نوع با میانگین تومان/دلار/تعداد', () => {
    const mk = (t: string, key: string, year: number | null, ppm: number, fk = false) => ({ ...l(t, 100, year, ppm), neighborhoodKey: key, firstKey: fk });
    const views = toListingViews(
      [
        mk('a', 'golestan', 1404, 100e6, true),
        mk('e', 'golestan', 1405, 120e6),
        mk('b', 'golestan', 1403, 90e6),
        mk('c', 'kianpars-east', 1398, 150e6),
        mk('d', 'kianpars-west', null, 140e6)
      ],
      250_000,
      1405
    );
    const rows = buildAreaTypeMatrix(views, 250_000, 1405);
    expect(rows.map((r) => r.key)).toEqual(['golestan', 'kianpars']);
    const g = rows[0];
    expect(g.count).toBe(3);
    // کلید اول و «۱ سال» جدا: کلید اول ۱۰۰M، نوساز غیرکلیداول ۱۲۰M
    expect(g.cells['first-key']!.ppmToman).toBe(100e6);
    expect(g.cells.age1!.count).toBe(1);
    expect(g.cells.age1!.ppmToman).toBe(120e6);
    expect(g.cells.age1!.ppmUsd).toBe(480);
    expect(g.cells.age2!.totalUsd).toBe(36000);
    // شرقی/غربی کیانپارس در یک ردیف؛ «۱ از ۲» (بدون سال ساخت در هیچ ستونی نیست)
    const kp = rows[1];
    expect(kp.total).toBe(2);
    expect(kp.count).toBe(1);
    expect(kp.cells.age7!.ppmToman).toBe(150e6);
    expect(kp.cells.age3).toBeUndefined();
  });
});

import { buildExactAreaRows, exactAreaRangeOf } from '../service/propertyMarketService';

describe('متراژ دقیق', () => {
  it('بازه‌ها: ۹۰ تا ۱۷۰ (شامل ۱۷۰) و ۱۷۱ تا ۳۳۰', () => {
    expect([90, 170, 171, 330, 331].map(exactAreaRangeOf)).toEqual(['90-170', '90-170', '171-330', '171-330', 'gt330']);
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
