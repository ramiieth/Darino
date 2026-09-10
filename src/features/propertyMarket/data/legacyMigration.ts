/** ============================================================
 * Property Market — مهاجرت داده تاریخی ماژول قبلی (§۱۶ مأموریت)
 *
 *  ماژول قدیمی (ثبت دستی قیمت محله) حذف شده اما داده‌های ارزشمند
 *  تاریخی آن حذف نمی‌شوند:
 *   - جدول‌های قدیمی (realAssets / realEstateSnapshots) دست‌نخورده می‌مانند.
 *   - Snapshotهای قدیمی به مدل جدید «بازار املاک» تبدیل می‌شوند
 *     (منبع: manual-legacy) تا تاریخچه قیمت مناطق ادامه داشته باشد.
 *  ⚠️ فقط رکوردهای «آپارتمان» وارد مدل جدید می‌شوند (اسکوپ فعلی)؛
 *     رکوردهای ویلا در جدول اصلی باقی می‌مانند (حذف نمی‌شوند).
 * ============================================================ */
import type {
  CleaningReport,
  NeighborhoodStatsRecord,
  PropertyMarketSnapshot
} from '../domain/types';
import { buildAreaStats } from '../domain/stats';
import { neighborhoodDisplayName } from './catalog';

/** نگاشت شناسه‌های قدیمی محله → کلیدهای جدید (فقط تطبیق قطعی) */
export const LEGACY_NEIGHBORHOOD_KEY_MAP: Record<string, string> = {
  'ahvaz-golestan': 'golestan',
  'ahvaz-saadi': 'saadi',
  'ahvaz-farhangshahr': 'farhangshahr',
  'ahvaz-bagh-sheikh': 'bagh-sheikh',
  'ahvaz-amanieh': 'amanieh',
  'ahvaz-kourosh': 'kourosh',
  'ahvaz-kompolo-north': 'kompolo-north',
  'ahvaz-kianpars-east': 'kianpars',
  'ahvaz-kianpars-west': 'kianpars',
  'ahvaz-shahrak-daneshgah': 'shahrak-daneshgah',
  'ahvaz-zeytoon-karmandi': 'zeytoon-karmandi',
  'ahvaz-kianabad-east': 'kianabad',
  'ahvaz-kianabad-west': 'kianabad',
  'ahvaz-padad': 'padad',
  'ahvaz-aryashahr': 'aryashahr',
  'ahvaz-mehrshahr': 'mehrshahr'
};

interface LegacyRecord {
  neighborhoodId: string;
  propertyType: string;
  buildingCondition?: string;
  averagePricePerSqmToman: number;
  averagePricePerSqmUsd?: number;
}

interface LegacySnapshot {
  id: string;
  dateTs: number;
  dateLabel?: string;
  usdRate: number;
  records: LegacyRecord[];
  createdAt?: number;
}

/**
 * تبدیل یک Snapshot قدیمی → Snapshot مدل جدید.
 * محله‌های قدیمی که به یک کلید واحد نگاشت می‌شوند (مثل کیان‌پارس
 * شرقی/غربی) با هم ترکیب می‌شوند.
 */
export function migrateLegacySnapshot(legacy: LegacySnapshot): PropertyMarketSnapshot | null {
  const apartmentRecords = legacy.records.filter(
    (r) => r.propertyType === 'apartment' && Number.isFinite(r.averagePricePerSqmToman) && r.averagePricePerSqmToman > 0
  );
  if (apartmentRecords.length === 0) return null;

  const byKey = new Map<string, number[]>();
  let unmapped = 0;
  for (const r of apartmentRecords) {
    const key = LEGACY_NEIGHBORHOOD_KEY_MAP[r.neighborhoodId];
    if (!key) {
      unmapped += 1;
      continue;
    }
    const arr = byKey.get(key) ?? [];
    arr.push(r.averagePricePerSqmToman);
    byKey.set(key, arr);
  }
  if (byKey.size === 0) return null;

  const neighborhoodStats: NeighborhoodStatsRecord[] = [...byKey.entries()].map(([key, values]) => ({
    neighborhoodKey: key,
    displayName: neighborhoodDisplayName(key),
    stats: buildAreaStats(values)
  }));

  const allValues = [...byKey.values()].flat();
  const mappedCount = apartmentRecords.length - unmapped;

  const cleaning: CleaningReport = {
    raw: apartmentRecords.length,
    normalized: apartmentRecords.length,
    valid: mappedCount,
    deduplicated: 0,
    outliersRemoved: 0,
    market: mappedCount,
    rejectReasons: unmapped > 0 ? { 'legacy-unmapped-neighborhood': unmapped } : {}
  };

  return {
    id: `legacy-${legacy.id}`,
    dateTs: legacy.dateTs,
    dateLabel: legacy.dateLabel ?? '',
    city: 'ahvaz',
    source: 'manual-legacy',
    fxRateAtSnapshotToman: Number.isFinite(legacy.usdRate) && legacy.usdRate > 0 ? legacy.usdRate : null,
    cityStats: buildAreaStats(allValues),
    neighborhoodStats,
    cleaning,
    createdAt: legacy.createdAt ?? Date.now()
  };
}

/** کلید تنظیم برای ثبت وضعیت مهاجرت (اجرای یک‌باره/ایدِمپوتنت) */
export const LEGACY_MIGRATION_FLAG = 'pmLegacyMigratedV1';
