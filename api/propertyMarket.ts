/** ============================================================
 * /api/propertyMarket — بازار املاک (کلکشنر Divar + Snapshot)
 *
 * GET                    → آگهی‌ها + Snapshotها (برای داشبورد)
 * POST collectChunk      → یک تکه کلکشن از دیوار (فهرست + جزئیات)
 *                           پارس/اعتبارسنجی/حذف تکراری → ذخیره در Neon
 * POST finalize          → ساخت Snapshot جدید از همه آگهی‌ها
 *                           (پرت‌گیری + آمار میانه/میانگین — الحاق، نه رونویسی)
 *
 * ⚠️ مرورگر مستقیم به دیوار نمی‌زند (CORS) — فقط این فانکشن.
 * ⚠️ کلکشنر: بازنویسی تایپ‌اسکریپت مرجع `mobin-torabi/divar-house-scraper`
 *    مطابق معماری دارینو (کپی مستقیم نشده است).
 *
 * حالت بدون دیتابیس (DATABASE_URL تنظیم نشده یا خطا):
 *   کلکشن دیوار ذاتاً به Neon نیاز ندارد — فقط واکشی سرور-سمت از دیوار است.
 *   در این حالت آگهی‌ها در بافر درون‌حافظهٔ همین instance نگه‌داری می‌شوند،
 *   آگهی‌های جدید هر تکه در پاسخ به کلاینت برمی‌گردند (`persisted: false`)
 *   و کلاینت آن‌ها را در finalize پس می‌فرستد تا حتی با سردشدن/چرخش
 *   instanceها (Vercel) Snapshot کامل ساخته شود. ذخیره نهایی سمت کلاینت
 *   در IndexedDB انجام می‌شود.
 * ============================================================ */
import type { ServerResponse, IncomingMessage } from 'node:http';
import { db, isDbConfigured, json, readBody, userIdOf } from './_neon.js';
import { ensureSchema } from './_schema.js';
import { collectChunk, type CollectCursor } from '../src/features/propertyMarket/collector/run.js';
import {
  deduplicateListings,
  filterOutliers,
  newCleaningReport,
  normalizeAndValidate
} from '../src/features/propertyMarket/collector/pipeline.js';
import { buildCityStats, buildNeighborhoodStats } from '../src/features/propertyMarket/domain/stats.js';
import { neighborhoodDisplayName } from '../src/features/propertyMarket/data/catalog.js';
import type {
  NeighborhoodStatsRecord,
  PropertyMarketListing,
  PropertyMarketSnapshot
} from '../src/features/propertyMarket/domain/types.js';

interface StoredRow {
  token: string;
  payload: PropertyMarketListing | string;
}

/** payloadهای JSONB ممکن است به‌صورت آبجکت یا رشته برگردند */
function fromJsonb<T>(p: T | string): T {
  return typeof p === 'string' ? (JSON.parse(p) as T) : p;
}

/* ---------------- بافر درون‌حافظه (حالت بدون دیتابیس) ----------------
 * روی یک instance گرم بین درخواست‌های متوالی کلکشن زنده می‌ماند؛
 * برای ایمنی در برابر چرخش/سردشدن instance، کلاینت آگهی‌های دریافتی
 * را در finalize پس می‌فرستد و بافر از آن‌ها بازسازی می‌شود. */
const memListings = new Map<string, PropertyMarketListing[]>();
const memSnapshots = new Map<string, PropertyMarketSnapshot[]>();

async function loadListingsDb(userId: string): Promise<PropertyMarketListing[]> {
  const rows = (await db()`
    SELECT token, payload FROM "pmListings"
    WHERE "userId" = ${userId}
  `) as unknown as StoredRow[];
  return rows.map((r) => fromJsonb<PropertyMarketListing>(r.payload));
}

async function upsertListingsDb(userId: string, listings: PropertyMarketListing[]): Promise<number> {
  let added = 0;
  for (const l of listings) {
    const res = await db()`
      INSERT INTO "pmListings" ("userId", token, city, payload, "listedAt", "scrapedAt")
      VALUES (${userId}, ${l.token}, ${l.city}, ${JSON.stringify(l)}::jsonb, ${l.listedAt}, ${l.scrapedAt})
      ON CONFLICT ("userId", token) DO UPDATE SET
        payload = EXCLUDED.payload,
        "listedAt" = EXCLUDED."listedAt",
        "scrapedAt" = GREATEST("pmListings"."scrapedAt", EXCLUDED."scrapedAt")
      RETURNING token
    `;
    if (res.length > 0) added += 1;
  }
  return added;
}

/** ادغام آگهی‌ها بر اساس توکن (بدون رونویسی — اولین نسخه هر توکن می‌ماند) */
function mergeByToken(
  base: PropertyMarketListing[],
  incoming: unknown[]
): { merged: PropertyMarketListing[]; fresh: PropertyMarketListing[] } {
  const known = new Set(base.map((l) => l.token));
  const merged = [...base];
  const fresh: PropertyMarketListing[] = [];
  for (const item of incoming) {
    if (!item || typeof item !== 'object') continue;
    const l = item as PropertyMarketListing;
    if (typeof l.token !== 'string' || l.token.length === 0 || known.has(l.token)) continue;
    known.add(l.token);
    merged.push(l);
    fresh.push(l);
  }
  return { merged, fresh };
}

/** آیا دیتابیس قابل استفاده است؟ (تنظیم‌شده + اتصال/schema سالم) */
async function isDbUsable(): Promise<boolean> {
  if (!isDbConfigured()) return false;
  try {
    return await ensureSchema(db());
  } catch {
    return false;
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const userId = userIdOf(req);
  const useDb = await isDbUsable();

  try {
    /* ---------- GET: آگهی‌ها + Snapshotها ---------- */
    if (req.method === 'GET') {
      if (!useDb) {
        // حالت بدون دیتابیس — داده‌های همین جلسه کلکشن (ممکن است خالی باشد)
        json(res, 200, {
          configured: false,
          listings: memListings.get(userId) ?? [],
          snapshots: memSnapshots.get(userId) ?? []
        });
        return;
      }
      const listings = await loadListingsDb(userId);
      const snapRows = (await db()`
        SELECT payload FROM "pmSnapshots" WHERE "userId" = ${userId} ORDER BY "dateTs" ASC LIMIT 200
      `) as unknown as { payload: PropertyMarketSnapshot | string }[];
      const snapshots = snapRows.map((r) => fromJsonb<PropertyMarketSnapshot>(r.payload));
      json(res, 200, { configured: true, listings, snapshots });
      return;
    }

    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'method not allowed' });
      return;
    }

    const body = await readBody(req);
    const action = typeof body.action === 'string' ? body.action : '';

    /* ---------- POST collectChunk ---------- */
    if (action === 'collectChunk') {
      const cursor = (body.cursor as CollectCursor | null | undefined) ?? undefined;
      // اسکوپ فعلی فقط اهواز است (§ مأموریت) — شهرهای بعدی توسعه‌پذیرند
      const city = 'ahvaz' as const;

      let result;
      try {
        result = await collectChunk({ city, cursor });
      } catch (e) {
        const raw = e instanceof Error ? e.message.slice(0, 160) : '';
        // پیام‌های مبهم شبکه (مثل fetch failed نود) → پیام صریح درباره دیوار
        const error = !raw || raw === 'fetch failed' ? 'divar unreachable' : raw;
        json(res, 200, { ok: false, error });
        return;
      }

      // پاک‌سازی تکه + ادغام با موجودی (حذف تکراری)
      const existing = useDb
        ? await loadListingsDb(userId)
        : (memListings.get(userId) ?? []);
      const report = newCleaningReport();
      const valid: PropertyMarketListing[] = [];
      const scrapedAt = Date.now();
      for (const seed of result.seeds) {
        const l = normalizeAndValidate(seed, city, result.cityId, scrapedAt, report);
        if (l) valid.push(l);
      }
      const merged = deduplicateListings(valid, existing, report);
      // فقط آگهی‌های جدید ذخیره شوند
      const known = new Set(existing.map((l) => l.token));
      const fresh = merged.filter((l) => !known.has(l.token));

      if (useDb) {
        const added = fresh.length > 0 ? await upsertListingsDb(userId, fresh) : 0;
        json(res, 200, {
          ok: true,
          done: result.done,
          cursor: result.cursor,
          added,
          fetchedDetails: result.fetchedDetails,
          failedDetails: result.failedDetails,
          report,
          persisted: true
        });
        return;
      }

      // حالت بدون دیتابیس → بافر محلی + بازگشت آگهی‌های جدید به کلاینت
      memListings.set(userId, [...existing, ...fresh]);
      json(res, 200, {
        ok: true,
        done: result.done,
        cursor: result.cursor,
        added: fresh.length,
        fetchedDetails: result.fetchedDetails,
        failedDetails: result.failedDetails,
        report,
        persisted: false,
        listings: fresh
      });
      return;
    }

    /* ---------- POST finalize → Snapshot جدید (الحاق، نه رونویسی) ---------- */
    if (action === 'finalize') {
      let all = useDb
        ? await loadListingsDb(userId)
        : (memListings.get(userId) ?? []);

      // آگهی‌های پس‌فرستاده‌شده از کلاینت (حالت بدون دیتابیس — تضمین کامل
      // بودن داده حتی اگر بافر این instance به‌دلیل چرخش از دست رفته باشد)
      if (Array.isArray(body.listings) && body.listings.length > 0) {
        const { merged, fresh } = mergeByToken(all, body.listings as unknown[]);
        all = merged;
        if (useDb && fresh.length > 0) await upsertListingsDb(userId, fresh);
        if (!useDb) memListings.set(userId, merged);
      }

      if (all.length === 0) {
        json(res, 200, { ok: false, error: 'no listings collected yet' });
        return;
      }
      const report = newCleaningReport();
      report.raw = all.length;
      report.normalized = all.length;
      report.valid = all.length;
      const market = filterOutliers(all, report);
      report.market = market.length;

      const dateTs = Date.now();
      const keys = [...new Set(market.map((l) => l.neighborhoodKey).filter((k): k is string => !!k))];
      const neighborhoodStats: NeighborhoodStatsRecord[] = keys.map((key) => ({
        neighborhoodKey: key,
        displayName: neighborhoodDisplayName(key),
        stats: buildNeighborhoodStats(market, key)
      }));

      const snapshot: PropertyMarketSnapshot = {
        id: `pmsnap-${dateTs}`,
        dateTs,
        dateLabel: new Date(dateTs).toISOString().slice(0, 10),
        city: 'ahvaz',
        source: 'divar',
        fxRateAtSnapshotToman: null, // نرخ دلار زنده در لایه سرویس اپ اعمال می‌شود
        cityStats: buildCityStats(market),
        neighborhoodStats,
        cleaning: report,
        createdAt: dateTs
      };

      if (useDb) {
        await db()`
          INSERT INTO "pmSnapshots" (id, "userId", "dateTs", payload, "createdAt")
          VALUES (${snapshot.id}, ${userId}, ${dateTs}, ${JSON.stringify(snapshot)}::jsonb, ${dateTs})
          ON CONFLICT ("userId", id) DO NOTHING
        `;
      } else {
        const snaps = memSnapshots.get(userId) ?? [];
        if (!snaps.some((s) => s.id === snapshot.id)) snaps.push(snapshot);
        memSnapshots.set(userId, snaps);
      }
      json(res, 200, { ok: true, snapshot, persisted: useDb });
      return;
    }

    json(res, 400, { ok: false, error: 'unknown action' });
  } catch (e) {
    json(res, 500, { ok: false, error: e instanceof Error ? e.message.slice(0, 160) : 'server error' });
  }
}
