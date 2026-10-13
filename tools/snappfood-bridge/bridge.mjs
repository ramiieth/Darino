#!/usr/bin/env node
/** ============================================================
 * پل اسنپ‌فود دارینو — روی مک خودتان، با مسیر VPN ایران
 *
 *  فقط دو مقصد دارد: دارینوی خودتان و snappfood.ir.
 *  هیچ پورتی باز نمی‌کند (فقط درخواست خروجی)، هیچ فایلی جز پوشهٔ خودش نمی‌خواند،
 *  هیچ پکیج خارجی ندارد و آدرس اسنپ‌فود را خودش می‌سازد؛ از سرور فقط «کلمهٔ جستجو،
 *  مختصات مرکز شهر و فیلترهای مجاز» می‌گیرد و همه را دوباره چک می‌کند.
 *
 *  اجرا: node bridge.mjs          (حلقهٔ دائمی؛ install.sh آن را در sandbox و با launchd اجرا می‌کند)
 *        node bridge.mjs --test   (یک جستجوی آزمایشی و چاپ نتیجه)
 * ============================================================ */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SNAPPFOOD = 'https://snappfood.ir/search/api/v5/search';
const ALLOWED_TYPES = [0, 1, 2, 3, 5, 6, 8, 11];
const IDLE_MS = 12_000; // بیکار: هر ۱۲ ثانیه (در سهمیهٔ رایگان Vercel)
const ACTIVE_MS = 3_000; // تا ۵ دقیقه پس از هر جستجو: هر ۳ ثانیه
const SNAPP_GAP_MS = 1_500; // فاصلهٔ بین درخواست‌ها به اسنپ‌فود
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

const log = (...a) => console.log(new Date().toISOString().slice(0, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** همان قواعد سرور: کلمهٔ کوتاه، مختصات داخل ایران، فیلترهای مجاز */
export function validJob(j) {
  return !!j && typeof j.query === 'string' && j.query.length >= 1 && j.query.length <= 60 && !/[\u0000-\u001f]/.test(j.query)
    && Number.isFinite(j.lat) && j.lat > 24 && j.lat < 40.5 && Number.isFinite(j.lon) && j.lon > 43 && j.lon < 64
    && Array.isArray(j.types) && j.types.length >= 1 && j.types.length <= 3 && j.types.every((t) => ALLOWED_TYPES.includes(t))
    && typeof j.discount === 'boolean';
}

/** آدرس جستجو فقط اینجا ساخته می‌شود — سرور نمی‌تواند پل را به جای دیگری بفرستد */
export function searchUrl(job, type) {
  const qs = new URLSearchParams({ optionalClient: 'PWA', client: 'PWA', deviceType: 'PWA', appVersion: '6.0.0', locale: 'fa', lat: job.lat.toFixed(6), long: job.lon.toFixed(6), query: job.query, page: '0', page_size: '40' });
  if (type > 0) qs.set('superType', `[${type}]`);
  if (job.discount) qs.set('filters', '["has_discount"]');
  return `${SNAPPFOOD}?${qs}`;
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const text = (v, n = 120) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const httpsImage = (v) => (typeof v === 'string' && /^https:\/\/[^\s"'<>]+$/.test(v) ? v : null);

/** نخستین آدرس تصویر https در فیلدهایی با نام image/photo/logo (نام فیلدها در نسخه‌های اسنپ‌فود فرق می‌کند) */
export function findImage(o, keys = /image|photo|img|logo|featured/i, depth = 0) {
  if (!isObj(o) || depth > 2) return null;
  for (const [k, v] of Object.entries(o)) {
    if (!keys.test(k)) continue;
    const direct = httpsImage(v);
    if (direct) return direct;
    for (const x of Array.isArray(v) ? v : [v]) {
      const inner = httpsImage(x) ?? (isObj(x) ? findImage(x, /url|src|image|main|large|medium|thumb/i, depth + 1) : null);
      if (inner) return inner;
    }
  }
  return null;
}

/** فقط فیلدهای لازم برای دارینو؛ بقیهٔ پاسخ اسنپ‌فود دور ریخته می‌شود */
export function normalize(item) {
  const v = isObj(item.vendor) ? item.vendor : {};
  const fee = v.isDeliveryFeeHasDiscount ? num(v.deliveryFeeAfterDiscount) : num(v.deliveryFee ?? v.delivery_fee);
  return {
    id: num(item.id),
    title: text(item.title),
    desc: text(item.description, 140),
    price: num(item.price),
    final: num(item.priceAfterDiscount),
    discountRatio: num(item.discountRatio),
    rating10: num(item.normalized_rating ?? item.rating),
    image: findImage(item, /image|photo|img/i),
    vendor: {
      code: text(v.code, 16),
      title: text(v.title, 80),
      logo: httpsImage(v.logo) ?? findImage(v, /logo|featured/i),
      rating10: num(v.rating),
      comments: num(v.commentCount ?? v.comment_count),
      open: v.is_open !== false && v.isOpen !== false,
      fee,
      area: text(v.area ?? v.address, 60),
      type: text(v.vendorTypeTitle ?? v.childTypeTitle ?? v.vendorType, 30)
    }
  };
}

let lastSnapp = 0;
async function snappSearch(job, type) {
  const wait = lastSnapp + SNAPP_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastSnapp = Date.now();
  const r = await fetch(searchUrl(job, type), { headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'fa-IR,fa;q=0.9', Referer: 'https://snappfood.ir/' }, signal: AbortSignal.timeout(15_000), redirect: 'error' });
  if (r.status === 403) throw Object.assign(new Error('blocked'), { code: 'blocked' });
  if (!r.ok) throw new Error(`snappfood HTTP ${r.status}`);
  const body = await r.json();
  const items = body?.data?.product_variations?.items;
  return Array.isArray(items) ? items.filter(isObj).map(normalize).filter((i) => i.id && i.title && i.vendor.code) : [];
}

export async function runJob(job) {
  if (!validJob(job)) return { ok: false, items: [], error: 'invalid job' };
  try {
    const all = [];
    for (const t of job.types) all.push(...(await snappSearch(job, t)));
    return { ok: true, items: all.slice(0, 150), error: null };
  } catch (e) {
    return { ok: false, items: [], error: e.code === 'blocked' ? 'blocked' : 'snappfood failed' };
  }
}

function loadConfig() {
  const dir = dirname(fileURLToPath(import.meta.url));
  const c = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
  if (!/^https:\/\/[a-zA-Z0-9.-]+$/.test(c.url ?? '') || !/^[0-9a-f]{64}$/.test(c.key ?? '')) throw new Error('config.json نامعتبر است (url باید https و key باید ۶۴ رقم hex باشد)');
  return c;
}

async function darino(cfg, method, body) {
  const r = await fetch(`${cfg.url}/api/integrations?op=shop-relay`, {
    method, headers: { Authorization: `Bearer ${cfg.key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000), redirect: 'error'
  });
  if (r.status === 401) throw new Error('کلید پل با SHOP_RELAY_KEY در Vercel یکی نیست');
  if (r.status === 404) throw new Error('SHOP_RELAY_KEY هنوز در Vercel تنظیم یا Deploy نشده');
  if (!r.ok && r.status !== 409) throw new Error(`Darino HTTP ${r.status}`);
  return r.json();
}

async function selfTest(print = false) {
  const job = { query: 'پیتزا', lat: 35.7032, lon: 51.3892, types: [0], discount: false };
  const r = await runJob(job);
  if (r.ok) log(`✅ مسیر ایران درست است — ${r.items.length} نتیجه از اسنپ‌فود`);
  else log(r.error === 'blocked' ? '❌ اسنپ‌فود مسدود کرد (403): ترافیک node از VPN ایران عبور نمی‌کند' : `❌ اسنپ‌فود پاسخ نداد (${r.error})`);
  if (print) for (const i of r.items.slice(0, 5)) log(`   • ${i.title} — ${i.vendor.title} — ${i.final ?? i.price} تومان — عکس: ${i.image ? 'دارد' : 'ندارد'} — لوگو: ${i.vendor.logo ? 'دارد' : 'ندارد'}`);
  return r.ok;
}

async function main() {
  if (process.argv.includes('--test')) { process.exitCode = (await selfTest(true)) ? 0 : 1; return; }
  const cfg = loadConfig();
  log(`پل اسنپ‌فود روشن شد → ${cfg.url}`);
  await selfTest();
  let fastUntil = 0; let failures = 0;
  for (;;) {
    try {
      const { jobs = [] } = await darino(cfg, 'GET');
      for (const { id, job } of jobs) {
        const res = await runJob(job);
        await darino(cfg, 'POST', { id, ...res });
        log(`جستجو «${String(job?.query).slice(0, 30)}» → ${res.ok ? `${res.items.length} نتیجه` : res.error}`);
      }
      if (jobs.length) fastUntil = Date.now() + 5 * 60_000;
      if (failures) log('اتصال به دارینو برقرار شد'); failures = 0;
    } catch (e) {
      if (failures++ % 20 === 0) log('⚠️', e.message);
    }
    await sleep(failures ? Math.min(60_000, IDLE_MS * failures) : Date.now() < fastUntil ? ACTIVE_MS : IDLE_MS);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { log('❌', e.message); process.exit(1); });
