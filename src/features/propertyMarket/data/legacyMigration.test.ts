/**
 * مهاجرت داده تاریخی ماژول قبلی — حفظ داده، بدون حذف (§۱۶)
 */
import { describe, it, expect } from 'vitest';
import { migrateLegacySnapshot, LEGACY_NEIGHBORHOOD_KEY_MAP } from './legacyMigration';

const legacySnap = {
  id: 'snap-1725000000000',
  dateTs: 1725000000000,
  dateLabel: '۱۴۰۴/۰۶/۱۹',
  usdRate: 100_000,
  records: [
    { neighborhoodId: 'ahvaz-kianpars-east', propertyType: 'apartment', buildingCondition: 'new', averagePricePerSqmToman: 50_000_000, averagePricePerSqmUsd: 500 },
    { neighborhoodId: 'ahvaz-kianpars-west', propertyType: 'apartment', buildingCondition: 'new', averagePricePerSqmToman: 48_000_000, averagePricePerSqmUsd: 480 },
    { neighborhoodId: 'ahvaz-golestan', propertyType: 'apartment', buildingCondition: 'old', averagePricePerSqmToman: 30_000_000, averagePricePerSqmUsd: 300 },
    { neighborhoodId: 'ahvaz-padad', propertyType: 'villa', buildingCondition: 'new', averagePricePerSqmToman: 25_000_000, averagePricePerSqmUsd: 250 }
  ],
  createdAt: 1725000000000
};

describe('migrateLegacySnapshot', () => {
  it('رکوردهای آپارتمان مهاجرت و شرقی/غربی‌ها ترکیب می‌شوند', () => {
    const out = migrateLegacySnapshot(legacySnap);
    expect(out).not.toBeNull();
    expect(out!.id).toBe('legacy-snap-1725000000000');
    expect(out!.source).toBe('manual-legacy');
    expect(out!.dateTs).toBe(1725000000000);
    expect(out!.fxRateAtSnapshotToman).toBe(100_000);
    // کیان‌پارس: میانگین/میانه دو رکورد شرقی+غربی
    const kp = out!.neighborhoodStats.find((n) => n.neighborhoodKey === 'kianpars')!;
    expect(kp).toBeDefined();
    expect(kp.stats.medianTomanPerM2).toBe(49_000_000);
    expect(kp.stats.listingCount).toBe(2);
    // ویلا وارد مدل جدید نمی‌شود (اما در جدول اصلی باقی است)
    expect(out!.neighborhoodStats.find((n) => n.neighborhoodKey === 'padad')).toBeUndefined();
    // آمار شهر از همه رکوردهای آپارتمان
    expect(out!.cityStats.listingCount).toBe(3);
  });

  it('snapshot بدون رکورد آپارتمان → مهاجرت نمی‌شود (نه خطا)', () => {
    const out = migrateLegacySnapshot({
      id: 'snap-2',
      dateTs: 2,
      usdRate: 1,
      records: [{ neighborhoodId: 'ahvaz-padad', propertyType: 'villa', buildingCondition: 'new', averagePricePerSqmToman: 10_000_000, averagePricePerSqmUsd: 100 }]
    });
    expect(out).toBeNull();
  });

  it('قیمت نامعتبر در رکورد قدیمی → نادیده گرفته می‌شود', () => {
    const out = migrateLegacySnapshot({
      id: 'snap-3',
      dateTs: 3,
      usdRate: 1,
      records: [
        { neighborhoodId: 'ahvaz-golestan', propertyType: 'apartment', buildingCondition: 'new', averagePricePerSqmToman: -5, averagePricePerSqmUsd: 0 },
        { neighborhoodId: 'ahvaz-golestan', propertyType: 'apartment', buildingCondition: 'new', averagePricePerSqmToman: 30_000_000, averagePricePerSqmUsd: 300 }
      ]
    });
    expect(out!.cityStats.listingCount).toBe(1);
    expect(out!.cityStats.medianTomanPerM2).toBe(30_000_000);
  });

  it('همه شناسه‌های کاتالوگ قدیمی نگاشت قطعی دارند', () => {
    const old = [
      'ahvaz-golestan', 'ahvaz-saadi', 'ahvaz-farhangshahr', 'ahvaz-bagh-sheikh',
      'ahvaz-amanieh', 'ahvaz-kourosh', 'ahvaz-kompolo-north', 'ahvaz-kianpars-east',
      'ahvaz-kianpars-west', 'ahvaz-shahrak-daneshgah', 'ahvaz-zeytoon-karmandi',
      'ahvaz-kianabad-east', 'ahvaz-kianabad-west', 'ahvaz-padad', 'ahvaz-aryashahr', 'ahvaz-mehrshahr'
    ];
    for (const id of old) expect(LEGACY_NEIGHBORHOOD_KEY_MAP[id]).toBeTruthy();
  });
});
