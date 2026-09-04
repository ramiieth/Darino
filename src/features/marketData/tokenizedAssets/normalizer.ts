/** ============================================================
 * Normalizer — تبدیل دارایی Parse‌شده به رکورد استاندارد Registry (بخش ۳۳)
 *
 *  - هش فراداده (metadata_hash) برای تشخیص تغییر (بخش ۱۶)
 *  - first_seen_at هرگز تغییر نمی‌کند (در Sync مدیریت می‌شود)
 *  - هیچ داده قیمتی/عملکردی اینجا نیست (فقط Metadata — بخش ۲۹)
 * ============================================================ */
import type { ParsedCategoryAsset, TokenizedAssetRecord, TokenizedProvider } from './types';
import type { TokenizedAssetSource } from './constants';
import { resolveAssetType, resolveUnderlying } from './resolver';

/** هش پایدار فراداده (FNV-1a روی JSON مرتب) — برای تشخیص تغییر */
export function hashMetadata(fields: Record<string, unknown>): string {
  const sorted = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${String(fields[k])}`)
    .join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < sorted.length; i++) {
    h ^= sorted.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** ساخت رکورد کامل Registry از دارایی Parse‌شده (زمان‌ها در Sync پر می‌شوند) */
export function normalizeAsset(
  asset: ParsedCategoryAsset,
  source: TokenizedAssetSource,
  now: number
): TokenizedAssetRecord {
  const underlying = resolveUnderlying(asset.tokenSymbol, asset.tokenName, source.provider);
  const assetType = resolveAssetType(asset.tokenName);
  const metadataHash = hashMetadata({
    tokenName: asset.tokenName,
    underlyingSymbol: underlying.underlyingSymbol ?? '',
    underlyingName: underlying.underlyingName ?? '',
    assetType,
    sourceRank: asset.sourceRank
  });

  const key = registryKey(source.provider, asset.tokenSymbol);

  return {
    key,
    provider: source.provider,
    sourceCategory: source.category,
    sourceUrl: source.url,
    coingeckoId: asset.coingeckoId,
    tokenSymbol: asset.tokenSymbol,
    tokenName: asset.tokenName,
    underlyingSymbol: underlying.underlyingSymbol,
    underlyingName: underlying.underlyingName,
    assetType,
    status: 'active',
    sourceRank: asset.sourceRank,
    // زمان‌ها در SyncEngine مقداردهی می‌شوند (نگه‌داری firstSeen)
    firstSeenAt: now,
    lastSeenAt: now,
    lastSyncedAt: now,
    metadataHash,
    createdAt: now,
    updatedAt: now
  };
}

/** کلید یکتا Registry: provider + token_symbol (بخش ۱۳) */
export function registryKey(provider: TokenizedProvider, tokenSymbol: string): string {
  return `${provider}:${tokenSymbol.toUpperCase()}`;
}
