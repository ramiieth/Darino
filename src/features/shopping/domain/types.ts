/** ============================================================
 * دستیار و راهنمای خرید — مدل مشترک کلاینت و سرور
 *
 *  همه‌چیز فقط‌خواندنی است: جستجوی عمومی سایت‌ها، بدون ورود، سبد، رزرو یا پرداخت.
 *  همهٔ قیمت‌ها تومان‌اند (منابع ریالی در سرور ÷۱۰ می‌شوند).
 * ============================================================ */

export type ServiceId =
  | 'digikala' | 'technolife' | 'masterkala' | 'shopino' | 'sheypoor' | 'divar'
  | 'snappfood' | 'snappmarket' | 'okala'
  | 'mrbilit' | 'flytoday' | 'jabama' | 'otaghak'
  | 'paziresh24' | 'doctoreto'
  | 'taaghche' | 'fidibo' | 'sibook'
  | 'khanoumi' | 'asalbanoo'
  | 'payping' | 'bale';

export type ServiceCategory = 'shopping' | 'food' | 'travel' | 'health' | 'books' | 'beauty' | 'payment';

/** نیت تشخیص‌داده‌شده از متن فارسی کاربر */
export type Intent = 'product' | 'fashion' | 'beauty' | 'food' | 'grocery' | 'flight' | 'train' | 'stay' | 'tour' | 'doctor' | 'book';

export interface CityRef {
  name: string;
  /** اسلاگ انگلیسی دیوار، پذیرش۲۴، دکترتو و مستربلیط */
  slug: string;
  sheypoorSlug: string;
  divarId: number;
  /** کد IATA فرودگاه، اگر پرواز داخلی دارد */
  iata: string | null;
  /** شناسهٔ ایستگاه قطار در مستربلیط */
  trainId: number | null;
  lat: number;
  lon: number;
}

export interface ShopQuery {
  text: string;
  intents: Intent[];
  /** عبارت جستجو پس از حذف شهر، بودجه و واژه‌های دستوری */
  keywords: string;
  city: CityRef | null;
  /** مقصد (سفر) یا چند شهر برای «شمال» */
  destinations: CityRef[];
  origin: CityRef | null;
  /** تاریخ میلادی YYYY-MM-DD؛ null یعنی «ارزان‌ترین روز در دو هفتهٔ آینده» */
  date: string | null;
  nights: number;
  guests: number;
  maxPrice: number | null;
  minPrice: number | null;
  used: boolean;
  sort: 'best' | 'cheapest';
  /** سرویس‌هایی که کاربر نامشان را آورده */
  named: ServiceId[];
}

export interface ItemFact {
  label: string;
  value: string;
}

export interface ShopItem {
  id: string;
  service: ServiceId;
  title: string;
  /** یک خط خلاصه (برند، فروشنده، ایرلاین و ساعت، تخصص و مطب…) */
  summary: string | null;
  image: string | null;
  /** لوگوی فروشنده/رستوران، اگر جدا از عکس محصول است */
  brandLogo?: string | null;
  url: string;
  priceToman: number | null;
  priceBeforeToman: number | null;
  discountPercent: number;
  /** امتیاز ۰ تا ۵ */
  rating: number | null;
  ratingCount: number | null;
  location: string | null;
  available: boolean;
  /** جزئیات کوتاه برای جدول مقایسه */
  facts: ItemFact[];
  /** لینک مسیریابی روی نقشه، اگر مختصات دارد */
  mapUrl: string | null;
  /** چند روز تا اولین نوبت/حرکت (برای رتبه‌بندی پزشک و سفر) */
  soonDays: number | null;
}

export interface RankedItem extends ShopItem {
  rank: number;
  /** ۰ تا ۱۰۰ */
  score: number;
  reasons: string[];
}

export interface SourceStatus {
  service: ServiceId;
  ok: boolean;
  count: number;
  /** پیام کوتاه فارسی وقتی منبع پاسخ نداد */
  note: string | null;
}

export interface ServiceLink {
  service: ServiceId;
  url: string;
}

export interface ShopAnswer {
  query: ShopQuery;
  items: RankedItem[];
  top: { item: RankedItem; why: string } | null;
  sources: SourceStatus[];
  /** لینک جستجوی مستقیم برای منابعی که داده نداشتند یا اتصال مستقیم ندارند */
  links: ServiceLink[];
  /** اطلاعات ناقص درخواست (مثلاً مقصد سفر) */
  hints: string[];
  fetchedAt: number;
}
