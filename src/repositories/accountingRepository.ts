/** ============================================================
 * Accounting Repository — حسابداری (Neon = SSOT وقتی متصل است)
 *
 *  Accounting UI → Repository → Vercel API → Neon
 *                    └──────────── Dexie (آفلاین/کش)
 *
 * ⚠️ Sync = Record-Level Merge (نه «push whole dataset» خطرناک):
 *
 *   Local → Neon : فقط رکوردهایی که در Neon نیستند Insert می‌شوند
 *                  (سرور: SELECT 1 → skip اگر موجود باشد — هرگز overwrite)
 *   Neon → Local : فقط رکوردهایی که در Local نیستند Pull می‌شوند (با حفظ ID)
 *
 *   ممنوع مطلق:
 *     - Local missing ⇒ حذف رکورد Neon        (هرگز — Neon منبع حقیقت است)
 *     - ID مشترک   ⇒ بازنویسی نسخه موجود      (هرگز — Accounting Immutable)
 *     - تولید ID جدید / Duplicate
 * ============================================================ */
import { fetchJson, isRemoteAllowed, isRemoteReady } from './remoteClient';
import type { RemoteAccountingPayload, RemoteAccountingResponse } from './types';
import {
  accountLoadAll,
  entryLoadAll,
  eventLoadAll,
  lotLoadAll,
  entryBulkPutExact,
  lotBulkPutExact,
  eventBulkPutExact,
  accountEnsure
} from '@/features/accounting/data/db';
import type { Account, FifoLot, JournalEntry, LedgerEvent } from '@/features/accounting/domain/types';

/** در جریان بودن sync (جلوگیری از تداخل) */
let syncInFlight = false;

/* ================= سریال‌سازی (دومین → شبکه) ================= */

/** تبدیل اشیای دامین به payload شبکه — با حفظ ID */
export function serializeAccounting(
  accounts: Account[],
  entries: JournalEntry[],
  lots: FifoLot[],
  events: LedgerEvent[]
): RemoteAccountingPayload {
  return {
    accounts: accounts.map((a) => ({ key: a.key, nameFa: a.nameFa, type: a.type, createdAt: 0 })),
    entries: entries.map((e) => ({
      id: e.id,
      date: e.date,
      createdAt: e.createdAt,
      payload: { memo: e.memo, lines: e.lines, source: e.source }
    })),
    lots: lots.map((l) => ({
      id: l.id,
      asset: l.asset,
      openedAt: l.openedAt,
      payload: { qty: l.qty, unitCost: l.unitCost, closedAt: l.closedAt }
    })),
    events: events.map((ev) => ({ id: ev.id, at: ev.at, payload: { kind: ev.kind, refId: ev.refId, detail: ev.detail } }))
  };
}

/* ================= Deserialization (شبکه → دامین) ================= */

export function deserializeEntries(payload: unknown[]): JournalEntry[] {
  return payload.map((p) => {
    const r = p as { id: number; date: number; createdAt: number; payload: { memo: string; lines: JournalEntry['lines']; source?: JournalEntry['source'] } };
    return { id: r.id, date: r.date, memo: r.payload.memo, lines: r.payload.lines, source: r.payload.source ?? 'manual', createdAt: r.createdAt };
  });
}

export function deserializeLots(payload: unknown[]): FifoLot[] {
  return payload.map((p) => {
    const r = p as { id: number; asset: string; openedAt: number; payload: { qty: number; unitCost: number; closedAt?: number } };
    return { id: r.id, asset: r.asset, qty: r.payload.qty, unitCost: r.payload.unitCost, openedAt: r.openedAt, closedAt: r.payload.closedAt };
  });
}

export function deserializeEvents(payload: unknown[]): LedgerEvent[] {
  return payload.map((p) => {
    const r = p as { id: number; at: number; payload: { kind: string; refId: number; detail: string } };
    return { id: r.id, at: r.at, kind: r.payload.kind, refId: r.payload.refId, detail: r.payload.detail };
  });
}

/* ================= Pure Helpers (تست‌پذیر — بخش Record-Level Merge) ================= */

/**
 * تفاضل: رکوردهای Remote که در Local نیستند (بر اساس ID) — فقط همین‌ها Pull می‌شوند.
 * Local missing هرگز رکورد Remote را حذف نمی‌کند (این تابع فقط «اضافه‌کردنی‌ها» را برمی‌گرداند).
 */
export function diffMissingById<T extends { id: number }>(localIds: ReadonlySet<number>, remote: T[]): T[] {
  return remote.filter((r) => !localIds.has(r.id));
}

/* ================= Sync — Record-Level Merge ================= */

export interface SyncReport {
  pushed: { entries: number; lots: number; events: number };
  pulled: { entries: number; lots: number; events: number };
}

/**
 * Local → Neon: کل دیتاست محلی ارسال می‌شود؛ سرور فقط رکوردهای
 * missing را Insert می‌کند (SELECT 1 → skip موجود) — هرگز overwrite.
 */
export async function pushAccountingToRemote(): Promise<SyncReport | null> {
  if (!isRemoteAllowed() || syncInFlight) return null;
  if (!(await isRemoteReady())) return null;
  syncInFlight = true;
  try {
    const [accounts, entries, lots, events] = await Promise.all([
      accountLoadAll(),
      entryLoadAll(),
      lotLoadAll(),
      eventLoadAll()
    ]);
    if (entries.length === 0 && lots.length === 0 && events.length === 0 && accounts.length <= 1) {
      return null; // هنوز داده واقعی نیست
    }
    const body = serializeAccounting(accounts, entries, lots, events);
    const res = await fetchJson<{ ok: boolean; inserted: number; skipped: number }>('/api/accounting', { method: 'POST', body });
    return { pushed: { entries: res.inserted, lots: 0, events: 0 }, pulled: { entries: 0, lots: 0, events: 0 } };
  } catch {
    return null; // سقوط بی‌صدا به حالت محلی
  } finally {
    syncInFlight = false;
  }
}

/**
 * Neon → Local: فقط رکوردهای missing به Local اضافه می‌شوند (با حفظ ID).
 * رکوردهای Local که Neon ندارد → دست نمی‌خورند (در push بعدی می‌روند).
 * Local missing هرگز باعث حذف رکورد Neon نمی‌شود.
 */
export async function pullAccountingFromRemote(): Promise<SyncReport | null> {
  if (!isRemoteAllowed() || syncInFlight) return null;
  if (!(await isRemoteReady())) return null;
  syncInFlight = true;
  try {
    const res = await fetchJson<RemoteAccountingResponse>('/api/accounting');
    if (!res.configured) return null;

    const [localEntries, localLots, localEvents] = await Promise.all([
      entryLoadAll(),
      lotLoadAll(),
      eventLoadAll()
    ]);

    const localEntryIds = new Set(localEntries.map((e) => e.id));
    const localLotIds = new Set(localLots.map((l) => l.id));
    const localEventIds = new Set(localEvents.map((e) => e.id));

    // فقط رکوردهایی که در Local نیستند (Record-Level Pull)
    const missingEntries = diffMissingById(localEntryIds, deserializeEntries(res.entries));
    const missingLots = diffMissingById(localLotIds, deserializeLots(res.lots));
    const missingEvents = diffMissingById(localEventIds, deserializeEvents(res.events));

    await entryBulkPutExact(missingEntries);
    await lotBulkPutExact(missingLots);
    await eventBulkPutExact(missingEvents);

    // حساب‌های missing هم اضافه می‌شوند (seed مشترک — بدون خطر)
    const localAccounts = await accountLoadAll();
    const localKeys = new Set(localAccounts.map((a) => a.key));
    for (const a of res.accounts) {
      if (!localKeys.has(a.key)) {
        await accountEnsure({ key: a.key, nameFa: a.nameFa, type: a.type as Account['type'] });
      }
    }

    return {
      pushed: { entries: 0, lots: 0, events: 0 },
      pulled: { entries: missingEntries.length, lots: missingLots.length, events: missingEvents.length }
    };
  } catch {
    return null;
  } finally {
    syncInFlight = false;
  }
}

/** همگام‌سازی کامل: اول Push (Local→Neon) سپس Pull (Neon→Local) */
export async function syncAccountingWithRemote(): Promise<SyncReport | null> {
  if (!isRemoteAllowed()) return null;
  const pushed = await pushAccountingToRemote();
  const pulled = await pullAccountingFromRemote();
  return {
    pushed: { entries: pushed?.pushed.entries ?? 0, lots: 0, events: 0 },
    pulled: pulled?.pulled ?? { entries: 0, lots: 0, events: 0 }
  };
}
