/** ============================================================
 * /api/propertyMarket — کلکشنر سرور-سمت بازار املاک (بدون حالت)
 *
 * POST ping           → سلامت خودِ این فانکشن (بدون دیتابیس، بدون شبکه بیرونی)
 * POST diagnose       → تست زنده دسترسی سرور به دیوار (زمان پاسخ/خطا)
 * POST collectChunk   → یک تکه کلکشن از دیوار → seedهای پارس‌شده
 * POST persist        → پشتیبان اختیاری در Neon (آگهی‌ها + Snapshot) — best-effort
 * GET                 → آگهی/Snapshotهای پشتیبان Neon (اگر تنظیم شده باشد)
 *
 * بازار خودرو (car.ir) — همین فانکشن (سقف ۱۲ فانکشن پلن Hobby):
 * POST carPrices          → فهرست قیمت روز car.ir (فالبک وقتی مرورگر مستقیم نتوانست)
 * POST carPersist         → ذخیره Snapshot روزانه خودرو در Neon (best-effort)
 * GET  ?market=car        → Snapshotهای روزانه خودرو از Neon
 * GET  ?market=car&cron=1 → Cron روزانه Vercel: واکشی + ذخیره Snapshot امروز
 *
 * خودروهای وارداتی پلاک اروند (api/_arvand.ts):
 * POST arvandSearch / arvandDetails / arvandPersist · GET ?market=arvand
 *
 * طراحی (بازطراحی ۲۰۲۶-۰۹):
 *  - اپ تک‌کاربره است؛ پاک‌سازی، حذف تکراری و Snapshot سمت کلاینت (IndexedDB)
 *    انجام می‌شود. این فانکشن فقط «پراکسی واکشی» است و هیچ وابستگی‌ای به
 *    دیتابیس در مسیر کلکشن ندارد (قبلاً خطای Neon/health کلکشن را متوقف می‌کرد).
 *  - مرورگر به‌دلیل CORS مستقیم به دیوار نمی‌زند؛ تنها مسیر جمع‌آوری همین سرور است.
 * ============================================================ */
import type { ServerResponse, IncomingMessage } from 'node:http';
import { db, isDbConfigured, json, readBody } from './_neon.js';
import { requireSession } from './_authCore.js';
import { ensureSchema } from './_schema.js';
import { collectChunk, sanitizeCursor, COLLECT_SOURCES } from '../src/features/propertyMarket/collector/run.js';
import { fetchCities, fetchListPage, matchCity } from '../src/features/propertyMarket/collector/client.js';
import { parseListPage } from '../src/features/propertyMarket/collector/parse.js';
import { PROPERTY_CITIES } from '../src/features/propertyMarket/data/catalog.js';
import type {
  ListingSource,
  PropertyMarketListing,
  PropertyMarketSnapshot
} from '../src/features/propertyMarket/domain/types.js';
import { fetchCarIrPrices } from '../src/features/carMarket/collector/carIr.js';
import { buildCarSnapshot, isCarSnapshot } from '../src/features/carMarket/domain/snapshot.js';
import type { CarSnapshot } from '../src/features/carMarket/domain/types.js';
import { fetchUsdtDirect, type UsdtSource } from '../src/shared/fx/usdtRate.js';
import { handleArvandAction, handleArvandGet } from './_arvand.js';

/** سقف زمان هر تکه — زیر maxDuration=60 در vercel.json */
const CHUNK_TIME_BUDGET_MS = 38_000;
const MAX_PERSIST_LISTINGS = 3000;

function fromJsonb<T>(p: T | string): T {
  return typeof p === 'string' ? (JSON.parse(p) as T) : p;
}

function isSource(v: unknown): v is ListingSource {
  return typeof v === 'string' && (COLLECT_SOURCES as string[]).includes(v);
}

/** پیام خطای شبکه قابل فهم (fetch failed نود مبهم است) */
function netError(e: unknown): string {
  const raw = e instanceof Error ? e.message.slice(0, 160) : '';
  if (!raw || raw === 'fetch failed' || /aborted|abort/i.test(raw)) return 'source unreachable';
  return raw;
}

async function isDbUsable(): Promise<boolean> {
  if (!isDbConfigured()) return false;
  try {
    return await ensureSchema(db());
  } catch {
    return false;
  }
}

/** تست زنده دیوار: یک درخواست فهرست بدون تلاش مجدد */
async function probeDivar(): Promise<{ ok: boolean; ms: number; listings: number; error?: string }> {
  const started = Date.now();
  const city = PROPERTY_CITIES[0];
  try {
    const cities = await fetchCities();
    const hit = matchCity(cities, city.divarSlugHints);
    if (!hit) return { ok: false, ms: Date.now() - started, listings: 0, error: 'city not found' };
    const page = await fetchListPage({ cityId: String(hit.id) });
    const n = parseListPage(page).seeds.size;
    return { ok: n > 0, ms: Date.now() - started, listings: n, error: n > 0 ? undefined : 'empty response' };
  } catch (e) {
    return { ok: false, ms: Date.now() - started, listings: 0, error: netError(e) };
  }
}

/* ---------------- بازار خودرو ---------------- */

/** حداکثر روزهای تاریخچه خودرو در پاسخ GET */
const CAR_HISTORY_LIMIT = 400;

function queryOf(req: IncomingMessage): URLSearchParams {
  const raw = typeof req.url === 'string' ? req.url : '';
  const i = raw.indexOf('?');
  return new URLSearchParams(i >= 0 ? raw.slice(i + 1) : '');
}

/** درخواست واقعاً از Cron ورسل است؟ (CRON_SECRET اگر تنظیم شده؛ وگرنه User-Agent) */
function isCronRequest(req: IncomingMessage): boolean {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers?.authorization;
  if (secret) return auth === `Bearer ${secret}`;
  const ua = req.headers?.['user-agent'];
  return typeof ua === 'string' && ua.startsWith('vercel-cron/');
}

/** نرخ زنده تتر سمت سرور (والکس → بیت‌پین) */
async function serverUsdt(): Promise<{ rateToman: number; source: UsdtSource } | null> {
  for (const s of ['wallex', 'bitpin'] as const) {
    try {
      const q = await fetchUsdtDirect(s);
      return { rateToman: q.priceToman, source: s };
    } catch {
      /* منبع بعدی */
    }
  }
  return null;
}

/** درج/جایگزینی Snapshot روز — نسخه قدیمی‌تر روی جدیدتر نمی‌نشیند */
async function upsertCarSnapshot(s: CarSnapshot): Promise<void> {
  await db()`
    INSERT INTO "carPriceSnapshots" (id, "dateTs", payload, "createdAt")
    VALUES (${s.id}, ${s.dateTs}, ${JSON.stringify(s)}::jsonb, ${s.createdAt ?? Date.now()})
    ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, "dateTs" = EXCLUDED."dateTs"
    WHERE "carPriceSnapshots"."dateTs" < EXCLUDED."dateTs"
  `;
}

async function handleCarGet(req: IncomingMessage, res: ServerResponse, q: URLSearchParams): Promise<void> {
  if (q.get('cron') === '1') {
    if (!isCronRequest(req)) {
      json(res, 401, { ok: false, error: 'unauthorized' });
      return;
    }
    if (!(await isDbUsable())) {
      json(res, 200, { ok: true, persisted: false, reason: 'no database' });
      return;
    }
    try {
      const snap = buildCarSnapshot(await fetchCarIrPrices(), await serverUsdt());
      await upsertCarSnapshot(snap);
      json(res, 200, { ok: true, persisted: true, day: snap.day, rows: snap.rows.length, usdt: snap.usdtRate });
    } catch (e) {
      json(res, 200, { ok: false, error: netError(e) });
    }
    return;
  }
  if (!(await isDbUsable())) {
    json(res, 200, { configured: false, snapshots: [] });
    return;
  }
  const auth = await requireSession(req, res);
  if (!auth) return;
  try {
    const rows = (await db()`
      SELECT payload FROM "carPriceSnapshots" ORDER BY "dateTs" DESC LIMIT ${CAR_HISTORY_LIMIT}
    `) as unknown as { payload: CarSnapshot | string }[];
    json(res, 200, { configured: true, snapshots: rows.map((r) => fromJsonb(r.payload)).reverse() });
  } catch {
    json(res, 200, { configured: false, snapshots: [] });
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    /* ---------- GET ?market=car: تاریخچه/Cron بازار خودرو ---------- */
    const query = queryOf(req);
    if (req.method === 'GET' && query.get('market') === 'car') {
      await handleCarGet(req, res, query);
      return;
    }
    if (req.method === 'GET' && query.get('market') === 'arvand') {
      await handleArvandGet(req, res);
      return;
    }

    /* ---------- GET: پشتیبان Neon (اختیاری) — فقط با نشست معتبر ---------- */
    if (req.method === 'GET') {
      if (!(await isDbUsable())) {
        json(res, 200, { configured: false, listings: [], snapshots: [] });
        return;
      }
      const auth = await requireSession(req, res);
      if (!auth) return;
      const userId = auth.userId;
      try {
        const rows = (await db()`
          SELECT payload FROM "pmListings" WHERE "userId" = ${userId}
        `) as unknown as { payload: PropertyMarketListing | string }[];
        const snapRows = (await db()`
          SELECT payload FROM "pmSnapshots" WHERE "userId" = ${userId} ORDER BY "dateTs" ASC LIMIT 200
        `) as unknown as { payload: PropertyMarketSnapshot | string }[];
        json(res, 200, {
          configured: true,
          listings: rows.map((r) => fromJsonb(r.payload)),
          snapshots: snapRows.map((r) => fromJsonb(r.payload))
        });
      } catch {
        json(res, 200, { configured: false, listings: [], snapshots: [] });
      }
      return;
    }

    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'method not allowed' });
      return;
    }

    const body = await readBody(req);
    const action = typeof body.action === 'string' ? body.action : '';

    /* ---------- ping: فقط زنده‌بودن فانکشن ---------- */
    if (action === 'ping') {
      json(res, 200, { ok: true, service: 'darino-property-market', sources: COLLECT_SOURCES, ts: Date.now() });
      return;
    }

    /* ---------- diagnose: دسترسی سرور به منابع ---------- */
    if (action === 'diagnose') {
      json(res, 200, { ok: true, results: { divar: await probeDivar() } });
      return;
    }

    /* ---------- collectChunk ---------- */
    if (action === 'collectChunk') {
      const source: ListingSource = isSource(body.source) ? body.source : 'divar';
      const cursor = sanitizeCursor(body.cursor, source);
      // آگهی‌هایی که کلاینت جزئیاتشان را دارد (سقف برای محافظت از حجم درخواست)
      const knownTokens = Array.isArray(body.known)
        ? body.known.filter((t): t is string => typeof t === 'string').slice(0, 20_000)
        : [];
      try {
        const r = await collectChunk({
          city: 'ahvaz',
          source,
          cursor,
          knownTokens,
          pauseMs: 350,
          timeBudgetMs: CHUNK_TIME_BUDGET_MS
        });
        json(res, 200, {
          ok: true,
          source,
          done: r.done,
          cursor: r.cursor,
          cityId: r.cityId,
          seeds: r.seeds,
          fetchedDetails: r.fetchedDetails,
          failedDetails: r.failedDetails,
          pending: r.pending
        });
      } catch (e) {
        json(res, 200, { ok: false, source, error: netError(e) });
      }
      return;
    }

    /* ---------- persist: پشتیبان اختیاری ---------- */
    if (action === 'persist') {
      if (!(await isDbUsable())) {
        json(res, 200, { ok: true, persisted: false });
        return;
      }
      // نوشتن در پایگاه داده فقط با نشست معتبر (کلکشن بدون‌حالت عمومی می‌ماند)
      const auth = await requireSession(req, res);
      if (!auth) return;
      const userId = auth.userId;
      const listings = (Array.isArray(body.listings) ? body.listings : [])
        .slice(0, MAX_PERSIST_LISTINGS)
        .filter((l): l is PropertyMarketListing =>
          !!l && typeof l === 'object' && typeof (l as PropertyMarketListing).token === 'string'
        );
      for (const l of listings) {
        await db()`
          INSERT INTO "pmListings" ("userId", token, city, payload, "listedAt", "scrapedAt")
          VALUES (${userId}, ${l.token}, ${l.city ?? 'ahvaz'}, ${JSON.stringify(l)}::jsonb, ${l.listedAt ?? null}, ${l.scrapedAt ?? Date.now()})
          ON CONFLICT ("userId", token) DO UPDATE SET
            payload = EXCLUDED.payload,
            "listedAt" = EXCLUDED."listedAt",
            "scrapedAt" = GREATEST("pmListings"."scrapedAt", EXCLUDED."scrapedAt")
        `;
      }
      const snap = body.snapshot as PropertyMarketSnapshot | undefined;
      if (snap && typeof snap === 'object' && typeof snap.id === 'string' && typeof snap.dateTs === 'number') {
        await db()`
          INSERT INTO "pmSnapshots" (id, "userId", "dateTs", payload, "createdAt")
          VALUES (${snap.id}, ${userId}, ${snap.dateTs}, ${JSON.stringify(snap)}::jsonb, ${snap.createdAt ?? Date.now()})
          ON CONFLICT ("userId", id) DO NOTHING
        `;
      }
      json(res, 200, { ok: true, persisted: true, listings: listings.length });
      return;
    }

    /* ---------- carPrices: قیمت روز خودرو (بدون دیتابیس) ---------- */
    /* ---------- خودروهای اروند (api/_arvand.ts) ---------- */
    if (action.startsWith('arvand') && (await handleArvandAction(action, body, req, res))) return;

    if (action === 'carPrices') {
      try {
        const parsed = await fetchCarIrPrices();
        json(res, 200, { ok: true, ...parsed });
      } catch (e) {
        json(res, 200, { ok: false, error: netError(e) });
      }
      return;
    }

    /* ---------- carPersist: Snapshot روزانه خودرو → Neon ---------- */
    if (action === 'carPersist') {
      if (!(await isDbUsable())) {
        json(res, 200, { ok: true, persisted: false });
        return;
      }
      const auth = await requireSession(req, res);
      if (!auth) return;
      const snap = body.snapshot;
      if (!isCarSnapshot(snap) || !/^car-\d{4}-\d{2}-\d{2}$/.test(snap.id) || snap.rows.length === 0 || snap.rows.length > 5000) {
        json(res, 400, { ok: false, error: 'invalid snapshot' });
        return;
      }
      await upsertCarSnapshot(snap);
      json(res, 200, { ok: true, persisted: true });
      return;
    }

    json(res, 400, { ok: false, error: 'unknown action' });
  } catch (e) {
    json(res, 500, { ok: false, error: e instanceof Error ? e.message.slice(0, 160) : 'server error' });
  }
}
