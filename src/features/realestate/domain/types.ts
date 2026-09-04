/** ============================================================
 * Real Estate — تایپ‌های پایه
 *
 * ⚠️ قیمت محله صرفاً «شاخص مرجع منطقه‌ای» است — نه قیمت قطعی معامله.
 * ⚠️ هر قیمت ثبت‌شده به‌صورت Historical Snapshot (Immutable) ذخیره می‌شود:
 *    قیمت تومانی + نرخ دلار همان روز + معادل دلاری همان روز — هرگز Recalculate نمی‌شود.
 * ⚠️ نام دارایی/نوع ملک/شهر/محله/وضعیت ساختمان: فقط از گزینه‌های آماده — کاربر دستی تایپ نمی‌کند.
 * ============================================================ */

/** نوع ملک (گزینه‌های آماده — قابل توسعه) */
export type PropertyType = 'apartment' | 'villa';

/** وضعیت ساختمان (گزینه‌های آماده — مرجع اصلی: نوساز/کلید اول) */
export type BuildingCondition = 'new' | 'few-years' | 'old';

/** شهر (نسخه اول: اهواز — قابل توسعه) */
export type City = 'ahvaz';

/** محله تعریف‌شده (از کاتالوگ) */
export interface Neighborhood {
  id: string;
  city: City;
  name: string;
}

/** دارایی واقعی ملک — ثبت‌شده توسط کاربر (قیمت‌ها دستی؛ ساختار از گزینه‌ها) */
export interface RealAsset {
  id: string;
  assetClass: 'real-estate';
  propertyType: PropertyType;
  city: City;
  neighborhoodId: string;
  buildingCondition: BuildingCondition;
  /** تاریخ تملک (شمسی — نمایش) + میلادی (ts — ذخیره) */
  ownershipDateJalali: string;
  ownershipDateGregorian: number;
  /** نرخ دلار ثبت‌شده در تاریخ تملک */
  ownershipUsdRate: number;
  purchasePriceToman: number;
  /** = purchasePriceToman / ownershipUsdRate (محاسبه خودکار — فریز) */
  purchasePriceUsd: number;
  /** تاریخ ارزش‌گذاری */
  valuationDateJalali: string;
  valuationDateGregorian: number;
  /** نرخ دلار ثبت‌شده در تاریخ ارزش‌گذاری */
  valuationUsdRate: number;
  currentValueToman: number;
  /** = currentValueToman / valuationUsdRate (محاسبه خودکار — فریز) */
  currentValueUsd: number;
  createdAt: number;
}

/** رکورد قیمت یک محله در یک Snapshot */
export interface NeighborhoodPriceRecord {
  neighborhoodId: string;
  propertyType: PropertyType;
  buildingCondition: BuildingCondition;
  /** میانگین قیمت هر مترمربع (تومان) — دستی */
  averagePricePerSqmToman: number;
  /** = averagePricePerSqmToman / usdRate (ثبت‌شده در لحظه) */
  averagePricePerSqmUsd: number;
}

/** Snapshot تاریخی قیمت محله‌ها (Immutable) */
export interface RealEstateSnapshot {
  id: string; // snap-{dateTs}
  dateTs: number;
  /** برچسب شمسی */
  dateLabel: string;
  /** نرخ دلار همان روز (ثبت‌شده) */
  usdRate: number;
  records: NeighborhoodPriceRecord[];
  createdAt: number;
}

/** ورودی ثبت قیمت محله */
export interface NewNeighborhoodPriceInput {
  dateTs: number;
  dateLabel: string;
  usdRate: number;
  /** (neighborhoodId, propertyType, buildingCondition) → قیمت متر (تومان) */
  prices: {
    neighborhoodId: string;
    propertyType: PropertyType;
    buildingCondition: BuildingCondition;
    averagePricePerSqmToman: number;
  }[];
}

/** ورودی ثبت دارایی ملک */
export interface NewRealAssetInput {
  propertyType: PropertyType;
  city: City;
  neighborhoodId: string;
  buildingCondition: BuildingCondition;
  ownershipDateJalali: string;
  ownershipDateGregorian: number;
  ownershipUsdRate: number;
  purchasePriceToman: number;
  valuationDateJalali: string;
  valuationDateGregorian: number;
  valuationUsdRate: number;
  currentValueToman: number;
}
