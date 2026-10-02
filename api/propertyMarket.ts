/** ============================================================
 * /api/propertyMarket — کلکشنر سرور-سمت بازار املاک (بدون حالت)
 *
 * POST ping           → سلامت خودِ این فانکشن (بدون دیتابیس، بدون شبکه بیرونی)
 * POST diagnose       → تست زنده دسترسی سرور به دیوار (زمان پاسخ/خطا)
 * POST collectChunk   → یک تکه کلکشن از دیوار → seedهای پارس‌شده
 * POST persist        → پشتیبان اختیاری در Neon (آگهی‌ها + Snapshot) — best-effort
 * GET                 → آگهی/Snapshotهای پشتیبان Neon (اگر تنظیم شده باشد)
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

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
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

    json(res, 400, { ok: false, error: 'unknown action' });
  } catch (e) {
    json(res, 500, { ok: false, error: e instanceof Error ? e.message.slice(0, 160) : 'server error' });
  }
}
