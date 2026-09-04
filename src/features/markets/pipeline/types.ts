/** ============================================================
 * Markets Pipeline — تایپ‌های پایه (Minimal Market DTO)
 *
 * ⚠️ فقط داده‌ای که UI واقعاً نیاز دارد منتقل می‌شود (بخش ۵/۱۷):
 *   Logo · Symbol · Price · 24H · 7D · 30D · Market Cap
 * هیچ فیلد اضافه‌ای از Response وارد Client نمی‌شود.
 * ============================================================ */

/** Universeهای Markets (بخش ۶) */
export type MarketUniverse = 'crypto_top_200' | 'ondo_tokenized' | 'xstocks';

/** منبع هر Asset */
export type MarketSource = 'crypto' | 'ondo' | 'xstocks';

/** Minimal Market Data — یک Data Model مشترک برای همه Universeها */
export interface MarketAsset {
  /** شناسه یکتای پایدار: `${source}:${symbol}` */
  id: string;
  symbol: string;
  image: string | null;
  price: number | null;
  marketCap: number | null;
  change24h: number | null;
  change7d: number | null;
  change30d: number | null;
  source: MarketSource;
  /** ترتیب CoinGecko (rank) — فقط برای مرتب‌سازی */
  rank: number;
}

/** برچسب فارسی Universe (متن UI — نه داده بازار) */
export const UNIVERSE_FA: Record<MarketUniverse, string> = {
  crypto_top_200: 'رمزارز (Top 200)',
  ondo_tokenized: 'Ondo',
  xstocks: 'xStocks'
};

/** هر Symbol یک Market Asset مستقل است (بخش ۱۱) */
export function assetId(source: MarketSource, symbol: string): string {
  return `${source}:${symbol.toUpperCase()}`;
}
