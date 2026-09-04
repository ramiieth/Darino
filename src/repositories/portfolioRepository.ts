/** ============================================================
 * Portfolio Repository — پورتفولیو/سرمایه کاربر
 *
 *  Portfolio UI → Repository → Vercel API → Neon
 *                     └──────────── Dexie (آفلاین — جدول portfolioAssets)
 *
 * ⚠️ فقط Cost Basis و Quantity اینجا ذخیره می‌شود؛ Current Value همیشه
 * از Market Data (زنده) محاسبه می‌شود — جدایی کامل Market/Accounting.
 * ============================================================ */
import { getDb } from '@/shared/lib/db';
import { fetchJson, isRemoteAllowed, isRemoteReady } from './remoteClient';
import type { PortfolioAsset } from './types';

interface PortfolioDbShape {
  portfolioAssets: {
    toArray(): Promise<PortfolioAsset[]>;
    put(v: PortfolioAsset): Promise<unknown>;
    bulkPut(v: PortfolioAsset[]): Promise<unknown>;
  };
}

let memAssets = new Map<string, PortfolioAsset>();

function memKey(a: { assetType: string; assetId: string }): string {
  return `${a.assetType}:${a.assetId}`;
}

/* ================= Local (Dexie v9 — آفلاین) ================= */

async function localAll(): Promise<PortfolioAsset[]> {
  const db = (await getDb()) as unknown as PortfolioDbShape | null;
  if (db) {
    try {
      const rows = await db.portfolioAssets.toArray();
      if (rows.length > 0) return rows;
    } catch {
      /* فالبک */
    }
  }
  return [...memAssets.values()];
}

async function localUpsert(asset: PortfolioAsset): Promise<void> {
  memAssets.set(memKey(asset), asset);
  const db = (await getDb()) as unknown as PortfolioDbShape | null;
  if (db) {
    try {
      await db.portfolioAssets.put(asset);
    } catch {
      /* فقط حافظه */
    }
  }
}

/* ================= Remote (Neon) ================= */

/** خواندن دارایی‌ها — اول Remote (وقتی متصل) سپس Local */
export async function getPortfolioAssets(): Promise<PortfolioAsset[]> {
  if (isRemoteAllowed() && (await isRemoteReady())) {
    try {
      const res = await fetchJson<{ assets: PortfolioAsset[] }>('/api/portfolio');
      if (Array.isArray(res.assets) && res.assets.length > 0) {
        // همگام‌سازی به محلی (آفلاین)
        for (const a of res.assets) await localUpsert(a);
        return res.assets;
      }
    } catch {
      /* ادامه با محلی */
    }
  }
  return localAll();
}

/** افزودن/به‌روزرسانی دارایی (Upsert) */
export async function upsertPortfolioAsset(input: Omit<PortfolioAsset, 'createdAt' | 'updatedAt'>): Promise<PortfolioAsset> {
  const now = Date.now();
  const asset: PortfolioAsset = { ...input, createdAt: now, updatedAt: now };
  await localUpsert(asset);
  if (isRemoteAllowed() && (await isRemoteReady())) {
    try {
      await fetchJson('/api/portfolio', { method: 'POST', body: { action: 'upsert', asset } });
    } catch {
      /* فقط محلی — sync بعدی */
    }
  }
  return asset;
}

/** حذف دارایی */
export async function deletePortfolioAsset(assetType: string, assetId: string): Promise<void> {
  memAssets.delete(memKey({ assetType, assetId }));
  const db = (await getDb()) as unknown as PortfolioDbShape | null;
  if (db) {
    try {
      // حذف از Dexie — جستجو و delete
      const all = await db.portfolioAssets.toArray();
      const hit = all.find((a) => a.assetType === assetType && a.assetId === assetId);
      if (hit && hit.id !== undefined) {
        await (db.portfolioAssets as unknown as { delete(id: number): Promise<unknown> }).delete(hit.id);
      }
    } catch {
      /* خاموش */
    }
  }
  if (isRemoteAllowed() && (await isRemoteReady())) {
    try {
      await fetchJson('/api/portfolio', { method: 'POST', body: { action: 'delete', asset: { assetType, assetId } } });
    } catch {
      /* فقط محلی */
    }
  }
}
