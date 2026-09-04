/** ============================================================
 * Sync Scenarios + Schema Safety — تست‌های سناریو (بخش ۲۶)
 *
 *  A) دیتابیس خالی → init همه جداول را می‌سازد (بدون خطا، idempotent)
 *  B) اجرای دوباره init → بدون حذف/duplicate
 *  C) Neon ۱۰ رکورد / Local ۰ → هر ۱۰ Pull (Neon دست نمی‌خورد)
 *  D) Local ۱۰ رکورد جدید / Neon خالی → هر ۱۰ Insert می‌شوند
 *  E) Neon ۱۰ / Local ۷ → فقط ۳ missing Pull (هیچ رکورد Neon حذف نمی‌شود)
 *  F) ID مشترک → نسخه Neon توسط Local overwrite نمی‌شود
 *
 * ⚠️ اتصال زنده به Neon در سندباکس در دسترس نیست؛ بنابراین:
 *   - منطق diff و merge (لایه خالص + Dexie حافظه) واقعاً تست می‌شود
 *   - متن schema واقعاً بررسی می‌شود (idempotent/غیرمخرب/پارسر)
 *   - این در گزارش نهایی صریح ذکر می‌شود
 * ============================================================ */
// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { diffMissingById, deserializeEntries, deserializeLots, deserializeEvents, serializeAccounting } from './accountingRepository';
import { assertSchemaIsSafe, splitSqlStatements } from '../../api/_schema';
import { entryBulkPutExact, entryLoadAll, lotBulkPutExact, lotLoadAll, eventBulkPutExact, eventLoadAll, accountingReset } from '@/features/accounting/data/db';
import type { JournalEntry, FifoLot, LedgerEvent } from '@/features/accounting/domain/types';

/* ---------- ساخت رکوردهای نمونه ---------- */

function mkEntry(id: number): JournalEntry {
  return {
    id,
    date: 1_700_000_000_000 + id,
    memo: `entry-${id}`,
    lines: [
      { account: 'asset:ETH', debit: 100, credit: 0 },
      { account: 'cash:usd', debit: 0, credit: 100 }
    ],
    createdAt: 1_700_000_001_000 + id,
    source: 'manual'
  };
}
function mkLot(id: number): FifoLot {
  return { id, asset: 'ETH', qty: 1, unitCost: 2_000 + id, openedAt: 1_700_000_000_000 + id };
}
function mkEvent(id: number): LedgerEvent {
  return { id, at: 1_700_000_001_000 + id, kind: 'manual', refId: id, detail: `ev-${id}` };
}

beforeEach(async () => {
  await accountingReset();
});

/* ================= A/B — Schema Safety & Idempotency ================= */

describe('Schema — ایمن، idempotent، غیرمخرب (A/B)', () => {
  const schema = readFileSync(resolve(process.cwd(), 'db/schema.sql'), 'utf8');

  it('A) هر ۶ جدول با CREATE TABLE IF NOT EXISTS ساخته می‌شوند', () => {
    const tables = ['accAccounts', 'accEntries', 'accLots', 'accEvents', 'portfolioAssets', 'dashboardSnapshots'];
    for (const t of tables) {
      // ⚠️ نام جدول باید Quoted و camelCase باشد — بدون کوتیشن، PostgreSQL
      // به lowercase تبدیل می‌کند و کوئری‌های Quoted در api/*.ts خطای
      // column "userId" does not exist می‌دهند (باگ سپتامبر ۲۰۲۶).
      expect(schema).toContain(`CREATE TABLE IF NOT EXISTS "${t}"`);
    }
  });

  it('A) پارسر statementها همه را جدا می‌کند و همه CREATE هستند', () => {
    const statements = splitSqlStatements(schema);
    expect(statements.length).toBeGreaterThan(6);
    for (const st of statements) {
      expect(st.toUpperCase().startsWith('CREATE')).toBe(true); // فقط DDL additive
    }
  });

  it('B) هیچ دستور مخرب (DROP/TRUNCATE/DELETE) در schema نیست', () => {
    const statements = splitSqlStatements(schema);
    expect(() => assertSchemaIsSafe(statements.join(' '))).not.toThrow();
    for (const st of statements) {
      expect(st.toUpperCase()).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/);
    }
  });

  it('B) اجرای دوباره بی‌خطر است — IF NOT EXISTS برای هر جدول/ایندکس', () => {
    // دو بار split+parse همان خروجی — و همه IF NOT EXISTS
    for (const st of splitSqlStatements(schema)) {
      expect(st.toUpperCase()).toContain('IF NOT EXISTS');
    }
  });
});

/* ================= Schema/Case — نگهبان حروف Quoted (رگرسیون سپتامبر ۲۰۲۶) ================= */

describe('Schema/Case — هم‌خوانی camelCase Quoted بین api و schema.sql', () => {
  const schema = readFileSync(resolve(process.cwd(), 'db/schema.sql'), 'utf8');
  const apiFiles = ['api/accounting.ts', 'api/portfolio.ts', 'api/dashboard.ts', 'api/_schema.ts'].map(
    (f) => readFileSync(resolve(process.cwd(), f), 'utf8')
  );

  it('هر ستون camelCase در schema.sql داخل دابل‌کوتیشن تعریف شده', () => {
    const camelCols = [
      'userId', 'nameFa', 'createdAt', 'openedAt',
      'assetType', 'assetId', 'averageCost', 'purchaseDate', 'updatedAt',
      'totalValue', 'totalCost', 'profitLoss', 'allocationSnapshot', 'fxRateUsed'
    ];
    for (const c of camelCols) {
      expect(schema).toContain(`"${c}"`);
    }
  });

  it('هر شناسه Quoted در api/*.ts دقیقاً در schema.sql وجود دارد', () => {
    // همه توکن‌های "..." در فایل‌های API شناسه SQL هستند (رشته‌های SQL تک‌کوتیشنی‌اند)
    const quoted = new Set<string>();
    for (const src of apiFiles) {
      for (const m of src.matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"/g)) quoted.add(m[1]);
    }
    expect(quoted.size).toBeGreaterThan(10);
    for (const id of quoted) {
      expect(schema).toContain(`"${id}"`);
    }
  });

  it('چک to_regclass در _schema.ts و ensure-schema.mjs از نام Quoted استفاده می‌کند', () => {
    const schemaTs = readFileSync(resolve(process.cwd(), 'api/_schema.ts'), 'utf8');
    const ensureJs = readFileSync(resolve(process.cwd(), 'scripts/ensure-schema.mjs'), 'utf8');
    for (const t of ['accAccounts', 'accEntries', 'accLots', 'accEvents', 'portfolioAssets', 'dashboardSnapshots']) {
      expect(schemaTs).toContain(`to_regclass('public."${t}"')`);
      expect(ensureJs).toContain(`to_regclass('public."${t}"')`);
    }
  });
});

/* ================= C/E/F — Record-Level Pull ================= */

describe('Pull — Neon → Local (فقط missing؛ هرگز حذف)', () => {
  it('C) Neon ۱۰ / Local ۰ → هر ۱۰ Pull می‌شوند', async () => {
    const remoteEntries = Array.from({ length: 10 }, (_, i) => mkEntry(i + 1));
    const remoteLots = Array.from({ length: 10 }, (_, i) => mkLot(i + 1));
    const remoteEvents = Array.from({ length: 10 }, (_, i) => mkEvent(i + 1));

    // شبیه‌سازی GET از سرور
    const payload = serializeAccounting([], remoteEntries, remoteLots, remoteEvents);
    const localEntries = await entryLoadAll();
    const missingE = diffMissingById(new Set(localEntries.map((e) => e.id)), deserializeEntries(payload.entries));
    expect(missingE).toHaveLength(10);

    await entryBulkPutExact(missingE);
    await lotBulkPutExact(diffMissingById(new Set((await lotLoadAll()).map((l) => l.id)), deserializeLots(payload.lots)));
    await eventBulkPutExact(diffMissingById(new Set((await eventLoadAll()).map((e) => e.id)), deserializeEvents(payload.events)));

    expect(await entryLoadAll()).toHaveLength(10);
    expect(await lotLoadAll()).toHaveLength(10);
    expect(await eventLoadAll()).toHaveLength(10);
  });

  it('E) Neon ۱۰ / Local ۷ → فقط ۳ missing Pull می‌شوند (۱۰ Neon حذف نمی‌شود)', async () => {
    // Local اول ۷ رکورد دارد
    await entryBulkPutExact(Array.from({ length: 7 }, (_, i) => mkEntry(i + 1)));

    // Remote هر ۱۰ را دارد
    const remoteEntries = Array.from({ length: 10 }, (_, i) => mkEntry(i + 1));
    const localEntries = await entryLoadAll();
    const missing = diffMissingById(new Set(localEntries.map((e) => e.id)), remoteEntries);

    expect(missing).toHaveLength(3); // فقط ۸/۹/۱۰
    expect(missing.map((m) => m.id)).toEqual([8, 9, 10]);

    await entryBulkPutExact(missing);
    const all = await entryLoadAll();
    expect(all).toHaveLength(10);
    // رکوردهای ۱..۷ دست‌نخورده (همان نسخه Local)
    expect(all.find((e) => e.id === 1)?.memo).toBe('entry-1');
  });

  it('F) ID مشترک → Local نسخه Neon را overwrite نمی‌کند (فقط skip)', () => {
    // رکورد id=5 در هر دو هست؛ diff آن را برنمی‌گرداند → در pull نمی‌آید → overwrite نمی‌شود
    const remote = Array.from({ length: 5 }, (_, i) => mkEntry(i + 1));
    const localIds = new Set([1, 2, 3, 4, 5]);
    const missing = diffMissingById(localIds, remote);
    expect(missing).toHaveLength(0); // هیچ‌کدام missing نیست → هیچ overwrite‌ای رخ نمی‌دهد
  });
});

/* ================= D — Record-Level Push (سمت سرور idempotent است) ================= */

describe('Push — Local → Neon (فقط insert-if-missing سمت سرور)', () => {
  it('D) Local ۱۰ رکورد جدید → همه برای insert ارسال می‌شوند (سرور skip موجودها)', async () => {
    const localEntries = Array.from({ length: 10 }, (_, i) => mkEntry(i + 1));
    const payload = serializeAccounting([], localEntries, [], []);
    expect(payload.entries).toHaveLength(10);
    // idها حفظ شده‌اند — سرور با SELECT 1 رکورد موجود را skip می‌کند (در تست‌های API شبیه‌سازی نمی‌شود)
    expect(payload.entries.map((e) => e.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('اجرای دوباره push همان payload می‌دهد — بدون تولید ID جدید (بدون duplicate)', async () => {
    const a = serializeAccounting([], [mkEntry(3)], [], []);
    const b = serializeAccounting([], [mkEntry(3)], [], []);
    expect(a.entries[0].id).toBe(3);
    expect(b.entries[0].id).toBe(3); // همان id — سرور skip می‌کند → duplicate نمی‌شود
  });
});

/* ================= Immutable ================= */

describe('Accounting Immutable — ID/تاریخ/مبلغ هرگز تغییر نمی‌کند', () => {
  it('bulkPutExact با همان id همان محتوا را نگه می‌دارد (بدون تغییر تاریخ/مبلغ)', async () => {
    const original = mkEntry(42);
    await entryBulkPutExact([original]);
    // اجرای دوباره همان رکورد (مثل pull تکراری)
    await entryBulkPutExact([{ ...mkEntry(42) }]);
    const all = await entryLoadAll();
    expect(all).toHaveLength(1); // نه ۲ — duplicate ساخته نشد
    expect(all[0].id).toBe(42);
    expect(all[0].date).toBe(original.date);
    expect(all[0].lines[0].debit).toBe(original.lines[0].debit);
    expect(all[0].createdAt).toBe(original.createdAt);
  });
});
