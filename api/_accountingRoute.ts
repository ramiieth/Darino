/** ============================================================
 * /api/accounting — همگام‌سازی حسابداری با Neon
 *
 * GET  → خواندن کامل داده مالی کاربر (accounts/entries/lots/events)
 * POST → Upsert Idempotent (اجرای مجدد = بدون Duplicate)
 *
 * ⚠️ تراکنش‌های گذشته (Immutable) هرگز بازنویسی نمی‌شوند:
 *   entries/lots/events → ON CONFLICT DO NOTHING (skip)
 *   accounts           → ON CONFLICT DO NOTHING (skip — seed یکسان)
 *
 * ساختار payloadها با Types فعلی اپ (domain/types) هماهنگ است.
 * ============================================================ */
import type { ServerResponse, IncomingMessage } from 'node:http';
import { db, isDbConfigured, json, readBody } from './_neon.js';
import { requireSession } from './_authCore.js';
import { ensureSchema } from './_schema.js';

interface SyncPayload {
  accounts?: { key: string; nameFa: string; type: string; createdAt: number }[];
  entries?: { id: number; date: number; createdAt: number; payload: unknown }[];
  lots?: { id: number; asset: string; openedAt: number; payload: unknown }[];
  events?: { id: number; at: number; payload: unknown }[];
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isDbConfigured()) {
    json(res, 200, { configured: false, accounts: [], entries: [], lots: [], events: [] });
    return;
  }
  // userId فقط از نشست معتبر (Passkey) — هدر x-user-id دیگر پذیرفته نمی‌شود
  const auth = await requireSession(req, res);
  if (!auth) return;
  const userId = auth.userId;
  const sql = db();

  try {
    // گارد خودکار: اطمینان از وجود جداول (ایجاد امن اگر نبودند) — بدون 500 «relation does not exist»
    if (!(await ensureSchema(sql))) {
      json(res, 503, { ok: false, error: 'database_unavailable', message: 'اتصال به دیتابیس برقرار نیست — داده محلی (Dexie) فعال است' });
      return;
    }
    const savedBook = await sql`SELECT payload FROM "custodyRecords" WHERE "userId"=${userId} AND collection='prefs' AND id='cost-basis-v1'`;
    const rawBook = savedBook[0]?.payload;
    const costBook = (typeof rawBook === 'string' ? JSON.parse(rawBook) : rawBook)?.value;
    if (new URL(req.url ?? '/', 'https://darino.local').searchParams.get('op') === 'retire' && req.method === 'POST') {
      if (costBook?.version !== 1 || costBook?.migrationConfirmed !== true || !Array.isArray(costBook.lots)) {
        json(res,409,{error:'cost_basis_not_confirmed'});return;
      }
      // One atomic statement; only this authenticated user's obsolete ledger is removed.
      await sql`WITH entries AS (DELETE FROM "accEntries" WHERE "userId"=${userId} RETURNING id),
        lots AS (DELETE FROM "accLots" WHERE "userId"=${userId} RETURNING id),
        events AS (DELETE FROM "accEvents" WHERE "userId"=${userId} RETURNING id),
        oldOperations AS (DELETE FROM "custodyRecords" WHERE "userId"=${userId} AND (collection='operations' OR (collection='prefs' AND id='acc-lot-baseline')) RETURNING id),
        accounts AS (DELETE FROM "accAccounts" WHERE "userId"=${userId} RETURNING key)
        SELECT (SELECT count(*) FROM entries) AS removed`;
      json(res,200,{ok:true});return;
    }
    if(costBook?.migrationConfirmed === true) {
      if(req.method==='GET') json(res,200,{configured:true,retired:true,accounts:[],entries:[],lots:[],events:[]});
      else json(res,409,{error:'legacy_accounting_retired'});
      return;
    }
    // ---------- GET: خواندن کامل (منبع حقیقت → کلاینت) ----------
    if (req.method === 'GET') {
      const [accounts, entries, lots, events] = await Promise.all([
        sql`SELECT key, "nameFa", type, "createdAt" FROM "accAccounts" WHERE "userId" = ${userId}`,
        sql`SELECT id, date, "createdAt", payload FROM "accEntries" WHERE "userId" = ${userId} ORDER BY id`,
        sql`SELECT id, asset, "openedAt", payload FROM "accLots" WHERE "userId" = ${userId} ORDER BY id`,
        sql`SELECT id, at, payload FROM "accEvents" WHERE "userId" = ${userId} ORDER BY id`
      ]);
      json(res, 200, {
        configured: true,
        accounts: accounts.map((r) => ({ key: r.key, nameFa: r.nameFa, type: r.type, createdAt: r.createdAt })),
        entries: entries.map((r) => ({ id: Number(r.id), date: Number(r.date), createdAt: Number(r.createdAt), payload: r.payload })),
        lots: lots.map((r) => ({ id: Number(r.id), asset: r.asset, openedAt: Number(r.openedAt), payload: r.payload })),
        events: events.map((r) => ({ id: Number(r.id), at: Number(r.at), payload: r.payload }))
      });
      return;
    }

    // ---------- POST: Upsert Idempotent ----------
    if (req.method === 'POST') {
      const body = (await readBody(req)) as SyncPayload;
      let inserted = 0;
      let skipped = 0;

      // Accounts — skip اگر موجود باشد
      for (const a of body.accounts ?? []) {
        const exists = await sql`SELECT 1 FROM "accAccounts" WHERE "userId" = ${userId} AND key = ${a.key}`;
        if (exists.length > 0) {
          skipped++;
          continue;
        }
        const written = await sql`INSERT INTO "accAccounts" ("userId", key, "nameFa", type, "createdAt") SELECT ${userId}, ${a.key}, ${a.nameFa}, ${a.type}, ${a.createdAt} WHERE NOT EXISTS (
          SELECT 1 FROM "custodyRecords" WHERE "userId"=${userId} AND collection='prefs' AND id='cost-basis-v1' AND payload->'value'->>'migrationConfirmed'='true'
        ) ON CONFLICT DO NOTHING RETURNING 1`;
        if (!written.length) { skipped++; continue; }
        inserted++;
      }

      // Entries — Immutable: skip اگر id موجود باشد
      for (const e of body.entries ?? []) {
        const exists = await sql`SELECT 1 FROM "accEntries" WHERE "userId" = ${userId} AND id = ${e.id}`;
        if (exists.length > 0) {
          skipped++;
          continue;
        }
        const written = await sql`INSERT INTO "accEntries" ("userId", id, date, "createdAt", payload) SELECT ${userId}, ${e.id}, ${e.date}, ${e.createdAt}, ${JSON.stringify(e.payload)}::jsonb WHERE NOT EXISTS (
          SELECT 1 FROM "custodyRecords" WHERE "userId"=${userId} AND collection='prefs' AND id='cost-basis-v1' AND payload->'value'->>'migrationConfirmed'='true'
        ) ON CONFLICT DO NOTHING RETURNING 1`;
        if (!written.length) { skipped++; continue; }
        inserted++;
      }

      // Lots — skip اگر id موجود باشد
      for (const l of body.lots ?? []) {
        const exists = await sql`SELECT 1 FROM "accLots" WHERE "userId" = ${userId} AND id = ${l.id}`;
        if (exists.length > 0) {
          skipped++;
          continue;
        }
        const written = await sql`INSERT INTO "accLots" ("userId", id, asset, "openedAt", payload) SELECT ${userId}, ${l.id}, ${l.asset}, ${l.openedAt}, ${JSON.stringify(l.payload)}::jsonb WHERE NOT EXISTS (
          SELECT 1 FROM "custodyRecords" WHERE "userId"=${userId} AND collection='prefs' AND id='cost-basis-v1' AND payload->'value'->>'migrationConfirmed'='true'
        ) ON CONFLICT DO NOTHING RETURNING 1`;
        if (!written.length) { skipped++; continue; }
        inserted++;
      }

      // Events — skip اگر id موجود باشد
      for (const ev of body.events ?? []) {
        const exists = await sql`SELECT 1 FROM "accEvents" WHERE "userId" = ${userId} AND id = ${ev.id}`;
        if (exists.length > 0) {
          skipped++;
          continue;
        }
        const written = await sql`INSERT INTO "accEvents" ("userId", id, at, payload) SELECT ${userId}, ${ev.id}, ${ev.at}, ${JSON.stringify(ev.payload)}::jsonb WHERE NOT EXISTS (
          SELECT 1 FROM "custodyRecords" WHERE "userId"=${userId} AND collection='prefs' AND id='cost-basis-v1' AND payload->'value'->>'migrationConfirmed'='true'
        ) ON CONFLICT DO NOTHING RETURNING 1`;
        if (!written.length) { skipped++; continue; }
        inserted++;
      }

      json(res, 200, { ok: true, inserted, skipped, userId });
      return;
    }

    json(res, 405, { ok: false, error: 'method not allowed' });
  } catch (e) {
    // هرگز جزئیات Secret را در پاسخ نده
    json(res, 500, { ok: false, error: e instanceof Error ? e.message.slice(0, 160) : 'server error' });
  }
}
