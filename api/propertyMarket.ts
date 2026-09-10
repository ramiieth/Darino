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

async function loadListings(userId: string): Promise<PropertyMarketListing[]> {
  const sql = db();
  const rows = (await sql`
    SELECT token, payload FROM "pmListings"
    WHERE "userId" = ${userId}
  `) as unknown as StoredRow[];
  return rows.map((r) => fromJsonb<PropertyMarketListing>(r.payload));
}

async function upsertListings(userId: string, listings: PropertyMarketListing[]): Promise<number> {
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

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isDbConfigured()) {
    json(res, 200, { configured: false, listings: [], snapshots: [] });
    return;
  }
  const userId = userIdOf(req);

  try {
    if (!(await ensureSchema(db()))) {
      json(res, 503, { ok: false, error: 'database_unavailable' });
      return;
    }

    /* ---------- GET: آگهی‌ها + Snapshotها ---------- */
    if (req.method === 'GET') {
      const listings = await loadListings(userId);
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
        json(res, 200, {
          ok: false,
          error: e instanceof Error ? e.message.slice(0, 160) : 'divar unreachable'
        });
        return;
      }

      // پاک‌سازی تکه + ادغام با موجودی (حذف تکراری)
      const existing = await loadListings(userId);
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
      const added = fresh.length > 0 ? await upsertListings(userId, fresh) : 0;

      json(res, 200, {
        ok: true,
        done: result.done,
        cursor: result.cursor,
        added,
        fetchedDetails: result.fetchedDetails,
        failedDetails: result.failedDetails,
        report
      });
      return;
    }

    /* ---------- POST finalize → Snapshot جدید (الحاق، نه رونویسی) ---------- */
    if (action === 'finalize') {
      const all = await loadListings(userId);
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

      await db()`
        INSERT INTO "pmSnapshots" (id, "userId", "dateTs", payload, "createdAt")
        VALUES (${snapshot.id}, ${userId}, ${dateTs}, ${JSON.stringify(snapshot)}::jsonb, ${dateTs})
        ON CONFLICT ("userId", id) DO NOTHING
      `;
      json(res, 200, { ok: true, snapshot });
      return;
    }

    json(res, 400, { ok: false, error: 'unknown action' });
  } catch (e) {
    json(res, 500, { ok: false, error: e instanceof Error ? e.message.slice(0, 160) : 'server error' });
  }
}
