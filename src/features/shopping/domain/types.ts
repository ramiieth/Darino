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
  | 'payping' | 'bale'
  | 'torob' | 'alibaba' | 'snapptrip' | 'bamadar' | 'snapppay' | 'digipay';

export type ServiceCategory = 'shopping' | 'food' | 'travel' | 'health' | 'books' | 'beauty' | 'payment';

/** نیت تشخیص‌داده‌شده از متن فارسی کاربر */
export type Intent = 'product' | 'fashion' | 'beauty' | 'food' | 'grocery' | 'flight' | 'train' | 'bus' | 'taxi' | 'stay' | 'tour' | 'doctor' | 'book'
  | 'job' | 'estate' | 'car' | 'service';

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
  /** شناسهٔ شهر اتوبوس در مستربلیط (همهٔ پایانه‌ها) */
  busId: number | null;
  /** اسلاگ صفحهٔ تاکسی بین‌شهری مستربلیط (فقط شهرهای دارای تاکسی) */
  taxiSlug: string | null;
  /** نزدیک‌ترین فرودگاه پرپرواز وقتی شهر فرودگاه ندارد یا کم‌پرواز است */
  nearIata: string | null;
  lat: number;
  lon: number;
}

export interface ShopQuery {
  text: string;
  intents: Intent[];
  /** عبارت جستجو پس از حذف شهر، بودجه و واژه‌های دستوری */
  keywords: string;
  /** «کروسان یا موهیتو یا اسپرسو» → هر گزینه جدا (حداکثر ۴)؛ برای غذا هر کدام جستجو می‌شود */
  alternatives?: string[];
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
  /** خرید اقساطی (اسنپ‌پی/دیجی‌پی) خواسته شده */
  installment: boolean;
  /** املاک: اجاره/رهن یا خرید */
  deal: 'rent' | 'buy' | null;
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
  /** دسته‌بندی خود فروشگاه، از کلی به جزئی با « › » (مثل «خواربار و نان › روغن پخت و پز و سالاد») */
  category?: string | null;
  /** جایگاه در فهرست خود منبع (آگهی‌ها: ۰ = جدیدترین) */
  order?: number | null;
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
  /** فروشگاه‌های اقساطی مرتبط (اسنپ‌پی/دیجی‌پی)، جدا از جدول کالاها */
  stores: RankedItem[];
  /** ۵ پیشنهاد برتر به ترتیب، با دلیل */
  tops: { item: RankedItem; why: string }[];
  sources: SourceStatus[];
  /** لینک جستجوی مستقیم برای منابعی که داده نداشتند یا اتصال مستقیم ندارند */
  links: ServiceLink[];
  /** اطلاعات ناقص درخواست (مثلاً مقصد سفر) */
  hints: string[];
  fetchedAt: number;
}
