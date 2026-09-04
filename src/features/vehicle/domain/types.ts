/** ============================================================
 * Vehicle Investment — تایپ‌های پایه
 *
 * ⚠️ Snapshot تاریخی «Immutable» است:
 *  - قیمت تومانی، نرخ دلار همان روز و معادل دلاری در لحظه ثبت ذخیره می‌شوند.
 *  - تغییر نرخ دلار/قیمت در روزهای بعد هرگز Snapshot قبلی را Recalculate نمی‌کند.
 * واحد پایه: تومان ایران — قیمت دلاری فقط معیار تحلیلی است.
 * ============================================================ */

/** دسته‌بندی خودرو */
export type VehicleCategory = 'imported' | 'domestic';

/** فراداده خودرو (ثابت — قابل توسعه) */
export interface Vehicle {
  id: string;
  /** برند (مثلاً BMW / ایران‌خودرو) */
  brand: string;
  /** نام مدل (مثلاً iX3) */
  name: string;
  /** سال/مدل خودرو — '2025' یا '1405' — null = نامشخص */
  modelYear: string | null;
  category: VehicleCategory;
}

/** قیمت ثبت‌شده یک خودرو در یک Snapshot (همه مقادیر در لحظه ثبت ذخیره شده‌اند) */
export interface VehiclePriceRecord {
  vehicleId: string;
  /** قیمت نمایندگی (تومان) — null = موجود نیست (N/A) */
  dealerPriceToman: number | null;
  /** قیمت بازار (تومان) — null = موجود نیست (N/A) */
  marketPriceToman: number | null;
  /** معادل دلاری قیمت نمایندگی در لحظه ثبت = dealerPriceToman / usdRate (ثابت) */
  dealerPriceUsd: number | null;
  /** معادل دلاری قیمت بازار در لحظه ثبت = marketPriceToman / usdRate (ثابت) */
  marketPriceUsd: number | null;
}

/** یک Snapshot تاریخی کامل (Immutable) */
export interface VehicleSnapshot {
  /** شناسه یکتای Snapshot (مثلاً ts) */
  id: string;
  /** timestamp تاریخ ثبت (ms) */
  dateTs: number;
  /** برچسب شمسی (مثلاً «18 مرداد 1405») */
  dateLabel: string;
  /** نرخ دلار همان روز (تومان به ازای هر دلار) — ثبت‌شده، نه ارجاع به نرخ فعلی */
  usdRate: number;
  /** منبع/نوع قیمت */
  priceSource: string;
  /** رکوردهای قیمت خودروها در این تاریخ */
  records: VehiclePriceRecord[];
  createdAt: number;
}

/** ورودی ثبت Snapshot جدید */
export interface NewSnapshotInput {
  dateTs: number;
  dateLabel: string;
  usdRate: number;
  priceSource: string;
  /** vehicleId → قیمت بازار (تومان) — null = بدون تغییر/ناموجود */
  marketPrices: Record<string, number | null>;
  /** vehicleId → قیمت نمایندگی (تومان) — اختیاری */
  dealerPrices?: Record<string, number | null>;
}
