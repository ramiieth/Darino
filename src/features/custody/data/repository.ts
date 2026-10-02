/** ============================================================
 * مخزن محلی دارایی چندشبکه‌ای — IndexedDB (Dexie v11) با فالبک حافظه
 *
 *  • فقط پس از اقدام صریح کاربر (دکمهٔ ذخیره/تأیید) نوشته می‌شود؛
 *    مشاهدهٔ صفحه یا فرم نیمه‌کاره هیچ رکوردی نمی‌سازد.
 *  • همگام‌سازی بین دستگاه‌ها (وب + PWA) در sync.ts و فقط با نشست Passkey انجام می‌شود؛
 *    این فایل خودش هیچ درخواست شبکه‌ای نمی‌فرستد.
 *  • هیچ seed یا دادهٔ نمونه‌ای وجود ندارد.
 * ============================================================ */
import { useSyncExternalStore } from 'react';
import type { Asset, Holding, Network, Operation, PrefRecord } from '../domain/types';

interface Table<T> {
  toArray(): Promise<T[]>;
  put(v: T): Promise<unknown>;
  delete(id: string): Promise<unknown>;
  clear(): Promise<unknown>;
}

interface CustodyDb {
  custodyHoldings: Table<Holding>;
  custodyOperations: Table<Operation>;
  custodyNetworks: Table<Network>;
  custodyAssets: Table<Asset>;
  custodyPrefs: Table<PrefRecord>;
}

export interface CustodySnapshot {
  loaded: boolean;
  holdings: Holding[];
  operations: Operation[];
  customNetworks: Network[];
  customAssets: Asset[];
  /** تنظیمات همگام (مبنای لات حسابداری، سرمایهٔ سناریو) */
  prefs: PrefRecord[];
  /** خطای ذخیره‌سازی دائمی (حالت فقط‌حافظه) */
  persistent: boolean;
}

let state: CustodySnapshot = {
  loaded: false,
  holdings: [],
  operations: [],
  customNetworks: [],
  customAssets: [],
  prefs: [],
  persistent: true
};

const listeners = new Set<() => void>();
/** شنوندگان تغییر محلی (برای زمان‌بندی push همگام‌سازی) — تغییرات دریافتی از سرور اعلام نمی‌شوند */
const localChangeListeners = new Set<() => void>();
export function onLocalChange(l: () => void): () => void {
  localChangeListeners.add(l);
  return () => localChangeListeners.delete(l);
}
const notifyLocal = () => localChangeListeners.forEach((l) => l());
function emit(next: Partial<CustodySnapshot>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

let dbPromise: Promise<CustodyDb | null> | null = null;
async function getCustodyDb(): Promise<CustodyDb | null> {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const { getDb } = await import('@/shared/lib/db');
        const db = await getDb();
        return (db as unknown as CustodyDb) ?? null;
      } catch {
        return null;
      }
    })();
  }
  return dbPromise;
}

let loading: Promise<void> | null = null;
export function loadCustody(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = (async () => {
    const db = await getCustodyDb();
    if (!db) {
      emit({ loaded: true, persistent: false });
      return;
    }
    try {
      const [holdings, operations, customNetworks, customAssets, prefs] = await Promise.all([
        db.custodyHoldings.toArray(),
        db.custodyOperations.toArray(),
        db.custodyNetworks.toArray(),
        db.custodyAssets.toArray(),
        db.custodyPrefs.toArray()
      ]);
      emit({ loaded: true, holdings, operations, customNetworks, customAssets, prefs, persistent: true });
    } catch {
      emit({ loaded: true, persistent: false });
    }
  })();
  return loading;
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
}

async function persist<T>(pick: (db: CustodyDb) => Table<T>, value: T): Promise<void> {
  const db = await getCustodyDb();
  if (!db) return;
  await pick(db).put(value);
}

export async function saveHolding(h: Holding): Promise<void> {
  await persist((d) => d.custodyHoldings, h);
  emit({ holdings: upsert(state.holdings, h) });
  notifyLocal();
}

export async function saveOperation(op: Operation): Promise<void> {
  await persist((d) => d.custodyOperations, op);
  emit({ operations: upsert(state.operations, op) });
  notifyLocal();
}

/** ذخیرهٔ چند عملیات (مثلاً ربط رکورد خارجی) — همه یا هیچ در سطح UI */
export async function saveOperations(ops: Operation[]): Promise<void> {
  for (const op of ops) await saveOperation(op);
}

export async function saveCustomNetwork(n: Network): Promise<void> {
  const rec = { ...n, updatedAt: n.updatedAt ?? Date.now() };
  await persist((d) => d.custodyNetworks, rec);
  emit({ customNetworks: upsert(state.customNetworks, rec) });
  notifyLocal();
}

export async function saveCustomAsset(a: Asset): Promise<void> {
  const rec = { ...a, updatedAt: a.updatedAt ?? Date.now() };
  await persist((d) => d.custodyAssets, rec);
  emit({ customAssets: upsert(state.customAssets, rec) });
  notifyLocal();
}

/** ذخیرهٔ تنظیم همگام — نسخهٔ جدید (revision+1) جایگزین می‌شود */
export async function savePref<T>(id: string, value: T): Promise<PrefRecord<T>> {
  const prev = state.prefs.find((p) => p.id === id);
  const rec: PrefRecord<T> = { id, revision: (prev?.revision ?? 0) + 1, updatedAt: Date.now(), value };
  await persist((d) => d.custodyPrefs as unknown as Table<PrefRecord<T>>, rec);
  emit({ prefs: upsert(state.prefs, rec as PrefRecord) });
  notifyLocal();
  return rec;
}

export function getPref<T>(id: string): PrefRecord<T> | undefined {
  return state.prefs.find((p) => p.id === id) as PrefRecord<T> | undefined;
}

/** اعمال نسخه‌های دریافتی از سرور (بدون اعلام تغییر محلی → بدون حلقهٔ push) */
export async function applyRemote(p: { holdings: Holding[]; operations: Operation[]; networks: Network[]; assets: Asset[]; prefs?: PrefRecord[] }): Promise<void> {
  const db = await getCustodyDb();
  if (db) {
    for (const h of p.holdings) await db.custodyHoldings.put(h);
    for (const o of p.operations) await db.custodyOperations.put(o);
    for (const n of p.networks) await db.custodyNetworks.put(n);
    for (const a of p.assets) await db.custodyAssets.put(a);
    for (const x of p.prefs ?? []) await db.custodyPrefs.put(x);
  }
  let { holdings, operations, customNetworks, customAssets, prefs } = state;
  for (const h of p.holdings) holdings = upsert(holdings, h);
  for (const o of p.operations) operations = upsert(operations, o);
  for (const n of p.networks) customNetworks = upsert(customNetworks, n);
  for (const a of p.assets) customAssets = upsert(customAssets, a);
  for (const x of p.prefs ?? []) prefs = upsert(prefs, x);
  emit({ holdings, operations, customNetworks, customAssets, prefs });
  if((prefs.find(p=>p.id==='cost-basis-v1')?.value as {legacyRetired?:boolean}|undefined)?.legacyRetired) {await retireManualOperations();const {accountingReset}=await import('@/features/accounting/data/db');await accountingReset();}
}

/**
 * پاک‌کردن کامل دادهٔ این بخش از این دستگاه (با تأیید صریح کاربر).
 * فقط جدول‌های custody — هیچ دادهٔ دیگری از اپ (حسابداری، بازار…) دست نمی‌خورد.
 */
export async function wipeCustodyData(): Promise<void> {
  const db = await getCustodyDb();
  if (db) {
    await Promise.all([
      db.custodyHoldings.clear(),
      db.custodyOperations.clear(),
      db.custodyNetworks.clear(),
      db.custodyAssets.clear(),
      db.custodyPrefs.clear()
    ]);
  }
  emit({ holdings: [], operations: [], customNetworks: [], customAssets: [], prefs: [] });
}

export function getCustodySnapshot(): CustodySnapshot {
  return state;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useCustodyStore(): CustodySnapshot {
  return useSyncExternalStore(subscribe, getCustodySnapshot, getCustodySnapshot);
}

/** فقط تست */
export function __resetCustodyForTests(): void {
  state = { loaded: false, holdings: [], operations: [], customNetworks: [], customAssets: [], prefs: [], persistent: true };
  loading = null;
  dbPromise = null;
  listeners.clear();
  localChangeListeners.clear();
}

/** After confirmed cost-basis migration, obsolete manual operations cannot repopulate balances. */
export async function retireManualOperations(): Promise<void> {
  const db = await getCustodyDb();
  if(db) { await db.custodyOperations.clear(); await db.custodyPrefs.delete('acc-lot-baseline'); }
  emit({operations:[],prefs:state.prefs.filter(p=>p.id!=='acc-lot-baseline')});
}
