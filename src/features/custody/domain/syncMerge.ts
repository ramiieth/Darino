/** ============================================================
 * همگام‌سازی بین دستگاه‌ها (وب + PWA آیفون) — منطق خالص ادغام
 *
 *  • هر رکورد (محل، عملیات، شبکه، توکن) با (revision، updatedAt) نسخه‌گذاری می‌شود.
 *    نسخهٔ جدیدتر برنده است — همین قاعده در سرور (ON CONFLICT … WHERE) هم اعمال می‌شود.
 *  • حذف سخت وجود ندارد: باطل‌کردن/بایگانی خودش یک نسخهٔ جدیدتر است و همگام می‌شود.
 *  • رکورد هم‌شناسه هرگز تکثیر نمی‌شود؛ ثبت جداگانهٔ یک رویداد روی دو دستگاه
 *    با کلیدهای یکتایی (ledger.dedupeKeys) شناسایی و به کاربر هشدار داده می‌شود.
 * ============================================================ */
import type { Asset, Holding, Network, Operation, PrefRecord } from './types.js';

export type SyncCollection = 'holdings' | 'operations' | 'networks' | 'assets' | 'prefs';
export const SYNC_COLLECTIONS: SyncCollection[] = ['holdings', 'operations', 'networks', 'assets', 'prefs'];

export interface SyncRecord {
  collection: SyncCollection;
  id: string;
  revision: number;
  updatedAt: number;
  payload: unknown;
}

export const SYNC_ID_RE = /^[\w:.\-]{1,120}$/;

/** آیا a از b جدیدتر است؟ */
export function isNewer(a: Pick<SyncRecord, 'revision' | 'updatedAt'>, b: Pick<SyncRecord, 'revision' | 'updatedAt'>): boolean {
  return a.revision > b.revision || (a.revision === b.revision && a.updatedAt > b.updatedAt);
}

export interface LocalSets {
  holdings: Holding[];
  operations: Operation[];
  customNetworks: Network[];
  customAssets: Asset[];
  prefs?: PrefRecord[];
}

export function toSyncRecords(s: LocalSets): SyncRecord[] {
  return [
    ...s.holdings.map((h) => ({ collection: 'holdings' as const, id: h.id, revision: 1, updatedAt: h.updatedAt, payload: h })),
    ...s.operations.map((o) => ({ collection: 'operations' as const, id: o.id, revision: o.revision, updatedAt: o.updatedAt, payload: o })),
    ...s.customNetworks.map((n) => ({ collection: 'networks' as const, id: n.id, revision: 1, updatedAt: n.updatedAt ?? 0, payload: n })),
    ...s.customAssets.map((a) => ({ collection: 'assets' as const, id: a.id, revision: 1, updatedAt: a.updatedAt ?? 0, payload: a })),
    ...(s.prefs ?? []).map((p) => ({ collection: 'prefs' as const, id: p.id, revision: p.revision, updatedAt: p.updatedAt, payload: p }))
  ];
}

const keyOf = (r: Pick<SyncRecord, 'collection' | 'id'>) => `${r.collection}|${r.id}`;

export interface MergePlan {
  /** نسخه‌های سرور که باید جایگزین/اضافهٔ محلی شوند */
  pull: SyncRecord[];
  /** نسخه‌های محلی که باید به سرور فرستاده شوند */
  push: SyncRecord[];
}

/** برنامهٔ ادغام دوطرفه — بدون حذف هیچ رکوردی */
export function planMerge(local: SyncRecord[], remote: SyncRecord[]): MergePlan {
  const remoteMap = new Map(remote.map((r) => [keyOf(r), r]));
  const localMap = new Map(local.map((r) => [keyOf(r), r]));
  const pull: SyncRecord[] = [];
  const push: SyncRecord[] = [];
  for (const r of remote) {
    const l = localMap.get(keyOf(r));
    if (!l || isNewer(r, l)) pull.push(r);
  }
  for (const l of local) {
    const r = remoteMap.get(keyOf(l));
    if (!r || isNewer(l, r)) push.push(l);
  }
  return { pull, push };
}

/** اعتبارسنجی ساختاری رکورد ورودی سرور (ورودی مرورگر قابل‌اعتماد فرض نمی‌شود) */
export function validateSyncRecord(r: unknown): r is SyncRecord {
  if (!r || typeof r !== 'object') return false;
  const x = r as Record<string, unknown>;
  if (!SYNC_COLLECTIONS.includes(x.collection as SyncCollection)) return false;
  if (typeof x.id !== 'string' || !SYNC_ID_RE.test(x.id)) return false;
  if (!Number.isSafeInteger(x.revision) || (x.revision as number) < 1) return false;
  if (!Number.isSafeInteger(x.updatedAt) || (x.updatedAt as number) < 0) return false;
  if (!x.payload || typeof x.payload !== 'object' || Array.isArray(x.payload)) return false;
  if ((x.payload as { id?: unknown }).id !== x.id) return false;
  return true;
}
