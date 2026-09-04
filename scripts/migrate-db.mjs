/**
 * DARINO — اجرای Schema روی Neon (Idempotent / Safe / Repeatable)
 *
 * استفاده:
 *   DATABASE_URL="postgresql://..." npm run db:migrate
 *
 * هیچ DROP/TRUNCATE/DELETE اجرا نمی‌شود — فقط CREATE TABLE IF NOT EXISTS.
 * اجرای مجدد بی‌خطر است.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('❌ DATABASE_URL تنظیم نشده است.');
  console.error('   مثال: DATABASE_URL="postgresql://..." npm run db:migrate');
  process.exit(1);
}

const sql = neon(url);
const schema = readFileSync(resolve(here, '../db/schema.sql'), 'utf8');

// اجرای statement به statement — با همان پارسر scripts/ensure-schema.mjs:
// کامنت‌های خطی/بلوکی حذف می‌شوند تا چانکِ «فقط-کامنت» به دیتابیس ارسال نشود.
function splitSqlStatements(src) {
  let clean = src.replace(/\/\*[\s\S]*?\*\//g, '');
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

const statements = splitSqlStatements(schema);

let ok = 0;
for (const st of statements) {
  try {
    await sql.unsafe(st);
    ok++;
    console.log('✓', st.split('\n')[0].slice(0, 70));
  } catch (e) {
    console.error('✗', st.slice(0, 70));
    console.error('  ', e instanceof Error ? e.message.slice(0, 200) : e);
    process.exitCode = 1;
  }
}
console.log(`\n✅ Schema اعمال شد (${ok}/${statements.length} statement).`);
