/**
 * DARINO — جمع‌آوری بازار املاک اهواز روی کامپیوتر خودتان (بدون سرور/دیتابیس)
 *
 * همان کلکشنر تست‌شده اپ (collector/run.ts) را با اینترنت همین سیستم اجرا
 * می‌کند و یک فایل JSON می‌سازد که در دارینو از «منابع داده ← ورود فایل»
 * وارد می‌شود. مناسب وقتی سرور دارینو به دیوار/شیپور دسترسی ندارد.
 *
 * استفاده:
 *   node scripts/collect-property-market.mjs                 # دیوار + شیپور
 *   node scripts/collect-property-market.mjs --source divar  # فقط دیوار
 *   node scripts/collect-property-market.mjs --max 200 --out ahvaz.json
 */
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const onlySource = arg('source', '');
const sources = onlySource ? [onlySource] : ['divar', 'sheypoor'];
const maxListings = Number(arg('max', 360));
const date = new Date().toISOString().slice(0, 10);
const outFile = resolve(process.cwd(), arg('out', `darino-property-market-${date}.json`));

for (const s of sources) {
  if (s !== 'divar' && s !== 'sheypoor') {
    console.error(`❌ منبع نامعتبر: ${s} (divar | sheypoor)`);
    process.exit(1);
  }
}

// باندل ماژول‌های خالص کلکشنر (بدون DOM/دیتابیس)
const tmp = mkdtempSync(resolve(tmpdir(), 'darino-pm-'));
const bundle = resolve(tmp, 'collector.mjs');
await build({
  stdin: {
    contents: `
      export { collectChunk } from './src/features/propertyMarket/collector/run.ts';
      export { makeSeedPayload } from './src/features/propertyMarket/bridge/protocol.ts';
      export { ingestSeeds, buildSnapshot } from './src/features/propertyMarket/data/ingest.ts';
    `,
    resolveDir: root,
    loader: 'ts'
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: bundle,
  logLevel: 'silent',
  alias: { '@': resolve(root, 'src') }
});
const { collectChunk, makeSeedPayload, ingestSeeds, buildSnapshot } = await import(pathToFileURL(bundle).href);

const FA = { divar: 'دیوار', sheypoor: 'شیپور' };
const payloads = [];
let listings = [];

for (const source of sources) {
  console.log(`\n🏗️  ${FA[source]}: شروع جمع‌آوری آپارتمان‌های فروشی اهواز…`);
  let cursor;
  let cityId = null;
  const seeds = [];
  let errors = 0;
  for (let i = 1; i <= 200; i += 1) {
    try {
      const r = await collectChunk({ city: 'ahvaz', source, cursor, maxListings, pauseMs: 500, timeBudgetMs: 60_000 });
      cursor = r.cursor;
      cityId = r.cityId;
      seeds.push(...r.seeds);
      errors = 0;
      process.stdout.write(
        `\r   صفحه ${cursor.pagesRead} · دیده‌شده ${cursor.seenTokens.length} · آماده ${seeds.length}` +
          (r.failedDetails ? ` · خطای جزئیات ${r.failedDetails}` : '') +
          '      '
      );
      if (r.done) break;
    } catch (e) {
      errors += 1;
      console.error(`\n⚠️  خطای شبکه (${errors}/3): ${e instanceof Error ? e.message : e}`);
      if (errors >= 3) break;
      await new Promise((r) => setTimeout(r, 3000 * errors));
    }
  }
  if (cursor?.pendingSeeds?.length) seeds.push(...cursor.pendingSeeds);
  console.log('');
  if (seeds.length === 0) {
    console.error(`❌ ${FA[source]}: هیچ آگهی‌ای دریافت نشد.`);
    continue;
  }
  payloads.push(makeSeedPayload({ source, cityId, seeds, via: 'script' }));
  const ing = ingestSeeds({ existing: listings, seeds, city: 'ahvaz', cityId });
  listings = ing.listings;
  const rej = Object.entries(ing.report.rejectReasons).map(([k, v]) => `${k}:${v}`).join(' ');
  console.log(`✅ ${FA[source]}: ${seeds.length} آگهی، ${ing.report.valid} معتبر${rej ? ` (رد: ${rej})` : ''}`);
}

if (payloads.length === 0) {
  console.error('\n❌ هیچ داده‌ای جمع نشد — اتصال اینترنت را بررسی کنید.');
  process.exit(1);
}

writeFileSync(outFile, JSON.stringify(payloads));
const snap = buildSnapshot({ listings });
console.log(`\n📄 فایل ساخته شد: ${outFile}`);
if (snap) {
  console.log(`   پیش‌نمایش: ${snap.cleaning.market} آگهی در تحلیل، ${snap.neighborhoodStats.length} محله،` +
    ` میانه ${Math.round((snap.cityStats.medianTomanPerM2 ?? 0) / 1e6)} میلیون تومان/متر`);
}
console.log('   در دارینو: بازار املاک ← منابع داده ← ورود فایل');
