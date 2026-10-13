/** ============================================================
 * فهرست سرویس‌های «دستیار و راهنمای خرید»
 *
 *  live: سرور دارینو جستجوی عمومی همین سایت را مستقیم می‌خواند.
 *  link: سایت از سرورهای خارج از ایران پاسخ نمی‌دهد (اسنپ‌فود: همهٔ دامنه‌های رستوران پشت geo-block آروان؛
 *        اسنپ‌مارکت روی svc.snapp.market باز است)، به ورود نیاز دارد یا
 *        حساب شخصی کاربر است؛ فقط لینک جستجوی مستقیم ساخته می‌شود.
 *  ایدهٔ منابع از awesome-iran-mcp و sheypoor-mcp است؛ کد آن‌ها نصب یا اجرا نشده.
 * ============================================================ */
import type { CityRef, Intent, ServiceCategory, ServiceId } from './types.js';

export interface ServiceInfo {
  id: ServiceId;
  name: string;
  category: ServiceCategory;
  logo: string;
  site: string;
  mode: 'live' | 'link';
  /** یک خط: چه چیزی از این سرویس می‌آید */
  blurb: string;
  intents: Intent[];
  /** واژه‌هایی که با آن کاربر سرویس را نام می‌برد */
  aliases: string[];
}

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  shopping: '🛒 خرید',
  food: '🍕 غذا',
  travel: '✈️ سفر و اقامت',
  health: '🩺 سلامت',
  books: '📚 کتاب',
  beauty: '💄 زیبایی',
  payment: '💳 پرداخت'
};

export const SERVICES: ServiceInfo[] = [
  { id: 'digikala', name: 'دیجی‌کالا', category: 'shopping', logo: '/logos/shop/digikala.png', site: 'https://www.digikala.com', mode: 'live', blurb: 'کالای نو، مقایسهٔ فروشنده‌ها و نظر خریداران', intents: ['product', 'fashion', 'beauty'], aliases: ['دیجی‌کالا', 'دیجی کالا', 'دیجیکالا'] },
  { id: 'technolife', name: 'تکنولایف', category: 'shopping', logo: '/logos/shop/technolife.png', site: 'https://www.technolife.com', mode: 'live', blurb: 'موبایل، لپ‌تاپ و لوازم دیجیتال', intents: ['product'], aliases: ['تکنولایف'] },
  { id: 'masterkala', name: 'مسترکالا', category: 'shopping', logo: '/logos/shop/masterkala.png', site: 'https://masterkala.com', mode: 'live', blurb: 'گجت و لوازم جانبی', intents: ['product'], aliases: ['مسترکالا', 'مستر کالا'] },
  { id: 'shopino', name: 'شاپینو', category: 'shopping', logo: '/logos/shop/shopino.png', site: 'https://shopino.app', mode: 'live', blurb: 'پوشاک، کفش و کیف از فروشگاه‌های مختلف', intents: ['fashion'], aliases: ['شاپینو'] },
  { id: 'sheypoor', name: 'شیپور', category: 'shopping', logo: '/logos/shop/sheypoor.png', site: 'https://www.sheypoor.com', mode: 'live', blurb: 'آگهی نو و کارکرده در شهر شما', intents: ['product', 'fashion'], aliases: ['شیپور'] },
  { id: 'divar', name: 'دیوار', category: 'shopping', logo: '/logos/shop/divar.png', site: 'https://divar.ir', mode: 'live', blurb: 'آگهی نو و کارکرده در شهر شما', intents: ['product', 'fashion'], aliases: ['دیوار'] },
  { id: 'snappfood', name: 'اسنپ‌فود', category: 'food', logo: '/logos/shop/snappfood.svg', site: 'https://snappfood.ir', mode: 'live', blurb: 'رستوران، کافه، شیرینی و کترینگ — از طریق پل مک شما (VPN ایران)', intents: ['food'], aliases: ['اسنپ‌فود', 'اسنپ فود', 'اسنپفود'] },
  { id: 'snappmarket', name: 'اسنپ‌مارکت', category: 'food', logo: '/logos/shop/snappfood.svg', site: 'https://snapp.market', mode: 'live', blurb: 'سوپرمارکت‌های اطراف با قیمت و موجودی لحظه‌ای', intents: ['grocery'], aliases: ['اسنپ‌مارکت', 'اسنپ مارکت'] },
  { id: 'okala', name: 'اکالا', category: 'food', logo: '/logos/shop/okala.png', site: 'https://okala.com', mode: 'link', blurb: 'مقایسهٔ قیمت سوپرمارکت‌های اطراف', intents: ['grocery'], aliases: ['اکالا', 'اوکالا'] },
  { id: 'mrbilit', name: 'مستربلیط', category: 'travel', logo: '/logos/shop/mrbilit.svg', site: 'https://mrbilit.com', mode: 'live', blurb: 'پرواز و قطار داخلی با قیمت لحظه‌ای', intents: ['flight', 'train'], aliases: ['مستربلیط', 'مستر بلیط'] },
  { id: 'flytoday', name: 'فلای‌تودی', category: 'travel', logo: '/logos/shop/flytoday.png', site: 'https://www.flytoday.ir', mode: 'link', blurb: 'پرواز، هتل و تور', intents: ['flight', 'stay', 'tour'], aliases: ['فلای‌تودی', 'فلای تودی'] },
  { id: 'jabama', name: 'جاباما', category: 'travel', logo: '/logos/shop/jabama.png', site: 'https://www.jabama.com', mode: 'link', blurb: 'ویلا، اقامتگاه و تور', intents: ['stay', 'tour'], aliases: ['جاباما'] },
  { id: 'otaghak', name: 'اتاقک', category: 'travel', logo: '/logos/shop/otaghak.png', site: 'https://www.otaghak.com', mode: 'live', blurb: 'ویلا و اقامتگاه با قیمت دقیق هر شب', intents: ['stay'], aliases: ['اتاقک'] },
  { id: 'paziresh24', name: 'پذیرش۲۴', category: 'health', logo: '/logos/shop/paziresh24.png', site: 'https://www.paziresh24.com', mode: 'live', blurb: 'پزشک با رضایت بیماران و اولین نوبت خالی', intents: ['doctor'], aliases: ['پذیرش۲۴', 'پذیرش 24', 'پذیرش ۲۴'] },
  { id: 'doctoreto', name: 'دکترتو', category: 'health', logo: '/logos/shop/doctoreto.png', site: 'https://doctoreto.com', mode: 'live', blurb: 'پزشک، تعرفهٔ ویزیت و نوبت خالی', intents: ['doctor'], aliases: ['دکترتو'] },
  { id: 'taaghche', name: 'طاقچه', category: 'books', logo: '/logos/shop/taaghche.png', site: 'https://taaghche.com', mode: 'live', blurb: 'کتاب الکترونیکی و صوتی', intents: ['book'], aliases: ['طاقچه'] },
  { id: 'fidibo', name: 'فیدیبو', category: 'books', logo: '/logos/shop/fidibo.png', site: 'https://fidibo.com', mode: 'link', blurb: 'کتاب الکترونیکی و صوتی', intents: ['book'], aliases: ['فیدیبو'] },
  { id: 'sibook', name: 'سی‌بوک', category: 'books', logo: '/logos/shop/30book.png', site: 'https://www.30book.com', mode: 'link', blurb: 'کتاب چاپی', intents: ['book'], aliases: ['سی‌بوک', 'سی بوک', '30book'] },
  { id: 'khanoumi', name: 'خانومی', category: 'beauty', logo: '/logos/shop/khanoumi.png', site: 'https://www.khanoumi.com', mode: 'live', blurb: 'آرایشی، مراقبت پوست و عطر', intents: ['beauty'], aliases: ['خانومی'] },
  { id: 'asalbanoo', name: 'عسل بانو', category: 'beauty', logo: '/logos/shop/asalbanoo.png', site: 'https://asalbanooshop.com', mode: 'live', blurb: 'آرایشی و بهداشتی', intents: ['beauty'], aliases: ['عسل بانو', 'عسل‌بانو'] },
  { id: 'payping', name: 'پی‌پینگ', category: 'payment', logo: '/logos/shop/payping.png', site: 'https://www.payping.ir', mode: 'link', blurb: 'درگاه و لینک پرداخت — نیازمند حساب شخصی؛ عمداً متصل نشده', intents: [], aliases: ['پی‌پینگ', 'پی پینگ'] },
  { id: 'bale', name: 'بله', category: 'payment', logo: '/logos/shop/bale.png', site: 'https://bale.ai', mode: 'link', blurb: 'پیام‌رسان و کیف پول — نیازمند حساب شخصی؛ عمداً متصل نشده', intents: [], aliases: ['پیام‌رسان بله'] }
];

export const SERVICE: Record<ServiceId, ServiceInfo> = Object.fromEntries(SERVICES.map((s) => [s.id, s])) as Record<ServiceId, ServiceInfo>;

const q = encodeURIComponent;

/** لینک صفحهٔ جستجوی خود سایت (همه با درخواست واقعی بررسی شده‌اند؛ بقیه صفحهٔ اصلی) */
export function searchUrl(id: ServiceId, text: string, ctx: { city?: CityRef | null; origin?: CityRef | null; destination?: CityRef | null } = {}): string {
  const s = SERVICE[id];
  const t = text.trim();
  const city = ctx.city ?? ctx.destination ?? null;
  switch (id) {
    case 'digikala': return `${s.site}/search/?q=${q(t)}`;
    case 'technolife': return `${s.site}/product/list/search?keywords=${q(t)}`;
    case 'masterkala': return `${s.site}/index.php?route=product/search&search=${q(t)}`;
    case 'shopino': return `${s.site}/search?q=${q(t)}`;
    case 'sheypoor': return `${s.site}/s/${city?.sheypoorSlug ?? 'iran'}?q=${q(t)}`;
    case 'divar': return `${s.site}/s/${city?.slug ?? 'iran'}?q=${q(t)}`;
    case 'asalbanoo': return `${s.site}/?s=${q(t)}&post_type=product`;
    case 'taaghche': return `${s.site}/search?term=${q(t)}`;
    case 'paziresh24': return `${s.site}/s/${city?.slug ?? 'tehran'}/?text=${q(t)}`;
    case 'doctoreto': return `${s.site}/search?q=${q(t)}`;
    case 'otaghak': return city ? `${s.site}/city/${city.slug}/` : s.site;
    case 'mrbilit':
      if (ctx.origin?.iata && ctx.destination?.iata) return `${s.site}/flights/${ctx.origin.iata}-${ctx.destination.iata}`;
      if (ctx.origin && ctx.destination) return `${s.site}/trains/${ctx.origin.slug}-${ctx.destination.slug}`;
      return s.site;
    default: return s.site;
  }
}

/** متن (نرمال‌شده، نیم‌فاصله = فاصله)، نام کدام سرویس‌ها را آورده؟ */
export function namedServices(text: string): ServiceId[] {
  return SERVICES.filter((s) => s.aliases.some((a) => text.includes(a.replace(/\u200c/g, ' ')))).map((s) => s.id);
}
