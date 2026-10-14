/** Shopping assistant: Persian request → intent → parallel read-only sources → one ranked answer (≤20 + 5 top picks). */
import { CITIES, cityByName } from '../src/features/shopping/domain/cities.js';
import { parseShopQuery, tehranToday } from '../src/features/shopping/domain/intent.js';
import { rankItems, topPicks } from '../src/features/shopping/domain/rank.js';
import { SERVICE, searchUrl } from '../src/features/shopping/domain/services.js';
import type { Intent, RankedItem, ServiceId, ServiceLink, ShopAnswer, ShopItem, ShopQuery, SourceStatus } from '../src/features/shopping/domain/types.js';
import { asalbanoo, digikala, khanoumi, masterkala, shopino, taaghche, technolife, torob } from './_shopGoods.js';
import { doctoreto, paziresh24 } from './_shopHealth.js';
import { bamadar, divar, foodTypes, okala, sheypoor, snappfood, snappmarket, type DivarCategory } from './_shopLocal.js';
import { digipayStores, payCategory, snapppayStores } from './_shopPay.js';
import { displayImage, SourceError } from './_shopHttp.js';
import { alibabaFlights, buses, flights, otaghak, taxis, tours, trains } from './_shopTravel.js';

interface Task { service: ServiceId; run: () => Promise<ShopItem[]>; stores?: boolean }

const TASK_TIMEOUT_MS = 20_000;
// پل اسنپ‌فود در حالت بیکار هر ۱۲ ثانیه سر می‌زند و تا ۳ جستجو با فاصلهٔ ۱.۵ ثانیه می‌کند؛ ۲۰ ثانیه برای اولین جستجو کم بود
const SLOW_MS: Partial<Record<ServiceId, number>> = { snappfood: 30_000 };
const CLASSIFIEDS: ServiceId[] = ['sheypoor', 'divar'];
const POPULAR = ['تهران', 'مشهد', 'کیش', 'شیراز', 'اصفهان'];

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new SourceError('پاسخ نداد (زمان تمام شد)')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** Which sources answer this request, plus link-only services worth offering. */
export function plan(q: ShopQuery, now: number): { tasks: Task[]; linkOnly: ServiceId[]; hints: string[] } {
  const tasks: Task[] = []; const linkOnly = new Set<ServiceId>(); const hints: string[] = [];
  const add = (service: ServiceId, run: () => Promise<ShopItem[]>, stores = false) => tasks.push({ service, run, stores });
  const want = (i: Intent) => q.intents.includes(i);
  const goods = { keywords: q.keywords, sort: q.sort, maxPrice: q.maxPrice, minPrice: q.minPrice };
  const local = { ...goods, city: q.city, used: q.used };
  const today = tehranToday(now).toISOString().slice(0, 10);
  const named = (id: ServiceId) => q.named.includes(id);
  const needsKeywords = ['product', 'fashion', 'beauty', 'book'].some((i) => want(i as Intent));
  if (needsKeywords && !q.keywords) hints.push('نام کالا یا کتاب را بنویسید؛ مثلاً «گوشی سامسونگ A55 زیر ۲۰ میلیون».');

  if (q.keywords && (want('product') || want('fashion'))) {
    // کالا: فروشگاه‌های آنلاین (نو) + آگهی‌های دیوار و شیپور شهر کاربر (نو و کارکرده) کنار هم؛ «کارکرده» فقط آگهی‌ها
    const classifieds = !!q.city || q.used || CLASSIFIEDS.some(named);
    // فقط شیپور/دیوار نام برده شده؟ فروشگاه‌های آنلاین جستجو نمی‌شوند
    const onlyClassifieds = q.named.length > 0 && q.named.every((id) => CLASSIFIEDS.includes(id));
    if (!q.used && !onlyClassifieds) {
      add('torob', () => torob(goods));
      // خرید اقساطی: دیجی‌کالا با اعتبار دیجی‌پی
      add('digikala', async () => (await digikala(goods)).map((i) => (q.installment ? { ...i, facts: [{ label: 'اقساط', value: 'خرید اعتباری دیجی‌پی' }, ...i.facts] } : i)));
      if (want('fashion')) add('shopino', () => shopino(goods));
      else { add('technolife', () => technolife(goods)); add('masterkala', () => masterkala(goods)); }
    }
    if (classifieds) { add('sheypoor', () => sheypoor(local)); add('divar', () => divar(local)); }
  }
  if (q.keywords && want('beauty')) {
    add('khanoumi', () => khanoumi(goods)); add('asalbanoo', () => asalbanoo(goods));
    if (!tasks.some((t) => t.service === 'digikala')) add('digikala', () => digikala(goods));
  }
  // خرید اقساطی: فروشگاه‌های همان دسته در اسنپ‌پی و دیجی‌پی (بخش جدا از جدول کالاها)
  if (q.installment && q.keywords) {
    if (payCategory(q.keywords)) {
      const pq = { keywords: q.keywords, city: q.city };
      add('snapppay', () => snapppayStores(pq), true);
      add('digipay', () => digipayStores(pq), true);
    } else { linkOnly.add('snapppay'); linkOnly.add('digipay'); }
  }
  if (q.keywords && want('book')) { add('taaghche', () => taaghche(goods)); linkOnly.add('fidibo'); linkOnly.add('sibook'); }
  if (want('food')) {
    // «کروسان یا موهیتو» → هر گزینه جدا؛ بدون نام غذا → همان نوع مکانی که نوشته شده
    const dishes = q.alternatives?.length ? q.alternatives : [q.keywords || (/ک[یت]ترینگ/.test(q.text) ? 'کترینگ' : /کافه|قهوه/.test(q.text) ? 'کافه' : 'غذا')];
    if (q.city) for (const keywords of dishes) add('snappfood', () => snappfood({ ...local, keywords }));
    else hints.push('شهر را بنویسید تا رستوران‌های همان شهر بررسی شوند.');
    linkOnly.add('snappfood');
  }
  // آگهی‌های دسته‌ای: استخدام، املاک، خودرو، خدمات — با دستهٔ خود دیوار؛ شیپور با جستجوی متنی
  const listing: [Intent, DivarCategory, string][] = [
    ['job', 'jobs', 'استخدام'],
    ['estate', q.deal === 'rent' ? 'residential-rent' : q.deal === 'buy' ? 'residential-sell' : 'real-estate', q.deal === 'rent' ? 'اجاره آپارتمان' : 'فروش آپارتمان'],
    ['car', /قطعه|قطعات|یدکی|لاستیک|رینگ|لوازم/.test(q.keywords) ? 'vehicles' : 'cars', 'خودرو'],
    ['service', 'services', 'خدمات']
  ];
  for (const [intent, category, fallback] of listing) {
    if (!want(intent)) continue;
    if (!q.city) { hints.push('شهر را بنویسید یا «شهر من» را انتخاب کنید تا آگهی‌های همان شهر نمایش داده شوند.'); break; }
    const lq = { ...local, used: false };
    if (!q.named.length || named('divar')) add('divar', () => divar({ ...lq, category }));
    const sq = intent === 'estate' && q.deal ? `${q.deal === 'rent' ? 'اجاره' : 'فروش'} ${q.keywords || 'آپارتمان'}` : q.keywords || fallback;
    if (!q.named.length || named('sheypoor')) add('sheypoor', () => sheypoor({ ...lq, keywords: sq }));
  }
  if (want('grocery')) {
    if (q.city && q.keywords) {
      add('snappmarket', () => snappmarket(local));
      add('okala', () => okala(local));
      add('bamadar', () => bamadar(local));
      // میوه‌فروشی و پروتئینی‌ها فقط در اسنپ‌فود هستند (از طریق پل مک)
      if (foodTypes(q.keywords, true).length) add('snappfood', () => snappfood({ ...local, grocery: true }));
    }
    else hints.push('نام کالا و شهر را بنویسید؛ مثلاً «شیر کم‌چرب در اهواز».');
    linkOnly.add('okala');
  }

  const modes = { flight: want('flight'), train: want('train'), bus: want('bus'), taxi: want('taxi') };
  const transport = modes.flight || modes.train || modes.bus || modes.taxi;
  if (transport) {
    // مقصد نگفته؟ پرطرفدارترین مقصدها از شهر کاربر
    const destinations = q.destinations.length ? q.destinations : POPULAR.map((n) => cityByName(n)!).filter((c) => c !== q.origin).slice(0, 4);
    const label = [modes.flight && 'پروازها', modes.train && 'قطارها', modes.bus && 'اتوبوس‌ها', modes.taxi && 'تاکسی‌ها'].filter(Boolean).join(' و ');
    if (!q.origin) hints.push('مبدأ را بنویسید یا «شهر من» را در تنظیمات همین صفحه انتخاب کنید.');
    else if (!q.destinations.length) hints.push(`مقصد را ننوشتید؛ ${label}ی ${q.date === today ? 'امروز ' : ''}از ${q.origin.name} به ${destinations.map((d) => d.name).join('، ')} نمایش داده شد.`);
    for (const destination of destinations) {
      if (!q.origin || destination === q.origin) continue;
      const t = { origin: q.origin, destination, date: q.date, sort: q.sort, today, vipOnly: /vip|وی ?آی ?پی/i.test(q.text) };
      // کرج و تهران هر دو خواسته شده؟ پرواز «نزدیک‌ترین فرودگاه» کرج همان پرواز تهران است
      const nearestIsListed = !!destination.nearIata && destinations.some((d) => d !== destination && d.iata === destination.nearIata);
      if (modes.flight && !nearestIsListed) { add('mrbilit', () => flights(t)); add('alibaba', () => alibabaFlights(t)); }
      if (modes.train) add('mrbilit', () => trains(t));
      if (modes.bus) add('mrbilit', () => buses(t));
      if (modes.taxi) add('mrbilit', () => taxis(t));
    }
    if (modes.flight) { linkOnly.add('flytoday'); linkOnly.add('snapptrip'); }
  }
  if (want('tour')) {
    // تور: مقصد مشخص یا ارزان‌ترین/پیشنهادی تورهای قابل رزرو
    const dests = q.destinations.length ? q.destinations.slice(0, 3) : [null];
    for (const destination of dests) add('jabama', () => tours({ destination, keywords: q.keywords, sort: q.sort, maxPrice: q.maxPrice, today }));
    linkOnly.add('flytoday');
  }
  if (want('stay')) {
    const cities = q.destinations.length ? q.destinations : q.city ? [q.city] : [];
    if (cities.length) add('otaghak', () => otaghak({ cities, date: q.date, nights: q.nights, guests: q.guests, maxPrice: q.maxPrice, minPrice: q.minPrice, sort: q.sort, today }));
    else hints.push('شهر یا منطقهٔ اقامت را بنویسید؛ مثلاً «ویلا در رامسر» یا «شمال».');
    linkOnly.add('jabama'); linkOnly.add('snapptrip');
  }
  if (want('doctor')) {
    if (q.city) {
      const dq = { keywords: q.keywords, city: q.city, now };
      add('paziresh24', () => paziresh24(dq)); add('doctoreto', () => doctoreto(dq));
    } else hints.push('شهر را بنویسید تا پزشکان همان شهر بررسی شوند.');
  }
  for (const id of q.named) if (SERVICE[id].mode === 'link') linkOnly.add(id);
  return { tasks, linkOnly: [...linkOnly], hints };
}

const answers = new Map<string, { at: number; value: ShopAnswer }>();

/** فروشگاه‌های اقساطی: آنلاین‌ها اول، سپس حضوری در شهر کاربر؛ حداکثر ۱۰ */
function rankStores(stores: ShopItem[]): RankedItem[] {
  const seen = new Set<string>();
  return stores.filter((st) => { const k = st.title.replace(/\s+/g, ''); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).slice(0, 10)
    .map((st, i) => ({ ...st, rank: i + 1, score: 0, reasons: [] }));
}
const ANSWER_TTL = 10 * 60_000;

export async function shopAsk(text: string, homeSlug: string | null, now = Date.now()): Promise<ShopAnswer> {
  const home = CITIES.find((c) => c.slug === homeSlug) ?? null;
  const q = parseShopQuery(text, { now, home });
  const key = JSON.stringify([q.intents, q.keywords, q.alternatives, q.city?.slug, q.origin?.slug, q.destinations.map((d) => d.slug), q.date, q.nights, q.guests, q.maxPrice, q.minPrice, q.used, q.sort, q.deal, q.named, q.installment]);
  const hit = answers.get(key);
  if (hit && now - hit.at < ANSWER_TTL) return { ...hit.value, query: q };

  const { tasks, linkOnly, hints } = plan(q, now);
  const status = new Map<ServiceId, SourceStatus>();
  const items: ShopItem[] = [];
  const storeItems: ShopItem[] = [];
  const runAll = async (list: Task[], cap = Infinity) => {
    const settled = await Promise.allSettled(list.map((t) => withTimeout(t.run(), Math.min(SLOW_MS[t.service] ?? TASK_TIMEOUT_MS, cap))));
    settled.forEach((r, i) => {
      const service = list[i].service;
      const s = status.get(service) ?? { service, ok: false, count: 0, note: null };
      if (r.status === 'fulfilled') { s.ok = true; s.count += r.value.length; s.note = null; (list[i].stores ? storeItems : items).push(...r.value); }
      else if (!s.ok) s.note = r.reason instanceof SourceError ? r.reason.message : 'در دسترس نیست';
      status.set(service, s);
    });
  };
  await runAll(tasks);
  let ranked = rankItems(items, q);
  // هیچ نتیجهٔ مرتبطی نبود؟ یک بار با عبارت کوتاه‌تر (بدون صفت‌های اضافه) دوباره جستجو کن
  const words = q.keywords.split(' ').filter(Boolean);
  if (!ranked.length && words.length > 1 && tasks.length) {
    const shorter = { ...q, keywords: words.slice(0, Math.max(1, words.length - 1)).join(' ') };
    items.length = 0; storeItems.length = 0; status.clear();
    await runAll(plan(shorter, now).tasks, TASK_TIMEOUT_MS); // سقف ۶۰ ثانیهٔ تابع Vercel
    ranked = rankItems(items, shorter);
    if (ranked.length) hints.push(`برای «${q.keywords}» نتیجه‌ای نبود؛ نتایج «${shorter.keywords}» نمایش داده شد.`);
  }
  for (const s of status.values()) if (s.ok && !s.count) s.note = 'نتیجه‌ای نداشت';

  const ctx = { city: q.city, origin: q.origin, destination: q.destinations[0] ?? null };
  const linkText = q.keywords || q.text;
  const linkIds = new Set<ServiceId>([...linkOnly, ...[...status.values()].filter((s) => !s.count).map((s) => s.service)]);
  const links: ServiceLink[] = [...linkIds].map((service) => ({ service, url: searchUrl(service, linkText, ctx) }));
  // تصاویر CDNهای ناپایدار از راه سرور
  const viaProxy = <T extends ShopItem>(i: T): T => ({ ...i, image: displayImage(i.image), brandLogo: displayImage(i.brandLogo ?? null) });
  ranked = ranked.map(viaProxy);
  const value: ShopAnswer = { query: q, items: ranked, tops: topPicks(ranked), stores: rankStores(storeItems).map(viaProxy), sources: [...status.values()], links, hints, fetchedAt: now };
  // پاسخی که منبعی در آن شکست خورده (مثلاً پل کند بود) ۱۰ دقیقه نمی‌ماند تا جستجوی بعدی نتیجهٔ پل را بگیرد
  if (ranked.length && [...status.values()].every((s) => s.ok)) {
    if (answers.size > 200) answers.delete(answers.keys().next().value as string);
    answers.set(key, { at: now, value });
  }
  return value;
}
