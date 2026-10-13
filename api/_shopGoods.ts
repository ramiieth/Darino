/** Retail sources for the shopping assistant: public search pages/APIs only, prices normalized to Toman. */
import { arr, obj, str } from '../src/features/connected/domain/model.js';
import type { ShopItem } from '../src/features/shopping/domain/types.js';
import { searchDigikala } from './_digikala.js';
import { json, num, plain, request, safeUrl, SourceError } from './_shopHttp.js';

export interface GoodsQuery { keywords: string; sort: 'best' | 'cheapest'; maxPrice: number | null; minPrice: number | null }

export function item(p: Partial<ShopItem> & Pick<ShopItem, 'id' | 'service' | 'title' | 'url'>): ShopItem {
  const out: ShopItem = { summary: null, image: null, brandLogo: null, priceToman: null, priceBeforeToman: null, discountPercent: 0, rating: null, ratingCount: null, location: null, available: true, facts: [], mapUrl: null, soonDays: null, ...p };
  if (out.rating != null) out.rating = Math.round(Math.min(5, Math.max(0, out.rating)) * 10) / 10;
  out.title = out.title.replace(/\s+/g, ' ').trim();
  return out;
}

const pct = (before: number | null, after: number | null) => (before && after && before > after ? Math.round((100 * (before - after)) / before) : 0);

export async function digikala(q: GoodsQuery): Promise<ShopItem[]> {
  const r = await searchDigikala(q.keywords, 1, q.sort === 'cheapest' ? 'cheapest' : 'relevant');
  return r.items.map((c) => item({
    id: `dk-${c.id}`, service: 'digikala', title: c.title, url: c.url, image: safeUrl(c.image),
    summary: [c.brand, c.seller && `فروشنده: ${c.seller}`].filter(Boolean).join(' · ') || null,
    priceToman: c.priceToman, priceBeforeToman: c.priceBeforeToman, discountPercent: c.discountPercent,
    rating: c.stars, ratingCount: c.ratingCount, available: c.inStock,
    facts: c.incredible ? [{ label: 'پیشنهاد', value: 'شگفت‌انگیز' }] : []
  }));
}

const TL_SEARCH = 'query search_page_results ($text: String!, $filter: filter_obj) { search_page_results (text: $text, filter: $filter) { results { name code image normal_price discounted_price deadline score_count score_avg available } } }';

export async function technolife(q: GoodsQuery): Promise<ShopItem[]> {
  const filter: Record<string, unknown> = { limit: 20, skip: 0, ordering: q.sort === 'cheapest' ? 'price-asc' : 'kalascore', available: true };
  if (q.maxPrice) filter.price_max = q.maxPrice;
  if (q.minPrice) filter.price_min = q.minPrice;
  const body = await json('https://www.technolife.com/searchapi', { method: 'POST', body: { query: TL_SEARCH, variables: { text: q.keywords, filter } } });
  if (arr(body.errors).length) throw new SourceError('جستجو را نپذیرفت');
  return arr(obj(obj(body.data).search_page_results).results).map(obj).map((p) => {
    const before = num(p.normal_price);
    const expired = (num(p.deadline) ?? Infinity) < Date.now();
    const final = expired ? before : num(p.discounted_price) ?? before;
    const code = str(p.code);
    const count = num(p.score_count) ?? 0;
    return item({
      id: `tl-${code}`, service: 'technolife', title: str(p.name).trim(), url: `https://www.technolife.com/product-${code.replace(/^TLP-/, '')}`,
      image: safeUrl(str(p.image), 'https://www.technolife.com'), priceToman: final, priceBeforeToman: before && final && before > final ? before : null,
      discountPercent: pct(before, final), rating: count ? num(p.score_avg) : null, ratingCount: count, available: !!num(p.available)
    });
  }).filter((i) => i.title && i.url);
}

export async function masterkala(q: GoodsQuery): Promise<ShopItem[]> {
  const data = obj(await request('https://masterkala.com/api/2.1.1.0.0/?route=product/searchproduct', {
    method: 'POST', body: JSON.stringify({ v: '1.2', query: q.keywords, from: 0, limit: 20, filter: '' }), headers: { Authorization: '', 'Content-Type': 'text/plain' }
  }));
  return arr(data.products).map(obj).map((p) => {
    const before = num(p.price) ? Math.round(num(p.price)!) : null;
    const final = num(p.pricewithdiscount) ? Math.round(num(p.pricewithdiscount)!) : before;
    const id = str(p.product_id);
    return item({
      id: `mk-${id}`, service: 'masterkala', title: str(p.name).trim(), url: `https://masterkala.com/product/${id}/${encodeURIComponent(str(p.slug) || 'x')}`,
      image: safeUrl(p.image), priceToman: final || null, priceBeforeToman: before && final && before > final ? before : null,
      discountPercent: pct(before, final), available: p.quantity === '1' && !!final
    });
  }).filter((i) => /^\d+$/.test(i.id.slice(3)));
}

export async function shopino(q: GoodsQuery): Promise<ShopItem[]> {
  const qs = new URLSearchParams({ page_size: '24', in_stock: 'true' });
  if (q.sort === 'cheapest') qs.set('sort', 'price');
  if (q.maxPrice) qs.set('price_to', String(q.maxPrice));
  if (q.minPrice) qs.set('price_from', String(q.minPrice));
  const data = await json(`https://api-go.shopino.app/api/v1/app/products/search/${encodeURIComponent(q.keywords)}/?${qs}`);
  const seen = new Set<number>();
  return arr(data.results).map(obj).filter((p) => { const id = num(p.id) ?? 0; if (!id || seen.has(id)) return false; seen.add(id); return true; }).map((p) => {
    const price = num(p.price); const disc = num(p.discounted_price);
    const final = disc || price; const shop = obj(p.shop);
    const media = arr(p.medias).map(obj).find((m) => m.url && !m.is_video);
    return item({
      id: `sh-${p.id}`, service: 'shopino', title: str(p.title).trim(), url: `https://shopino.app/product/${p.id}`,
      image: safeUrl(media?.url), priceToman: final || null, priceBeforeToman: price && final && price > final ? price : null,
      discountPercent: pct(price, final), available: p.in_stock === true, summary: str(shop.title) ? `فروشگاه ${str(shop.title)}` : null,
      rating: num(shop.rating), ratingCount: null
    });
  });
}

export async function khanoumi(q: GoodsQuery): Promise<ShopItem[]> {
  const qs = new URLSearchParams({ query: q.keywords, page_number: '1', page_size: '24', has_stock: 'true' });
  if (q.sort === 'cheapest') qs.set('sort', 'Cheapest');
  if (q.maxPrice) qs.set('to_price', String(q.maxPrice));
  if (q.minPrice) qs.set('from_price', String(q.minPrice));
  const data = await json(`https://www.khanoumi.com/api/ntl/v1/products?${qs}`);
  return arr(obj(obj(data.data).products).items).map(obj).map((p) => {
    const before = num(p.basePrice); const final = num(p.effectivePrice) ?? before;
    return item({
      id: `kh-${str(p.id)}`, service: 'khanoumi', title: str(p.nameFa).trim() || str(p.nameEn), url: `https://www.khanoumi.com/products/${encodeURIComponent(str(p.slug))}`,
      image: safeUrl(p.imageUrl), priceToman: final, priceBeforeToman: before && final && before > final ? before : null,
      discountPercent: Math.round(num(p.discountPercent) ?? pct(before, final)), available: p.hasStock === true && p.isSalable !== false,
      summary: str(obj(p.brand).nameFa) || null
    });
  }).filter((i) => i.url.length > 40);
}

/** asalbanooshop.com answers 418 with a tiny JS page that sets the _dgjsc cookie; we echo that public value once. */
export async function asalbanoo(q: GoodsQuery): Promise<ShopItem[]> {
  const url = `https://asalbanooshop.com/?s=${encodeURIComponent(q.keywords)}&post_type=product`;
  let html = await request<string>(url, { text: true, cacheKey: false });
  const challenge = /_dgjsc=([a-f0-9]{32}:[0-9]{14})/.exec(html)?.[1];
  if (challenge && !html.includes('product-grid-item')) html = await request<string>(url, { text: true, headers: { Cookie: `_dgjsc=${challenge}` } });
  const parts = html.split(/<div class="product-grid-item([^"]*)"[^>]*data-id="(\d+)">/);
  const out: ShopItem[] = [];
  for (let i = 1; i + 2 < parts.length && out.length < 24; i += 3) {
    const [cls, id, rest] = [parts[i], parts[i + 1], parts[i + 2].split('woocommerce-pagination')[0]];
    const link = /wd-entities-title"><a href="([^"]*)">([\s\S]*?)<\/a>/.exec(rest);
    const priceHtml = rest.split('<span class="price">')[1] ?? '';
    const sale = priceHtml.split('</del>').pop() ?? '';
    const nums = [...sale.matchAll(/<bdi>([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, '')));
    const regular = priceHtml.includes('</del>') ? Number(/<bdi>([\d,]+)/.exec(priceHtml)?.[1].replace(/,/g, '')) || null : null;
    const final = nums[0] ?? null;
    const rating = num(/<strong class="rating">([\d.]+)<\/strong>/.exec(rest)?.[1]);
    const href = safeUrl(link?.[1], 'https://asalbanooshop.com');
    if (!link || !href) continue;
    out.push(item({
      id: `ab-${id}`, service: 'asalbanoo', title: plain(link[2]), url: href, image: safeUrl(/<img[^>]*?\ssrc="([^"]+)"/.exec(rest)?.[1], 'https://asalbanooshop.com'),
      priceToman: final, priceBeforeToman: regular && final && regular > final ? regular : null, discountPercent: pct(regular, final),
      rating, ratingCount: null, available: !cls.includes('outofstock') && final != null
    }));
  }
  return out;
}

export async function taaghche(q: GoodsQuery): Promise<ShopItem[]> {
  const qs = new URLSearchParams({ term: q.keywords, offset: 'null', trackingData: '110160240' });
  const data = await json(`https://get.taaghche.com/v3/search/filters?${qs}`, { timeoutMs: 15_000 });
  return arr(obj(data.tabItems).items).map(obj).map((b) => {
    const final = num(b.price) ?? 0; const before = Math.max(num(b.beforeOffPrice) ?? 0, final);
    const count = arr(b.rates).map(obj).reduce((s, r) => s + (num(r.count) ?? 0), 0);
    const authors = arr(b.authors).map(obj).filter((a) => a.type === 1).map((a) => `${str(a.firstName)} ${str(a.lastName)}`.trim()).filter(Boolean);
    return item({
      id: `tg-${b.id}`, service: 'taaghche', title: str(b.title), url: `https://taaghche.com/book/${num(b.id)}`, image: safeUrl(b.coverUri),
      priceToman: final, priceBeforeToman: before > final ? before : null, discountPercent: pct(before, final),
      rating: count ? num(b.rating) : null, ratingCount: count,
      summary: [authors.slice(0, 2).join('، '), str(b.publisher)].filter(Boolean).join(' · ') || null,
      facts: final === 0 ? [{ label: 'قیمت', value: 'رایگان' }] : []
    });
  }).filter((i) => i.title && /\d$/.test(i.url));
}
