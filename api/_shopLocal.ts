/** City-scoped sources: Sheypoor and Divar classifieds, Snappfood dishes, SnappMarket groceries. Read-only public search. */
import { arr, obj, str } from '../src/features/connected/domain/model.js';
import type { CityRef, ShopItem } from '../src/features/shopping/domain/types.js';
import { item } from './_shopGoods.js';
import { json, num, request, safeUrl, SourceError } from './_shopHttp.js';
import { bridgeOnline, relayConfigured, relaySearch } from './_shopRelay.js';

export interface LocalQuery { keywords: string; city: CityRef | null; sort: 'best' | 'cheapest'; maxPrice: number | null; minPrice: number | null; used: boolean }
/** دستهٔ آگهی دیوار (همه با درخواست واقعی بررسی شده‌اند) */
export type DivarCategory = 'jobs' | 'real-estate' | 'residential-rent' | 'residential-sell' | 'cars' | 'vehicles' | 'services';

const FA = /[۰-۹]/g;
const toLatin = (s: string) => s.replace(FA, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

/** «۱۲۰,۰۰۰,۰۰۰ تومان» / «12,000,000 ریال» → تومان؛ کمتر از ۱۰ هزار تومان قیمت واقعی آگهی نیست */
export function adPrice(amount: string, currency = ''): number | null {
  const n = Number(toLatin(amount).replace(/[^\d]/g, ''));
  if (!n) return null;
  const toman = /ریال/.test(currency + amount) ? Math.round(n / 10) : n;
  return toman >= 10_000 ? toman : null;
}

export async function sheypoor(q: LocalQuery): Promise<ShopItem[]> {
  const qs = new URLSearchParams({ q: q.keywords, p: '1' });
  if (q.sort === 'cheapest') qs.set('o', 'pa');
  if (q.maxPrice) qs.set('mxp', String(q.maxPrice));
  if (q.minPrice) qs.set('mnp', String(q.minPrice));
  const data = await json(`https://www.sheypoor.com/api/v10.0.0/search/${q.city?.sheypoorSlug ?? 'iran'}?${qs}`);
  const rows = arr(data.data).map(obj).flatMap((g) => (g.type === 'listingGroup' || g.type === 'vip' ? arr(g.items).map(obj) : g.type === 'normal' ? [g] : []));
  const cityName = q.city?.name;
  return rows.filter((r) => { const loc = str(obj(r.attributes).location); return !cityName || !loc || loc.includes(cityName); }).map((r, order) => {
    const a = obj(r.attributes); const price = obj(arr(a.price)[0]);
    const thumbs = obj(obj(a.images).thumbnails);
    return item({
      id: `sp-${str(r.id)}`, service: 'sheypoor', title: str(a.title).trim(), url: safeUrl(a.url) ?? '',
      image: safeUrl(thumbs.landscape) ?? safeUrl(thumbs.round), priceToman: adPrice(str(price.amount), str(price.currency)),
      location: str(a.location) || null, summary: str(a.timePassedLabel) || null, order,
      facts: str(price.amount) && !adPrice(str(price.amount)) ? [{ label: 'قیمت', value: 'توافقی' }] : []
    });
  }).filter((i) => i.title && i.url);
}

export async function divar(q: LocalQuery & { category?: DivarCategory }): Promise<ShopItem[]> {
  const data0 = q.category ? { category: { str: { value: q.category } } } : {};
  const body = { city_ids: [String(q.city?.divarId ?? 1)], search_data: { form_data: { data: data0 }, query: q.keywords } };
  const data = await json('https://api.divar.ir/v8/postlist/w/search', { method: 'POST', body });
  return arr(data.list_widgets).map(obj).filter((w) => w.widget_type === 'POST_ROW').map((w, order) => {
    const d = obj(w.data); const info = obj(obj(obj(d.action).payload).web_info);
    const token = str(d.token) || str(obj(obj(d.action).payload).token);
    const top = str(d.top_description_text).trim();
    const middle = str(d.middle_description_text).trim();
    // کالا: بالا = وضعیت (نو/کارکرده)، وسط = قیمت · اجاره: بالا = ودیعه، وسط = اجاره · استخدام: بالا = حقوق، وسط = نوع پرداخت
    const isCondition = /^(نو|در حد نو|کارکرده|نیاز به تعمیر|سالم)$/.test(top);
    const label = /ودیعه/.test(top) ? 'ودیعه' : q.category === 'jobs' ? 'حقوق' : 'جزئیات';
    const facts = [
      ...(middle && !adPrice(middle) ? [{ label: 'قیمت', value: middle.includes('توافق') ? 'توافقی' : middle }] : []),
      ...(top && !isCondition ? [{ label, value: top.replace(/^ودیعه:\s*/, '') }] : [])
    ];
    return item({
      id: `dv-${token}`, service: 'divar', title: str(d.title).trim(), url: /^[\w-]{4,20}$/.test(token) ? `https://divar.ir/v/${token}` : '',
      image: safeUrl(d.image_url), priceToman: adPrice(middle), location: [str(info.city_persian), str(info.district_persian)].filter(Boolean).join('، ') || null,
      summary: [isCondition ? top : '', str(d.bottom_description_text)].filter(Boolean).join(' · ') || null,
      facts, order, available: !(q.used && top === 'نو')
    });
  }).filter((i) => i.title && i.url);
}

/* ---------- Snappfood: restaurants, cafés, pastry shops, caterers ---------- */

const CAFE = /کافه|قهوه|لاته|کاپوچینو|اسپرسو|موکا|آیس|نوشیدنی|آبمیوه|اسموتی|شیک|کیک|کروسان|دسر|شیرینی|بستنی|چای/;
const FRUIT = /میوه|سبزی|تره ?بار|صیفی/;
const PROTEIN = /گوشت|مرغ|ماهی|میگو|قصابی|پروتئین|تخم ?مرغ/;

/** Snappfood verticals: 0 = default mix (restaurants, fast food, caterers), 2 = cafés, 3 = pastry, 6 = fruit, 11 = protein shops. */
export function foodTypes(keywords: string, grocery = false): number[] {
  if (grocery) return FRUIT.test(keywords) ? [6] : PROTEIN.test(keywords) ? [11] : [];
  return CAFE.test(keywords) ? [0, 2, 3] : [0];
}

const short = (v: unknown, n = 120) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** Items arrive pre-normalised from the Mac bridge (tools/snappfood-bridge); every field is re-validated here. */
export function parseSnappfood(items: unknown[], city: CityRef): ShopItem[] {
  const seen = new Set<string>();
  return items.map(obj).flatMap((it) => {
    const v = obj(it.vendor);
    const code = short(v.code, 16); const pid = short(String(it.id ?? ''), 20);
    if (!/^[\w-]{3,16}$/.test(code) || !/^\d{1,20}$/.test(pid) || seen.has(`${code}:${pid}`)) return [];
    seen.add(`${code}:${pid}`);
    const before = num(it.price); const final = num(it.final) ?? before;
    const r10 = num(it.rating10) ?? num(v.rating10);
    const fee = num(v.fee);
    const type = short(v.type, 30);
    return [item({
      id: `sf-${code}-${pid}`, service: 'snappfood', title: short(it.title), url: `https://snappfood.ir/restaurant/menu/${code}?productId=${pid}`,
      image: safeUrl(it.image) ?? safeUrl(v.logo), brandLogo: safeUrl(v.logo),
      priceToman: final != null && final > 0 ? Math.round(final) : null, priceBeforeToman: before && final && before > final ? Math.round(before) : null,
      discountPercent: Math.max(0, Math.min(99, Math.round(num(it.discountRatio) ?? 0))),
      rating: r10 != null && r10 > 0 && r10 <= 10 ? Math.round(r10 * 5) / 10 : null, ratingCount: num(v.comments),
      summary: [type, short(v.title, 60)].filter(Boolean).join(' ') || null,
      location: [city.name, short(v.area, 40)].filter(Boolean).join('، '), available: v.open !== false,
      facts: [
        ...(fee != null ? [{ label: 'پیک', value: fee === 0 ? 'رایگان' : `${fee.toLocaleString('en-US')} تومان` }] : []),
        ...(short(it.desc, 90) ? [{ label: 'توضیح', value: short(it.desc, 90) }] : [])
      ]
    })];
  }).filter((i) => i.title);
}

/** Snappfood blocks non-Iranian IPs, so a configured Mac bridge (Iranian VPN route) fetches it. */
export async function snappfood(q: LocalQuery & { grocery?: boolean }): Promise<ShopItem[]> {
  const c = q.city;
  const types = foodTypes(q.keywords, q.grocery);
  if (!c || !types.length) return [];
  const job = { query: q.keywords.slice(0, 60), lat: c.lat, lon: c.lon, types, discount: q.sort === 'cheapest' };
  if (relayConfigured()) {
    if (!(await bridgeOnline())) throw new SourceError('پل مک خاموش است', 503);
    const r = await relaySearch(job);
    if (!r.ok) throw new SourceError(r.error === 'blocked' ? 'مک از مسیر ایران وصل نیست' : 'پل مک پاسخ نداد', 503);
    return parseSnappfood(r.items, c);
  }
  // Vercel runs outside Iran and Snappfood answers 403 there; without the bridge only the direct link is offered.
  throw new SourceError('پل مک تنظیم نشده (سرور خارج از ایران)', 403);
}

const MARKET_PARAMS = { client: 'PWA', deviceType: 'PWA', appVersion: '1.403.1' };

/** SnappMarket (svc.snapp.market) is not geo-blocked, unlike the Snappfood restaurant stack. Prices are Toman. */
export async function snappmarket(q: LocalQuery): Promise<ShopItem[]> {
  const c = q.city;
  if (!c || !q.keywords) return [];
  const qs = new URLSearchParams({ ...MARKET_PARAMS, query: q.keywords, lat: String(c.lat), long: String(c.lon), superType: '[4]', new_search: '1', page: '0', size: '12' });
  const data = await json(`https://svc.snapp.market/mobile/v3/search?${qs}`);
  return arr(obj(obj(data.data).vendor_product_variations).items).map(obj)
    .filter((v) => v.is_open !== false && v.deliver !== false && v.does_deliver !== false)
    .flatMap((v) => {
      const code = str(v.code);
      if (!/^\w{4,10}$/.test(code)) return [];
      const fee = num(v.deliveryFee);
      return arr(v.products).map(obj).filter((p) => (num(p.stock) ?? 0) > 0).map((p) => {
        const price = num(p.price); const final = price != null ? price - (num(p.discount) ?? 0) : null;
        const img = obj(arr(p.images)[0]);
        return item({
          id: `sm-${str(p.id)}-${code}`, service: 'snappmarket', title: str(p.title).trim(), url: `https://snapp.market/supermarket/%2B/${code}`,
          image: safeUrl(img.thumb) ?? safeUrl(img.main), priceToman: final, priceBeforeToman: price && final && price > final ? price : null,
          discountPercent: price && final && price > final ? Math.round((100 * (price - final)) / price) : 0,
          summary: str(v.title) || null, location: [c.name, str(v.area)].filter(Boolean).join('، '),
          facts: [
            ...(fee != null ? [{ label: 'پیک', value: v.is_pro === true ? 'رایگان (پرو)' : `${fee.toLocaleString('en-US')} تومان` }] : []),
            ...(num(v.minOrder) ? [{ label: 'حداقل سفارش', value: `${num(v.minOrder)!.toLocaleString('en-US')} تومان` }] : [])
          ]
        });
      });
    });
}

/* ---------- اکالا (حالت مهمان: جستجو با دسته‌بندی) و بامادر ---------- */

const OKALA = 'https://apigateway.okala.com/api';
const rial = (v: unknown) => { const n = num(v); return n && n > 0 ? Math.round(n / 10) : null; };
const words = (t: string) => t.split(/\s+/).filter((w) => w.length > 1 && !/\d/.test(w));

/** اکالا بدون ورود جستجوی متنی ندارد: واژه‌ها با نام دسته‌های نزدیک تطبیق می‌خورند، کالاهای آن دسته از فروشگاه‌های باز اطراف می‌آیند */
export async function okala(q: LocalQuery): Promise<ShopItem[]> {
  const c = q.city; const tokens = words(q.keywords);
  if (!c || !tokens.length) return [];
  const tree = arr(obj(obj(await request(`${OKALA}/unicorn/v3/categories/nearby?lat=${c.lat}&lon=${c.lon}`)).data).categories).map(obj);
  const flat = new Map<string, Record<string, unknown>>();
  const walk = (ns: Record<string, unknown>[]) => { for (const n of ns) { flat.set(String(n.id), n); walk(arr(n.children).map(obj)); } };
  walk(tree);
  const scored = [...flat.values()].map((n) => ({ n, hit: tokens.filter((t) => str(n.name).includes(t)).length, len: str(n.name).length }))
    .filter((x) => x.hit > 0).sort((a, b) => b.hit - a.hit || a.len - b.len);
  const best = scored.filter((x) => x.hit === scored[0]?.hit).slice(0, 2).map((x) => str(x.n.latinName)).filter((s) => /^[a-z0-9-]{2,60}$/.test(s));
  if (!best.length) return [];
  const replies = await Promise.all(best.map((slug) => json(`${OKALA}/unicorn/v2/products/nearby?slug=${slug}&lat=${c.lat}&lon=${c.lon}`)));
  const out: ShopItem[] = [];
  for (const g of replies.flatMap((r) => arr(r.data).map(obj))) {
    const store = obj(g.store);
    if (obj(store.earliestSlot).isClosed === true) continue;
    for (const p of arr(g.products).map(obj)) {
      if (p.hasQuantity === false || p.supplyStatus === 2) continue;
      const final = rial(p.okPrice); const before = rial(p.price);
      const id = str(p.id); const sid = str(store.storeId);
      if (!/^\d+$/.test(id) || !/^\d+$/.test(sid)) continue;
      out.push(item({
        id: `ok-${sid}-${id}`, service: 'okala', title: str(p.name).trim(), url: `https://www.okala.com/product/${id}?storeId=${sid}`,
        image: safeUrl(p.imageUrl), brandLogo: safeUrl(store.logo), priceToman: final, priceBeforeToman: before && final && before > final ? before : null,
        discountPercent: Math.round(num(p.discountPercent) ?? 0), summary: str(store.storeName) ? `فروشگاه ${str(store.storeName)}` : null, location: c.name,
        rating: num(store.rate), facts: num(store.deliveryPrice) === 0 ? [{ label: 'پیک', value: 'رایگان' }] : []
      }));
    }
  }
  return out;
}

/** بامادر: هایپرمارکت در شهرهای خوزستان (شناسهٔ شعبه از supported-cities) */
const BAMADAR_BRANCH: Record<string, number> = { اهواز: 15, آبادان: 28, خرمشهر: 18, اندیمشک: 5, دزفول: 4 };

export async function bamadar(q: LocalQuery): Promise<ShopItem[]> {
  const branch = q.city ? BAMADAR_BRANCH[q.city.name] : undefined;
  if (!branch || !q.keywords) return [];
  const qs = new URLSearchParams({ page: '1', limit: '24', search: q.keywords, branch_id: String(branch) });
  const data = await json(`https://marketcore.avani.website/v1/shop/product-variants?${qs}`);
  return arr(data.data).map(obj).flatMap((p) => {
    const price = obj(arr(p.prices).map(obj).find((x) => x.price_type === 'retail') ?? arr(p.prices)[0]);
    const before = rial(price.price); const off = rial(price.discount_value) ?? 0;
    const final = before != null ? before - off : null;
    const stock = num(obj(p.stock).available_quantity) ?? 0;
    const img = str(p.image);
    if (p.is_available === false || stock <= 0 || !final) return [];
    return [item({
      id: `bm-${str(p.id)}`, service: 'bamadar', title: str(p.name).trim(), url: 'https://bamadar.com/market/search',
      image: /^[\w/.-]+\.(webp|jpe?g|png)$/i.test(img) ? `https://avani.s3.ir-thr-at1.arvanstorage.ir/${img}` : null,
      priceToman: final, priceBeforeToman: off > 0 ? before : null, discountPercent: Math.round(num(price.discount_percentage) ?? 0),
      summary: [str(obj(p.brand).name), str(obj(p.category).name)].filter(Boolean).join(' · ') || null, location: q.city?.name ?? null,
      facts: [{ label: 'موجودی', value: `${stock} عدد` }]
    })];
  });
}
