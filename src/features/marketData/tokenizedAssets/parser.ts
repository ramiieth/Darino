/** ============================================================
 * Parser — استخراج دارایی‌ها از پاسخ خام API دسته (بخش ۳۳)
 *
 *  - ترتیب CoinGecko حفظ می‌شود (source_rank = ایندکس واقعی)
 *  - ردیف‌های نامعتبر (بدون id/symbol/name) حذف می‌شوند
 * ============================================================ */
import type { CoingeckoCategoryRow, ParsedCategoryAsset } from './types';

/** استخراج همه دارایی‌های یک دسته — ترتیب ورودی = ترتیب CoinGecko */
export function parseCategoryAssets(rows: CoingeckoCategoryRow[]): ParsedCategoryAsset[] {
  const out: ParsedCategoryAsset[] = [];
  rows.forEach((row, index) => {
    if (!row || typeof row.id !== 'string' || row.id === '') return;
    if (typeof row.symbol !== 'string' || row.symbol.trim() === '') return;
    if (typeof row.name !== 'string' || row.name.trim() === '') return;
    out.push({
      coingeckoId: row.id,
      tokenSymbol: row.symbol.trim(),
      tokenName: row.name.trim(),
      // rank واقعی در ترتیب پاسخ (۱-پایه)
      sourceRank: index + 1
    });
  });
  return out;
}
