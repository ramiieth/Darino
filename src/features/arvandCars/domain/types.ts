/** ============================================================
 * خودروهای وارداتی پلاک اروند (خوزستان) — تایپ‌های پایه
 *
 *  منبع: آگهی‌های دیوار (اهواز، آبادان، خرمشهر) + مبنای پلاک ملی (تهران)
 *  هر آگهی با خواندن متن کاملش طبقه‌بندی می‌شود (دیوار فیلد نوع پلاک ندارد).
 * ⚠️ بدون alias «@/» — در فانکشن سرور هم import می‌شود.
 * ============================================================ */

/** نوع پلاک/وضعیت از متن آگهی */
export type PlateKind =
  | 'arvand' //            پلاک اروند / منطقه آزاد
  | 'arvand-convertible' // اروند — قابل تبدیل به ملی
  | 'customs' //           کف گمرک (هنوز پلاک نشده)
  | 'transit' //           گذر موقت
  | 'national' //          پلاک ملی (صریح در متن)
  | 'unknown'; //          بدون نشانه

export type ArvandCity = 'ahvaz' | 'abadan' | 'khorramshahr' | 'tehran';
export type Region = 'khuz' | 'tehran';

export interface PricePoint {
  ts: number;
  price: number;
}

/** یک آگهی خودرو (پارس‌شده) */
export interface CarAd {
  token: string;
  region: Region;
  city: ArvandCity;
  /** محله/شهر نمایشی از دیوار */
  where: string | null;
  title: string;
  /** «برند و مدل» از تاکسونومی خود دیوار */
  model: string | null;
  /** سال میلادی (شمسی → تقریبی +۶۲۱) */
  year: number | null;
  yearRaw: string | null;
  km: number | null;
  /** تومان — null = توافقی/نامعتبر */
  price: number | null;
  gearbox: string | null;
  fuel: string | null;
  color: string | null;
  plate: PlateKind;
  /** بخش کوتاهی از متن که نوع پلاک از آن تشخیص داده شد */
  evidence: string | null;
  /** آگهی چندخودرویی نمایشگاه / اقساطی — از میانه‌ها کنار گذاشته می‌شود */
  dealerMulti: boolean;
  installment: boolean;
  image: string | null;
  /** زمان انتشار/آخرین به‌روزرسانی در دیوار */
  listedAt: number | null;
  updatedAt: number | null;
  /** زمان‌های ما */
  firstSeenAt: number;
  lastSeenAt: number;
  detailAt: number;
  priceHistory: PricePoint[];
  /** مدل مبنا که این آگهی برایش جمع شده (فقط آگهی‌های تهران) */
  baselineFor?: string | null;
}

/** ردیف فهرست جستجو (بدون جزئیات) */
export interface ListRow {
  token: string;
  title: string;
  priceText: string | null;
  kmText: string | null;
  where: string | null;
  image: string | null;
}

/** آمار یک گروه (مدل + سال) در یک Snapshot */
export interface GroupStat {
  key: string;
  model: string;
  year: number;
  arvMedian: number | null;
  arvN: number;
  natMedian: number | null;
  natN: number;
}

export interface ArvandSnapshot {
  /** arv-YYYY-MM-DD */
  id: string;
  day: string;
  dateTs: number;
  usdtRate: number | null;
  activeAds: number;
  groups: GroupStat[];
}
