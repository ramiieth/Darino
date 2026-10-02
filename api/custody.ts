/** ============================================================
 * /api/custody — همگام‌سازی دارایی چندشبکه‌ای بین دستگاه‌ها
 *
 *  GET  → همهٔ رکوردهای کاربر (محل، عملیات، شبکه، توکن)
 *  POST { records } → upsert شرطی: فقط اگر (revision, updatedAt) جدیدتر از نسخهٔ سرور باشد.
 *        پاسخ: applied (پذیرفته) و stale (نسخهٔ سرور جدیدتر بود → کلاینت دوباره pull می‌کند).
 *
 *  • فقط با نشست معتبر Passkey؛ userId از نشست — نه از ورودی مرورگر.
 *  • حذف سخت ندارد. هیچ داده‌ای از این endpoint به سرویس دیگری ارسال نمی‌شود.
 * ============================================================ */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { db, isDbConfigured, json, readBody } from './_neon.js';
import { requireSession } from './_authCore.js';
import { validateSyncRecord, type SyncRecord } from '../src/features/custody/domain/syncMerge.js';

const MAX_RECORDS_PER_POST = 1000;

export interface CustodyStore {
  list(userId: string): Promise<SyncRecord[]>;
  /** upsert شرطی — true اگر نوشته شد */
  upsertIfNewer(userId: string, r: SyncRecord): Promise<boolean>;
}

export function neonCustodyStore(sql: NeonQueryFunction<false, false>): CustodyStore {
  return {
    async list(userId) {
      const rows = (await sql`SELECT collection, id, revision, "updatedAt", payload FROM "custodyRecords" WHERE "userId" = ${userId}`) as Record<string, unknown>[];
      return rows.map((r) => ({
        collection: r.collection as SyncRecord['collection'],
        id: String(r.id),
        revision: Number(r.revision),
        updatedAt: Number(r.updatedAt),
        payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload
      }));
    },
    async upsertIfNewer(userId, r) {
      const rows = (await sql`
        INSERT INTO "custodyRecords" ("userId", collection, id, revision, "updatedAt", payload)
        VALUES (${userId}, ${r.collection}, ${r.id}, ${r.revision}, ${r.updatedAt}, ${JSON.stringify(r.payload)}::jsonb)
        ON CONFLICT ("userId", collection, id) DO UPDATE SET
          revision = EXCLUDED.revision, "updatedAt" = EXCLUDED."updatedAt", payload = EXCLUDED.payload
        WHERE ("custodyRecords".revision, "custodyRecords"."updatedAt") < (EXCLUDED.revision, EXCLUDED."updatedAt")
        RETURNING id`) as unknown[];
      return rows.length > 0;
    }
  };
}

let override: CustodyStore | null = null;
/** فقط تست */
export function __setCustodyStoreForTests(s: CustodyStore | null): void {
  override = s;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!override && !isDbConfigured()) {
    json(res, 200, { configured: false, records: [] });
    return;
  }
  const auth = await requireSession(req, res);
  if (!auth) return;
  const store = override ?? neonCustodyStore(db());

  try {
    if (req.method === 'GET') {
      json(res, 200, { configured: true, records: await store.list(auth.userId) });
      return;
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const input = Array.isArray(body.records) ? body.records : [];
      if (input.length > MAX_RECORDS_PER_POST) {
        json(res, 413, { ok: false, error: 'too_many_records' });
        return;
      }
      const applied: string[] = [];
      const stale: string[] = [];
      let invalid = 0;
      for (const r of input) {
        if (!validateSyncRecord(r)) {
          invalid++;
          continue;
        }
        const ok = await store.upsertIfNewer(auth.userId, r);
        (ok ? applied : stale).push(`${r.collection}|${r.id}`);
      }
      json(res, 200, { ok: true, applied, stale, invalid });
      return;
    }
    json(res, 405, { ok: false, error: 'method not allowed' });
  } catch {
    json(res, 500, { ok: false, error: 'server_error' });
  }
}

/** ادغام شرطی در حافظه (فقط تست) — همان قاعدهٔ SQL */
export function memoryCustodyStore(): CustodyStore {
  const m = new Map<string, SyncRecord & { userId: string }>();
  return {
    async list(u) {
      return [...m.values()].filter((r) => r.userId === u).map(({ userId: _u, ...r }) => r);
    },
    async upsertIfNewer(u, r) {
      const k = `${u}|${r.collection}|${r.id}`;
      const cur = m.get(k);
      if (cur && !(r.revision > cur.revision || (r.revision === cur.revision && r.updatedAt > cur.updatedAt))) return false;
      m.set(k, { ...r, userId: u });
      return true;
    }
  };
}
