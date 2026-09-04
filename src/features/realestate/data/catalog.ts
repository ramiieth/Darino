/** ============================================================
 * Real Estate — کاتالوگ گزینه‌های آماده (نسخه اول: شهر اهواز)
 *
 * ⚠️ همه موارد ساختاری از این کاتالوگ انتخاب می‌شوند — کاربر دستی تایپ نمی‌کند.
 * ⚠️ در آینده شهرها/محله‌ها/نوع‌ها بدون تغییر معماری اضافه می‌شوند.
 * ============================================================ */
import type { BuildingCondition, City, Neighborhood, PropertyType } from '../domain/types';

/** شهرهای تعریف‌شده */
export const CITIES: { id: City; name: string }[] = [{ id: 'ahvaz', name: 'اهواز' }];

/** محله‌های اهواز (نسخه اول — ۱۶ محله) */
export const NEIGHBORHOODS: Neighborhood[] = [
  { id: 'ahvaz-golestan', city: 'ahvaz', name: 'گلستان' },
  { id: 'ahvaz-saadi', city: 'ahvaz', name: 'سعدی' },
  { id: 'ahvaz-farhangshahr', city: 'ahvaz', name: 'فرهنگ شهر' },
  { id: 'ahvaz-bagh-sheikh', city: 'ahvaz', name: 'باغ شیخ' },
  { id: 'ahvaz-amanieh', city: 'ahvaz', name: 'امانیه' },
  { id: 'ahvaz-kourosh', city: 'ahvaz', name: 'کوروش' },
  { id: 'ahvaz-kompolo-north', city: 'ahvaz', name: 'کمپلو شمالی' },
  { id: 'ahvaz-kianpars-east', city: 'ahvaz', name: 'کیان‌پارس شرقی' },
  { id: 'ahvaz-kianpars-west', city: 'ahvaz', name: 'کیان پارس غربی' },
  { id: 'ahvaz-shahrak-daneshgah', city: 'ahvaz', name: 'شهرک دانشگاه' },
  { id: 'ahvaz-zeytoon-karmandi', city: 'ahvaz', name: 'زیتون کارمندی' },
  { id: 'ahvaz-kianabad-east', city: 'ahvaz', name: 'کیان آباد شرقی' },
  { id: 'ahvaz-kianabad-west', city: 'ahvaz', name: 'کیان آباد غربی' },
  { id: 'ahvaz-padad', city: 'ahvaz', name: 'پاداد' },
  { id: 'ahvaz-aryashahr', city: 'ahvaz', name: 'آریا شهر' },
  { id: 'ahvaz-mehrshahr', city: 'ahvaz', name: 'مهر شهر' }
];

/** نوع ملک (گزینه‌های آماده — قابل توسعه: زمین/مغازه/دفتر/ویلا/…) */
export const PROPERTY_TYPES: { id: PropertyType; name: string }[] = [
  { id: 'apartment', name: 'آپارتمان' },
  { id: 'villa', name: 'خانه ویلایی' }
];

/** وضعیت ساختمان — مرجع اصلی: نوساز/کلید اول */
export const BUILDING_CONDITIONS: { id: BuildingCondition; name: string; isPrimary: boolean }[] = [
  { id: 'new', name: 'نوساز / کلید اول', isPrimary: true },
  { id: 'few-years', name: 'چند سال ساخت', isPrimary: false },
  { id: 'old', name: 'قدیمی', isPrimary: false }
];

/** برچسب فارسی نوع ملک */
export const PROPERTY_TYPE_FA: Record<PropertyType, string> = {
  apartment: 'آپارتمان',
  villa: 'خانه ویلایی'
};

/** برچسب فارسی وضعیت ساختمان */
export const BUILDING_CONDITION_FA: Record<BuildingCondition, string> = {
  new: 'نوساز / کلید اول',
  'few-years': 'چند سال ساخت',
  old: 'قدیمی'
};

/** نام محله از id */
export function neighborhoodName(id: string): string {
  return NEIGHBORHOODS.find((n) => n.id === id)?.name ?? id;
}
