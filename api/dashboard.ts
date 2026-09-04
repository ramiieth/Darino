/** ============================================================
 * /api/dashboard — اسنپ‌شات‌های داشبورد (فقط تاریخچه/نمودار)
 *
 * GET          → آخرین ۹۰ اسنپ‌شات (برای نمودار عملکرد)
 * POST snapshot→ ثبت اسنپ‌شات (UNIQUE userId+timestamp → skip تکراری)
 *
 * ⚠️ این جدول منبع اصلی Portfolio نیست؛ منبع اصلی = Accounting.
 * اسنپ‌شات فقط «عکس لحظه‌ای» ارزش خالص برای نمودار تاریخی است.
 * نرخ دلار استفاده‌شده داخل همان رکورد ذخیره می‌شود (Historical FX).
 * ============================================================ */
import type { ServerResponse, IncomingMessage } from 'node:http';
import { db, isDbConfigured, json, readBody, userIdOf } from './_neon';
import { ensureSchema } from './_schema';

interface SnapshotInput {
  timestamp: number;
  totalValue: number;
  totalCost?: number;
  profitLoss?: number;
  allocationSnapshot?: Record<string, unknown>;
  fxRateUsed?: number;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isDbConfigured()) {
    json(res, 200, { configured: false, snapshots: [] });
    return;
  }
  const userId = userIdOf(req);
  const sql = db();

  try {
    if (!(await ensureSchema(sql))) {
      json(res, 503, { ok: false, error: 'database_unavailable' });
      return;
    }
    // ---------- GET: آخرین ۹۰ اسنپ‌شات ----------
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT * FROM "dashboardSnapshots"
        WHERE "userId" = ${userId}
        ORDER BY timestamp DESC
        LIMIT 90
      `;
      json(res, 200, { configured: true, snapshots: rows });
      return;
    }

    // ---------- POST: ثبت اسنپ‌شات (تکراری → skip) ----------
    if (req.method === 'POST') {
      const body = (await readBody(req)) as { snapshot?: SnapshotInput };
      const s = body.snapshot;
      if (!s || typeof s.timestamp !== 'number' || typeof s.totalValue !== 'number') {
        json(res, 400, { ok: false, error: 'snapshot.timestamp/totalValue required' });
        return;
      }
      const now = Date.now();
      const exists = await sql`SELECT 1 FROM "dashboardSnapshots" WHERE "userId" = ${userId} AND timestamp = ${s.timestamp}`;
      if (exists.length > 0) {
        json(res, 200, { ok: true, inserted: false, skipped: true });
        return;
      }
      await sql`
        INSERT INTO "dashboardSnapshots"
          ("userId", timestamp, "totalValue", "totalCost", "profitLoss", "allocationSnapshot", "fxRateUsed", "createdAt")
        VALUES (${userId}, ${s.timestamp}, ${s.totalValue}, ${s.totalCost ?? null}, ${s.profitLoss ?? null},
                ${JSON.stringify(s.allocationSnapshot ?? null)}::jsonb, ${s.fxRateUsed ?? null}, ${now})
      `;
      json(res, 200, { ok: true, inserted: true, skipped: false });
      return;
    }

    json(res, 405, { ok: false, error: 'method not allowed' });
  } catch (e) {
    json(res, 500, { ok: false, error: e instanceof Error ? e.message.slice(0, 160) : 'server error' });
  }
}
