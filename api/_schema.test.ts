/** ============================================================
 * تست رگرسیون برای ensureSchema
 *
 * باگ واقعی production: DDL با `sql.unsafe(st)` اجرا می‌شد، اما در
 * @neondatabase/serverless تابع unsafe() فقط یک نشانگر (UnsafeRawSql)
 * برای درون‌ریزی داخل template است و هیچ کوئری‌ای اجرا نمی‌کند.
 * نتیجه: ensureSchema بی‌صدا true برمی‌گرداند ولی هیچ جدولی ساخته نمی‌شود
 * → همه‌ی endpointها با «relation "dashboardSnapshots" does not exist» می‌شکستند.
 * ============================================================ */
import { describe, it, expect, beforeEach } from 'vitest';
import { ensureSchema, resetSchemaState, splitSqlStatements } from './_schema.js';

/** ساخت یک stub از neon sql با کنترل وجود/نبود جداول */
function makeSqlStub(opts: { existsInitially: boolean; ddlCreatesTables: boolean }) {
  let tablesExist = opts.existsInitially;
  const executed: string[] = [];
  const unsafeCalls: string[] = [];

  const stub = ((_strings: TemplateStringsArray, ..._params: unknown[]) =>
    // تنها کوئری template در ensureSchema، بررسی to_regclass است
    Promise.resolve([
      { a: tablesExist, e: tablesExist, l: tablesExist, ev: tablesExist, p: tablesExist, d: tablesExist }
    ])) as unknown as Record<string, unknown>;

  stub.query = (s: string) => {
    executed.push(s);
    if (opts.ddlCreatesTables) tablesExist = true;
    return Promise.resolve([]);
  };
  // رفتار واقعی درایور: هیچ اجرایی نمی‌کند، فقط یک نشانگر برمی‌گرداند
  stub.unsafe = (s: string) => {
    unsafeCalls.push(s);
    return { sql: s };
  };

  const sql = stub as unknown as Parameters<typeof ensureSchema>[0];

  return { sql, executed, unsafeCalls };
}

describe('ensureSchema', () => {
  beforeEach(() => resetSchemaState());

  it('وقتی جداول موجودند → بدون اجرای DDL', async () => {
    const { sql, executed } = makeSqlStub({ existsInitially: true, ddlCreatesTables: true });
    expect(await ensureSchema(sql)).toBe(true);
    expect(executed).toHaveLength(0);
  });

  it('وقتی جداول نیستند → DDL را با query() اجرا می‌کند (نه unsafe()) و true می‌دهد', async () => {
    const { sql, executed, unsafeCalls } = makeSqlStub({ existsInitially: false, ddlCreatesTables: true });
    expect(await ensureSchema(sql)).toBe(true);
    expect(executed.length).toBeGreaterThan(0);
    expect(unsafeCalls).toHaveLength(0); // ← رگرسیون‌گارد باگ اصلی
    expect(executed.some((s) => s.includes('CREATE TABLE IF NOT EXISTS "dashboardSnapshots"'))).toBe(true);
  });

  it('اگر DDL اثر نکند → false (نه false-green) تا کالر 503 بدهد', async () => {
    const { sql, executed } = makeSqlStub({ existsInitially: false, ddlCreatesTables: false });
    expect(await ensureSchema(sql)).toBe(false);
    expect(executed.length).toBeGreaterThan(0);
  });

  it('هر statement اجراشده تنها یک دستور SQL است (بدون سمی‌کالن پایانی)', async () => {
    const { sql, executed } = makeSqlStub({ existsInitially: false, ddlCreatesTables: true });
    await ensureSchema(sql);
    for (const st of executed) expect(st.includes(';')).toBe(false);
  });

  it('splitSqlStatements کامنت‌ها را حذف و statementها را جدا می‌کند', () => {
    const out = splitSqlStatements(`-- comment\nCREATE TABLE a (id int); /* block */ CREATE TABLE b (id int);`);
    expect(out).toEqual(['CREATE TABLE a (id int)', 'CREATE TABLE b (id int)']);
  });
});
