/** Read-only Digikala product data from its public web API. Host is fixed; inputs are validated by the caller. */
import { obj, arr, str } from '../src/features/connected/domain/model.js';
import { ProviderError } from './_zerion.js';
import { DK_SORT_IDS, type DkCard, type DkComment, type DkOffer, type DkProduct, type DkSearchResult, type DkSort, type DkSpecGroup } from '../src/features/shopping/digikala/domain/types.js';

const API = 'https://api.digikala.com';
const SITE = 'https://www.digikala.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36';
const SEARCH_TTL = 10 * 60_000;
const PRODUCT_TTL = 15 * 60_000;
const MIN_GAP_MS = 350;

const cache = new Map<string, { at: number; ttl: number; value: unknown }>();
const running = new Map<string, Promise<unknown>>();
// Digikala's CDN throttles with a 307-to-self plus a digicdn_cookie challenge instead of 429.
let cdnCookie: string | null = null;
let nextSlot = 0;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const toman = (rial: unknown): number | null => { const r = num(rial); return r != null && r > 0 ? Math.round(r / 10) : null; };

async function pace(): Promise<void> {
  const now = Date.now(); const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + MIN_GAP_MS;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

async function request(url: string): Promise<Response> {
  await pace();
  return fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
    headers: {
      'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'fa-IR,fa;q=0.9',
      Referer: `${SITE}/`, 'X-Web-Client': 'desktop', 'X-Web-Optimize-Response': '1',
      ...(cdnCookie ? { Cookie: `digicdn_cookie=${cdnCookie}` } : {})
    }
  });
}

async function dkJson(path: string): Promise<Record<string, unknown>> {
  const url = `${API}${path}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try { res = await request(url); } catch { if (attempt === 2) throw new ProviderError(502, 'اتصال به دیجی‌کالا برقرار نشد'); continue; }
    if (res.status === 307 || res.status === 308) {
      const cookie = /digicdn_cookie=([^;\s]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
      cdnCookie = cookie ?? null;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    if (res.status === 404) throw new ProviderError(404, 'کالا در دیجی‌کالا پیدا نشد');
    if (res.status === 429) throw new ProviderError(429, 'دیجی‌کالا موقتاً درخواست‌ها را محدود کرده؛ کمی بعد تلاش کنید', 60);
    if (!res.ok) throw new ProviderError(502, `دیجی‌کالا پاسخ نداد (HTTP ${res.status})`);
    const text = await res.text();
    if (/^\s*</.test(text)) { cdnCookie = null; continue; }
    try { return obj(JSON.parse(text)); } catch { throw new ProviderError(502, 'پاسخ دیجی‌کالا قابل خواندن نیست'); }
  }
  throw new ProviderError(503, 'دیجی‌کالا موقتاً داده نمی‌دهد (بررسی ربات CDN)؛ چند لحظه بعد دوباره تلاش کنید', 30);
}

async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as T;
  const inflight = running.get(key); if (inflight) return inflight as Promise<T>;
  const p = load().then((value) => {
    if (cache.size > 300) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), ttl, value }); return value;
  }).finally(() => running.delete(key));
  running.set(key, p);
  return p;
}

function productUrl(p: Record<string, unknown>, id: number): string {
  const uri = str(obj(p.url).uri);
  return uri.startsWith('/') ? `${SITE}${uri}` : `${SITE}/product/dkp-${id}/`;
}

function toCard(raw: unknown): DkCard | null {
  const p = obj(raw); const id = num(p.id); if (!id) return null;
  const dv = obj(p.default_variant); const price = obj(dv.price); const seller = obj(dv.seller);
  const rating = obj(p.rating); const count = Math.max(0, num(rating.count) ?? 0); const rate = num(rating.rate);
  const layer = obj(p.data_layer); const selling = toman(price.selling_price); const rrp = toman(price.rrp_price);
  return {
    id,
    title: str(p.title_fa) || str(p.title_en) || `کالای ${id}`,
    brand: str(layer.brand) || str(obj(p.brand).title_fa) || null,
    category: str(layer.item_category3) || str(obj(p.category).title_fa) || null,
    image: str(arr(obj(obj(p.images).main).url)[0]) || null,
    url: productUrl(p, id),
    priceToman: selling,
    priceBeforeToman: rrp && selling && rrp > selling ? rrp : null,
    discountPercent: Math.max(0, Math.round(num(price.discount_percent) ?? 0)),
    stars: count > 0 && rate != null ? Math.round(rate / 2) / 10 : null,
    ratingCount: count,
    inStock: str(p.status) === 'marketable' && selling != null,
    seller: str(seller.title) || null,
    sellerStars: num(seller.stars),
    incredible: price.is_incredible === true
  };
}

export function searchDigikala(query: string, page: number, sort: DkSort): Promise<DkSearchResult> {
  const qs = new URLSearchParams({ q: query, page: String(page), sort: String(DK_SORT_IDS[sort]) });
  return cached(`s:${qs}`, SEARCH_TTL, async () => {
    const data = obj((await dkJson(`/v1/search/?${qs}`)).data);
    const pager = obj(data.pager);
    return {
      query, page,
      totalPages: num(pager.total_pages) ?? 1,
      totalItems: num(pager.total_items) ?? 0,
      items: arr(data.products).map(toCard).filter((c): c is DkCard => !!c),
      fetchedAt: Date.now()
    };
  });
}

export function digikalaProduct(id: number): Promise<DkProduct> {
  return cached(`p:${id}`, PRODUCT_TTL, async () => {
    const p = obj(obj((await dkJson(`/v2/product/${id}/`)).data).product);
    const card = toCard(p); if (!card) throw new ProviderError(404, 'کالا در دیجی‌کالا پیدا نشد');
    const offers: DkOffer[] = arr(p.variants).map(obj).map((v) => {
      const price = obj(v.price); const seller = obj(v.seller); const props = obj(seller.properties);
      return {
        seller: str(seller.title) || 'دیجی‌کالا', sellerStars: num(seller.stars),
        official: props.is_official === true, trusted: props.is_trusted === true,
        priceToman: toman(price.selling_price) ?? 0,
        discountPercent: Math.max(0, Math.round(num(price.discount_percent) ?? 0)),
        warranty: str(obj(v.warranty).title_fa) || null,
        color: str(obj(v.color).title) || null
      };
    }).filter((o) => o.priceToman > 0).sort((a, b) => a.priceToman - b.priceToman).slice(0, 15);
    const specs: DkSpecGroup[] = arr(p.specifications).map(obj).slice(0, 6).map((g) => ({
      title: str(g.title),
      rows: arr(g.attributes).map(obj).slice(0, 30).map((a) => ({
        title: str(a.title).trim(),
        value: arr(a.values).map((x) => str(x).trim()).filter(Boolean).join('، ')
      })).filter((r) => r.title && r.value)
    })).filter((g) => g.rows.length);
    const overview = obj(p.comments_overview);
    const comments: DkComment[] = arr(p.last_comments).map(obj).slice(0, 5).map((c) => ({
      body: str(c.body).trim().slice(0, 500), rate: num(c.rate), date: str(c.created_at), isBuyer: c.is_buyer === true
    })).filter((c) => c.body);
    return {
      ...card,
      recommendPercent: num(obj(p.suggestion).percentage),
      commentsCount: num(p.comments_count) ?? 0,
      overview: str(overview.overview).trim() || null,
      advantages: arr(overview.advantages).map(str).filter(Boolean).slice(0, 6),
      disadvantages: arr(overview.disadvantages).map(str).filter(Boolean).slice(0, 6),
      offers, specs, comments,
      fetchedAt: Date.now()
    };
  });
}
