/** ============================================================
 * Dashboard Repository — داشبورد (فقط View + اسنپ‌شات تاریخچه)
 *
 *  Dashboard → Repository → Vercel API → Neon
 *
 * ⚠️ منبع اصلی ارقام داشبورد = Accounting + Portfolio (که خودشان از
 * Neon می‌آیند). dashboardSnapshots فقط برای نمودار/تاریخچه است.
 * ============================================================ */
import { getDb } from '@/shared/lib/db';
import { fetchJson, isRemoteAllowed, isRemoteReady } from './remoteClient';
import type { DashboardSnapshot } from './types';

interface SnapshotDbShape {
  dashboardSnapshots: {
    toArray(): Promise<DashboardSnapshot[]>;
    put(v: DashboardSnapshot): Promise<unknown>;
  };
}

let memSnapshots: DashboardSnapshot[] = [];

/* ================= Local (Dexie v9 — آفلاین) ================= */

async function localRecent(limit = 90): Promise<DashboardSnapshot[]> {
  const db = (await getDb()) as unknown as SnapshotDbShape | null;
  if (db) {
    try {
      const rows = await db.dashboardSnapshots.toArray();
      if (rows.length > 0) return rows.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    } catch {
      /* فالبک */
    }
  }
  return [...memSnapshots].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

async function localPut(s: DashboardSnapshot): Promise<void> {
  memSnapshots.push(s);
  const db = (await getDb()) as unknown as SnapshotDbShape | null;
  if (db) {
    try {
      await db.dashboardSnapshots.put(s);
    } catch {
      /* فقط حافظه */
    }
  }
}

/* ================= Remote (Neon) ================= */

/** آخرین اسنپ‌شات‌ها (برای نمودار عملکرد) */
export async function getDashboardSnapshots(limit = 90): Promise<DashboardSnapshot[]> {
  if (isRemoteAllowed() && (await isRemoteReady())) {
    try {
      const res = await fetchJson<{ snapshots: DashboardSnapshot[] }>('/api/dashboard');
      if (Array.isArray(res.snapshots) && res.snapshots.length > 0) return res.snapshots.slice(0, limit);
    } catch {
      /* ادامه با محلی */
    }
  }
  return localRecent(limit);
}

/**
 * ثبت اسنپ‌شات ارزش خالص (با نرخ دلار همان لحظه — Historical FX).
 * تکراری در همان timestamp → در سرور skip می‌شود (Idempotent).
 */
export async function recordDashboardSnapshot(snapshot: Omit<DashboardSnapshot, 'createdAt'>): Promise<void> {
  await localPut({ ...snapshot, createdAt: Date.now() });
  if (isRemoteAllowed() && (await isRemoteReady())) {
    try {
      await fetchJson('/api/dashboard', { method: 'POST', body: { snapshot } });
    } catch {
      /* فقط محلی */
    }
  }
}
