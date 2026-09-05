/** ============================================================
 * Centralized Cache — کش مرکزی Market Data (بخش ۱۸)
 *
 *  One Fetch → One Cache → Multiple Consumers
 *
 *  - Shared (Dexie + حافظه)
 *  - TTL به‌ازای Universe
 *  - Request Deduplication (در استور)
 *  - Data قدیمی معتبر تا دریافت جدید حفظ می‌شود (بخش ۲۹)
 * ============================================================ */
import { cacheBulkGetPrice, cachePutPrice } from '@/shared/lib/db';
import type { MarketAsset, MarketUniverse } from './types';

/** TTL کش — کریپتو سریع‌تر، توکنایز کندتر (بخش ۲۵: Refresh مرکزی) */
export const UNIVERSE_TTL_MS: Record<MarketUniverse, number> = {
  crypto_top_200: 60_000, // ۱ دقیقه
  ondo_tokenized: 10 * 60_000, // ۱۰ دقیقه
  xstocks: 10 * 60_000
};

const cacheKey = (u: MarketUniverse): string => `markets:v2:${u}`;

/**
 * اعتبارسنجی محتوای کش.
 *
 * ⚠️ اگر یک پاسخ خراب Provider قبلاً در کش نوشته شده باشد، بدون این
 * بررسی تا پایان TTL سرو می‌شود و بازار روی داده غلط/اسنپ‌شات گیر می‌کند.
 */
function isMarketAssetArray(v: unknown): v is MarketAsset[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every(
      (a) => a !== null && typeof a === 'object' && typeof (a as MarketAsset).symbol === 'string'
    )
  );
}

/** خواندن کش (اگر تازه باشد) */
export async function cacheGetUniverse(u: MarketUniverse): Promise<MarketAsset[] | null> {
  try {
    const rec = await cacheBulkGetPrice([cacheKey(u)]);
    const r = rec.get(cacheKey(u));
    const assets = r?.price as unknown;
    if (r && Date.now() - r.fetchedAt < UNIVERSE_TTL_MS[u] && isMarketAssetArray(assets)) {
      return assets;
    }
  } catch {
    /* ادامه */
  }
  return null;
}

/**
 * خواندن هر داده قبلی حتی اگر کهنه باشد (بخش ۲۹: داده قبلی هرگز پاک نمی‌شود).
 * وقتی شبکه/سهمیه در دسترس نیست، به‌جای «داده ناکافی» آخرین داده واقعی نمایش داده می‌شود.
 */
export async function cacheGetUniverseStale(u: MarketUniverse): Promise<MarketAsset[] | null> {
  try {
    const rec = await cacheBulkGetPrice([cacheKey(u)]);
    const r = rec.get(cacheKey(u));
    const assets = r?.price as unknown;
    if (isMarketAssetArray(assets)) {
      return assets;
    }
  } catch {
    /* ادامه */
  }
  return null;
}

/** نوشتن کش */
export async function cachePutUniverse(u: MarketUniverse, assets: MarketAsset[]): Promise<void> {
  try {
    await cachePutPrice(cacheKey(u), { price: assets as unknown as number, source: 'live', fetchedAt: Date.now() });
  } catch {
    /* خاموش */
  }
}
