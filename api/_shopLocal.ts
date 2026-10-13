/** City-scoped sources: Sheypoor and Divar classifieds, Snappfood dishes, SnappMarket groceries. Read-only public search. */
import { arr, obj, str } from '../src/features/connected/domain/model.js';
import type { CityRef, ShopItem } from '../src/features/shopping/domain/types.js';
import { item } from './_shopGoods.js';
import { json, num, safeUrl, SourceError } from './_shopHttp.js';
import { bridgeOnline, relayConfigured, relaySearch } from './_shopRelay.js';

export interface LocalQuery { keywords: string; city: CityRef | null; sort: 'best' | 'cheapest'; maxPrice: number | null; minPrice: number | null; used: boolean }

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
  return rows.map((r) => {
    const a = obj(r.attributes); const price = obj(arr(a.price)[0]);
    const thumbs = obj(obj(a.images).thumbnails);
    return item({
      id: `sp-${str(r.id)}`, service: 'sheypoor', title: str(a.title).trim(), url: safeUrl(a.url) ?? '',
      image: safeUrl(thumbs.landscape) ?? safeUrl(thumbs.round), priceToman: adPrice(str(price.amount), str(price.currency)),
      location: str(a.location) || null, summary: str(a.timePassedLabel) || null,
      facts: str(price.amount) && !adPrice(str(price.amount)) ? [{ label: 'قیمت', value: 'توافقی' }] : []
    });
  }).filter((i) => i.title && i.url);
}

export async function divar(q: LocalQuery): Promise<ShopItem[]> {
  const body = { city_ids: [String(q.city?.divarId ?? 1)], search_data: { form_data: { data: {} }, query: q.keywords } };
  const data = await json('https://api.divar.ir/v8/postlist/w/search', { method: 'POST', body });
  return arr(data.list_widgets).map(obj).filter((w) => w.widget_type === 'POST_ROW').map((w) => {
    const d = obj(w.data); const info = obj(obj(obj(d.action).payload).web_info);
    const token = str(d.token) || str(obj(obj(d.action).payload).token);
    const condition = str(d.top_description_text);
    const priceText = str(d.middle_description_text);
    return item({
      id: `dv-${token}`, service: 'divar', title: str(d.title).trim(), url: /^[\w-]{4,20}$/.test(token) ? `https://divar.ir/v/${token}` : '',
      image: safeUrl(d.image_url), priceToman: adPrice(priceText), location: [str(info.city_persian), str(info.district_persian)].filter(Boolean).join('، ') || null,
      summary: [condition, str(d.bottom_description_text)].filter(Boolean).join(' · ') || null,
      facts: priceText && !adPrice(priceText) ? [{ label: 'قیمت', value: priceText.includes('توافق') ? 'توافقی' : priceText }] : [],
      available: !(q.used && condition === 'نو')
    });
  }).filter((i) => i.title && i.url);
}

/* ---------- Snappfood: restaurants, cafés, pastry shops, caterers ---------- */

const CAFE = /کافه|قهوه|لاته|کاپوچینو|اسپرسو|موکا|آیس|نوشیدنی|آبمیوه|اسموتی|شیک|کیک|کروسان|دسر|شیرینی|بستنی|چای/;

/** Which Snappfood verticals to search: 0 = default mix (restaurants, fast food, caterers), 2 = cafés, 3 = pastry. */
export function foodTypes(keywords: string): number[] {
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
export async function snappfood(q: LocalQuery): Promise<ShopItem[]> {
  const c = q.city;
  if (!c) return [];
  const job = { query: q.keywords.slice(0, 60), lat: c.lat, lon: c.lon, types: foodTypes(q.keywords), discount: q.sort === 'cheapest' };
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
