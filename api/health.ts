/** ============================================================
 * GET /api/health — وضعیت واقعی Database + آماده‌سازی خودکار Schema
 *
 * بدون DATABASE_URL:        { ok: true,  database: 'local' }
 * با DATABASE_URL (موفق):   { ok: true,  database: 'connected' }  ← schema هم تضمین شده
 * با DATABASE_URL (خطا):    { ok: false, database: 'error' }      ← هرگز دروغ نمی‌گوید
 *
 * هرگز Secret/Password/DATABASE_URL را نمایش نمی‌دهد.
 * ============================================================ */
import type { ServerResponse, IncomingMessage } from 'node:http';
import { db, isDbConfigured, json } from './_neon.js';
import { ensureSchema } from './_schema.js';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    json(res, 405, { ok: false, error: 'method not allowed' });
    return;
  }
  if (!isDbConfigured()) {
    // حالت محلی/Dexie — اپ بدون Neon کار می‌کند
    json(res, 200, { ok: true, database: 'local' });
    return;
  }
  try {
    const sql = db();
    await sql`SELECT 1`;
    // اطمینان از آماده‌بودن schema (idempotent — جداول می‌سازد اگر نبودند)
    const schemaOk = await ensureSchema(sql);
    json(res, schemaOk ? 200 : 503, { ok: schemaOk, database: schemaOk ? 'connected' : 'error' });
  } catch {
    // خطای اتصال واقعی → وضعیت failure صریح (نه connected دروغین)
    json(res, 503, { ok: false, database: 'error' });
  }
}
