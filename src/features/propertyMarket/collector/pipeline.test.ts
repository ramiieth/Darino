/**
 * قیف پاک‌سازی — Normalize → Validate → Deduplicate → Outlier (§۱۸)
 */
import { describe, it, expect } from 'vitest';
import {
  deduplicateListings,
  filterOutliers,
  newCleaningReport,
  normalizeAndValidate,
  runCleaningPipeline,
  MIN_NEIGHBORHOOD_SAMPLE_FOR_IQR
} from './pipeline';
import { emptySeed, type ParsedListingSeed } from './parse';
import { keyFromUnknownName } from '../data/catalog';
import type { PropertyMarketListing } from '../domain/types';

function seed(ppm: number | null, opts: Partial<ParsedListingSeed> = {}): ParsedListingSeed {
  const s = emptySeed(`tok-${Math.random().toString(36).slice(2)}`);
  s.neighborhood = 'کیانپارس';
  s.pricePerSqmToman = ppm;
  return { ...s, ...opts };
}

describe('normalizeAndValidate', () => {
  const report = newCleaningReport();

  it('محله دیوار → کلید کاتالوگ (کیانپارس)', () => {
    const l = normalizeAndValidate(seed(50_000_000), 'ahvaz', '3', 100, newCleaningReport());
    expect(l).not.toBeNull();
    expect(l!.neighborhoodKey).toBe('kianpars');
    expect(l!.city).toBe('ahvaz');
    expect(l!.pricePerSqmToman).toBe(50_000_000);
  });

  it('بدون قیمت → رد (داده جعلی جایگزین نمی‌شود)', () => {
    const r = newCleaningReport();
    const l = normalizeAndValidate(seed(null, { totalPriceToman: null, areaSqm: null }), 'ahvaz', '3', 100, r);
    expect(l).toBeNull();
    expect(r.rejectReasons['missing-price']).toBe(1);
  });

  it('قیمت اسپم (بیرون بازه) → رد', () => {
    const r = newCleaningReport();
    expect(normalizeAndValidate(seed(500_000), 'ahvaz', '3', 100, r)).toBeNull();
    expect(normalizeAndValidate(seed(5_000_000_000), 'ahvaz', '3', 100, r)).toBeNull();
    expect(r.rejectReasons['ppm-out-of-range']).toBe(2);
  });

  it('قیمت کل نگهدارنده/اسپم → رد', () => {
    const r = newCleaningReport();
    const l = normalizeAndValidate(seed(50_000_000, { totalPriceToman: 1000 }), 'ahvaz', '3', 100, r);
    expect(l).toBeNull();
    expect(r.rejectReasons['total-price-spam']).toBe(1);
  });

  it('متراژ نامعقول → رد', () => {
    const r = newCleaningReport();
    const l = normalizeAndValidate(seed(50_000_000, { areaSqm: 5 }), 'ahvaz', '3', 100, r);
    expect(l).toBeNull();
  });

  it('سال ساخت نامعتبر → فقط فیلد حذف می‌شود (نه آگهی)', () => {
    const l = normalizeAndValidate(seed(50_000_000, { yearBuilt: 900 }), 'ahvaz', '3', 100, newCleaningReport());
    expect(l).not.toBeNull();
    expect(l!.yearBuilt).toBeNull();
  });

  it('محله ناشناخته → با کلید خام نگه داشته می‌شود (بدون حدس)', () => {
    const l = normalizeAndValidate(seed(40_000_000, { neighborhood: 'منطقه‌ی تستی جدید' }), 'ahvaz', '3', 100, newCleaningReport());
    expect(l).not.toBeNull();
    expect(l!.neighborhoodKey).toBe(keyFromUnknownName('منطقه‌ی تستی جدید'));
  });
});

describe('deduplicateListings', () => {
  const mk = (token: string, ppm: number, ts: number, nb = 'kianpars'): PropertyMarketListing => ({
    token,
    url: '',
    city: 'ahvaz',
    cityId: '3',
    neighborhood: 'کیانپارس',
    neighborhoodKey: nb,
    propertyKind: 'apartment',
    areaSqm: 100,
    rooms: 2,
    yearBuilt: 1400,
    floor: 2,
    totalPriceToman: ppm * 100,
    pricePerSqmToman: ppm,
    parking: null,
    elevator: null,
    storage: null,
    balcony: null,
    title: null,
    listedAt: null,
    scrapedAt: ts,
    source: 'divar'
  });

  it('توکن تکراری → یکی نگه داشته می‌شود (جدیدتر)', () => {
    const r = newCleaningReport();
    const out = deduplicateListings([mk('a', 50e6, 200)], [mk('a', 50e6, 100)], r);
    expect(out.length).toBe(1);
    expect(out[0].scrapedAt).toBe(200);
    expect(r.deduplicated).toBeGreaterThan(0);
  });

  it('اثرانگشت قیمت+متراژ+محله → آگهی دوباره ثبت‌شده حذف می‌شود', () => {
    const r = newCleaningReport();
    const out = deduplicateListings([mk('x', 50e6, 300)], [mk('y', 50e6, 100)], r);
    expect(out.length).toBe(1);
    expect(out[0].token).toBe('x'); // جدیدتر
  });

  it('قیمت متفاوت → هر دو نگه داشته می‌شوند', () => {
    const r = newCleaningReport();
    const out = deduplicateListings([mk('x', 51e6, 300)], [mk('y', 50e6, 100)], r);
    expect(out.length).toBe(2);
  });
});

describe('filterOutliers', () => {
  const mk = (ppm: number, nb: string, token: string): PropertyMarketListing => ({
    token,
    url: '',
    city: 'ahvaz',
    cityId: '3',
    neighborhood: nb,
    neighborhoodKey: nb,
    propertyKind: 'apartment',
    areaSqm: 100,
    rooms: 2,
    yearBuilt: 1400,
    floor: 2,
    totalPriceToman: ppm * 100,
    pricePerSqmToman: ppm,
    parking: null,
    elevator: null,
    storage: null,
    balcony: null,
    title: null,
    listedAt: null,
    scrapedAt: 1,
    source: 'divar'
  });

  it('پرت فاحش محله با نمونه کافی → حذف می‌شود', () => {
    const group: PropertyMarketListing[] = [];
    for (let i = 0; i < MIN_NEIGHBORHOOD_SAMPLE_FOR_IQR + 2; i += 1) {
      group.push(mk(50e6 + i * 100_000, 'kianpars', `t${i}`));
    }
    group.push(mk(900_000_000, 'kianpars', 'outlier'));
    const r = newCleaningReport();
    const out = filterOutliers(group, r);
    expect(out.find((l) => l.token === 'outlier')).toBeUndefined();
    expect(r.outliersRemoved).toBe(1);
  });

  it('نمونه کم محله → فقط حصار سراسری اعمال می‌شود', () => {
    const out = filterOutliers([mk(50e6, 'a', 't1'), mk(52e6, 'a', 't2')], newCleaningReport());
    expect(out.length).toBe(2);
  });
});

describe('runCleaningPipeline (مسیر کامل)', () => {
  it('خام → معتبر → بدون تکراری → بازار', () => {
    const seeds = [
      seed(50_000_000),
      seed(null, { totalPriceToman: null, areaSqm: null }), // رد: بدون قیمت
      seed(500_000), // رد: نامعقول
      seed(45_000_000, { neighborhood: 'پاداد' })
    ];
    const { listings, report } = runCleaningPipeline({
      seeds,
      existing: [],
      city: 'ahvaz',
      cityId: '3',
      scrapedAt: 1
    });
    expect(report.raw).toBe(4);
    expect(report.valid).toBe(2);
    expect(report.market).toBe(2);
    expect(listings.length).toBe(2);
    expect(report.rejectReasons['missing-price']).toBe(1);
  });

  it('ادغام با موجودی قبلی + حذف تکراری بین اجراها', () => {
    const first = runCleaningPipeline({
      seeds: [seed(50_000_000, { token: 'dup' })],
      existing: [],
      city: 'ahvaz',
      cityId: '3',
      scrapedAt: 1
    });
    const again = runCleaningPipeline({
      seeds: [seed(50_000_000, { token: 'dup' })],
      existing: first.listings,
      city: 'ahvaz',
      cityId: '3',
      scrapedAt: 2
    });
    expect(again.listings.length).toBe(1);
  });
});
