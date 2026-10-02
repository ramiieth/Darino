/**
 * DARINO — Ensure Schema در زمان Build (Vercel Build-time Init)
 *
 * ⚠️ رفتار:
 *   - بدون DATABASE_URL → بدون کار (خروج ۰ — حالت Dexie/local حفظ می‌شود)
 *   - با DATABASE_URL  → اجرای idempotent schema (فقط CREATE IF NOT EXISTS)
 *   - خطای موقت اتصال  → لاگ + خروج ۰ (Deploy هرگز به‌خاطر DB موقت نمی‌شکند؛
 *                        گارد runtime در api/* بعداً دوباره تلاش می‌کند)
 *
 * استفاده: "vercel-build": "node scripts/ensure-schema.mjs && npm run build"
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const here = dirname(fileURLToPath(import.meta.url));

/** جدا کردن statementها — حذف کامنت‌های خطی و بلوکی */
function splitSqlStatements(sql) {
  let clean = sql.replace(/\/\*[\s\S]*?\*\//g, '');
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

/** بررسی امن بودن schema — فقط DDL امن مجاز است */
function assertSchemaIsSafe(sql) {
  const upper = sql.toUpperCase();
  const banned = ['DROP TABLE', 'DROP COLUMN', 'DROP SCHEMA', 'TRUNCATE', 'DELETE FROM', 'DROP DATABASE'];
  for (const b of banned) {
    if (upper.includes(b)) {
      throw new Error(`schema حاوی دستور مخرب است: ${b}`);
    }
  }
}

const url = process.env.DATABASE_URL ?? '';

if (!url) {
  console.log('ℹ️  DATABASE_URL تنظیم نشده — حالت محلی (Dexie)؛ بدون تغییر.');
  process.exit(0);
}

const sql = neon(url);

try {
  // اثر انگشت اسکیما (همان الگوریتم api/_schema.ts) — اگر همین نسخه قبلاً اعمال شده، بدون DDL
  const schema = readFileSync(resolve(here, '../db/schema.sql'), 'utf8');
  const statements = splitSqlStatements(schema);
  const hash = createHash('sha256').update(statements.join(';\n')).digest('hex');
  const meta = await sql`SELECT to_regclass('public."schemaMeta"') IS NOT NULL AS m`;
  if (meta[0]?.m) {
    const cur = await sql`SELECT hash FROM "schemaMeta" WHERE id = 1`;
    if (cur[0]?.hash === hash) {
      console.log('✅ Schema از قبل آماده است (نسخهٔ فعلی) — بدون DDL.');
      process.exit(0);
    }
  }

  assertSchemaIsSafe(statements.join(' '));
  for (const st of statements) {
    await sql.query(st); // query() اجرا می‌کند؛ unsafe() فقط قطعهٔ SQL می‌سازد و هرگز اجرا نمی‌شد
  }
  await sql`INSERT INTO "schemaMeta" (id, hash, "appliedAt") VALUES (1, ${hash}, ${Date.now()})
    ON CONFLICT (id) DO UPDATE SET hash = EXCLUDED.hash, "appliedAt" = EXCLUDED."appliedAt"`;
  console.log(`✅ Schema روی Neon اعمال شد (${statements.length} statement — idempotent).`);
} catch (e) {
  // soft-fail: Build نباید به‌خاطر خطای موقت DB شکسته شود
  console.warn('⚠️  اتصال/اعمال schema ناموفق (موقت؟):', e instanceof Error ? e.message.slice(0, 200) : e);
  console.warn('   Deploy ادامه می‌یابد؛ گارد runtime در api/* بعداً دوباره تلاش می‌کند.');
  process.exit(0);
}
