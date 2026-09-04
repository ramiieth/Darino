/** ============================================================
 * Tokenized Assets DB — دسترسی به جداول Registry (Dexie)
 *
 *  tokenized_asset_registry  — هویت/فراداده (Market Discovery فقط)
 *  tokenized_asset_sync_runs — لاگ اجراهای Sync
 * ============================================================ */
import { getDb } from '@/shared/lib/db';
import type { TokenizedAssetRecord, TokenizedProvider, TokenizedSyncRun } from './types';

interface TokenizedDbShape {
  tokenizedAssetRegistry: {
    bulkPut(v: TokenizedAssetRecord[]): Promise<unknown>;
    bulkGet(keys: string[]): Promise<(TokenizedAssetRecord | undefined)[]>;
    toArray(): Promise<TokenizedAssetRecord[]>;
  };
  tokenizedAssetSyncRuns: {
    add(v: Omit<TokenizedSyncRun, 'id'>): Promise<number>;
    toArray(): Promise<TokenizedSyncRun[]>;
  };
}

async function tables(): Promise<TokenizedDbShape | null> {
  return (await getDb()) as unknown as TokenizedDbShape | null;
}

/** حافظه درون‌فرایندی (فالبک وقتی IndexedDB در دسترس نیست) */
let memoryRegistry = new Map<string, TokenizedAssetRecord>();
let memoryRuns: TokenizedSyncRun[] = [];

export async function registryBulkPut(records: TokenizedAssetRecord[]): Promise<void> {
  records.forEach((r) => memoryRegistry.set(r.key, r));
  const db = await tables();
  if (!db) return;
  try {
    await db.tokenizedAssetRegistry.bulkPut(records);
  } catch {
    /* فقط حافظه */
  }
}

export async function registryBulkGet(keys: string[]): Promise<Map<string, TokenizedAssetRecord>> {
  const out = new Map<string, TokenizedAssetRecord>();
  const db = await tables();
  if (db) {
    try {
      const rows = await db.tokenizedAssetRegistry.bulkGet(keys);
      rows.forEach((r) => r && out.set(r.key, r));
      return out;
    } catch {
      /* فالبک حافظه */
    }
  }
  keys.forEach((k) => {
    const r = memoryRegistry.get(k);
    if (r) out.set(k, r);
  });
  return out;
}

export async function registryAll(): Promise<TokenizedAssetRecord[]> {
  const db = await tables();
  if (db) {
    try {
      const rows = await db.tokenizedAssetRegistry.toArray();
      if (rows.length > 0) return rows;
    } catch {
      /* فالبک حافظه */
    }
  }
  return [...memoryRegistry.values()];
}

export async function registryByProvider(provider: TokenizedProvider): Promise<TokenizedAssetRecord[]> {
  const all = await registryAll();
  return all.filter((r) => r.provider === provider);
}

export async function syncRunAdd(run: Omit<TokenizedSyncRun, 'id'>): Promise<void> {
  memoryRuns.push({ ...run, id: memoryRuns.length + 1 });
  const db = await tables();
  if (!db) return;
  try {
    await db.tokenizedAssetSyncRuns.add(run);
  } catch {
    /* فقط حافظه */
  }
}

export async function syncRunsAll(): Promise<TokenizedSyncRun[]> {
  const db = await tables();
  if (db) {
    try {
      const rows = await db.tokenizedAssetSyncRuns.toArray();
      if (rows.length > 0) return rows;
    } catch {
      /* فالبک حافظه */
    }
  }
  return memoryRuns;
}

/** آخرین اجرای موفق برای یک provider */
export async function lastSuccessfulRun(provider: TokenizedProvider): Promise<TokenizedSyncRun | null> {
  const runs = await syncRunsAll();
  const ok = runs
    .filter((r) => r.provider === provider && r.status === 'success')
    .sort((a, b) => b.startedAt - a.startedAt);
  return ok[0] ?? null;
}

/** ریست حافظه درون‌فرایندی — فقط برای تست‌ها */
export function registryResetForTests(): void {
  memoryRegistry.clear();
  memoryRuns = [];
}
