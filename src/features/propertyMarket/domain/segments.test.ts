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
  it('سال جاری − سال ساخت؛ سال آینده (ساخته‌نشده) یا نامعتبر → null', () => {
    expect(buildingAgeYears(1401, 1405)).toBe(4);
    expect(buildingAgeYears(1405, 1405)).toBe(0);
    expect(buildingAgeYears(1406, 1405)).toBeNull();
    expect(buildingAgeYears(null, 1405)).toBeNull();
    expect(buildingAgeYears(87, 1405)).toBeNull();
  });
  it('هر سال جدا: ۰ (نوساز) تا ۷ سال، ۸ به بالا یک دسته', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 20].map(ageBandOf)).toEqual(['y0', 'y1', 'y2', 'y3', 'y4', 'y5', 'y6', 'y7', 'y8+', 'y8+']);
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
    expect(a.ageBand).toBe('y1');
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
    const age1 = rows[0].cells.b1!;
    expect(age1.count).toBe(2);
    expect(age1.ppmToman).toBe(110_000_000);
    expect(age1.ppmUsd).toBeCloseTo(110_000_000 / RATE, 6);
    expect(age1.totalToman).toBe(9_900_000_000);
    // ۱۵۰ متری ساخت ۱۳۹۰ → ستون «۱۳۹۷ و قبل‌تر» (دیگر «۰ از ۱» نیست)
    expect(rows[1].total).toBe(1);
    expect(rows[1].count).toBe(1);
    expect(Object.keys(rows[1].cells)).toEqual(['old']);
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

import { bandOfType, matchesPriceType, PRICE_TYPES, priceTypeLabel, priceTypeSub, priceTypeYear } from './segments';
import { buildAreaTypeMatrix } from '../service/propertyMarketService';

describe('ستون‌ها فقط بر اساس سال ساخت (بدون «کلید اول»)', () => {
  it('۱۴۰۵ نوساز، ۱۴۰۴ یک سال … ۱۳۹۸ هفت سال، ۱۳۹۷ و قبل‌تر', () => {
    expect(PRICE_TYPES.map((t) => priceTypeYear(t.key, 1405))).toEqual([
      '۱۴۰۵', '۱۴۰۴', '۱۴۰۳', '۱۴۰۲', '۱۴۰۱', '۱۴۰۰', '۱۳۹۹', '۱۳۹۸', '۱۳۹۷ و قبل‌تر'
    ]);
    expect(PRICE_TYPES.map((t) => priceTypeSub(t.key))).toEqual([
      'نوساز', '۱ سال', '۲ سال', '۳ سال', '۴ سال', '۵ سال', '۶ سال', '۷ سال', '۸ سال به بالا'
    ]);
    expect(priceTypeLabel('b1', 1405)).toBe('ساخت ۱۴۰۴ (۱ سال)');
    expect(['b0', 'b4', 'old'].map((t) => bandOfType(t as never))).toEqual(['y0', 'y4', 'y8+']);
    // سال بعد ستون‌ها خودکار جابه‌جا می‌شوند
    expect(priceTypeYear('b0', 1406)).toBe('۱۴۰۶');
  });
  it('matchesPriceType: هر آگهی دقیقاً در یک ستون', () => {
    const y = 1405;
    expect(matchesPriceType({ yearBuilt: 1405 }, 'b0', y)).toBe(true);
    expect(matchesPriceType({ yearBuilt: 1404 }, 'b0', y)).toBe(false);
    expect(matchesPriceType({ yearBuilt: 1404 }, 'b1', y)).toBe(true);
    expect(matchesPriceType({ yearBuilt: 1398 }, 'b7', y)).toBe(true);
    expect(matchesPriceType({ yearBuilt: 1397 }, 'old', y)).toBe(true);
    expect(matchesPriceType({ yearBuilt: 1397 }, 'b7', y)).toBe(false);
    expect(matchesPriceType({ yearBuilt: null }, 'b3', y)).toBe(false);
    expect(matchesPriceType({ yearBuilt: 1406 }, 'b0', y)).toBe(false);
  });
  it('ماتریس مناطق: «کلید اول» در متن اثری ندارد؛ ۱۴۰۴ همان «۱ سال» است', () => {
    const mk = (t: string, key: string, year: number | null, ppm: number, title = '') => ({ ...l(t, 100, year, ppm), neighborhoodKey: key, title });
    const views = toListingViews(
      [
        mk('a', 'golestan', 1404, 100e6, 'آپارتمان کلید اول'),
        mk('e', 'golestan', 1405, 120e6),
        mk('b', 'golestan', 1403, 90e6),
        mk('c', 'kianpars-east', 1398, 150e6),
        mk('d', 'kianpars-west', null, 140e6),
        mk('f', 'kianpars-west', 1380, 70e6)
      ],
      250_000,
      1405
    );
    const rows = buildAreaTypeMatrix(views, 250_000, 1405);
    expect(rows.map((r) => r.key)).toEqual(['golestan', 'kianpars']);
    const g = rows[0];
    expect(g.cells.b0!.ppmToman).toBe(120e6);
    expect(g.cells.b1!.ppmToman).toBe(100e6); // «کلید اول» ۱۴۰۴ → ۱ سال
    expect(g.cells.b1!.ppmUsd).toBe(400);
    expect(g.cells.b2!.totalUsd).toBe(36000);
    // کیانپارس شرقی/غربی یک ردیف؛ ۱۳۸۰ در «قبل‌تر»؛ فقط بدون سال ساخت بیرون می‌ماند
    const kp = rows[1];
    expect(kp.total).toBe(3);
    expect(kp.count).toBe(2);
    expect(kp.cells.b7!.ppmToman).toBe(150e6);
    expect(kp.cells.old!.ppmToman).toBe(70e6);
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
