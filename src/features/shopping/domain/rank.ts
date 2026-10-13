/** ============================================================
 * رتبه‌بندی چندمنبعی «دستیار خرید» — شفاف و قابل توضیح
 *
 *  امتیاز ۰ تا ۱۰۰ = وزن‌های جدول PROFILE بر حسب نیت و مرتب‌سازی:
 *   کیفیت (میانگین بیزی امتیاز، مثل «بهترین خرید» دیجی‌کالا) · اعتبار (تعداد نظر)
 *   · قیمت (نسبت به ارزان‌ترین/گران‌ترین نامزد) · تخفیف · زودی (نوبت/حرکت)
 *  از هر منبع حداکثر ۶ گزینه تا نتیجه از چند پلتفرم باشد.
 * ============================================================ */
import { bayesStars } from '../digikala/domain/score.js';
import { normalizeFa } from './intent.js';
import { SERVICE } from './services.js';
import type { Intent, RankedItem, ShopItem, ShopQuery } from './types.js';

type Weights = { quality: number; trust: number; price: number; discount: number; soon: number; fresh?: number };

const PROFILE: Record<'goods' | 'food' | 'trip' | 'stay' | 'doctor' | 'listing', { best: Weights; cheapest: Weights }> = {
  // آگهی استخدام/املاک/خودرو/خدمات: تازگی (جایگاه در فهرست خود منبع) + ارتباط؛ قیمت فقط در «ارزان‌ترین»
  listing: { best: { quality: 0, trust: 0, price: 0.1, discount: 0, soon: 0, fresh: 0.9 }, cheapest: { quality: 0, trust: 0, price: 0.75, discount: 0, soon: 0, fresh: 0.25 } },
  goods: { best: { quality: 0.4, trust: 0.15, price: 0.3, discount: 0.15, soon: 0 }, cheapest: { quality: 0.15, trust: 0.1, price: 0.65, discount: 0.1, soon: 0 } },
  food: { best: { quality: 0.4, trust: 0.1, price: 0.35, discount: 0.15, soon: 0 }, cheapest: { quality: 0.15, trust: 0.05, price: 0.6, discount: 0.2, soon: 0 } },
  trip: { best: { quality: 0, trust: 0, price: 0.8, discount: 0, soon: 0.2 }, cheapest: { quality: 0, trust: 0, price: 0.92, discount: 0, soon: 0.08 } },
  stay: { best: { quality: 0.35, trust: 0.2, price: 0.35, discount: 0.1, soon: 0 }, cheapest: { quality: 0.15, trust: 0.1, price: 0.65, discount: 0.1, soon: 0 } },
  doctor: { best: { quality: 0.45, trust: 0.3, price: 0, discount: 0, soon: 0.25 }, cheapest: { quality: 0.35, trust: 0.2, price: 0.25, discount: 0, soon: 0.2 } }
};

const MAX_PER_SOURCE = 10;

/* ---------- ارتباط عنوان با درخواست ---------- */

// املاهای رایج فارسی/لاتین یک برند یا کالا → یک شکل
const SYNONYMS: [RegExp, string][] = [
  [/پلی ?استیشن|پلیستیشن|playstation|پی ?اس(?= ?\d)/g, 'ps'], [/ایکس ?باکس|xbox/g, 'xbox'], [/آیفون|ایفون|iphone/g, 'iphone'],
  [/سامسونگ|samsung/g, 'samsung'], [/شیائومی|شیاومی|xiaomi|redmi|ردمی/g, 'xiaomi'], [/ایرپاد|airpods?/g, 'airpods'],
  [/لپ ?تاپ|laptop|notebook/g, 'laptop'], [/جارو ?برقی/g, 'جاروبرقی'], [/هدفون|هندزفری|هدست|headphone|earbuds?/g, 'هدفون'],
  [/بی ?سیم|بلوتوث(ی)?|wireless|bluetooth/g, 'بیسیم'], [/ظروف|ظرف/g, 'ظرف'], [/وسایل|وسیله/g, 'وسیله'], [/لوازم/g, 'لوازم'], [/گوشی|موبایل|تلفن همراه/g, 'گوشی'], [/تلویزیون|tv/g, 'تلویزیون'], [/اسلیم|slim/g, 'slim']
];
// عنوانی که با این واژه‌ها شروع شود معمولاً لوازم جانبی است، نه خود کالا
const ACCESSORY = /^(?:(?:فروش|فروشی|خرید|ویژه|حراج|تخفیف)\s+)*(کاور|قاب|کوله|روکش|محافظ|گلس|کیف|کیس|شارژر|کابل|پایه|استند|برچسب|اسکین|تعمیر|تعمیرات|دیسک|بازی|کنترلر|دسته|باتری|باطری|فیلم|بند|لوازم|قطعات|کارتن|جعبه|چراغ|آینه|سپر|گلگیر|کاپوت|لنت|فیلتر|رینگ|قالپاق)/;
// آگهی خدمات/تعمیر یا خریدار، خودِ کالا نیست (مگر کاربر همین را خواسته باشد)
const SERVICE_AD = /تعمیر|نمایندگی|سرویس (و|کار)|خریدار|خرید (فوری|نقدی)|خرید ?و? ?فروش|خریدفروش|می ?خریم|گازگیری|نصب/;

function canon(text: string): string {
  let t: string = normalizeFa(text).toLowerCase();
  for (const [re, to] of SYNONYMS) t = t.replace(re, ` ${to} `);
  t = t.replace(/\s+/g, ' ').replace(/([a-z]+) (\d)/g, '$1$2')
    // واحدها: «۳۰۰ گرمی» = «300گرم»، «یک کیلویی» = «1کیلو» = «1000گرم»، «۱.۵ لیتری» = «1.5لیتر»
    .replace(/(\d+(?:\.\d+)?) ?(کیلوگرمی|کیلوگرم|کیلویی|کیلو|kg)(?=\s|$|[^\p{L}])/gu, '$1کیلو')
    .replace(/(\d+(?:\.\d+)?) ?(گرمی|گرم|gr|g)(?=\s|$|[^\p{L}])/gu, (_, n: string) => (Number(n) >= 1000 && Number(n) % 1000 === 0 ? `${Number(n) / 1000}کیلو` : `${n}گرم`))
    .replace(/(\d+(?:\.\d+)?) ?(لیتری|لیتر)(?=\s|$|[^\p{L}])/gu, '$1لیتر')
    .replace(/(\d+) ?(میلی ?لیتری|میلی ?لیتر|سی ?سی|ml)(?=\s|$|[^\p{L}])/gu, (_, n: string) => (Number(n) >= 1000 && Number(n) % 1000 === 0 ? `${Number(n) / 1000}لیتر` : `${n}میلی`));
  return t.trim();
}

/** ۰ تا ۱: چه کسری از واژه‌های درخواست در عنوان آمده؛ لوازم جانبی جریمه می‌شوند */
export function relevance(title: string, keywords: string, strictNumbers = true): number {
  const words = canon(keywords).split(' ').filter((w) => w.length > 1 || /\d/.test(w));
  if (!words.length) return 1;
  const t = canon(title);
  const tokens = t.split(' ');
  const hit = words.filter((w) => t.includes(w) || tokens.some((x) => x.length > 2 && w.startsWith(x))).length / words.length;
  const k = canon(keywords);
  const accessory = ACCESSORY.test(t) && !ACCESSORY.test(k);
  const serviceAd = SERVICE_AD.test(t) && !SERVICE_AD.test(k);
  // واژهٔ اول (اسم اصلی در فارسی) باید در عنوان باشد: «ظروف پلاستیکی» ≠ «چاقو با دستهٔ پلاستیکی»
  const head = words[0];
  // «کمربند مخصوص شلوار»، «کاور مناسب برای گوشی»: کالای دیگری «برای» کالای خواسته‌شده
  const forOther = !t.startsWith(head) && new RegExp(`(مخصوص|مناسب|برای|جهت|سازگار با)( [^ ]+){0,2} ${head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t);
  const headHit = t.includes(head) || tokens.some((x) => x.length > 2 && head.startsWith(x));
  // عددها (۵۵ اینچ، A55، ۲۰۶) شرط‌اند: «تلویزیون ۳۲ اینچ» جواب «۵۵ اینچ» نیست
  const numbersMissing = words.filter((w) => /\d/.test(w)).some((w) => !new RegExp(`(^|[^\\d.])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t));
  return hit * (accessory || forOther ? 0.3 : 1) * (serviceAd ? 0.5 : 1) * (headHit || words.length === 1 ? 1 : 0.45) * (numbersMissing && strictNumbers ? 0.3 : 1);
}
export const MAX_RESULTS = 20;
export const TOP_PICKS = 5;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const fa = (n: number) => new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(n);

function profileOf(item: ShopItem, intents: Intent[]): keyof typeof PROFILE {
  if (item.service === 'paziresh24' || item.service === 'doctoreto') return 'doctor';
  if (item.service === 'mrbilit') return 'trip';
  if (item.service === 'otaghak') return 'stay';
  if ((item.service === 'divar' || item.service === 'sheypoor') && intents.some((i) => i === 'job' || i === 'estate' || i === 'car' || i === 'service')) return 'listing';
  if (item.service === 'snappfood' || intents.includes('food')) return 'food';
  return 'goods';
}

/** نتایج خارج از بودجه یا ناموجود حذف می‌شوند؛ آگهی «توافقی» می‌ماند */
export function withinBudget(items: ShopItem[], q: Pick<ShopQuery, 'maxPrice' | 'minPrice'>): ShopItem[] {
  return items.filter((i) =>
    i.available &&
    (i.priceToman == null || ((q.maxPrice == null || i.priceToman <= q.maxPrice) && (q.minPrice == null || i.priceToman >= q.minPrice))));
}

export function rankItems(items: ShopItem[], q: Pick<ShopQuery, 'intents' | 'sort' | 'maxPrice' | 'minPrice' | 'keywords'> & { deal?: ShopQuery['deal'] }): RankedItem[] {
  const pool = withinBudget(items, q);
  const seen = new Set<string>();
  const deduped = pool.filter((i) => { const k = profileOf(i, q.intents) === 'trip' ? i.id : `${i.service}:${i.title}:${i.priceToman}`; if (seen.has(k)) return false; seen.add(k); return true; });
  // کالا و آگهی باید به درخواست مربوط باشند؛ پرواز، اقامت و پزشک از قبل با فیلتر خود منبع آمده‌اند
  // فروشگاه‌های مواد غذایی برای یک واژهٔ کلی («میوه» → «سیب قرمز») به جستجوی خودشان اعتماد می‌شود؛
  // ولی «سس مایونز ۳۰۰ گرمی» یا برند باید واقعاً در عنوان باشد
  const GROCERY: string[] = ['snappmarket', 'snappfood', 'okala', 'bamadar'];
  const kwWords = q.keywords.split(' ').filter(Boolean);
  const generic = kwWords.length <= 1 && !/\d/.test(q.keywords);
  const textual = (i: ShopItem) => (GROCERY.includes(i.service) ? !generic : ['goods', 'listing'].includes(profileOf(i, q.intents)));
  const dealPenalty = (i: ShopItem) => (q.deal === 'rent' && /فروش|پیش ?فروش/.test(i.title) && !/اجاره|رهن/.test(i.title)) || (q.deal === 'buy' && /اجاره|رهن/.test(i.title) && !/فروش/.test(i.title)) ? 0.3 : 1;
  const rel = new Map(deduped.map((i) => [i, (textual(i) ? relevance(i.title, q.keywords) : 1) * dealPenalty(i)]));
  let strong = deduped.filter((i) => rel.get(i)! >= 0.6);
  let unique = strong.length >= 3 ? strong : deduped.filter((i) => rel.get(i)! >= 0.34);
  // «۳۰۰ گرمی» دقیقاً نبود؟ نزدیک‌ترین اندازه‌ها (بدون شرط عدد) به‌جای پاسخ خالی
  if (!unique.length && /\d/.test(q.keywords)) {
    for (const i of deduped) rel.set(i, (textual(i) ? relevance(i.title, q.keywords, false) : 1) * dealPenalty(i));
    strong = deduped.filter((i) => rel.get(i)! >= 0.6);
    unique = (strong.length ? strong : deduped.filter((i) => rel.get(i)! >= 0.34)).map((i) => ({ ...i, facts: [{ label: 'اندازه', value: 'نزدیک‌ترین به درخواست' }, ...i.facts] }));
    for (const i of unique) rel.set(i, 0.8);
  }

  // قیمت‌ها در هر گروه (کالا، پرواز، اقامت…) جدا نرمال می‌شوند
  // قیمت نمادین آگهی («۱۱۱٬۱۱۱» یا «۱۰۰ هزار» برای یخچال) = توافقی؛ از مقایسهٔ قیمت بیرون
  // میانهٔ قیمت فروشگاه‌ها پیش از فیلتر بودجه (تا آگهی «۱ میلیون» لپ‌تاپ هم شناخته شود)
  const shopPrices = items.filter((i) => i.priceToman && i.service !== 'divar' && i.service !== 'sheypoor').map((i) => i.priceToman!).sort((a, b) => a - b);
  const shopMedian = shopPrices.length >= 3 ? shopPrices[Math.floor(shopPrices.length / 2)] : null;
  const fake = (i: ShopItem) => (i.service === 'divar' || i.service === 'sheypoor') && i.priceToman != null && (/^(\d)\1{4,}$/.test(String(i.priceToman)) || (shopMedian != null && i.priceToman < shopMedian * 0.12));
  for (const i of unique) if (fake(i)) { i.facts = [...i.facts.filter((f) => f.label !== 'قیمت'), { label: 'قیمت', value: 'توافقی' }]; i.priceToman = null; }
  const groups = new Map<string, number[]>();
  for (const i of unique) if (i.priceToman) { const g = profileOf(i, q.intents); groups.set(g, [...(groups.get(g) ?? []), i.priceToman]); }
  const median = (g: string) => { const s = [...(groups.get(g) ?? [])].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

  const scored = unique.map((item) => {
    const g = profileOf(item, q.intents);
    const w = PROFILE[g][q.sort];
    const prices = groups.get(g) ?? [];
    const lo = Math.min(...prices); const hi = Math.max(...prices);
    const priceScore = item.priceToman == null ? (g === 'doctor' ? 0.5 : 0.3) : hi === lo ? 1 : clamp01(1 - (item.priceToman - lo) / (hi - lo));
    const count = item.ratingCount ?? 0;
    const quality = clamp01((bayesStars(item.rating, count) - 1) / 4);
    const trust = clamp01(Math.log10(count + 1) / Math.log10(2001));
    const discount = clamp01(item.discountPercent / 50);
    const soon = item.soonDays == null ? 0.4 : clamp01(1 - item.soonDays / 30);
    const fresh = item.order == null ? 0.5 : clamp01(1 - item.order / 25);
    const score = (w.quality * quality + w.trust * trust + w.price * priceScore + w.discount * discount + w.soon * soon + (w.fresh ?? 0) * fresh) * (0.55 + 0.45 * rel.get(item)!);

    const reasons: string[] = [];
    const med = median(g);
    if (item.priceToman === 0) reasons.push('رایگان');
    else if (item.priceToman != null && prices.length > 2 && item.priceToman === lo) reasons.push('ارزان‌ترین گزینه');
    else if (item.priceToman != null && med && prices.length > 2 && item.priceToman < med) reasons.push(`${fa(Math.round((1 - item.priceToman / med) * 100))}٪ ارزان‌تر از میانه`);
    if (item.discountPercent >= 10) reasons.push(`${fa(item.discountPercent)}٪ تخفیف`);
    if (item.rating != null && count >= 20 && item.rating >= 4.2) reasons.push(`امتیاز ${fa(item.rating)} از ${fa(count)} نظر`);
    else if (item.rating != null && count > 0 && count < 10) reasons.push('نظرات کم');
    if (item.soonDays != null && item.soonDays <= 3 && g === 'doctor') reasons.push(item.soonDays === 0 ? 'نوبت امروز' : `نوبت تا ${fa(item.soonDays)} روز دیگر`);
    return { ...item, rank: 0, score: Math.round(score * 1000) / 10, reasons };
  });

  scored.sort((a, b) => b.score - a.score || (a.priceToman ?? Infinity) - (b.priceToman ?? Infinity));
  // سفر: هر مسیر و هر وسیله (پرواز/قطار/اتوبوس/تاکسی) سهم منصفانه؛ بقیه: هر منبع حداکثر ۱۰
  const bucketOf = (i: ShopItem) => (profileOf(i, q.intents) === 'trip' ? `${i.location}|${i.title.split(' ')[0]}` : i.service);
  const buckets = new Set(scored.map(bucketOf));
  const trip = scored.some((i) => profileOf(i, q.intents) === 'trip');
  const cap = trip ? Math.max(2, Math.floor(MAX_RESULTS / Math.max(1, buckets.size))) : MAX_PER_SOURCE;
  const perGroup = new Map<string, number>();
  const out: RankedItem[] = [];
  const take = (s: RankedItem) => { perGroup.set(bucketOf(s), (perGroup.get(bucketOf(s)) ?? 0) + 1); out.push({ ...s, rank: out.length + 1 }); };
  for (const s of scored) {
    if (out.length >= MAX_RESULTS) break;
    if (buckets.size > 1 && (perGroup.get(bucketOf(s)) ?? 0) >= cap) continue;
    take(s);
  }
  // سهم گروه‌های کم‌نتیجه پر نشد؟ بقیه با بهترین‌های باقی‌مانده
  for (const s of scored) {
    if (out.length >= MAX_RESULTS) break;
    if (!out.some((o) => o.id === s.id)) take(s);
  }
  out.sort((a, b) => b.score - a.score || (a.priceToman ?? Infinity) - (b.priceToman ?? Infinity));
  return out.map((o, i) => ({ ...o, rank: i + 1 }));
}

/** «پیشنهاد برتر» با دلیل کوتاه، در مقایسه با بقیهٔ گزینه‌ها */
export function topPick(items: RankedItem[]): { item: RankedItem; why: string } | null {
  return topPicks(items, 1)[0] ?? null;
}

/** «پیشنهادهای برتر» (پیش‌فرض ۵) با دلیل کوتاه هرکدام، در مقایسه با گزینهٔ بعدی */
export function topPicks(items: RankedItem[], n = TOP_PICKS): { item: RankedItem; why: string }[] {
  return items.slice(0, n).map((item, i) => {
    const parts = [...item.reasons];
    const next = items[i + 1];
    if (next && item.priceToman != null && next.priceToman != null && item.priceToman < next.priceToman) {
      parts.push(`${fa(Math.round((next.priceToman - item.priceToman) / 1000) * 1000)} تومان ارزان‌تر از رتبهٔ ${fa(i + 2)}`);
    }
    if (!parts.length) parts.push(i === 0 ? 'بیشترین امتیاز ترکیبی قیمت، کیفیت و اعتبار' : 'امتیاز ترکیبی بالا در میان نتایج');
    return { item, why: `${SERVICE[item.service].name}: ${[...new Set(parts)].slice(0, 3).join('، ')}` };
  });
}
