/** Shopping assistant: Persian request → intent → parallel read-only sources → one ranked answer (≤10 + top pick). */
import { CITIES } from '../src/features/shopping/domain/cities.js';
import { parseShopQuery, tehranToday } from '../src/features/shopping/domain/intent.js';
import { rankItems, topPick } from '../src/features/shopping/domain/rank.js';
import { SERVICE, searchUrl } from '../src/features/shopping/domain/services.js';
import type { Intent, ServiceId, ServiceLink, ShopAnswer, ShopItem, ShopQuery, SourceStatus } from '../src/features/shopping/domain/types.js';
import { asalbanoo, digikala, khanoumi, masterkala, shopino, taaghche, technolife } from './_shopGoods.js';
import { doctoreto, paziresh24 } from './_shopHealth.js';
import { divar, sheypoor, snappfood, snappmarket } from './_shopLocal.js';
import { SourceError } from './_shopHttp.js';
import { flights, otaghak, trains } from './_shopTravel.js';

interface Task { service: ServiceId; run: () => Promise<ShopItem[]> }

const TASK_TIMEOUT_MS = 20_000;
const CLASSIFIEDS: ServiceId[] = ['sheypoor', 'divar'];

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new SourceError('پاسخ نداد (زمان تمام شد)')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** Which sources answer this request, plus link-only services worth offering. */
export function plan(q: ShopQuery, now: number): { tasks: Task[]; linkOnly: ServiceId[]; hints: string[] } {
  const tasks: Task[] = []; const linkOnly = new Set<ServiceId>(); const hints: string[] = [];
  const add = (service: ServiceId, run: () => Promise<ShopItem[]>) => tasks.push({ service, run });
  const want = (i: Intent) => q.intents.includes(i);
  const goods = { keywords: q.keywords, sort: q.sort, maxPrice: q.maxPrice, minPrice: q.minPrice };
  const local = { ...goods, city: q.city, used: q.used };
  const today = tehranToday(now).toISOString().slice(0, 10);
  const named = (id: ServiceId) => q.named.includes(id);
  const needsKeywords = ['product', 'fashion', 'beauty', 'book'].some((i) => want(i as Intent));
  if (needsKeywords && !q.keywords) hints.push('نام کالا یا کتاب را بنویسید؛ مثلاً «گوشی سامسونگ A55 زیر ۲۰ میلیون».');

  if (q.keywords && (want('product') || want('fashion'))) {
    // «کارکرده» یا نام شیپور/دیوار یا ذکر شهر → آگهی‌ها؛ در غیر این صورت فروشگاه‌های آنلاین
    const classifieds = q.used || CLASSIFIEDS.some(named) || q.destinations.length > 0;
    if (!q.used) {
      add('digikala', () => digikala(goods));
      if (want('fashion')) add('shopino', () => shopino(goods));
      else { add('technolife', () => technolife(goods)); add('masterkala', () => masterkala(goods)); }
    }
    if (classifieds) { add('sheypoor', () => sheypoor(local)); add('divar', () => divar(local)); }
  }
  if (q.keywords && want('beauty')) {
    add('khanoumi', () => khanoumi(goods)); add('asalbanoo', () => asalbanoo(goods));
    if (!tasks.some((t) => t.service === 'digikala')) add('digikala', () => digikala(goods));
  }
  if (q.keywords && want('book')) { add('taaghche', () => taaghche(goods)); linkOnly.add('fidibo'); linkOnly.add('sibook'); }
  if (want('food')) {
    if (q.city) add('snappfood', () => snappfood({ ...local, keywords: q.keywords || 'غذا' }));
    else hints.push('شهر را بنویسید تا رستوران‌های همان شهر بررسی شوند.');
    linkOnly.add('snappfood');
  }
  if (want('grocery')) {
    if (q.city && q.keywords) add('snappmarket', () => snappmarket(local));
    else hints.push('نام کالا و شهر را بنویسید؛ مثلاً «شیر کم‌چرب در اهواز».');
    linkOnly.add('okala');
  }

  const trip = want('flight') || want('train') || want('tour');
  if (trip) {
    if (!q.destinations.length) hints.push('مقصد سفر را بنویسید؛ مثلاً «پرواز از اهواز به مشهد».');
    else if (!q.origin) hints.push('مبدأ را بنویسید یا «شهر من» را در تنظیمات همین صفحه انتخاب کنید.');
    for (const destination of q.destinations.slice(0, 3)) {
      if (!q.origin || destination === q.origin) continue;
      const t = { origin: q.origin, destination, date: q.date, sort: q.sort, today };
      if (want('flight') || want('tour')) add('mrbilit', () => flights(t));
      if (want('train') || want('tour')) add('mrbilit', () => trains(t));
    }
    linkOnly.add('flytoday');
  }
  if (want('stay') || want('tour')) {
    const cities = q.destinations.length ? q.destinations : q.city ? [q.city] : [];
    if (cities.length) add('otaghak', () => otaghak({ cities, date: q.date, nights: q.nights, guests: q.guests, maxPrice: q.maxPrice, minPrice: q.minPrice, sort: q.sort, today }));
    else hints.push('شهر یا منطقهٔ اقامت را بنویسید؛ مثلاً «ویلا در رامسر» یا «شمال».');
    linkOnly.add('jabama');
    if (want('tour')) linkOnly.add('flytoday');
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
const ANSWER_TTL = 10 * 60_000;

export async function shopAsk(text: string, homeSlug: string | null, now = Date.now()): Promise<ShopAnswer> {
  const home = CITIES.find((c) => c.slug === homeSlug) ?? null;
  const q = parseShopQuery(text, { now, home });
  const key = JSON.stringify([q.intents, q.keywords, q.city?.slug, q.origin?.slug, q.destinations.map((d) => d.slug), q.date, q.nights, q.guests, q.maxPrice, q.minPrice, q.used, q.sort]);
  const hit = answers.get(key);
  if (hit && now - hit.at < ANSWER_TTL) return { ...hit.value, query: q };

  const { tasks, linkOnly, hints } = plan(q, now);
  const settled = await Promise.allSettled(tasks.map((t) => withTimeout(t.run(), TASK_TIMEOUT_MS)));
  const status = new Map<ServiceId, SourceStatus>();
  const items: ShopItem[] = [];
  settled.forEach((r, i) => {
    const service = tasks[i].service;
    const s = status.get(service) ?? { service, ok: false, count: 0, note: null };
    if (r.status === 'fulfilled') { s.ok = true; s.count += r.value.length; s.note = null; items.push(...r.value); }
    else if (!s.ok) s.note = r.reason instanceof SourceError ? r.reason.message : 'در دسترس نیست';
    status.set(service, s);
  });
  for (const s of status.values()) if (s.ok && !s.count) s.note = 'نتیجه‌ای نداشت';

  const ranked = rankItems(items, q);
  const ctx = { city: q.city, origin: q.origin, destination: q.destinations[0] ?? null };
  const linkText = q.keywords || q.text;
  const linkIds = new Set<ServiceId>([...linkOnly, ...[...status.values()].filter((s) => !s.count).map((s) => s.service)]);
  const links: ServiceLink[] = [...linkIds].map((service) => ({ service, url: searchUrl(service, linkText, ctx) }));
  const value: ShopAnswer = { query: q, items: ranked, top: topPick(ranked), sources: [...status.values()], links, hints, fetchedAt: now };
  if (ranked.length) {
    if (answers.size > 200) answers.delete(answers.keys().next().value as string);
    answers.set(key, { at: now, value });
  }
  return value;
}
