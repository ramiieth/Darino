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
  const banned = ['DROP TABLE', 'TRUNCATE', 'DELETE FROM', 'DROP DATABASE'];
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
  // بررسی سبک — جداول موجودند؟
  // ⚠️ نام‌ها Quoted تا دقیقاً جدول camelCase بررسی شود (توضیح در api/_schema.ts)؛
  // روی دیتابیس قدیمی (lowercase) هم DDL دوباره اجرا و خودترمیم می‌شود.
  const rows = await sql`SELECT
    to_regclass('public."accAccounts"') IS NOT NULL AS a,
    to_regclass('public."accEntries"') IS NOT NULL AS e,
    to_regclass('public."accLots"') IS NOT NULL AS l,
    to_regclass('public."accEvents"') IS NOT NULL AS ev,
    to_regclass('public."portfolioAssets"') IS NOT NULL AS p,
    to_regclass('public."dashboardSnapshots"') IS NOT NULL AS d`;
  const r = rows[0] ?? {};
  if (r.a && r.e && r.l && r.ev && r.p && r.d) {
    console.log('✅ Schema از قبل آماده است — بدون DDL.');
    process.exit(0);
  }

  const schema = readFileSync(resolve(here, '../db/schema.sql'), 'utf8');
  const statements = splitSqlStatements(schema);
  assertSchemaIsSafe(statements.join(' '));
  // ⚠️ حتماً sql.query(...) — نه sql.unsafe(...)!
  // در @neondatabase/serverless، unsafe() فقط یک نشانگر برای درون‌ریزی در
  // template است و هیچ کوئری‌ای اجرا نمی‌کند (await روی آن بی‌صدا موفق می‌شود).
  for (const st of statements) {
    await sql.query(st);
  }

  // تأیید نهایی — DDL واقعاً اثر کرد؟ (جلوگیری از موفقیت دروغین)
  const after = (await sql`SELECT
    to_regclass('public."accAccounts"') IS NOT NULL AS a,
    to_regclass('public."accEntries"') IS NOT NULL AS e,
    to_regclass('public."accLots"') IS NOT NULL AS l,
    to_regclass('public."accEvents"') IS NOT NULL AS ev,
    to_regclass('public."portfolioAssets"') IS NOT NULL AS p,
    to_regclass('public."dashboardSnapshots"') IS NOT NULL AS d`)[0] ?? {};
  if (!(after.a && after.e && after.l && after.ev && after.p && after.d)) {
    console.warn('⚠️  DDL اجرا شد اما جداول هنوز موجود نیستند — گارد runtime دوباره تلاش می‌کند.');
    process.exit(0);
  }
  console.log(`✅ Schema روی Neon اعمال شد (${statements.length} statement — idempotent).`);
} catch (e) {
  // soft-fail: Build نباید به‌خاطر خطای موقت DB شکسته شود
  console.warn('⚠️  اتصال/اعمال schema ناموفق (موقت؟):', e instanceof Error ? e.message.slice(0, 200) : e);
  console.warn('   Deploy ادامه می‌یابد؛ گارد runtime در api/* بعداً دوباره تلاش می‌کند.');
  process.exit(0);
}
