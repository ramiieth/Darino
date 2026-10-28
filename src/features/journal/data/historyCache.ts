/**
 * کش تاریخچهٔ اجراها و فاندینگ روی همین دستگاه — پایگاه دادهٔ جدا از پایگاه اصلی اپ
 *
 *   چرا جدا؟ تغییر schema پایگاه اصلی (portfolio-simulator-db) ریسک مهاجرت دارد؛ این کش دورریختنی است:
 *   اگر پاک شود فقط دوباره از صرافی خوانده می‌شود. هیچ‌چیز از اینجا به سرور دارینو فرستاده نمی‌شود.
 *   IndexedDB در دسترس نباشد (حالت خصوصی) → حافظهٔ همین جلسه.
 */
import Dexie, { type Table } from 'dexie';
import type { Fill, FundingEvent } from '../domain/types';

export interface SyncMark {
  /** کلید حساب */
  key: string;
  /** آخرین زمان اجرای دریافت‌شده (ms) */
  lastTime: number;
  /** از چه زمانی به بعد کامل داریم */
  from: number;
  complete: boolean;
  limitation: string | null;
  syncedAt: number;
}

class JournalCacheDb extends Dexie {
  fills!: Table<Fill, string>;
  funding!: Table<FundingEvent, string>;
  sync!: Table<SyncMark, string>;
  constructor() {
    super('darino-journal-cache');
    this.version(1).stores({ fills: 'id, account, time', funding: 'id, account, time', sync: 'key' });
  }
}

let db: JournalCacheDb | null | undefined;
const mem = { fills: new Map<string, Fill>(), funding: new Map<string, FundingEvent>(), sync: new Map<string, SyncMark>() };

async function open(): Promise<JournalCacheDb | null> {
  if (db !== undefined) return db;
  try {
    if (typeof indexedDB === 'undefined') return (db = null);
    const d = new JournalCacheDb();
    await d.open();
    db = d;
  } catch {
    db = null;
  }
  return db;
}

export async function readAccount(key: string): Promise<{ fills: Fill[]; funding: FundingEvent[]; mark: SyncMark | null }> {
  const d = await open();
  if (d) {
    try {
      const [fills, funding, mark] = await Promise.all([d.fills.where('account').equals(key).toArray(), d.funding.where('account').equals(key).toArray(), d.sync.get(key)]);
      return { fills, funding, mark: mark ?? null };
    } catch {
      /* فالبک حافظه */
    }
  }
  return {
    fills: [...mem.fills.values()].filter((f) => f.account === key),
    funding: [...mem.funding.values()].filter((f) => f.account === key),
    mark: mem.sync.get(key) ?? null
  };
}

export async function writeAccount(key: string, fills: Fill[], funding: FundingEvent[], mark: SyncMark): Promise<void> {
  fills.forEach((f) => mem.fills.set(f.id, f));
  funding.forEach((f) => mem.funding.set(f.id, f));
  mem.sync.set(key, mark);
  const d = await open();
  if (!d) return;
  try {
    await d.transaction('rw', d.fills, d.funding, d.sync, async () => {
      if (fills.length) await d.fills.bulkPut(fills);
      if (funding.length) await d.funding.bulkPut(funding);
      await d.sync.put(mark);
    });
  } catch {
    /* فقط حافظه */
  }
}

/** پاک‌کردن کامل کش (دکمهٔ تنظیمات) — دادهٔ کاربر (یادداشت، برنامه، مرور) دست نمی‌خورد */
export async function clearHistoryCache(): Promise<void> {
  mem.fills.clear();
  mem.funding.clear();
  mem.sync.clear();
  const d = await open();
  if (!d) return;
  try {
    await Promise.all([d.fills.clear(), d.funding.clear(), d.sync.clear()]);
  } catch {
    /* بی‌صدا */
  }
}
