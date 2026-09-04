/** ============================================================
 * Normalize — تبدیل ردیف خام CoinGecko به Minimal Market DTO
 *
 * فقط فیلدهای موردنیاز UI استخراج می‌شوند؛ بقیه Response دور ریخته
 * می‌شود (بخش ۵: Smaller Payload — Client Processing کم).
 * ============================================================ */
import type { MarketAsset, MarketSource } from './types';

/** ردیف خام CoinGecko (فقط فیلدهایی که می‌خوانیم) */
export interface RawCgRow {
  id: string;
  symbol: string;
  name?: string;
  image?: string | null;
  current_price?: number | null;
  market_cap?: number | null;
  price_change_percentage_24h?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  price_change_percentage_30d_in_currency?: number | null;
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** تبدیل ردیف خام → DTO مینیمال (هر Symbol مستقل — هیچ Merge/Grouping) */
export function normalizeRow(row: RawCgRow, source: MarketSource, rank: number): MarketAsset {
  const symbol = (row.symbol ?? '').toUpperCase();
  return {
    id: `${source}:${symbol}`,
    symbol,
    image: row.image ?? null,
    price: num(row.current_price),
    marketCap: num(row.market_cap),
    change24h: num(row.price_change_percentage_24h),
    change7d: num(row.price_change_percentage_7d_in_currency),
    change30d: num(row.price_change_percentage_30d_in_currency),
    source,
    rank
  };
}

/**
 * فیلتر اعتبار (بخش ۸/۹/۲۹):
 *  - Tokenized (Ondo/xStocks): فقط Market Cap معتبر (>0) نمایش داده می‌شود
 *  - Crypto: همه (MCap خالی → null، نه حذف)
 */
export function isValidTokenized(a: MarketAsset): boolean {
  return a.marketCap !== null && a.marketCap > 0;
}
