/** Installment shopping: stores accepting SnappPay (4 interest-free payments) or DigiPay credit, in the request's category. */
import { arr, obj, str } from '../src/features/connected/domain/model.js';
import type { CityRef, ShopItem } from '../src/features/shopping/domain/types.js';
import { item } from './_shopGoods.js';
import { json, plain, request, safeUrl } from './_shopHttp.js';

interface PayCategory { dp: string; label: RegExp; sp: string[] }

// واژهٔ کالا → دستهٔ دیجی‌پی، نام دسته در اسنپ‌پی، واژه‌های جستجوی فروشگاه
const CATEGORIES: [RegExp, PayCategory][] = [
  [/پیراهن|شلوار|مانتو|کفش|کتونی|لباس|پوشاک|کیف|تیشرت|تی شرت|کاپشن|جین|هودی|سویشرت|ساعت مچی|عینک|دامن|کت|جوراب/, { dp: 'FASHION_AND_CLOTHING', label: /پوشاک|مد/, sp: ['پوشاک', 'مد'] }],
  [/گوشی|موبایل|لپ ?تاپ|تبلت|هدفون|هندزفری|تلویزیون|کنسول|پلی ?استیشن|دوربین|ساعت هوشمند|کامپیوتر|مانیتور|اسپیکر|پاوربانک/, { dp: 'DIGITAL', label: /دیجیتال|موبایل|الکترونیک/, sp: ['موبایل', 'دیجیتال'] }],
  [/یخچال|لباسشویی|ظرفشویی|جارو|کولر|مبل|فرش|آشپزخانه|ظروف|لوازم خانگی|اجاق|ماکروفر|سرخ ?کن|بخاری|پنکه|(^|\s)اتو(\s|$)|چای ?ساز|قهوه ?ساز|سرویس خواب|تخت|میز|پرده|روشنایی/, { dp: 'HOME_AND_KITCHEN', label: /خانه|آشپزخانه|خانگی/, sp: ['لوازم خانگی', 'خانه'] }],
  [/آرایش|عطر|ادکلن|کرم|شامپو|بهداشتی|ضد ?آفتاب|رژ/, { dp: 'BEAUTY_AND_HEALTH', label: /زیبایی|آرایش|سلامت/, sp: ['آرایشی', 'زیبایی'] }],
  [/طلا|سکه|زیور|جواهر/, { dp: 'GOLD_AND_COINS', label: /طلا|جواهر/, sp: ['طلا', 'گالری'] }],
  [/دوچرخه|ورزشی|کوهنوردی|کمپ|چمدان|تردمیل/, { dp: 'SPORTS_AND_TRAVEL', label: /ورزش|سفر/, sp: ['ورزشی'] }],
  [/کتاب|لوازم ?التحریر|نوشت/, { dp: 'BOOKS_STATIONERY', label: /کتاب|تحریر/, sp: ['کتاب'] }],
  [/اسباب ?بازی|کودک|نوزاد|کالسکه|سیسمونی/, { dp: 'TOYS_FOR_CHILDREN_AND_BABIES', label: /کودک|نوزاد/, sp: ['کودک'] }],
  [/لاستیک|خودرو|موتور|قطعات|روغن موتور/, { dp: 'CARS_AND_MOTORCYCLES', label: /خودرو|موتور/, sp: ['خودرو'] }],
  [/ابزار|دریل|مصالح|ساختمان|شیرآلات/, { dp: 'BUILDING_TOOLS_AND_INDUSTRIAL_EQUIPMENT', label: /ابزار|ساختمان/, sp: ['ابزار'] }]
];

export function payCategory(keywords: string): PayCategory | null {
  return CATEGORIES.find(([re]) => re.test(keywords))?.[1] ?? null;
}

export interface PayQuery { keywords: string; city: CityRef | null }

/** اسنپ‌پی: فروشگاه‌های آنلاین، یا حضوری در شهر کاربر، فقط در همان دسته */
export async function snapppayStores(q: PayQuery): Promise<ShopItem[]> {
  const cat = payCategory(q.keywords);
  if (!cat) return [];
  const replies = await Promise.all(cat.sp.map((w) => request(`https://snapppay.ir/wp-json/spms/v1/search?q=${encodeURIComponent(w)}`).then(obj)));
  const seen = new Set<string>();
  return replies.flatMap((r) => arr(r.results).map(obj)).flatMap((m) => {
    const key = str(m.key);
    const online = m.online === true; const cities = str(m.cities);
    const local = !!q.city && cities.includes(q.city.name);
    if (!key || seen.has(key) || !cat.label.test(str(m.category_fa)) || !(online || local)) return [];
    seen.add(key);
    const url = safeUrl(m.online_url) ?? safeUrl(m.instore_open_href) ?? 'https://snapppay.ir/stores/';
    return [item({
      id: `sp-${key}`, service: 'snapppay', title: str(m.name_fa).trim(), url, image: safeUrl(m.logo) ?? safeUrl(m.image),
      summary: str(m.category_fa) || null, location: online ? 'خرید آنلاین' : `حضوری در ${cities}`, order: online ? 0 : 1,
      facts: [{ label: 'اقساط', value: '۴ قسط بدون سود (اسنپ‌پی)' }]
    })];
  });
}

/** دیجی‌پی: فروشگاه‌های «خرید اعتباری» همان دسته (پاسخ سایت HTML کارت فروشگاه است) */
export async function digipayStores(q: PayQuery): Promise<ShopItem[]> {
  const cat = payCategory(q.keywords);
  if (!cat) return [];
  const html = await request<string>('https://www.mydigipay.com/stores/search?page=0&size=20&count=true', {
    method: 'POST', text: true, headers: { 'X-Requested-With': 'XMLHttpRequest' },
    body: { restrictions: [{ type: 'collection', field: 'categories', values: [cat.dp], operation: 'eq' }, { type: 'collection', field: 'paymentMethods', values: [2], operation: 'eq' }], orders: [{ field: 'priority', order: 'asc' }] }
  });
  return html.split('class="stores-wrapper').slice(1).flatMap((card, order) => {
    const name = plain(/title text-onback-high st-8">([^<]+)</.exec(card)?.[1] ?? '');
    const sub = plain(/title text-onback-medium c-3">([^<]+)</.exec(card)?.[1] ?? '');
    const link = safeUrl(/href="(https:\/\/www\.mydigipay\.com\/stores\/[^"]+)"/.exec(card)?.[1]);
    const img = /<img src="(\/bck-assets\/[^"]+)"/.exec(card)?.[1];
    const cashback = /cashback-badge[^>]*>\s*<span>([^<]+)</.exec(card)?.[1];
    if (!name || !link) return [];
    // فروشگاه چنددسته‌ای: توضیحِ هم‌دسته اول، عمومی بعد، دستهٔ دیگر (پوشاک برای یخچال) حذف
    const otherCategory = CATEGORIES.some(([, c]) => c !== cat && c.label.test(sub)) && !cat.label.test(sub);
    if (otherCategory) return [];
    const rank = cat.label.test(sub) ? 0 : 1;
    return [item({
      id: `dp-${name}`, service: 'digipay', title: name, url: link, image: img ? safeUrl(img, 'https://www.mydigipay.com') : null,
      summary: sub || null, location: 'خرید آنلاین', order: rank * 100 + order,
      facts: [{ label: 'اقساط', value: 'خرید اعتباری دیجی‌پی' }, ...(cashback ? [{ label: 'بازگشت وجه', value: plain(cashback) }] : [])]
    })];
  });
}

