/** ============================================================
 * Tokenized Sync Engine — موتور همگام‌سازی Registry (بخش ۱۸/۲۰/۲۶)
 *
 *  برای هر Source:
 *    fetch (تمام صفحات) → parse → normalize → compare با Registry
 *      ├── جدید؟        → INSERT (status=active, firstSeenAt=now)
 *      ├── تغییر کرده؟  → UPDATE متادیتا (firstSeenAt ثابت می‌ماند)
 *      └── دیگر موجود نیست؟ → status=inactive (هرگز Hard Delete — بخش ۱۵)
 *
 *  شکست (نرخ‌لیمیت/آفلاین):
 *    → لاگ «failed» ثبت می‌شود و دیتابیس دست‌نخورده می‌ماند (بخش ۲۰)
 *
 * ⚠️ فقط Market Metadata — هیچ داده حسابداری/معامله‌ای دست نمی‌خورد (بخش ۳۲).
 * ============================================================ */
import { registryBulkGet, registryBulkPut, registryByProvider, syncRunAdd } from './db';
import { sourceForProvider, TOKENIZED_ASSET_SOURCES } from './constants';
import { fetchCategoryPages } from './sources/coingeckoCategory';
import { parseCategoryAssets } from './parser';
import { normalizeAsset } from './normalizer';
import type { TokenizedAssetRecord, TokenizedProvider, TokenizedSyncRun } from './types';

/** جلوگیری از اجرای هم‌زمان */
const inFlight = new Map<string, Promise<SyncOutcome>>();

export interface SyncOutcome {
  provider: TokenizedProvider;
  assetsFound: number;
  assetsAdded: number;
  assetsUpdated: number;
  assetsRemoved: number;
}

/**
 * Sync کامل Registry — هر دو منبع.
 * برمی‌گرداند: لیست نتایج به‌تفکیک provider + رکوردهای به‌روزشده.
 */
export async function syncTokenizedRegistry(): Promise<{
  outcomes: SyncOutcome[];
  records: TokenizedAssetRecord[];
}> {
  const outcomes: SyncOutcome[] = [];
  const allRecords: TokenizedAssetRecord[] = [];

  for (const source of TOKENIZED_ASSET_SOURCES) {
    const outcome = await syncProvider(source.provider);
    outcomes.push(outcome);
    allRecords.push(...(await registryByProvider(source.provider)));
  }

  return { outcomes, records: allRecords };
}

/** Sync یک Provider (dedupe هم‌زمان) */
export async function syncProvider(provider: TokenizedProvider): Promise<SyncOutcome> {
  const existing = inFlight.get(provider);
  if (existing) {
    await existing;
    return { provider, assetsFound: 0, assetsAdded: 0, assetsUpdated: 0, assetsRemoved: 0 };
  }

  const p = (async () => {
    const source = sourceForProvider(provider);
    const startedAt = Date.now();
    const run: Omit<TokenizedSyncRun, 'id'> = {
      provider,
      sourceCategory: source.category,
      startedAt,
      completedAt: null,
      status: 'failed',
      assetsFound: 0,
      assetsAdded: 0,
      assetsUpdated: 0,
      assetsRemoved: 0,
      errorMessage: null
    };

    try {
      // ۱) خواندن تمام صفحات (بخش ۴)
      const rows = await fetchCategoryPages(source.category);

      // ۲) Parse + Normalize
      const parsed = parseCategoryAssets(rows);
      const now = Date.now();
      const normalized = parsed.map((a) => normalizeAsset(a, source, now));

      // ۳) مقایسه با Registry موجود — همه رکوردهای Provider (نه فقط کلیدهای جدید)
      //     تا دارایی‌های حذف‌شده از منبع هم شناسایی شوند (inactive)
      const existingAll = await registryByProvider(provider);
      const existingMap = new Map(existingAll.map((r) => [r.key, r]));
      const newRecords: TokenizedAssetRecord[] = [];
      let added = 0;
      let updated = 0;

      for (const next of normalized) {
        const prev = existingMap.get(next.key);
        if (!prev) {
          // جدید → INSERT
          added++;
          newRecords.push(next);
          continue;
        }
        if (prev.metadataHash !== next.metadataHash || prev.status !== 'active') {
          // تغییر متادیتا یا بازگشت از inactive → UPDATE (firstSeenAt ثابت)
          updated++;
          newRecords.push({
            ...next,
            firstSeenAt: prev.firstSeenAt,
            createdAt: prev.createdAt
          });
        }
        // بدون تغییر → همان رکورد قبلی می‌ماند
      }

      // ۴) دارایی‌های قبلی که در منبع نیستند → inactive (نه حذف)
      let removed = 0;
      for (const prev of existingMap.values()) {
        if (prev.status !== 'active') continue;
        const stillThere = normalized.some((n) => n.key === prev.key);
        if (!stillThere) {
          removed++;
          newRecords.push({ ...prev, status: 'inactive', lastSeenAt: now, updatedAt: now });
        }
      }

      // ۵) نوشتن فقط وقتی fetch موفق بوده (هرگز دیتابیس را خالی نمی‌کنیم).
      //     پاسخ موفق حتی اگر خالی باشد معتبر است: دارایی‌های قبلی inactive می‌شوند
      //     (شکست شبکه هرگز به اینجا نمی‌رسد — در catch می‌ماند)
      await registryBulkPut(newRecords);

      run.status = 'success';
      run.completedAt = Date.now();
      run.assetsFound = normalized.length;
      run.assetsAdded = added;
      run.assetsUpdated = updated;
      run.assetsRemoved = removed;
      await syncRunAdd(run);

      return {
        provider,
        assetsFound: normalized.length,
        assetsAdded: added,
        assetsUpdated: updated,
        assetsRemoved: removed
      };
    } catch (e) {
      // شکست → دیتابیس دست‌نخورده؛ فقط لاگ failed
      run.completedAt = Date.now();
      run.errorMessage = e instanceof Error ? e.message.slice(0, 300) : String(e);
      await syncRunAdd(run);
      throw e;
    } finally {
      inFlight.delete(provider);
    }
  })();

  inFlight.set(provider, p);
  return p;
}
