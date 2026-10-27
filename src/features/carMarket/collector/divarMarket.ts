/** ============================================================
 * Car Market — بازار دست‌دوم خودروی داخلی از دیوار (تهران)
 *
 *  car.ir فقط خودروهای در حال تولید و سال‌های ۱۴۰۱ به بعد را دارد؛ پراید ۱۳۱، ۴۰۵، سمند، تیبا و همهٔ
 *  سال‌های قدیمی‌تر فقط در بازار دست‌دوم‌اند. این ماژول آگهی‌های دیوار را به قیمت میانهٔ هر «مدل + سال» تبدیل می‌کند.
 *
 *  POST /v8/postlist/w/search با فیلتر brand_model (مثلاً «Peugeot») و صفحه‌بندی؛
 *  seo_details.linked_data هر آگهی را با مدل دقیق (Peugeot 206 5)، سال شمسی، کارکرد و قیمت ریالی می‌دهد.
 *  مقدار نامعتبر فیلتر، فهرست عمومی برمی‌گرداند → فقط آگهی‌هایی که مدلشان با همان برند شروع می‌شود.
 *  Pure — مشترک بین سرور و تست. ⚠️ بدون alias «@/».
 * ============================================================ */
import type { CarPriceRow } from '../domain/types.js';

export const DIVAR_TEHRAN = '1';

/** مقدار فیلتر brand_model دیوار → برند car.ir (برای دسته «داخلی» و لوگو) */
export const DIVAR_DOMESTIC: Record<string, 'iran-khodro' | 'saipa'> = {
  Peugeot: 'iran-khodro', Samand: 'iran-khodro', Dena: 'iran-khodro', Runna: 'iran-khodro', Paykan: 'iran-khodro',
  Tara: 'iran-khodro', Haima: 'iran-khodro',
  Pride: 'saipa', Saipa: 'saipa', Tiba: 'saipa', Quick: 'saipa', Saina: 'saipa', Shahin: 'saipa', Zamyad: 'saipa'
};
export const DIVAR_BRANDS = Object.keys(DIVAR_DOMESTIC);

const BRAND_FA: Record<string, string> = {
  Peugeot: 'پژو', Samand: 'سمند', Dena: 'دنا', Runna: 'رانا', Paykan: 'پیکان', Tara: 'تارا', Haima: 'هایما',
  Pride: 'پراید', Saipa: 'سایپا', Tiba: 'تیبا', Quick: 'کوییک', Saina: 'ساینا', Shahin: 'شاهین', Zamyad: 'زامیاد', Soren: 'سورن', Padra: 'پادرا'
};
const WORD_FA: Record<string, string> = {
  sedan: 'صندوق‌دار', hatchback: 'هاچ‌بک', manual: 'دنده‌ای', automatic: 'اتوماتیک', petrol: 'بنزینی', cng: 'دوگانه‌سوز',
  'bi-fuel': 'دوگانه‌سوز', pickup: 'وانت', basic: 'ساده', plus: 'پلاس', latest: 'جدید', optional: 'آپشنال', turbo: 'توربو'
};

/** «Peugeot 206 SD V9» → «پژو 206 SD V9» ؛ «Tiba Sedan SX-normal» → «تیبا صندوق‌دار SX» */
export function modelFa(model: string): string {
  return model
    .replace(/-normal\b/gi, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => BRAND_FA[w] ?? WORD_FA[w.toLowerCase()] ?? w.replace(/-(petrol|cng)$/i, (_, f: string) => ` ${WORD_FA[f.toLowerCase()]}`))
    .join(' ')
    .trim();
}

export function buildDivarSearchBody(brand: string, paginationData?: unknown): Record<string, unknown> {
  const body: Record<string, unknown> = {
    city_ids: [DIVAR_TEHRAN],
    search_data: { form_data: { data: { category: { str: { value: 'light' } }, brand_model: { repeated_string: { value: [brand] } } } } }
  };
  if (paginationData) body.pagination_data = paginationData;
  return body;
}

export interface DivarCarAd {
  token: string;
  /** مقدار دقیق مدل دیوار (Peugeot 206 5) */
  model: string;
  /** سال شمسی */
  year: number;
  km: number | null;
  /** تومان */
  price: number;
}

/** بازهٔ معقول قیمت خودروی داخلی دست‌دوم (تومان)؛ زیر آن معمولاً پیش‌قسط یا قیمت نمادین است */
const MIN_PRICE = 100_000_000;
const MAX_PRICE = 30_000_000_000;

/** پاسخ جستجو → آگهی‌های همان برند + دادهٔ صفحهٔ بعد */
export function parseDivarCars(json: unknown, brand: string): { ads: DivarCarAd[]; next: unknown | null } {
  const j = json as { seo_details?: { linked_data?: unknown[] }; pagination?: { has_next_page?: boolean; data?: unknown } } | null;
  const ads: DivarCarAd[] = [];
  for (const raw of j?.seo_details?.linked_data ?? []) {
    const c = raw as { '@type'?: string; model?: unknown; productionDate?: unknown; mileageFromOdometer?: { value?: unknown }; offers?: { price?: unknown; priceCurrency?: unknown }; url?: unknown };
    if (c?.['@type'] !== 'Car' || typeof c.model !== 'string' || !c.model.startsWith(`${brand} `)) continue;
    const token = typeof c.url === 'string' ? c.url.split('/').pop() ?? '' : '';
    const year = Number(c.productionDate);
    const rial = Number(c.offers?.price);
    const price = c.offers?.priceCurrency === 'IRR' ? Math.round(rial / 10) : NaN;
    const km = Number(c.mileageFromOdometer?.value);
    if (!/^[A-Za-z0-9_-]{5,16}$/.test(token) || !(year >= 1360 && year <= 1410) || !(price >= MIN_PRICE && price <= MAX_PRICE)) continue;
    ads.push({ token, model: c.model.replace(/\s+/g, ' ').trim(), year, km: Number.isFinite(km) ? km : null, price });
  }
  const p = j?.pagination;
  return { ads, next: p?.has_next_page && p.data ? p.data : null };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** کمترین آگهی برای یک «مدل + سال» تا میانه معنا داشته باشد */
export const MIN_ADS = 3;

/**
 * آگهی‌های پنجرهٔ اخیر → یک ردیف قیمت برای هر «مدل + سال»: میانه پس از حذف قیمت‌های دورتر از ۴۰٪ میانهٔ اولیه
 * (قسطی، تصادفی، قیمت اشتباه). شناسه پایدار dv:مدل:سال تا تغییر هفتگی و ماهانه بین Snapshotها حساب شود.
 */
export function divarRows(ads: DivarCarAd[], now: number): CarPriceRow[] {
  const groups = new Map<string, DivarCarAd[]>();
  for (const a of ads) {
    const k = `${a.model}|${a.year}`;
    const g = groups.get(k);
    if (g) g.push(a);
    else groups.set(k, [a]);
  }
  const rows: CarPriceRow[] = [];
  for (const [k, list] of groups) {
    const m0 = median(list.map((a) => a.price));
    const clean = list.filter((a) => a.price >= m0 * 0.6 && a.price <= m0 * 1.4);
    if (clean.length < MIN_ADS) continue;
    const [model, year] = k.split('|');
    const brand = DIVAR_DOMESTIC[model.split(' ')[0]] ?? 'iran-khodro';
    rows.push({
      id: `dv:${model}:${year}`,
      modelId: `dv:${model}`,
      brand,
      model: modelFa(model),
      year,
      option: null,
      market: Math.round(median(clean.map((a) => a.price))),
      dealer: null,
      marketUpdatedAt: now,
      srcChangePct: null,
      source: 'divar',
      n: clean.length
    });
  }
  return rows;
}
