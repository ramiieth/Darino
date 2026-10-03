/** ============================================================
 * Car Market — تایپ‌های پایه (قیمت روزانه بازار خودرو)
 *
 *  منبع: car.ir — قیمت بازار + قیمت کارخانه/نمایندگی هر تیپ و سال
 *  هر روز (به وقت تهران) یک Snapshot؛ واکشی دوباره در همان روز همان
 *  Snapshot را با داده تازه‌تر جایگزین می‌کند (روزهای گذشته دست نمی‌خورند).
 *  واحد: تومان · معادل دلاری با نرخ تتر ثبت‌شده در همان Snapshot
 * ⚠️ بدون alias «@/» — در فانکشن سرور هم import می‌شود.
 * ============================================================ */

/** داخلی (تولید ایرانی) · مونتاژی (برند خارجی، تولید/مونتاژ در ایران) · وارداتی */
export type CarCategory = 'domestic' | 'assembled' | 'imported';

/** قیمت یک تیپ/سال در یک روز */
export interface CarPriceRow {
  /** شناسه تیپ-سال در منبع (car.ir trim id) */
  id: string;
  /** شناسه مدل در منبع (car.ir tip id) */
  modelId: string;
  /** اسلاگ برند اصلی (مثلاً iran-khodro) */
  brand: string;
  /** نام فارسی مدل */
  model: string;
  /** سال مدل — '1405' (شمسی) یا '2025' (میلادی) */
  year: string;
  /** گزینه/تیپ (مثلاً «دو دیفرانسیل») */
  option: string | null;
  /** قیمت بازار (تومان) */
  market: number | null;
  /** قیمت کارخانه/نمایندگی (تومان) */
  dealer: number | null;
  /** زمان آخرین به‌روزرسانی قیمت بازار در منبع (ms) */
  marketUpdatedAt: number | null;
  /** درصد تغییر قیمت بازار در آخرین به‌روزرسانی منبع */
  srcChangePct: number | null;
}

/** Snapshot روزانه کل بازار */
export interface CarSnapshot {
  /** `car-YYYY-MM-DD` (روز تهران) */
  id: string;
  /** کلید روز تهران YYYY-MM-DD */
  day: string;
  /** زمان واکشی (ms) */
  dateTs: number;
  source: 'car.ir';
  /** نرخ تتر زنده در لحظه واکشی (تومان) — null = بعداً از تاریخچه روزانه */
  usdtRate: number | null;
  usdtSource: 'wallex' | 'bitpin' | null;
  /** نام فارسی برندها از منبع (فالبک برندهای ناشناخته) */
  brandNames: Record<string, string>;
  rows: CarPriceRow[];
  createdAt: number;
}
