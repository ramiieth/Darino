/**
 * DARINO — کلکشن بازار املاک اهواز از دیوار (اجرای محلی/کرون)
 *
 * این اسکریپت همان فانکشن سرورلس /api/propertyMarket را به‌صورت
 * درون‌فرآیندی اجرا می‌کند (بدون نیاز به استقرار):
 *   ۱) باندل کردن api/propertyMarket.ts با esbuild
 *   ۲) حلقه «collectChunk» تا پایان صفحات دیوار
 *   ۳) «finalize» → ثبت Snapshot جدید (الحاقی، نه رونویسی)
 *
 * پیش‌نیاز: DATABASE_URL در محیط (اتصال Neon).
 * استفاده:  node scripts/collect-property-market.mjs [--chunks 40] [--pause 1000]
 */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL تنظیم نشده — کلکشن نیازمند اتصال Neon است.');
  process.exit(1);
}

const maxChunks = Number(process.argv.includes('--chunks')
  ? process.argv[process.argv.indexOf('--chunks') + 1]
  : 40);

// باندل فانکشن سرورلس به یک ماژول موقت (منابع سرور فقط — چیزی وارد مرورگر نمی‌شود)
const tmp = mkdtempSync(resolve(tmpdir(), 'darino-pm-'));
const outFile = resolve(tmp, 'handler.mjs');
await build({
  entryPoints: [resolve(root, 'api/propertyMarket.ts')],
  bundle: true, // شامل @neondatabase/serverless — خروجی از هر مسیر قابل اجرا باشد
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: outFile,
  logLevel: 'silent'
});

const mod = await import(pathToFileURL(outFile).href);
const handler = mod.default;

/** فراخوانی درون‌فرآیندی هندلر با شبیه‌سازی req/res */
function callHandler(method, body) {
  return new Promise((resolveCall, rejectCall) => {
    const chunks = [];
    const req = {
      method,
      headers: { 'x-user-id': 'local-user' },
      on(event, cb) {
        if (event === 'data') {
          if (body) chunks.push(Buffer.from(JSON.stringify(body)));
          cb(body ? Buffer.from(JSON.stringify(body)) : Buffer.alloc(0));
        } else if (event === 'end') {
          cb();
        } else if (event === 'error') {
          rejectCall(new Error('stream error'));
        }
        return req;
      }
    };
    const res = {
      statusCode: 200,
      setHeader() {},
      end(b) {
        try {
          resolveCall(JSON.parse(b.toString()));
        } catch (e) {
          rejectCall(e);
        }
      }
    };
    Promise.resolve(handler(req, res)).catch(rejectCall);
  });
}

console.log('🏗️  شروع کلکشن بازار املاک اهواز از دیوار…');

let cursor = null;
let totalAdded = 0;
let totalDetails = 0;
let done = false;

for (let i = 1; i <= maxChunks && !done; i += 1) {
  const res = await callHandler('POST', { action: 'collectChunk', city: 'ahvaz', cursor });
  if (!res.ok) {
    console.error(`❌ تکه ${i} ناموفق: ${res.error}`);
    process.exit(1);
  }
  cursor = res.cursor ?? cursor;
  totalAdded += res.added ?? 0;
  totalDetails += res.fetchedDetails ?? 0;
  done = res.done === true;
  console.log(
    `📦 تکه ${i}: +${res.added} آگهی (جزئیات: ${res.fetchedDetails}، خطا: ${res.failedDetails ?? 0})` +
      (done ? ' — پایان صفحات' : '')
  );
}

if (!done) {
  console.warn(`⚠️  پس از ${maxChunks} تکه هنوز تمام نشده — اجرای بعدی ادامه می‌دهد.`);
}

const fin = await callHandler('POST', { action: 'finalize' });
if (!fin.ok) {
  console.error(`❌ ثبت Snapshot ناموفق: ${fin.error}`);
  process.exit(1);
}

console.log('✅ Snapshot جدید ثبت شد:');
console.log(`   آگهی معتبر: ${fin.snapshot.cleaning.market}`);
console.log(`   پرت حذف‌شده: ${fin.snapshot.cleaning.outliersRemoved}`);
console.log(`   میانه اهواز: ${Math.round(fin.snapshot.cityStats.medianTomanPerM2 ?? 0).toLocaleString('en-US')} تومان/متر`);
console.log(`   محله‌ها: ${fin.snapshot.neighborhoodStats.length}`);
console.log(`مجموع: ${totalAdded} آگهی جدید، ${totalDetails} واکشی جزئیات`);
writeFileSync(resolve(tmp, 'last-run.json'), JSON.stringify({ totalAdded, totalDetails, snapshotId: fin.snapshot.id }, null, 2));
