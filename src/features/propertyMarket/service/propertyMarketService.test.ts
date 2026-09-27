/**
 * PropertyMarketService — ماتریس مناطق از Snapshot (بدون «کل اهواز»، فقط سطح منطقه)
 */
import { describe, it, expect } from 'vitest';
import { areaTypeMatrixFromSnapshot, snapshotAreaRecords } from './propertyMarketService';
import type { AreaPriceStats, PropertyMarketSnapshot } from '../domain/types';

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
  cityStats: st(10, { 'b0': { count: 3, medianPpm: 90e6, meanPpm: 100e6, medianTotal: null, meanTotal: 10e9 } }),
  neighborhoodStats: [
    { neighborhoodKey: 'golestan', displayName: 'گلستان', stats: st(4, { b2: { count: 4, medianPpm: 70e6, meanPpm: 75e6, medianTotal: null, meanTotal: null } }) },
    { neighborhoodKey: 'kianpars-east', displayName: 'کیانپارس شرقی', stats: st(6, {}) }
  ],
  groupStats: [
    {
      neighborhoodKey: 'kianpars',
      displayName: 'کیانپارس',
      stats: st(6, { 'b0': { count: 2, medianPpm: 180e6, meanPpm: 200e6, medianTotal: null, meanTotal: 24e9 } })
    }
  ],
  cleaning: { raw: 0, normalized: 0, valid: 0, deduplicated: 0, outliersRemoved: 0, market: 10, rejectReasons: {} },
  createdAt: 1
};

describe('snapshotAreaRecords', () => {
  it('منطقه = گروه‌ها + محله‌های مستقل (کیانپارس شرقی جدا نمی‌آید)', () => {
    expect(snapshotAreaRecords(snap).map((r) => r.neighborhoodKey)).toEqual(['kianpars', 'golestan']);
  });
});

describe('areaTypeMatrixFromSnapshot', () => {
  it('بدون ردیف «کل اهواز»؛ میانگین ذخیره‌شده (نه میانه) با نرخ فعلی تتر', () => {
    const rows = areaTypeMatrixFromSnapshot(snap, 250_000);
    // همه مناطق به ترتیب تعداد کل آگهی
    expect(rows.map((r) => r.key)).toEqual(['kianpars', 'golestan']);
    const kp = rows[0];
    expect(kp.total).toBe(6);
    expect(kp.count).toBe(2);
    expect(kp.cells['b0']!.ppmToman).toBe(200e6);
    expect(kp.cells['b0']!.ppmUsd).toBe(800);
    expect(kp.cells['b0']!.totalUsd).toBe(96_000);
    expect(rows[1].cells.b2!.ppmToman).toBe(75e6);
  });

  it('نرخ تتر نامشخص → دلار null (هرگز نرخ دستی/فرضی)', () => {
    const rows = areaTypeMatrixFromSnapshot(snap, null);
    expect(rows[0].cells['b0']!.ppmUsd).toBeNull();
    expect(rows[0].cells['b0']!.ppmToman).toBe(200e6);
  });
});
