/** ============================================================
 * /api/founderLab — آزمایشگاه ایده کسب‌وکار (Founder Lab) روی Neon
 *
 * GET                       → فهرست پروژه‌های کاربر
 * POST { action: 'upsert', project }
 * POST { action: 'delete', id }
 * POST { action: 'bulkImport', projects }
 * POST { action: 'wipeAll' }
 * ============================================================ */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { db, isDbConfigured, json, readBody } from './_neon.js';
import { requireSession } from './_authCore.js';
import { ensureSchema } from './_schema.js';

interface FounderLabPayload {
  id: string;
  currency?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  profile?: {
    name?: string;
    stage?: string;
  };
  [key: string]: unknown;
}

function toEpochMs(value: string | number | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isDbConfigured()) {
    json(res, 200, { configured: false, projects: [] });
    return;
  }

  const auth = await requireSession(req, res);
  if (!auth) return;
  const userId = auth.userId;
  const sql = db();

  try {
    if (!(await ensureSchema(sql))) {
      json(res, 503, { ok: false, error: 'database_unavailable' });
      return;
    }

    if (req.method === 'GET') {
      const rows = (await sql`
        SELECT id, title, stage, currency, payload, "createdAt", "updatedAt"
        FROM "founderLabProjects"
        WHERE "userId" = ${userId}
        ORDER BY "updatedAt" DESC
      `) as { payload: FounderLabPayload }[];
      json(res, 200, {
        configured: true,
        projects: rows.map((r) => r.payload)
      });
      return;
    }

    if (req.method === 'POST') {
      const body = (await readBody(req)) as {
        action?: 'upsert' | 'delete' | 'bulkImport' | 'wipeAll';
        id?: string;
        project?: FounderLabPayload;
        projects?: FounderLabPayload[];
      };

      const action = body.action ?? 'upsert';
      const now = Date.now();

      if (action === 'wipeAll') {
        await sql`DELETE FROM "founderLabProjects" WHERE "userId" = ${userId}`;
        json(res, 200, { ok: true, wiped: true });
        return;
      }

      if (action === 'delete') {
        const id = typeof body.id === 'string' ? body.id.trim() : '';
        if (!id) {
          json(res, 400, { ok: false, error: 'id required' });
          return;
        }
        await sql`DELETE FROM "founderLabProjects" WHERE "userId" = ${userId} AND id = ${id}`;
        json(res, 200, { ok: true, deleted: id });
        return;
      }

      if (action === 'bulkImport') {
        const list = Array.isArray(body.projects) ? body.projects : [];
        let imported = 0;
        for (const p of list) {
          if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id.trim()) continue;
          const title = String(p.profile?.name ?? '').slice(0, 200);
          const stage = String(p.profile?.stage ?? 'idea').slice(0, 40);
          const currency = String(p.currency ?? 'IRT').slice(0, 12);
          const createdAt = toEpochMs(p.createdAt, now);
          const updatedAt = toEpochMs(p.updatedAt, now);
          await sql`
            INSERT INTO "founderLabProjects" ("userId", id, title, stage, currency, payload, "createdAt", "updatedAt")
            VALUES (${userId}, ${p.id}, ${title}, ${stage}, ${currency}, ${JSON.stringify(p)}::jsonb, ${createdAt}, ${updatedAt})
            ON CONFLICT ("userId", id)
            DO UPDATE SET title = EXCLUDED.title,
                          stage = EXCLUDED.stage,
                          currency = EXCLUDED.currency,
                          payload = EXCLUDED.payload,
                          "updatedAt" = EXCLUDED."updatedAt"
          `;
          imported++;
        }
        json(res, 200, { ok: true, imported });
        return;
      }

      const p = body.project;
      if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id.trim()) {
        json(res, 400, { ok: false, error: 'valid project with id required' });
        return;
      }
      const title = String(p.profile?.name ?? '').slice(0, 200);
      const stage = String(p.profile?.stage ?? 'idea').slice(0, 40);
      const currency = String(p.currency ?? 'IRT').slice(0, 12);
      const createdAt = toEpochMs(p.createdAt, now);
      const updatedAt = now;

      await sql`
        INSERT INTO "founderLabProjects" ("userId", id, title, stage, currency, payload, "createdAt", "updatedAt")
        VALUES (${userId}, ${p.id}, ${title}, ${stage}, ${currency}, ${JSON.stringify(p)}::jsonb, ${createdAt}, ${updatedAt})
        ON CONFLICT ("userId", id)
        DO UPDATE SET title = EXCLUDED.title,
                      stage = EXCLUDED.stage,
                      currency = EXCLUDED.currency,
                      payload = EXCLUDED.payload,
                      "updatedAt" = EXCLUDED."updatedAt"
      `;
      json(res, 200, { ok: true, id: p.id, updatedAt });
      return;
    }

    json(res, 405, { ok: false, error: 'method not allowed' });
  } catch (e) {
    json(res, 500, { ok: false, error: e instanceof Error ? e.message.slice(0, 160) : 'server error' });
  }
}
