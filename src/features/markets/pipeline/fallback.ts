/** ============================================================
 * Market Offline Snapshot — اسنپ‌شات مرجع (بخش ۲۹: داده قبلی هرگز پاک نمی‌شود)
 *
 * وقتی Provider در دسترس نیست (آفلاین / سندباکس / 429) ولی هیچ کش قبلی
 * نداریم، به‌جای «داده ناکافی» از همین اسنپ‌شات واقعی استفاده می‌شود.
 * این مقادیر از پاسخ واقعی CoinGecko/مرجع پروژه استخراج شده و فقط
 * به‌عنوان داده آفلاین (برچسب «اسنپ‌شات») نمایش داده می‌شوند — هرگز
 * به‌عنوان «زنده» ثبت نمی‌شوند (lastSyncAt ثابت می‌ماند).
 * ============================================================ */
import {
  COINS,
  JULY_1_2026_PRICES,
  TOKENIZED_STOCK_PRICES
} from '@/features/simulation/domain/constants';
import { TOKENIZED_COIN_MAP } from '@/features/simulation/data/tokenizedCoinMap';
import type { MarketAsset, MarketSource, MarketUniverse } from './types';

/** ساخت Asset آفلاین از اسنپ‌شات مرجع */
function snapshotAsset(
  source: MarketSource,
  symbol: string,
  price: number | null,
  image: string | null,
  rank: number
): MarketAsset {
  return {
    id: `${source}:${symbol.toUpperCase()}`,
    symbol: symbol.toUpperCase(),
    image,
    price,
    marketCap: null,
    change24h: null,
    change7d: null,
    change30d: null,
    source,
    rank,
    /** این ردیف از اسنپ‌شات است، نه پاسخ زنده */
    snapshot: true
  };
}

/** ساخت اسنپ‌شات یک Universe — در بدترین حالت [] برمی‌گردد */
export function buildFallbackAssets(u: MarketUniverse): MarketAsset[] {
  if (u === 'crypto_top_200') {
    // ۳۲ رمزارز مرجع (تابع معکوس: symbol → price) — فقط داده واقعی
    const bySymbol = new Map<string, { id: string; price: number }>();
    for (const [id, price] of Object.entries(JULY_1_2026_PRICES)) {
      const symbol = COINS[id];
      if (symbol) bySymbol.set(symbol.toUpperCase(), { id, price });
    }
    return [...bySymbol.entries()].map(([symbol, v], i) =>
      snapshotAsset('crypto', symbol, v.price, null, i + 1)
    );
  }

  const out: MarketAsset[] = [];
  let rank = 0;

  for (const [sym, price] of Object.entries(TOKENIZED_STOCK_PRICES)) {
    const meta = TOKENIZED_COIN_MAP[sym.toUpperCase()];
    const name = meta?.name ?? sym;
    const isOndo =
      sym.toUpperCase().endsWith('ON') || /ondo/i.test(name);
    const isXstock =
      sym.toUpperCase().endsWith('X') || /xstock/i.test(name);

    const source: MarketSource | null = isOndo ? 'ondo' : isXstock ? 'xstocks' : null;
    if (!source) continue; // فقط دارایی‌های دو دسته رسمی (Ondo / xStocks)

    if (u === 'ondo_tokenized' && source !== 'ondo') continue;
    if (u === 'xstocks' && source !== 'xstocks') continue;

    rank += 1;
    out.push(snapshotAsset(source, sym, price, meta?.img ?? null, rank));
  }

  return out;
}
