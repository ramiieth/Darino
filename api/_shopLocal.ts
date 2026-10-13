/** City-scoped sources: Sheypoor and Divar classifieds, Snappfood dishes, SnappMarket groceries. Read-only public search. */
import { arr, obj, str } from '../src/features/connected/domain/model.js';
import type { CityRef, ShopItem } from '../src/features/shopping/domain/types.js';
import { item } from './_shopGoods.js';
import { json, num, safeUrl } from './_shopHttp.js';

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

const FOOD_PARAMS = { optionalClient: 'PWA', client: 'PWA', deviceType: 'PWA', appVersion: '6.0.0' };

/** Snappfood blocks most non-Iranian server IPs (403); the caller then shows the direct search link. */
export async function snappfood(q: LocalQuery): Promise<ShopItem[]> {
  const c = q.city;
  if (!c) return [];
  const qs = new URLSearchParams({ ...FOOD_PARAMS, lat: String(c.lat), long: String(c.lon), query: q.keywords, page: '0', page_size: '40' });
  if (q.sort === 'cheapest') qs.set('filters', '["has_discount"]');
  const data = await json(`https://snappfood.ir/search/api/v5/search?${qs}`);
  return arr(obj(obj(data.data).product_variations).items).map(obj).map((it) => {
    const v = obj(it.vendor); const code = str(v.code);
    const before = num(it.price); const final = num(it.priceAfterDiscount) ?? before;
    const r10 = num(it.normalized_rating);
    return item({
      id: `sf-${str(it.id)}`, service: 'snappfood', title: str(it.title).trim(), url: /^[\w]{3,12}$/.test(code) ? `https://snappfood.ir/restaurant/menu/-r-${code}/` : '',
      image: safeUrl(it.image) ?? safeUrl(v.logo), priceToman: final, priceBeforeToman: before && final && before > final ? before : null,
      discountPercent: Math.round(num(it.discountRatio) ?? 0), rating: r10 ? Math.round(r10 * 5) / 10 : null, ratingCount: num(v.commentCount),
      summary: str(v.title) || null, location: c.name, available: v.is_open !== false
    });
  }).filter((i) => i.title && i.url);
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
