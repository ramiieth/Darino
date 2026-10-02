// @vitest-environment node
/**
 * نگهبان: اسکیما باید واقعاً اجرا شود.
 * باگ قبلی: sql.unsafe(st) در @neondatabase/serverless v1 فقط قطعهٔ SQL می‌سازد و اجرا نمی‌کند؛
 * در نتیجه هیچ جدولی خودکار ساخته نمی‌شد. حالا sql.query(st) استفاده می‌شود.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ensureSchema, resetSchemaState, schemaHash, splitSqlStatements } from '../../api/_schema';

describe('اجرای اسکیما', () => {
  it('وقتی جدول‌ها نیستند، همهٔ statementها با query() اجرا می‌شوند', async () => {
    resetSchemaState();
    const query = vi.fn(async () => []);
    const unsafe = vi.fn();
    const sql = Object.assign(
      // بررسی سبک to_regclass → همه false
      vi.fn(async () => [{ a: false, e: false }]),
      { query, unsafe }
    );
    expect(await ensureSchema(sql as never)).toBe(true);
    const expected = splitSqlStatements(readFileSync(path.resolve(__dirname, '../../db/schema.sql'), 'utf8')).length;
    expect(query).toHaveBeenCalledTimes(expected);
    expect(unsafe).not.toHaveBeenCalled();
  });

  it('اسکیما جدول‌های ورود و همگام‌سازی را دارد و دستور مخرب ندارد', () => {
    const src = readFileSync(path.resolve(__dirname, '../../db/schema.sql'), 'utf8');
    for (const t of ['authCredentials', 'authChallenges', 'authSessions', 'authPairCodes', 'authEvents', 'custodyRecords']) {
      expect(src).toContain(`CREATE TABLE IF NOT EXISTS "${t}"`);
    }
    // کامنت‌ها اجرا نمی‌شوند؛ فقط statementهای واقعی بررسی می‌شوند
    expect(splitSqlStatements(src).join(' ').toUpperCase()).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/);
  });

  it('هیچ اسکریپتی برای اجرای اسکیما از unsafe() استفاده نمی‌کند', () => {
    for (const f of ['api/_schema.ts', 'scripts/ensure-schema.mjs', 'scripts/migrate-db.mjs']) {
      const s = readFileSync(path.resolve(__dirname, '../..', f), 'utf8');
      expect(s).not.toMatch(/await sql\.unsafe\(/);
      expect(s).toMatch(/await sql\.query\(st\)/);
    }
  });

  it('اسکیمای همین نسخه قبلاً اعمال شده → هیچ DDL اجرا نمی‌شود', async () => {
    resetSchemaState();
    const hash = schemaHash(readFileSync(path.resolve(__dirname, '../../db/schema.sql'), 'utf8'));
    const query = vi.fn(async () => []);
    const tagged = vi.fn().mockResolvedValueOnce([{ m: true }]).mockResolvedValueOnce([{ hash }]);
    expect(await ensureSchema(Object.assign(tagged, { query }) as never)).toBe(true);
    expect(query).not.toHaveBeenCalled();
    expect(tagged).toHaveBeenCalledTimes(2);
  });

  it('schema.sql تغییر کرده (فیچر جدید) → همهٔ statementها دوباره اجرا و اثر انگشت جدید ذخیره می‌شود', async () => {
    resetSchemaState();
    const query = vi.fn(async () => []);
    const tagged = vi.fn().mockResolvedValueOnce([{ m: true }]).mockResolvedValueOnce([{ hash: 'old' }]).mockResolvedValue([]);
    expect(await ensureSchema(Object.assign(tagged, { query }) as never)).toBe(true);
    const expected = splitSqlStatements(readFileSync(path.resolve(__dirname, '../../db/schema.sql'), 'utf8')).length;
    expect(query).toHaveBeenCalledTimes(expected);
    // سومین فراخوانی = ذخیرهٔ اثر انگشت
    expect(String((tagged.mock.calls[2][0] as TemplateStringsArray).join('?'))).toContain('INSERT INTO "schemaMeta"');
  });

  it('اثر انگشت به کامنت‌ها حساس نیست ولی به statement جدید حساس است', () => {
    const base = 'CREATE TABLE IF NOT EXISTS "a" (id INT);';
    expect(schemaHash(base)).toBe(schemaHash('-- توضیح\n' + base));
    expect(schemaHash(base)).not.toBe(schemaHash(base + '\nALTER TABLE "a" ADD COLUMN IF NOT EXISTS b INT;'));
  });

  it('اسکریپت build همان الگوریتم اثر انگشت را دارد', () => {
    const s = readFileSync(path.resolve(__dirname, '../../scripts/ensure-schema.mjs'), 'utf8');
    expect(s).toContain("createHash('sha256').update(statements.join(';\\n'))");
    expect(s).toContain('INSERT INTO "schemaMeta"');
  });
});
