/** ============================================================
 * بازار دست‌دوم خودروی داخلی از دیوار تهران — گردآوری تدریجی + ردیف‌های Snapshot روزانه
 *
 *  • تیک اعلان‌ها (هر ۱۰ دقیقه) تا ۳ صفحه (۲۴ آگهی) از برند جاری؛ هر برند تا ۱۵ صفحه، بعد برند بعدی
 *    (۱۴ برند ← هر دور حدود ۷ ساعت؛ روزی ~۱۰ هزار آگهی، یک درخواست هر ~۳ دقیقه به دیوار)
 *  • آگهی‌ها در "divarCarAds" (بر اساس token؛ قیمت و lastSeen به‌روز می‌شوند)، بیش از ۶۰ روز پاک
 *  • divarRowsAt: میانهٔ «مدل + سال» آگهی‌های دیده‌شده در ۱۴ روز پیش از لحظه ← ردیف‌های source='divar'
 *    که upsertCarSnapshot به Snapshot روز اضافه می‌کند؛ تغییر هفتگی/ماهانه با همان منطق car.ir حساب می‌شود
 * ============================================================ */
import { db, isDbConfigured } from './_neon.js';
import { ensureSchema } from './_schema.js';
import { providerCacheKey, readProviderCache, writeProviderCache } from './_providerCache.js';
import { requestJson, safeHeaders, sleep } from '../src/features/propertyMarket/collector/client.js';
import { DIVAR_POSTLIST_URL } from '../src/features/propertyMarket/collector/endpoints.js';
import { DIVAR_BRANDS, buildDivarSearchBody, divarRows, parseDivarCars, type DivarCarAd } from '../src/features/carMarket/collector/divarMarket.js';
import type { CarPriceRow } from '../src/features/carMarket/domain/types.js';

const DAY_MS = 86_400_000;
// صفحه‌های اول هر برند بیشترِ آگهی‌های تازه‌اند؛ دور کامل همهٔ برندها باید خیلی کوتاه‌تر از پنجرهٔ ۱۴ روزه باشد
const PAGES_PER_BRAND = 8;
const WINDOW_MS = 14 * DAY_MS;
const KEEP_MS = 60 * DAY_MS;
const PAUSE_MS = 1_000;

interface Cursor { brand: number; page: number; next: unknown | null }
const cursorKey = () => providerCacheKey('divar-cars-v1:cursor');

async function dbReady(): Promise<boolean> {
  if (!isDbConfigured()) return false;
  try {
    return await ensureSchema(db());
  } catch {
    return false;
  }
}

async function upsertAds(ads: DivarCarAd[], now: number): Promise<void> {
  if (!ads.length) return;
  await db()`
    INSERT INTO "divarCarAds" (token, model, year, km, price, "firstSeen", "lastSeen")
    SELECT x.token, x.model, x.year, x.km, x.price, ${now}, ${now}
    FROM jsonb_to_recordset(${JSON.stringify(ads)}::jsonb) AS x(token text, model text, year int, km int, price bigint)
    ON CONFLICT (token) DO UPDATE SET model = EXCLUDED.model, year = EXCLUDED.year, km = EXCLUDED.km,
      price = EXCLUDED.price, "lastSeen" = EXCLUDED."lastSeen"
  `;
}

/** از تیک اعلان‌ها: تا `pages` صفحه جستجو؛ تعداد آگهی ذخیره‌شده */
export async function warmDivarCars(pages = 3, deadlineMs = 9_000, now = Date.now()): Promise<number> {
  if (!(await dbReady())) return -1;
  const started = Date.now();
  const cur = (await readProviderCache<Cursor>(cursorKey(), true)) ?? { brand: 0, page: 0, next: null };
  let saved = 0;
  for (let i = 0; i < pages && Date.now() - started < deadlineMs; i++) {
    const brand = DIVAR_BRANDS[cur.brand % DIVAR_BRANDS.length];
    const json = await requestJson<unknown>(undefined, DIVAR_POSTLIST_URL, {
      method: 'POST',
      headers: safeHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' }),
      body: JSON.stringify(buildDivarSearchBody(brand, cur.next ?? undefined))
    }, { retries: 1, timeoutMs: 8_000 });
    const { ads, next } = parseDivarCars(json, brand);
    await upsertAds(ads, now);
    saved += ads.length;
    if (next && cur.page + 1 < PAGES_PER_BRAND) Object.assign(cur, { page: cur.page + 1, next });
    else Object.assign(cur, { brand: (cur.brand + 1) % DIVAR_BRANDS.length, page: 0, next: null });
    await sleep(PAUSE_MS);
  }
  await writeProviderCache(cursorKey(), cur, 7 * DAY_MS);
  if (cur.brand === 0 && cur.page === 0) await db()`DELETE FROM "divarCarAds" WHERE "lastSeen" < ${now - KEEP_MS}`;
  return saved;
}

/** ردیف‌های دیوار برای Snapshot لحظهٔ ts (آگهی‌های دیده‌شده در ۱۴ روز پیش از آن) */
export async function divarRowsAt(ts: number): Promise<CarPriceRow[]> {
  if (!(await dbReady())) return [];
  try {
    const ads = (await db()`
      SELECT token, model, year, km, price FROM "divarCarAds" WHERE "lastSeen" BETWEEN ${ts - WINDOW_MS} AND ${ts}
    `) as unknown as { token: string; model: string; year: number; km: number | null; price: string | number }[];
    return divarRows(ads.map((a) => ({ ...a, price: Number(a.price) })), ts);
  } catch {
    return [];
  }
}
