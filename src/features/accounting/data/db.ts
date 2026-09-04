/** ============================================================
 * لایه داده حسابداری — IndexedDB (Dexie v4) با فالبک حافظه
 * فقط‌افزودنی: سندها و رویدادها هرگز ویرایش/حذف نمی‌شوند
 * ============================================================ */
import type { Account, FifoLot, JournalEntry, LedgerEvent } from '../domain/types';
import { DEFAULT_ACCOUNTS } from '../domain/types';

/** افزودن جدول‌های حسابداری به دیتابیس موجود (نسخه ۴) */
export function accountTables(stores: Record<string, string>): Record<string, string> {
  return {
    ...stores,
    accAccounts: 'key',
    accEntries: '++id, date, createdAt',
    accLots: '++id, asset, openedAt',
    accEvents: '++id, at'
  };
}

/* ---------------- فالبک حافظه (IndexedDB در دسترس نیست) ---------------- */
const mem = {
  accounts: new Map<string, Account>(DEFAULT_ACCOUNTS.map((a) => [a.key, a])),
  entries: [] as JournalEntry[],
  lots: [] as FifoLot[],
  events: [] as LedgerEvent[],
  nextEntryId: 1,
  nextLotId: 1,
  nextEventId: 1
};

interface AccDb {
  accAccounts: { toArray(): Promise<Account[]>; put(v: Account): Promise<unknown>; bulkPut(v: Account[]): Promise<unknown>; clear(): Promise<unknown> };
  accEntries: { toArray(): Promise<JournalEntry[]>; add(v: JournalEntry): Promise<number>; bulkAdd(v: JournalEntry[]): Promise<unknown>; bulkPut(v: JournalEntry[]): Promise<unknown>; clear(): Promise<unknown> };
  accLots: { toArray(): Promise<FifoLot[]>; add(v: FifoLot): Promise<number>; bulkAdd(v: FifoLot[]): Promise<unknown>; bulkPut(v: FifoLot[]): Promise<unknown>; clear(): Promise<unknown> };
  accEvents: { toArray(): Promise<LedgerEvent[]>; add(v: LedgerEvent): Promise<number>; bulkPut(v: LedgerEvent[]): Promise<unknown>; clear(): Promise<unknown> };
}

let accDb: AccDb | null = null;

async function getAccDb(): Promise<AccDb | null> {
  if (accDb) return accDb;
  try {
    const { getDb } = await import('@/shared/lib/db');
    const db = await getDb();
    if (!db) return null;
    accDb = db as unknown as AccDb;
  } catch {
    accDb = null;
  }
  return accDb;
}

/* ---------------- نمودار حساب‌ها ---------------- */

/**
 * بارگذاری نمودار حساب‌ها — همیشه با نمودار پیش‌فرض ادغام می‌شود:
 *  نمودار پیش‌فرض (DEFAULT_ACCOUNTS) منبع حقیقت نام/نوع است؛
 *  حساب‌های سفارشی (رمزارزها) به آن اضافه می‌شوند و حساب‌های ناقص ذخیره می‌گردند.
 */
export async function accountLoadAll(): Promise<Account[]> {
  const db = await getAccDb();
  let rows: Account[] = [];
  if (db) {
    try {
      rows = await db.accAccounts.toArray();
    } catch {
      rows = [];
    }
  } else {
    rows = [...mem.accounts.values()];
  }

  const map = new Map<string, Account>(DEFAULT_ACCOUNTS.map((a) => [a.key, a]));
  for (const r of rows) {
    if (!map.has(r.key)) map.set(r.key, r);
  }

  // ثبت حساب‌های پیش‌فرضِ غایب (مثلاً صندوق مخارج/حساب بانکی در دیتابیس قدیمی)
  const missing = DEFAULT_ACCOUNTS.filter((a) => !rows.some((r) => r.key === a.key));
  if (db && missing.length > 0) {
    try {
      await db.accAccounts.bulkPut(missing);
    } catch {
      /* خاموش */
    }
  }
  return [...map.values()];
}

/** اطمینان از وجود حساب (برای رمزارزهای خریداری‌شده) */
export async function accountEnsure(account: Account): Promise<void> {
  mem.accounts.set(account.key, account);
  const db = await getAccDb();
  if (db) {
    try {
      await db.accAccounts.put(account);
    } catch {
      /* خاموش */
    }
  }
}

/* ---------------- سندهای حسابداری (فقط‌افزودنی) ---------------- */

export async function entryLoadAll(): Promise<JournalEntry[]> {
  const db = await getAccDb();
  if (db) {
    try {
      const rows = await db.accEntries.toArray();
      if (rows.length > 0) return rows.sort((a, b) => a.id - b.id);
    } catch {
      /* فالبک */
    }
  }
  return [...mem.entries].sort((a, b) => a.id - b.id);
}

/** افزودن سند — همیشه شناسه جدید می‌گیرد (هرگز ویرایش نمی‌شود) */
export async function entryAppend(entry: JournalEntry): Promise<JournalEntry> {
  const db = await getAccDb();
  if (db) {
    try {
      const id = await db.accEntries.add({ ...entry, id: undefined as unknown as number });
      return { ...entry, id };
    } catch {
      /* فالبک */
    }
  }
  const saved = { ...entry, id: mem.nextEntryId++ };
  mem.entries.push(saved);
  return saved;
}

/** افزودن چند سند (افتتاحیه) */
export async function entryAppendMany(entries: JournalEntry[]): Promise<JournalEntry[]> {
  const db = await getAccDb();
  if (db) {
    try {
      const withIds = entries.map((e) => ({ ...e, id: undefined as unknown as number }));
      await db.accEntries.bulkAdd(withIds);
      const all = await entryLoadAll();
      return all.slice(-entries.length);
    } catch {
      /* فالبک */
    }
  }
  return Promise.all(entries.map((e) => entryAppend(e)));
}

/* ============ Put-Level (برای همگام‌سازی Neon → Dexie با حفظ ID) ============ */

/** بازنویسی/درج با شناسه صریح (pull از سرور — IDها حفظ می‌شوند تا Duplicate نشود) */
export async function entryBulkPutExact(entries: JournalEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const db = await getAccDb();
  if (db) {
    try {
      await db.accEntries.bulkPut(entries);
      return;
    } catch {
      /* فالبک */
    }
  }
  for (const e of entries) {
    const i = mem.entries.findIndex((x) => x.id === e.id);
    if (i >= 0) mem.entries[i] = e;
    else mem.entries.push(e);
    mem.nextEntryId = Math.max(mem.nextEntryId, e.id + 1);
  }
  mem.entries.sort((a, b) => a.id - b.id);
}

export async function lotBulkPutExact(lots: FifoLot[]): Promise<void> {
  if (lots.length === 0) return;
  const db = await getAccDb();
  if (db) {
    try {
      await db.accLots.bulkPut(lots);
      return;
    } catch {
      /* فالبک */
    }
  }
  for (const l of lots) {
    const i = mem.lots.findIndex((x) => x.id === l.id);
    if (i >= 0) mem.lots[i] = l;
    else mem.lots.push(l);
    mem.nextLotId = Math.max(mem.nextLotId, l.id + 1);
  }
}

export async function eventBulkPutExact(events: LedgerEvent[]): Promise<void> {
  if (events.length === 0) return;
  const db = await getAccDb();
  if (db) {
    try {
      await db.accEvents.bulkPut(events);
      return;
    } catch {
      /* فالبک */
    }
  }
  for (const e of events) {
    const i = mem.events.findIndex((x) => x.id === e.id);
    if (i >= 0) mem.events[i] = e;
    else mem.events.push(e);
    mem.nextEventId = Math.max(mem.nextEventId, e.id + 1);
  }
  mem.events.sort((a, b) => a.id - b.id);
}

/* ---------------- لات‌های FIFO ---------------- */

export async function lotLoadAll(): Promise<FifoLot[]> {
  const db = await getAccDb();
  if (db) {
    try {
      const rows = await db.accLots.toArray();
      if (rows.length > 0) return rows.sort((a, b) => a.id - b.id);
    } catch {
      /* فالبک */
    }
  }
  return [...mem.lots].sort((a, b) => a.id - b.id);
}

/** افزودن لات خرید */
export async function lotAppend(lot: FifoLot): Promise<FifoLot> {
  const db = await getAccDb();
  if (db) {
    try {
      const id = await db.accLots.add({ ...lot, id: undefined as unknown as number });
      return { ...lot, id };
    } catch {
      /* فالبک */
    }
  }
  const saved = { ...lot, id: mem.nextLotId++ };
  mem.lots.push(saved);
  return saved;
}

/** جایگزینی لات‌ها پس از فروش (بستن/کاهش لات‌های مصرف‌شده) */
export async function lotReplaceAll(lots: FifoLot[]): Promise<void> {
  mem.lots = lots;
  const db = await getAccDb();
  if (db) {
    try {
      await db.accLots.clear();
      await db.accLots.bulkAdd(lots.map((l) => ({ ...l, id: l.id })));
    } catch {
      /* فقط حافظه */
    }
  }
}

/* ---------------- رویدادهای ممیزی (فقط‌افزودنی) ---------------- */

export async function eventLoadAll(): Promise<LedgerEvent[]> {
  const db = await getAccDb();
  if (db) {
    try {
      const rows = await db.accEvents.toArray();
      if (rows.length > 0) return rows.sort((a, b) => a.id - b.id);
    } catch {
      /* فالبک */
    }
  }
  return [...mem.events].sort((a, b) => a.id - b.id);
}

/** افزودن رویداد ممیزی */
export async function eventAppend(
  kind: string,
  refId: number,
  detail: string
): Promise<LedgerEvent> {
  const ev: LedgerEvent = { id: -1, at: Date.now(), kind, refId, detail };
  const db = await getAccDb();
  if (db) {
    try {
      const id = await db.accEvents.add({ ...ev, id: undefined as unknown as number });
      return { ...ev, id };
    } catch {
      /* فالبک */
    }
  }
  const saved = { ...ev, id: mem.nextEventId++ };
  mem.events.push(saved);
  return saved;
}

/* ---------------- پاک‌سازی (فقط تست) ---------------- */

export async function accountingReset(): Promise<void> {
  mem.accounts = new Map(DEFAULT_ACCOUNTS.map((a) => [a.key, a]));
  mem.entries = [];
  mem.lots = [];
  mem.events = [];
  mem.nextEntryId = 1;
  mem.nextLotId = 1;
  mem.nextEventId = 1;
  const db = await getAccDb();
  if (db) {
    try {
      await db.accEntries.clear();
      await db.accLots.clear();
      await db.accEvents.clear();
      await db.accAccounts.clear();
      await db.accAccounts.bulkPut(DEFAULT_ACCOUNTS);
    } catch {
      /* خاموش */
    }
  }
}
