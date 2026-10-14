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
  /** درخواست‌های نمونه (گزینه‌های پیش‌فرض) برای همین پلتفرم */
  examples: string[];
}

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  shopping: '🛒 خرید',
  food: '🍕 غذا و خرید روزانه',
  travel: '✈️ سفر و اقامت',
  health: '🩺 سلامت',
  books: '📚 کتاب',
  beauty: '💄 زیبایی',
  payment: '💳 خرید اقساطی و پرداخت'
};

export const SERVICES: ServiceInfo[] = [
  // 🛒 خرید
  { id: 'torob', name: 'ترب', category: 'shopping', logo: '/logos/shop/torob.png', site: 'https://torob.com', mode: 'live', blurb: 'کمترین قیمت یک کالا در صدها فروشگاه', intents: ['product', 'fashion', 'beauty'], aliases: ['ترب'], examples: ['ارزان‌ترین گوشی سامسونگ A55', 'قیمت ماشین لباسشویی ۸ کیلویی'] },
  { id: 'digikala', name: 'دیجی‌کالا', category: 'shopping', logo: '/logos/shop/digikala.png', site: 'https://www.digikala.com', mode: 'live', blurb: 'کالای نو، مقایسهٔ فروشنده‌ها و نظر خریداران', intents: ['product', 'fashion', 'beauty'], aliases: ['دیجی‌کالا', 'دیجی کالا', 'دیجیکالا'], examples: ['بهترین هدفون بی‌سیم زیر ۳ میلیون', 'جاروبرقی پرفروش'] },
  { id: 'technolife', name: 'تکنولایف', category: 'shopping', logo: '/logos/shop/technolife.png', site: 'https://www.technolife.com', mode: 'live', blurb: 'موبایل، لپ‌تاپ، لوازم دیجیتال و خانگی', intents: ['product'], aliases: ['تکنولایف'], examples: ['لپ تاپ ایسوس زیر ۵۰ میلیون', 'تلویزیون ۵۵ اینچ'] },
  { id: 'masterkala', name: 'مسترکالا', category: 'shopping', logo: '/logos/shop/masterkala.png', site: 'https://masterkala.com', mode: 'live', blurb: 'گجت و لوازم جانبی', intents: ['product'], aliases: ['مسترکالا', 'مستر کالا'], examples: ['پاوربانک ۲۰ هزار', 'ساعت هوشمند'] },
  { id: 'shopino', name: 'شاپینو', category: 'shopping', logo: '/logos/shop/shopino.png', site: 'https://shopino.app', mode: 'live', blurb: 'پوشاک، کفش و کیف از فروشگاه‌های مختلف', intents: ['fashion'], aliases: ['شاپینو'], examples: ['کفش ورزشی مردانه', 'مانتو تابستانه'] },
  { id: 'sheypoor', name: 'شیپور', category: 'shopping', logo: '/logos/shop/sheypoor.png', site: 'https://www.sheypoor.com', mode: 'live', blurb: 'آگهی کالا، استخدام، املاک، خودرو و خدمات در شهر شما', intents: ['product', 'fashion', 'job', 'estate', 'car', 'service'], aliases: ['شیپور'], examples: ['پلی استیشن ۵ کارکرده در شیپور', 'اجاره آپارتمان در شیپور'] },
  { id: 'divar', name: 'دیوار', category: 'shopping', logo: '/logos/shop/divar.png', site: 'https://divar.ir', mode: 'live', blurb: 'آگهی کالا، استخدام، املاک، خودرو و خدمات در شهر شما', intents: ['product', 'fashion', 'job', 'estate', 'car', 'service'], aliases: ['دیوار'], examples: ['آگهی‌های استخدام دیوار', 'پژو ۲۰۶ در دیوار', 'رهن خانه ویلایی'] },
  // 🍕 غذا و خرید روزانه
  { id: 'snappfood', name: 'اسنپ‌فود', category: 'food', logo: '/logos/shop/snappfood.svg', site: 'https://snappfood.ir', mode: 'live', blurb: 'رستوران، کافه، شیرینی و کترینگ — از طریق پل مک شما (VPN ایران)', intents: ['food'], aliases: ['اسنپ‌فود', 'اسنپ فود', 'اسنپفود'], examples: ['ارزان‌ترین پیتزای تخفیف‌دار', 'بهترین آیس لاته در کافه‌ها'] },
  { id: 'tapsifood', name: 'تپسی‌فود', category: 'food', logo: '/logos/shop/tapsifood.png', site: 'https://tapsi.food', mode: 'live', blurb: 'رستوران، کافه و شیرینی — مستقیم و بدون پل (در شهرهایی که فعال است)', intents: ['food'], aliases: ['تپسی‌فود', 'تپسی فود', 'تپسیفود'], examples: ['پیتزا ناپولیتن', 'کافه‌های اطراف'] },
  { id: 'snappmarket', name: 'اسنپ‌مارکت', category: 'food', logo: '/logos/shop/snappfood.svg', site: 'https://snapp.market', mode: 'live', blurb: 'سوپرمارکت‌های اطراف با قیمت و موجودی لحظه‌ای', intents: ['grocery'], aliases: ['اسنپ‌مارکت', 'اسنپ مارکت'], examples: ['ارزان‌ترین سس مایونز ۳۰۰ گرمی', 'شیر کم چرب'] },
  { id: 'okala', name: 'اکالا', category: 'food', logo: '/logos/shop/okala.png', site: 'https://www.okala.com', mode: 'live', blurb: 'مقایسهٔ قیمت فروشگاه‌های اطراف (جستجو با دسته‌بندی)', intents: ['grocery'], aliases: ['اکالا', 'اوکالا'], examples: ['سوسیس و کالباس یک کیلویی', 'برنج ایرانی'] },
  { id: 'bamadar', name: 'بامادر', category: 'food', logo: '/logos/shop/bamadar.png', site: 'https://bamadar.com', mode: 'live', blurb: 'هایپرمارکت در شهرهای خوزستان (اهواز، آبادان، خرمشهر، دزفول…)', intents: ['grocery'], aliases: ['بامادر', 'با مادر', 'فروشگاه مادر'], examples: ['روغن سرخ کردنی ۱.۵ لیتری', 'ارزان‌ترین تن ماهی'] },
  // ✈️ سفر و اقامت
  { id: 'mrbilit', name: 'مستربلیط', category: 'travel', logo: '/logos/shop/mrbilit.svg', site: 'https://mrbilit.com', mode: 'live', blurb: 'پرواز، قطار و اتوبوس داخلی با قیمت لحظه‌ای', intents: ['flight', 'train', 'bus'], aliases: ['مستربلیط', 'مستر بلیط'], examples: ['پروازهای امروز', 'قطار به مشهد', 'اتوبوس vip به تهران'] },
  { id: 'alibaba', name: 'علی‌بابا', category: 'travel', logo: '/logos/shop/alibaba.png', site: 'https://www.alibaba.ir', mode: 'live', blurb: 'پرواز داخلی با قیمت لحظه‌ای', intents: ['flight'], aliases: ['علی‌بابا', 'علی بابا', 'علیبابا'], examples: ['ارزان‌ترین پرواز به کیش', 'پرواز فردا به تهران'] },
  { id: 'jabama', name: 'جاباما', category: 'travel', logo: '/logos/shop/jabama.png', site: 'https://jabama.tours', mode: 'live', blurb: 'تورهای گروهی (زنده) و ویلا', intents: ['tour', 'stay'], aliases: ['جاباما'], examples: ['ارزان‌ترین تور کیش', 'تور طبیعت‌گردی یک روزه'] },
  { id: 'otaghak', name: 'اتاقک', category: 'travel', logo: '/logos/shop/otaghak.png', site: 'https://www.otaghak.com', mode: 'live', blurb: 'ویلا و اقامتگاه با قیمت دقیق هر شب', intents: ['stay'], aliases: ['اتاقک'], examples: ['ویلا در شمال برای ۴ نفر', 'اقامتگاه در مشهد شبی زیر ۲ میلیون'] },
  { id: 'snapptrip', name: 'اسنپ‌تریپ', category: 'travel', logo: '/logos/shop/snapptrip.png', site: 'https://www.snapptrip.com', mode: 'link', blurb: 'پرواز، هتل و ویلا — API عمومی ندارد؛ لینک مستقیم', intents: ['flight', 'stay'], aliases: ['اسنپ‌تریپ', 'اسنپ تریپ'], examples: ['هتل در شیراز'] },
  { id: 'flytoday', name: 'فلای‌تودی', category: 'travel', logo: '/logos/shop/flytoday.png', site: 'https://www.flytoday.ir', mode: 'link', blurb: 'پرواز، هتل و تور', intents: ['flight', 'stay', 'tour'], aliases: ['فلای‌تودی', 'فلای تودی'], examples: [] },
  // 🩺 سلامت
  { id: 'paziresh24', name: 'پذیرش۲۴', category: 'health', logo: '/logos/shop/paziresh24.png', site: 'https://www.paziresh24.com', mode: 'live', blurb: 'پزشک با رضایت بیماران و اولین نوبت خالی', intents: ['doctor'], aliases: ['پذیرش۲۴', 'پذیرش 24', 'پذیرش ۲۴'], examples: ['متخصص پوست با نوبت خالی', 'دندانپزشک خوب'] },
  { id: 'doctoreto', name: 'دکترتو', category: 'health', logo: '/logos/shop/doctoreto.png', site: 'https://doctoreto.com', mode: 'live', blurb: 'پزشک، تعرفهٔ ویزیت و نوبت خالی', intents: ['doctor'], aliases: ['دکترتو'], examples: ['متخصص قلب', 'جراح چشم لیزیک'] },
  // 📚 کتاب
  { id: 'taaghche', name: 'طاقچه', category: 'books', logo: '/logos/shop/taaghche.png', site: 'https://taaghche.com', mode: 'live', blurb: 'کتاب الکترونیکی و صوتی', intents: ['book'], aliases: ['طاقچه'], examples: ['کتاب صوتی ملت عشق', 'رمان شازده کوچولو'] },
  { id: 'fidibo', name: 'فیدیبو', category: 'books', logo: '/logos/shop/fidibo.png', site: 'https://fidibo.com', mode: 'link', blurb: 'کتاب الکترونیکی و صوتی', intents: ['book'], aliases: ['فیدیبو'], examples: [] },
  { id: 'sibook', name: 'سی‌بوک', category: 'books', logo: '/logos/shop/30book.png', site: 'https://www.30book.com', mode: 'link', blurb: 'کتاب چاپی', intents: ['book'], aliases: ['سی‌بوک', 'سی بوک', '30book'], examples: [] },
  // 💄 زیبایی
  { id: 'khanoumi', name: 'خانومی', category: 'beauty', logo: '/logos/shop/khanoumi.png', site: 'https://www.khanoumi.com', mode: 'live', blurb: 'آرایشی، مراقبت پوست و عطر', intents: ['beauty'], aliases: ['خانومی'], examples: ['کرم ضد آفتاب پوست چرب', 'رژ لب مات'] },
  { id: 'asalbanoo', name: 'عسل بانو', category: 'beauty', logo: '/logos/shop/asalbanoo.png', site: 'https://asalbanooshop.com', mode: 'live', blurb: 'آرایشی و بهداشتی', intents: ['beauty'], aliases: ['عسل بانو', 'عسل‌بانو'], examples: ['عطر زنانه', 'شامپو ضد ریزش'] },
  // 💳 خرید اقساطی و پرداخت
  { id: 'snapppay', name: 'اسنپ‌پی', category: 'payment', logo: '/logos/shop/snapppay.png', site: 'https://snapppay.ir', mode: 'live', blurb: 'فروشگاه‌های اقساطی (۴ قسط بدون سود) — آنلاین و حضوری', intents: [], aliases: ['اسنپ‌پی', 'اسنپ پی', 'اسنپپی'], examples: ['پیراهن مردانه قسطی', 'لوازم خانگی اقساطی'] },
  { id: 'digipay', name: 'دیجی‌پی', category: 'payment', logo: '/logos/shop/digipay.png', site: 'https://www.mydigipay.com', mode: 'live', blurb: 'فروشگاه‌های خرید اعتباری و اقساطی دیجی‌پی', intents: [], aliases: ['دیجی‌پی', 'دیجی پی', 'دیجیپی'], examples: ['گوشی موبایل اقساطی', 'وسایل آشپزخانه با اقساط'] },
  { id: 'payping', name: 'پی‌پینگ', category: 'payment', logo: '/logos/shop/payping.png', site: 'https://www.payping.ir', mode: 'link', blurb: 'درگاه و لینک پرداخت — نیازمند حساب شخصی؛ عمداً متصل نشده', intents: [], aliases: ['پی‌پینگ', 'پی پینگ'], examples: [] },
  { id: 'bale', name: 'بله', category: 'payment', logo: '/logos/shop/bale.png', site: 'https://bale.ai', mode: 'link', blurb: 'پیام‌رسان و کیف پول — نیازمند حساب شخصی؛ عمداً متصل نشده', intents: [], aliases: ['پیام‌رسان بله'], examples: [] }
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
    case 'alibaba': return ctx.origin?.iata && ctx.destination?.iata ? `${s.site}/flights/${ctx.origin.iata}-${ctx.destination.iata}` : s.site;
    case 'torob': return `${s.site}/search/?query=${q(t)}`;
    case 'okala': return `${s.site}/search?q=${q(t)}`;
    case 'tapsifood': return `${s.site}/search?query=${q(t)}`;
    case 'bamadar': return `${s.site}/market/search`;
    case 'snapppay': return `${s.site}/stores/`;
    case 'digipay': return `${s.site}/stores/`;
    default: return s.site;
  }
}

/** متن (نرمال‌شده، نیم‌فاصله = فاصله)، نام کدام سرویس‌ها را آورده؟ */
export function namedServices(text: string): ServiceId[] {
  return SERVICES.filter((s) => s.aliases.some((a) => text.includes(a.replace(/\u200c/g, ' ')))).map((s) => s.id);
}
