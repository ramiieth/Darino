/** ============================================================
 * /api/portfolio — پورتفولیو / سرمایه کاربر (Neon)
 *
 * GET            → فهرست دارایی‌ها
 * POST upsert    → افزودن/به‌روزرسانی دارایی (UNIQUE userId+assetType+assetId)
 * POST delete    → حذف یک دارایی
 *
 * ⚠️ قیمت جاری در اینجا ذخیره نمی‌شود — فقط Cost Basis و Quantity.
 * Current Value همیشه از Market Data (زنده) محاسبه می‌شود (جدایی Market/Accounting).
 * ============================================================ */
import type { ServerResponse, IncomingMessage } from 'node:http';
import { db, isDbConfigured, json, readBody, userIdOf } from './_neon';
import { ensureSchema } from './_schema';

export interface PortfolioRow {
  id?: number;
  assetType: string;
  assetId: string;
  quantity: number;
  averageCost: number;
  purchaseDate?: number | null;
  currency?: string;
  note?: string | null;
  createdAt: number;
  updatedAt: number;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isDbConfigured()) {
    json(res, 200, { configured: false, assets: [] });
    return;
  }
  const userId = userIdOf(req);
  const sql = db();

  try {
    if (!(await ensureSchema(sql))) {
      json(res, 503, { ok: false, error: 'database_unavailable' });
      return;
    }
    // ---------- GET ----------
    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM "portfolioAssets" WHERE "userId" = ${userId} ORDER BY "assetType", "assetId"`;
      json(res, 200, { configured: true, assets: rows });
      return;
    }

    // ---------- POST ----------
    if (req.method === 'POST') {
      const body = (await readBody(req)) as { action?: string; asset?: PortfolioRow } & Record<string, unknown>;
      const a = (body.asset ?? {}) as Partial<PortfolioRow>;
      if (!a.assetType || !a.assetId || typeof a.quantity !== 'number') {
        json(res, 400, { ok: false, error: 'assetType/assetId/quantity required' });
        return;
      }
      const now = Date.now();

      if (body.action === 'delete') {
        await sql`DELETE FROM "portfolioAssets" WHERE "userId" = ${userId} AND "assetType" = ${a.assetType} AND "assetId" = ${a.assetId}`;
        json(res, 200, { ok: true, deleted: true });
        return;
      }

      // Upsert — مقدار/بهای تمام‌شده به‌روز می‌شود
      await sql`
        INSERT INTO "portfolioAssets"
          ("userId", "assetType", "assetId", quantity, "averageCost", "purchaseDate", currency, note, "createdAt", "updatedAt")
        VALUES (${userId}, ${a.assetType}, ${a.assetId}, ${a.quantity}, ${a.averageCost ?? 0},
                ${a.purchaseDate ?? null}, ${a.currency ?? 'USD'}, ${a.note ?? null}, ${now}, ${now})
        ON CONFLICT ("userId", "assetType", "assetId")
        DO UPDATE SET quantity = EXCLUDED.quantity,
                      "averageCost" = EXCLUDED."averageCost",
                      "purchaseDate" = EXCLUDED."purchaseDate",
                      note = EXCLUDED.note,
                      "updatedAt" = EXCLUDED."updatedAt"
      `;
      json(res, 200, { ok: true, upserted: { assetType: a.assetType, assetId: a.assetId } });
      return;
    }

    json(res, 405, { ok: false, error: 'method not allowed' });
  } catch (e) {
    json(res, 500, { ok: false, error: e instanceof Error ? e.message.slice(0, 160) : 'server error' });
  }
}
