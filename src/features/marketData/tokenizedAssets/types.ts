/** ============================================================
 * Tokenized Assets Registry — تایپ‌ها
 *
 * ⚠️ این سیستم فقط MARKET DATA / DISCOVERY LAYER است.
 * هیچ ارتباطی با حسابداری (journal/postings/lots/FIFO) ندارد.
 * ============================================================ */

/** Providerهای رسمی (پیکربندی‌محور — بخش ۳/۷ مشخصات) */
export type TokenizedProvider = 'backedfi' | 'ondo';

/** نوع دارایی — بدون حدس خطرناک (بخش ۱۰) */
export type TokenizedAssetType =
  | 'STOCK'
  | 'ETF'
  | 'INDEX'
  | 'COMMODITY'
  | 'BOND'
  | 'PREFERRED_STOCK'
  | 'OTHER';

/** وضعیت رکورد — حذف فیزیکی ممنوع؛ فقط inactive (بخش ۱۵/۲۸) */
export type RegistryStatus = 'active' | 'inactive';

/** یک رکورد Registry (بخش ۶) */
export interface TokenizedAssetRecord {
  /** کلید یکتا: `${provider}:${tokenSymbol}` (بخش ۱۳ — dedupe) */
  key: string;
  provider: TokenizedProvider;
  /** شناسه رسمی دسته در CoinGecko (بخش ۳) */
  sourceCategory: string;
  /** URL رسمی دسته */
  sourceUrl: string;
  /** شناسه CoinGecko */
  coingeckoId: string;
  /** نماد دقیق توکن (مثلاً AAPLX / AAPLON) — هرگز جایگزین پایه نمی‌شود (بخش ۸) */
  tokenSymbol: string;
  /** نام توکن از Provider */
  tokenName: string;
  /** نماد دارایی پایه (مثلاً AAPL) — در صورت قابل تشخیص */
  underlyingSymbol: string | null;
  /** نام دارایی پایه (مثلاً Apple) */
  underlyingName: string | null;
  assetType: TokenizedAssetType;
  status: RegistryStatus;
  /** ترتیب CoinGecko در زمان Sync (بخش ۵ — نه شناسه اصلی) */
  sourceRank: number;
  firstSeenAt: number;
  lastSeenAt: number;
  lastSyncedAt: number;
  /** هش فراداده — تشخیص تغییر (بخش ۱۶) */
  metadataHash: string;
  createdAt: number;
  updatedAt: number;
}

/** رکورد لاگ هر اجرای Sync (بخش ۲۱) */
export interface TokenizedSyncRun {
  id?: number;
  provider: TokenizedProvider;
  sourceCategory: string;
  startedAt: number;
  completedAt: number | null;
  status: 'success' | 'failed';
  assetsFound: number;
  assetsAdded: number;
  assetsUpdated: number;
  assetsRemoved: number;
  errorMessage: string | null;
}

/** ردیف خام از API دسته CoinGecko */
export interface CoingeckoCategoryRow {
  id: string;
  symbol: string;
  name: string;
  image?: string | null;
  market_cap_rank?: number | null;
  [k: string]: unknown;
}

/** نتیجه Parse یک دسته */
export interface ParsedCategoryAsset {
  coingeckoId: string;
  tokenSymbol: string;
  tokenName: string;
  sourceRank: number;
}

/** خروجی گروه‌بندی Underlying برای UI */
export interface UnderlyingAssetGroup {
  /** شناسه پایدار: underlyingSymbol یا fallback نام */
  underlyingId: string;
  underlyingName: string;
  underlyingSymbol: string | null;
  tokens: TokenizedAssetRecord[];
}
