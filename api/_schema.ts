/** ============================================================
 * Auto Schema Initialization — آماده‌سازی خودکار جداول Neon
 *
 * ⚠️ کاملاً Idempotent / Safe / Non-destructive:
 *   - فقط CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS
 *   - هیچ DROP / TRUNCATE / DELETE / ALTER مخربی ندارد
 *   - اجرای چندباره = بی‌خطر (داده هرگز لمس نمی‌شود)
 *
 * استراتژی (Serverless-safe):
 *   - اثر انگشت (SHA-256) statementهای db/schema.sql با مقدار ذخیره‌شده در "schemaMeta" مقایسه می‌شود
 *   - برابر → بدون DDL؛ متفاوت/نبود → اجرای همهٔ statementها و ذخیرهٔ اثر انگشت جدید
 *     (پس هر جدول/ستون/ایندکس جدید در schema.sql خودکار اعمال می‌شود — بدون فهرست دستی جدول‌ها)
 *   - نتیجه در حافظه instance کش می‌شود (هر cold-start یک‌بار بررسی سبک)
 *   - race بین instanceها امن است (DDL ها IF NOT EXISTS هستند)
 * ============================================================ */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NeonQueryFunction } from '@neondatabase/serverless';

let schemaSql: string | null = null;

function loadSchemaSql(): string {
  if (!schemaSql) {
    // روی Vercel، فایل db/schema.sql از طریق includeFiles در vercel.json
    // همراه فانکشن‌ها مستقر می‌شود و process.cwd() ریشه پروژه است.
    const p = join(process.cwd(), 'db', 'schema.sql');
    try {
      schemaSql = readFileSync(p, 'utf8');
    } catch {
      throw new Error(`schema file not found at ${p} (check vercel.json includeFiles)`);
    }
  }
  return schemaSql;
}

/** جدا کردن statementها — حذف کامنت‌های خطی و بلوکی (schema ما ساده است) */
export function splitSqlStatements(sql: string): string[] {
  // حذف کامنت‌های بلوکی
  let clean = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  // حذف کامنت‌های خطی
  clean = clean
    .split('\n')
    .map((l) => {
      const idx = l.indexOf('--');
      return idx >= 0 ? l.slice(0, idx) : l;
    })
    .join('\n');
  return clean
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** بررسی امن بودن schema (جلوگیری از خطای انسانی — فقط DDL امن مجاز است) */
export function assertSchemaIsSafe(sql: string): void {
  const upper = sql.toUpperCase();
  const banned = ['DROP TABLE', 'DROP COLUMN', 'DROP SCHEMA', 'TRUNCATE', 'DELETE FROM', 'DROP DATABASE'];
  for (const b of banned) {
    if (upper.includes(b)) {
      throw new Error(`schema حاوی دستور مخرب است: ${b} — اجرا متوقف شد`);
    }
  }
}

/** اثر انگشت اسکیما — فقط روی statementهای واقعی (تغییر کامنت‌ها اجرای مجدد نمی‌خواهد) */
export function schemaHash(source: string): string {
  return createHash('sha256').update(splitSqlStatements(source).join(';\n')).digest('hex');
}

/** وضعیت آمادگی در حافظه instance (null = بررسی نشده / تلاش مجدد) */
let schemaReady: boolean | null = null;

/**
 * اطمینان از وجود جداول — قبل از queryهای اصلی صدا زده می‌شود.
 * برگشت false = دیتابیس در دسترس نیست (کالر ۵۰۳ می‌دهد؛ کلاینت local-fallback دارد).
 */
export async function ensureSchema(sql: NeonQueryFunction<false, false>): Promise<boolean> {
  if (schemaReady === true) return true;
  try {
    const source = loadSchemaSql();
    const statements = splitSqlStatements(source);
    const hash = schemaHash(source);
    // ۱) بررسی سبک — آیا همین نسخهٔ اسکیما قبلاً اعمال شده؟
    // (to_regclass جدا پرسیده می‌شود چون SELECT از جدولِ ناموجود خطا می‌دهد)
    const meta = (await sql`SELECT to_regclass('public."schemaMeta"') IS NOT NULL AS m`) as Array<{ m?: boolean }>;
    if (meta[0]?.m) {
      const cur = (await sql`SELECT hash FROM "schemaMeta" WHERE id = 1`) as Array<{ hash?: string }>;
      if (cur[0]?.hash === hash) {
        schemaReady = true;
        return true;
      }
    }
    // ۲) اجرای DDL (idempotent — فقط IF NOT EXISTS؛ امنیت روی statementهای بدون کامنت بررسی می‌شود)
    assertSchemaIsSafe(statements.join(' '));
    for (const st of statements) {
      await sql.query(st); // query() اجرا می‌کند؛ unsafe() فقط قطعهٔ SQL می‌سازد و هرگز اجرا نمی‌شد
    }
    await sql`INSERT INTO "schemaMeta" (id, hash, "appliedAt") VALUES (1, ${hash}, ${Date.now()})
      ON CONFLICT (id) DO UPDATE SET hash = EXCLUDED.hash, "appliedAt" = EXCLUDED."appliedAt"`;
    schemaReady = true;
    return true;
  } catch {
    // خطای موقت → اجازه تلاش مجدد در درخواست بعد (هرگز 500 «relation does not exist»)
    schemaReady = null;
    return false;
  }
}

/** ریست (برای تست) */
export function resetSchemaState(): void {
  schemaReady = null;
}
