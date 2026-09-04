/**
 * آداپتر CoinGecko — قیمت و فراداده رمزارزها + سهام توکن‌ایز (دسته Tokenized Products)
 *
 * استراتژی سهام توکن‌ایز (۱۳۵ نماد):
 *  ۱) نقشه seed (از پاسخ واقعی API دسته tokenized-products) → ۱۳۱ نماد با لوگو و شناسه.
 *  ۲) ۴ نماد باقی‌مانده (AALON, JNJON, MRKON, SCCOON) از طریق /search با صف محدود
 *     (فاصله ۵ ثانیه) جستجو و در IndexedDB کش می‌شوند.
 *  ۳) قیمت لحظه‌ای همه شناسه‌ها با یک درخواست دسته‌ای /simple/price (کش ۶۰ ثانیه).
 *  ۴) اسنپ‌شات توکن‌ایزها فقط و فقط قیمت مرجع ۱ ژوئیه ۲۰۲۶ است.
 *
 * لوگوی رمزارزها: یک درخواست /coins/markets با همه شناسه‌ها (کش ۱ روزه).
 */
import { COINGECKO_BASE, CRYPTO_STALE_MS } from '@/app/config/apiConfig';
import { RateLimitedQueue } from '@/shared/lib/throttler';
import { cgFetch } from '@/shared/lib/coingeckoGate';
import {
  cacheBulkGetPrice,
  cachePutPrice,
  metaBulkGet,
  metaBulkPut,
  metaPut,
  type AssetMetaRecord
} from '@/shared/lib/db';
import { TOKENIZED_COIN_MAP } from '@/features/simulation/data/tokenizedCoinMap';
import { TOKENIZED_STOCK_PRICES } from '@/features/simulation/domain/constants';
import type { PriceQuote, PriceSource } from '@/shared/types';

export interface CryptoPriceMap {
  prices: Record<string, number>;
  sources: Record<string, PriceSource>;
  /** تغییر ۲۴ ساعته (درصد) — برای هدر ارزش خالص */
  changes24h: Record<string, number>;
  fetchedAt: number;
  live: boolean;
}

/** صف محدود جستجوهای CoinGecko (جلوگیری از Throttled) */
const cgSearchQueue = new RateLimitedQueue(6_000, 10, 60_000);

/* ================= ۱) قیمت رمزارزها (دسته‌ای) ================= */

/** گرفتن قیمت دسته‌ای چند رمزارز (یک درخواست) */
export async function fetchCryptoPrices(ids: string[]): Promise<CryptoPriceMap> {
  const unique = Array.from(new Set(ids));
  const priceMap: Record<string, number> = {};
  const sources: Record<string, PriceSource> = {};
  const changes24h: Record<string, number> = {};
  let fetchedAt = Date.now();
  let live = false;
  let cached = new Map<string, PriceQuote>();

  try {
    // ۱) کش تازه در IndexedDB؟
    cached = await cacheBulk(unique);
    const freshIds: string[] = [];
    const now = Date.now();
    for (const id of unique) {
      const rec = cached.get(id);
      if (rec && now - rec.fetchedAt < CRYPTO_STALE_MS) {
        priceMap[id] = rec.price;
        sources[id] = rec.source;
      } else {
        freshIds.push(id);
      }
    }
    if (freshIds.length === 0) {
      return { prices: priceMap, sources, changes24h, fetchedAt, live: false };
    }

    // ۲) درخواست شبکه — یک درخواست با همه شناسه‌ها
    const url =
      `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(freshIds.join(','))}` +
      `&vs_currencies=usd&include_24hr_change=true`;
    const res = await cgFetch(url);
    if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
    const data = (await res.json()) as Record<
      string,
      { usd?: number; usd_24h_change?: number } | undefined
    >;
    fetchedAt = Date.now();
    live = true;

    for (const id of freshIds) {
      const usd = data[id]?.usd;
      const change = data[id]?.usd_24h_change;
      if (typeof change === 'number' && Number.isFinite(change)) {
        changes24h[id] = change;
      }
      if (typeof usd === 'number' && Number.isFinite(usd)) {
        priceMap[id] = usd;
        sources[id] = 'live';
        void cachePutPrice(`coingecko:${id}`, {
          price: usd,
          source: 'live',
          fetchedAt
        });
      } else {
        sources[id] = 'na';
      }
    }
  } catch {
    // آفلاین / محدودیت نرخ → فقط کش
    for (const id of unique) {
      const rec = cached.get(id);
      if (rec) {
        priceMap[id] = rec.price;
        sources[id] = rec.source;
      } else {
        sources[id] = 'na';
      }
    }
  }

  return { prices: priceMap, sources, changes24h, fetchedAt, live };
}

async function cacheBulk(ids: string[]): Promise<Map<string, PriceQuote>> {
  const out = new Map<string, PriceQuote>();
  const rows = await cacheBulkGetPrice(ids.map((id) => `coingecko:${id}`));
  rows.forEach((rec, key) => {
    out.set(key.replace(/^coingecko:/, ''), {
      price: rec.price,
      source: rec.source,
      fetchedAt: rec.fetchedAt
    });
  });
  return out;
}

/* ================= ۲) لوگوی رمزارزها (یک درخواست) ================= */

export interface CryptoMetaEntry {
  id: string;
  symbol: string;
  name: string;
  img: string;
}

const META_STALE_MS = 24 * 60 * 60 * 1000; // ۱ روز

/** گرفتن لوگوی اختصاصی رمزارزها از API بازار */
export async function fetchCryptoMeta(ids: string[]): Promise<Record<string, CryptoMetaEntry>> {
  const out: Record<string, CryptoMetaEntry> = {};
  try {
    const url =
      `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids.join(','))}` +
      `&per_page=100&page=1&price_change_percentage=`;
    const res = await cgFetch(url);
    if (!res.ok) throw new Error(`CoinGecko meta HTTP ${res.status}`);
    const list = (await res.json()) as {
      id: string;
      symbol: string;
      name: string;
      image?: string | null;
    }[];
    for (const c of list) {
      if (c.id && c.image) {
        out[c.id] = { id: c.id, symbol: c.symbol, name: c.name, img: c.image };
        void metaPut({ key: `cg-meta:${c.id}`, coinId: c.id, nameEn: c.name, logoUrl: c.image, updatedAt: Date.now() });
      }
    }
  } catch {
    /* آفلاین → از کش */
    const rows = await metaBulkGet(ids.map((id) => `cg-meta:${id}`));
    rows.forEach((r, key) => {
      const id = key.replace(/^cg-meta:/, '');
      if (r.logoUrl) out[id] = { id, symbol: id, name: r.nameEn ?? id, img: r.logoUrl };
    });
  }
  return out;
}

/* ================= ۳) قیمت سهام توکن‌ایز (دسته Tokenized Products) ================= */

export interface TokenizedSyncResult {
  /** نماد → قیمت دلار */
  prices: Record<string, number>;
  /** نماد → آدرس لوگو */
  logos: Record<string, string>;
  /** نماد → شناسه کوین */
  ids: Record<string, string>;
  liveCount: number;
  fetchedAt: number;
}

const TOKEN_PRICE_STALE_MS = 60_000;

/** ساخت نقشه فراداده توکن‌ایز: seed + کش IndexedDB */
export async function buildTokenizedMeta(): Promise<{
  bySymbol: Record<string, AssetMetaRecord>;
  missing: string[];
}> {
  const symbols = Object.keys(TOKENIZED_STOCK_PRICES);
  const bySymbol: Record<string, AssetMetaRecord> = {};

  // ۱) seed (شناسه و لوگوی تأییدشده از API)
  for (const [sym, meta] of Object.entries(TOKENIZED_COIN_MAP)) {
    bySymbol[sym] = {
      key: `tk:${sym}`,
      coinId: meta.id,
      nameEn: meta.name,
      logoUrl: meta.img,
      updatedAt: Date.now()
    };
  }

  // ۲) کش IndexedDB (نتایج جستجوی زمان‌اجرا برای نمادهای باقی‌مانده)
  const cached = await metaBulkGet(symbols.map((s) => `tk:${s}`));
  for (const [key, rec] of cached) {
    const sym = key.replace(/^tk:/, '');
    if (!bySymbol[sym] && rec.coinId) bySymbol[sym] = rec;
  }

  const missing = symbols.filter((s) => !bySymbol[s]);
  return { bySymbol, missing };
}

/** جستجوی نماد در CoinGecko (با صف محدود — کش دائمی در IndexedDB) */
export async function searchTokenizedSymbol(symbol: string): Promise<AssetMetaRecord | null> {
  try {
    const result = await cgSearchQueue.enqueue(async () => {
      const url = `${COINGECKO_BASE}/search?query=${encodeURIComponent(symbol)}`;
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`search HTTP ${res.status}`);
      return (await res.json()) as { coins?: { id: string; symbol: string; name: string; large?: string | null }[] };
    });

    const coins = result?.coins ?? [];
    const q = symbol.toLowerCase();
    const exact = coins.find((c) => c.symbol.toLowerCase() === q);
    const nameMatch = coins.find(
      (c) => c.name.toLowerCase().startsWith(q) || c.name.toLowerCase().includes(q)
    );
    const best = exact ?? nameMatch ?? coins[0];
    if (!best?.id) return null;

    const rec: AssetMetaRecord = {
      key: `tk:${symbol}`,
      coinId: best.id,
      nameEn: best.name,
      logoUrl: best.large ?? undefined,
      updatedAt: Date.now()
    };
    await metaPut(rec);
    return rec;
  } catch {
    return null;
  }
}

/** قیمت لحظه‌ای دسته‌ای شناسه‌های توکن‌ایز (یک درخواست) */
export async function fetchTokenizedPrices(
  bySymbol: Record<string, AssetMetaRecord>
): Promise<TokenizedSyncResult> {
  const prices: Record<string, number> = {};
  const logos: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let liveCount = 0;
  let fetchedAt = Date.now();

  const entries = Object.entries(bySymbol).filter(([, rec]) => rec.coinId);
  const idToSymbols = new Map<string, string[]>();
  for (const [sym, rec] of entries) {
    ids[sym] = rec.coinId as string;
    if (rec.logoUrl) logos[sym] = rec.logoUrl;
    const arr = idToSymbols.get(rec.coinId as string) ?? [];
    arr.push(sym);
    idToSymbols.set(rec.coinId as string, arr);
  }

  const uniqueIds = [...idToSymbols.keys()];

  // ۱) کش تازه؟
  const cacheKeys = uniqueIds.map((id) => `cg-token:${id}`);
  const cached = await cacheBulkGetPrice(cacheKeys);
  const now = Date.now();
  const freshIds: string[] = [];
  for (const id of uniqueIds) {
    const rec = cached.get(`cg-token:${id}`);
    if (rec && now - rec.fetchedAt < TOKEN_PRICE_STALE_MS) {
      for (const sym of idToSymbols.get(id) ?? []) {
        prices[sym] = rec.price;
        liveCount++;
      }
    } else {
      freshIds.push(id);
    }
  }

  if (freshIds.length > 0) {
    try {
      // تکه‌تکه کردن درخواست‌ها (حداکثر ۵۰ شناسه در هر URL) — جلوگیری از خطاهای URL بزرگ
      const chunks: string[][] = [];
      for (let i = 0; i < freshIds.length; i += 50) chunks.push(freshIds.slice(i, i + 50));

      for (const [idx, chunk] of chunks.entries()) {
        // فاصله کوتاه بین تکه‌ها — پخش درخواست‌ها در پنجره نرخ
        if (idx > 0) await sleep(1_500);
        const url =
          `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(chunk.join(','))}` +
          `&vs_currencies=usd`;
        const res = await cgFetch(url);
        if (!res.ok) throw new Error(`token price HTTP ${res.status}`);
        const data = (await res.json()) as Record<string, { usd?: number } | undefined>;
        fetchedAt = Date.now();
        for (const id of chunk) {
          const usd = data[id]?.usd;
          if (typeof usd === 'number' && Number.isFinite(usd) && usd > 0) {
            for (const sym of idToSymbols.get(id) ?? []) {
              prices[sym] = usd;
              liveCount++;
            }
            void cachePutPrice(`cg-token:${id}`, { price: usd, source: 'live', fetchedAt });
          }
        }
      }
    } catch {
      // آفلاین / محدودیت نرخ → کش کهنه
      for (const id of freshIds) {
        const rec = cached.get(`cg-token:${id}`);
        if (rec) {
          for (const sym of idToSymbols.get(id) ?? []) {
            prices[sym] = rec.price;
            liveCount++;
          }
        }
      }
    }
  }

  return { prices, logos, ids, liveCount, fetchedAt };
}

/** ترکیب کل فرایند: متادیتا + قیمت — خروجی برای UI */
export async function syncTokenizedAssets(): Promise<TokenizedSyncResult> {
  const { bySymbol, missing } = await buildTokenizedMeta();

  // جستجوی زمان‌اجرا برای نمادهای بدون نقشه (حداکثر چند نماد — با صف محدود)
  for (const sym of missing) {
    const rec = await searchTokenizedSymbol(sym);
    if (rec) bySymbol[sym] = rec;
  }

  return fetchTokenizedPrices(bySymbol);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** جستجوی سکه در CoinGecko (با صف محدود — برای لوگوهای ناشناخته) */
export async function searchCoin(
  query: string
): Promise<{ id: string; symbol: string; name: string; large?: string | null } | null> {
  try {
    const res = await cgSearchQueue.enqueue(async () => {
      const url = `${COINGECKO_BASE}/search?query=${encodeURIComponent(query)}`;
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error(`search HTTP ${r.status}`);
      return (await r.json()) as { coins?: { id: string; symbol: string; name: string; large?: string | null }[] };
    });
    const coins = res?.coins ?? [];
    const q = query.toLowerCase();
    const exact = coins.find((c) => c.symbol.toLowerCase() === q);
    const byName = coins.find((c) => c.name.toLowerCase().includes(q));
    return exact ?? byName ?? coins[0] ?? null;
  } catch {
    return null;
  }
}

/** آمار ۲۵۰ سکه برتر (لوگو + id + نام + مارکت‌کپ) — یک درخواست، کش IndexedDB ۲۴ ساعت */
export interface TopCoinInfo {
  img: string;
  id: string;
  name: string;
  marketCap?: number | null;
}

export async function fetchTopCoinLogos(): Promise<Record<string, TopCoinInfo>> {
  const ck = 'cg:top250logos';
  try {
    const rec = await cacheBulkGetPrice([ck]);
    const r = rec.get(ck);
    if (r && Date.now() - r.fetchedAt < 24 * 60 * 60 * 1000) return r.price as unknown as Record<string, { img: string; id: string; name: string }>;
  } catch { /* ادامه */ }
  try {
    const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&price_change_percentage=`;
    const res = await cgFetch(url);
    if (!res.ok) throw new Error(`top HTTP ${res.status}`);
    const list = (await res.json()) as {
      id: string; symbol: string; name: string; image?: string | null; market_cap?: number | null;
    }[];
    const out: Record<string, TopCoinInfo> = {};
    for (const c of list) {
      if (c.image) out[c.symbol.toUpperCase()] = { img: c.image, id: c.id, name: c.name, marketCap: c.market_cap };
    }
    try { await cachePutPrice(ck, { price: out as unknown as number, source: 'live', fetchedAt: Date.now() }); } catch { /* خاموش */ }
    return out;
  } catch {
    return {};
  }
}
