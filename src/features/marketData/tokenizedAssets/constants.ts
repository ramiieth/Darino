/** ============================================================
 * Tokenized Assets — پیکربندی منابع (Configuration-driven — بخش ۳)
 *
 * دو Source رسمی CoinGecko به‌عنوان Source of Truth:
 *   BACKEDFI_XSTOCKS        (BackedFi xStocks Ecosystem)
 *   ONDO_TOKENIZED_ASSETS   (Ondo Tokenized Assets)
 *
 * URLها فقط همین‌جا تعریف شده‌اند؛ هیچ‌جا تکرار نمی‌شوند.
 * ⚠️ هیچ لیست دارایی Hardcode نیست — فقط پیکربندی منابع.
 * ============================================================ */
import type { TokenizedProvider } from './types';

export interface TokenizedAssetSource {
  provider: TokenizedProvider;
  category: string;
  url: string;
  /** برچسب فارسی نمایشی (UI) */
  labelFa: string;
}

export const BACKEDFI_XSTOCKS = 'xstocks-ecosystem';
export const ONDO_TOKENIZED_ASSETS = 'ondo-tokenized-assets';

export const TOKENIZED_ASSET_SOURCES: TokenizedAssetSource[] = [
  {
    provider: 'backedfi',
    category: BACKEDFI_XSTOCKS,
    url: 'https://www.coingecko.com/en/categories/xstocks-ecosystem',
    labelFa: 'BackedFi xStocks'
  },
  {
    provider: 'ondo',
    category: ONDO_TOKENIZED_ASSETS,
    url: 'https://www.coingecko.com/en/categories/ondo-tokenized-assets',
    labelFa: 'Ondo'
  }
];

/** یافتن منبع بر اساس provider */
export function sourceForProvider(provider: TokenizedProvider): TokenizedAssetSource {
  return TOKENIZED_ASSET_SOURCES.find((s) => s.provider === provider) ?? TOKENIZED_ASSET_SOURCES[0];
}

/**
 * فاصله همگام‌سازی خودکار:
 *  - حداقل «هر ۶ ساعت» اگر زیرساخت اجازه دهد (بخش ۱۷)
 *  - در هر Render صفحه Markets هرگز درخواست ارسال نمی‌شود
 */
export const TOKENIZED_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** تعداد درخواست در هر صفحه دسته */
export const CATEGORY_PAGE_SIZE = 250;
/** سقف صفحات (محافظ حلقه بینهایت) */
export const CATEGORY_MAX_PAGES = 10;
