/** ============================================================
 * Auto Schema Initialization — آماده‌سازی خودکار جداول Neon
 *
 * ⚠️ کاملاً Idempotent / Safe / Non-destructive:
 *   - فقط CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS
 *   - هیچ DROP / TRUNCATE / DELETE / ALTER مخربی ندارد
 *   - اجرای چندباره = بی‌خطر (داده هرگز لمس نمی‌شود)
 *
 * استراتژی (Serverless-safe):
 *   - یک بررسی سبک (to_regclass) — اگر جداول موجودند → بدون DDL
 *   - اگر نبودند → اجرای statements از db/schema.sql
 *   - نتیجه در حافظه instance کش می‌شود (هر cold-start یک‌بار بررسی سبک)
 *   - race بین instanceها امن است (DDL ها IF NOT EXISTS هستند)
 * ============================================================ */
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
  const banned = ['DROP TABLE', 'TRUNCATE', 'DELETE FROM', 'DROP DATABASE', 'ALTER TABLE ... DROP'];
  for (const b of banned) {
    if (upper.includes(b)) {
      throw new Error(`schema حاوی دستور مخرب است: ${b} — اجرا متوقف شد`);
    }
  }
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
    // ۱) بررسی سبک — آیا جداول اصلی موجودند؟
    // ⚠️ نام‌ها داخل دابل‌کوتیشن‌اند تا دقیقاً جدول camelCase بررسی شود؛
    // بدون کوتیشن، PostgreSQL به lowercase تبدیل می‌کند و جدول‌های قدیمیِ
    // خراب (lowercase) را «موجود» گزارش می‌دهد (false-green) در حالی که
    // کوئری‌های Quoted روی آن‌ها خطا می‌دهند. با کوتیشن، روی دیتابیس قدیمی
    // هم DDL دوباره اجرا و جدول‌های درست ساخته می‌شوند (self-heal).
    const rows = await sql`SELECT
      to_regclass('public."accAccounts"') IS NOT NULL AS a,
      to_regclass('public."accEntries"') IS NOT NULL AS e,
      to_regclass('public."accLots"') IS NOT NULL AS l,
      to_regclass('public."accEvents"') IS NOT NULL AS ev,
      to_regclass('public."portfolioAssets"') IS NOT NULL AS p,
      to_regclass('public."dashboardSnapshots"') IS NOT NULL AS d`;
    const r = rows[0] as { a: boolean; e: boolean; l: boolean; ev: boolean; p: boolean; d: boolean };
    if (r.a && r.e && r.l && r.ev && r.p && r.d) {
      schemaReady = true;
      return true;
    }
    // ۲) اجرای DDL (idempotent — فقط IF NOT EXISTS؛ امنیت بررسی شد)
    const source = loadSchemaSql();
    const statements = splitSqlStatements(source);
    // بررسی امنیت روی statementهای پاک‌شده از کامنت (بدون false-positive)
    assertSchemaIsSafe(statements.join(' '));
    for (const st of statements) {
      await sql.unsafe(st);
    }
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
