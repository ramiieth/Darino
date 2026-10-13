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

type Weights = { quality: number; trust: number; price: number; discount: number; soon: number };

const PROFILE: Record<'goods' | 'food' | 'trip' | 'stay' | 'doctor', { best: Weights; cheapest: Weights }> = {
  goods: { best: { quality: 0.4, trust: 0.15, price: 0.3, discount: 0.15, soon: 0 }, cheapest: { quality: 0.15, trust: 0.1, price: 0.65, discount: 0.1, soon: 0 } },
  food: { best: { quality: 0.4, trust: 0.1, price: 0.35, discount: 0.15, soon: 0 }, cheapest: { quality: 0.15, trust: 0.05, price: 0.6, discount: 0.2, soon: 0 } },
  trip: { best: { quality: 0, trust: 0, price: 0.8, discount: 0, soon: 0.2 }, cheapest: { quality: 0, trust: 0, price: 0.92, discount: 0, soon: 0.08 } },
  stay: { best: { quality: 0.35, trust: 0.2, price: 0.35, discount: 0.1, soon: 0 }, cheapest: { quality: 0.15, trust: 0.1, price: 0.65, discount: 0.1, soon: 0 } },
  doctor: { best: { quality: 0.45, trust: 0.3, price: 0, discount: 0, soon: 0.25 }, cheapest: { quality: 0.35, trust: 0.2, price: 0.25, discount: 0, soon: 0.2 } }
};

const MAX_PER_SOURCE = 6;

/* ---------- ارتباط عنوان با درخواست ---------- */

// املاهای رایج فارسی/لاتین یک برند یا کالا → یک شکل
const SYNONYMS: [RegExp, string][] = [
  [/پلی ?استیشن|پلیستیشن|playstation|پی ?اس(?= ?\d)/g, 'ps'], [/ایکس ?باکس|xbox/g, 'xbox'], [/آیفون|ایفون|iphone/g, 'iphone'],
  [/سامسونگ|samsung/g, 'samsung'], [/شیائومی|شیاومی|xiaomi|redmi|ردمی/g, 'xiaomi'], [/ایرپاد|airpods?/g, 'airpods'],
  [/لپ ?تاپ|laptop|notebook/g, 'laptop'], [/جارو ?برقی/g, 'جاروبرقی'], [/هدفون|هندزفری|هدست|headphone|earbuds?/g, 'هدفون'],
  [/بی ?سیم|بلوتوث(ی)?|wireless|bluetooth/g, 'بیسیم'], [/گوشی|موبایل|تلفن همراه/g, 'گوشی'], [/تلویزیون|tv/g, 'تلویزیون'], [/اسلیم|slim/g, 'slim']
];
// عنوانی که با این واژه‌ها شروع شود معمولاً لوازم جانبی است، نه خود کالا
const ACCESSORY = /^(کاور|قاب|روکش|محافظ|گلس|کیف|کیس|شارژر|کابل|پایه|استند|برچسب|اسکین|تعمیر|تعمیرات|دیسک|بازی|کنترلر|دسته|باتری|فیلم|بند|لوازم|قطعات)/;

function canon(text: string): string {
  let t = normalizeFa(text).toLowerCase();
  for (const [re, to] of SYNONYMS) t = t.replace(re, ` ${to} `);
  return t.replace(/\s+/g, ' ').replace(/([a-z]+) (\d)/g, '$1$2').trim();
}

/** ۰ تا ۱: چه کسری از واژه‌های درخواست در عنوان آمده؛ لوازم جانبی جریمه می‌شوند */
export function relevance(title: string, keywords: string): number {
  const words = canon(keywords).split(' ').filter((w) => w.length > 1 || /\d/.test(w));
  if (!words.length) return 1;
  const t = canon(title);
  const tokens = t.split(' ');
  const hit = words.filter((w) => t.includes(w) || tokens.some((x) => x.length > 2 && w.startsWith(x))).length / words.length;
  const accessory = ACCESSORY.test(t) && !ACCESSORY.test(canon(keywords));
  return accessory ? hit * 0.35 : hit;
}
export const MAX_RESULTS = 10;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const fa = (n: number) => new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(n);

function profileOf(item: ShopItem, intents: Intent[]): keyof typeof PROFILE {
  if (item.service === 'paziresh24' || item.service === 'doctoreto') return 'doctor';
  if (item.service === 'mrbilit') return 'trip';
  if (item.service === 'otaghak') return 'stay';
  if (item.service === 'snappfood' || intents.includes('food')) return 'food';
  return 'goods';
}

/** نتایج خارج از بودجه یا ناموجود حذف می‌شوند؛ آگهی «توافقی» می‌ماند */
export function withinBudget(items: ShopItem[], q: Pick<ShopQuery, 'maxPrice' | 'minPrice'>): ShopItem[] {
  return items.filter((i) =>
    i.available &&
    (i.priceToman == null || ((q.maxPrice == null || i.priceToman <= q.maxPrice) && (q.minPrice == null || i.priceToman >= q.minPrice))));
}

export function rankItems(items: ShopItem[], q: Pick<ShopQuery, 'intents' | 'sort' | 'maxPrice' | 'minPrice' | 'keywords'>): RankedItem[] {
  const pool = withinBudget(items, q);
  const seen = new Set<string>();
  const deduped = pool.filter((i) => { const k = `${i.service}:${i.title}:${i.priceToman}`; if (seen.has(k)) return false; seen.add(k); return true; });
  // کالا و آگهی باید به درخواست مربوط باشند؛ پرواز، اقامت و پزشک از قبل با فیلتر خود منبع آمده‌اند
  const textual = (i: ShopItem) => profileOf(i, q.intents) === 'goods' || profileOf(i, q.intents) === 'food';
  const rel = new Map(deduped.map((i) => [i, textual(i) ? relevance(i.title, q.keywords) : 1]));
  const strong = deduped.filter((i) => rel.get(i)! >= 0.6);
  const unique = strong.length >= 3 ? strong : deduped.filter((i) => rel.get(i)! >= 0.34);

  // قیمت‌ها در هر گروه (کالا، پرواز، اقامت…) جدا نرمال می‌شوند
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
    const score = (w.quality * quality + w.trust * trust + w.price * priceScore + w.discount * discount + w.soon * soon) * (0.55 + 0.45 * rel.get(item)!);

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
  const sources = new Set(scored.map((s) => s.service));
  const perSource = new Map<string, number>();
  const out: RankedItem[] = [];
  for (const s of scored) {
    const n = perSource.get(s.service) ?? 0;
    if (sources.size > 1 && n >= MAX_PER_SOURCE) continue;
    perSource.set(s.service, n + 1);
    out.push({ ...s, rank: out.length + 1 });
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}

/** «پیشنهاد برتر» با دلیل کوتاه، در مقایسه با بقیهٔ گزینه‌ها */
export function topPick(items: RankedItem[]): { item: RankedItem; why: string } | null {
  const item = items[0];
  if (!item) return null;
  const parts = [...item.reasons];
  const runner = items[1];
  if (runner && item.priceToman != null && runner.priceToman != null && item.priceToman < runner.priceToman) {
    parts.push(`${fa(Math.round((runner.priceToman - item.priceToman) / 1000) * 1000)} تومان ارزان‌تر از رتبهٔ دوم`);
  }
  if (!parts.length) parts.push('بیشترین امتیاز ترکیبی قیمت، کیفیت و اعتبار');
  return { item, why: `${SERVICE[item.service].name}: ${[...new Set(parts)].slice(0, 3).join('، ')}` };
}
