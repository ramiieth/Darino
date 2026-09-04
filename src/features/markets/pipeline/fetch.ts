/** ============================================================
 * Fetch Layer — دریافت داده از Provider (Batch/Category-level)
 *
 *  - crypto_top_200: یک درخواست Top200 (با dedup سراسری موجود)
 *  - ondo/xstocks:    یک درخواست Category (تمام صفحات — بخش ۲۱)
 *
 * ⚠️ هرگز برای هر Token درخواست جدا ارسال نمی‌شود (بخش ۲۰).
 * همه درخواست‌ها از دروازه نرخ سراسری عبور می‌کنند (dedup + مدارشکن).
 * ============================================================ */
import { fetchTopMarketsOnce } from '@/features/cryptomarkets/data/useTopCryptoMarkets';
import { fetchCategoryPages } from '@/features/marketData/tokenizedAssets/sources/coingeckoCategory';
import { normalizeRow, type RawCgRow } from './normalize';
import type { MarketAsset, MarketSource, MarketUniverse } from './types';

/** دسته‌های رسمی CoinGecko (Config-driven — بخش ۳) */
export const CATEGORY_BY_UNIVERSE: Record<'ondo_tokenized' | 'xstocks', string> = {
  ondo_tokenized: 'ondo-tokenized-assets',
  xstocks: 'xstocks-ecosystem'
};

/**
 * دریافت + نرمال‌سازی یک Universe.
 * خروجی: لیست DTO مینیمال (فقط فیلدهای UI) — پردازش سنگین سمت Client نیست.
 */
export async function fetchUniverseAssets(u: MarketUniverse): Promise<MarketAsset[]> {
  if (u === 'crypto_top_200') {
    const res = await fetchTopMarketsOnce();
    // dedup سراسری: همان fetch مشترک با داشبورد/سیمولیشن (بخش ۱۹)
    return res.data.map((row, i) => normalizeRow(row as unknown as RawCgRow, 'crypto', i + 1));
  }

  // Category-level fetch (بخش ۲۱) — تمام صفحات، ترتیب CoinGecko حفظ می‌شود
  const source: MarketSource = u === 'ondo_tokenized' ? 'ondo' : 'xstocks';
  const rows = await fetchCategoryPages(CATEGORY_BY_UNIVERSE[u]);
  return rows.map((row, i) => normalizeRow(row as unknown as RawCgRow, source, i + 1));
}
