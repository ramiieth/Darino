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

/** خواندن کش (اگر تازه باشد) */
export async function cacheGetUniverse(u: MarketUniverse): Promise<MarketAsset[] | null> {
  try {
    const rec = await cacheBulkGetPrice([cacheKey(u)]);
    const r = rec.get(cacheKey(u));
    if (r && Date.now() - r.fetchedAt < UNIVERSE_TTL_MS[u]) {
      return r.price as unknown as MarketAsset[];
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
