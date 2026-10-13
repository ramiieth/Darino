/** ============================================================
 * Snappfood relay queue — the user's own Mac (Iranian route) fetches Snappfood for us.
 *
 *  Outbound-only: the Mac polls /api/integrations?op=shop-relay with SHOP_RELAY_KEY;
 *  nothing on the Mac is reachable from the internet. Jobs carry only a search word,
 *  a city-centre point and fixed filters; the Mac builds the Snappfood URL itself.
 *  Storage reuses the "providerCache" table (no migration); entries expire in minutes.
 * ============================================================ */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { db, isDbConfigured, json, readBody } from './_neon.js';

export interface RelayJob {
  query: string;
  lat: number;
  lon: number;
  /** Snappfood superType filters; 0 = the site's default mix */
  types: number[];
  discount: boolean;
}
export interface RelayResult { ok: boolean; items: unknown[]; error: string | null; at: number }

const JOB = 'shoprelay:job:';
const RES = 'shoprelay:res:';
const BEAT = 'shoprelay:heartbeat';
const JOB_TTL = 2 * 60_000;
const RESULT_TTL = 10 * 60_000;
const ONLINE_MS = 45_000;
const STALE_CLAIM_MS = 30_000;
export const ALLOWED_TYPES = [0, 1, 2, 3, 5, 6, 8, 11];
const MAX_ITEMS = 160;
const MAX_RESULT_BYTES = 800_000;

const memory = new Map<string, { payload: Record<string, unknown>; expiresAt: number }>();

export function relayConfigured(): boolean {
  return (process.env.SHOP_RELAY_KEY ?? '').trim().length >= 32;
}

/** Constant-time check of "Authorization: Bearer <key>". */
export function relayAuthorized(header: string | undefined): boolean {
  const key = (process.env.SHOP_RELAY_KEY ?? '').trim();
  const given = /^Bearer\s+(\S{32,200})$/.exec(header ?? '')?.[1];
  if (key.length < 32 || !given) return false;
  const a = createHash('sha256').update(key).digest(); const b = createHash('sha256').update(given).digest();
  return timingSafeEqual(a, b);
}

export function validJob(j: unknown): j is RelayJob {
  const o = j as RelayJob;
  return !!o && typeof o.query === 'string' && o.query.length >= 1 && o.query.length <= 60 && !/[\u0000-\u001f]/.test(o.query)
    && Number.isFinite(o.lat) && o.lat > 24 && o.lat < 40.5 && Number.isFinite(o.lon) && o.lon > 43 && o.lon < 64
    && Array.isArray(o.types) && o.types.length >= 1 && o.types.length <= 3 && o.types.every((t) => ALLOWED_TYPES.includes(t))
    && typeof o.discount === 'boolean';
}

const jobId = (j: RelayJob) => createHash('sha256').update(JSON.stringify([j.query, j.lat.toFixed(4), j.lon.toFixed(4), j.types, j.discount])).digest('hex').slice(0, 32);

/* ---------- storage (Neon, or memory for local dev/tests) ---------- */

async function put(key: string, payload: Record<string, unknown>, ttl: number, onlyIfAbsent = false): Promise<void> {
  const expiresAt = Date.now() + ttl;
  if (!isDbConfigured()) {
    const old = memory.get(key);
    if (onlyIfAbsent && old && old.expiresAt > Date.now()) return;
    memory.set(key, { payload, expiresAt }); return;
  }
  if (onlyIfAbsent) await db()`INSERT INTO "providerCache" ("key","payload","expiresAt") VALUES (${key},${JSON.stringify(payload)}::jsonb,${expiresAt}) ON CONFLICT ("key") DO UPDATE SET "payload"=EXCLUDED."payload","expiresAt"=EXCLUDED."expiresAt" WHERE "providerCache"."expiresAt" < ${Date.now()}`;
  else await db()`INSERT INTO "providerCache" ("key","payload","expiresAt") VALUES (${key},${JSON.stringify(payload)}::jsonb,${expiresAt}) ON CONFLICT ("key") DO UPDATE SET "payload"=EXCLUDED."payload","expiresAt"=EXCLUDED."expiresAt"`;
}

async function get(key: string): Promise<Record<string, unknown> | null> {
  if (!isDbConfigured()) { const m = memory.get(key); return m && m.expiresAt > Date.now() ? m.payload : null; }
  const rows = await db()`SELECT "payload" FROM "providerCache" WHERE "key"=${key} AND "expiresAt">${Date.now()} LIMIT 1`;
  return (rows[0]?.payload as Record<string, unknown>) ?? null;
}

async function remove(key: string): Promise<void> {
  if (!isDbConfigured()) { memory.delete(key); return; }
  await db()`DELETE FROM "providerCache" WHERE "key"=${key}`;
}

/* ---------- Darino side ---------- */

export async function bridgeOnline(): Promise<boolean> {
  const beat = await get(BEAT).catch(() => null);
  return !!beat && Date.now() - Number(beat.at) < ONLINE_MS;
}

/** Queue a search (deduplicated) and wait for the Mac; a fresh cached result returns at once. */
export async function relaySearch(job: RelayJob, waitMs = 22_000): Promise<RelayResult> {
  if (!validJob(job)) throw new Error('invalid relay job');
  const id = jobId(job);
  const cached = await get(RES + id);
  if (cached) return cached as unknown as RelayResult;
  await put(JOB + id, { id, job, status: 'pending', at: Date.now() }, JOB_TTL, true);
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 900));
    const res = await get(RES + id);
    if (res) return res as unknown as RelayResult;
  }
  return { ok: false, items: [], error: 'timeout', at: Date.now() };
}

/* ---------- Mac side (authorised by relayAuthorized) ---------- */

/** Heartbeat + claim up to 3 pending (or stale) jobs. */
export async function claimJobs(now = Date.now()): Promise<{ id: string; job: RelayJob }[]> {
  await put(BEAT, { at: now, beat: randomUUID().slice(0, 8) }, 5 * 60_000);
  if (!isDbConfigured()) {
    const out: { id: string; job: RelayJob }[] = [];
    for (const [key, m] of memory) {
      if (!key.startsWith(JOB) || m.expiresAt <= now || out.length >= 3) continue;
      const p = m.payload;
      if (p.status === 'pending' || (p.status === 'working' && now - Number(p.claimedAt) > STALE_CLAIM_MS)) {
        m.payload = { ...p, status: 'working', claimedAt: now };
        out.push({ id: String(p.id), job: p.job as RelayJob });
      }
    }
    return out;
  }
  const rows = await db()`UPDATE "providerCache" SET "payload" = "payload" || jsonb_build_object('status','working','claimedAt',${now}::bigint)
    WHERE "key" IN (SELECT "key" FROM "providerCache" WHERE "key" LIKE 'shoprelay:job:%' AND "expiresAt" > ${now}
      AND ("payload"->>'status' = 'pending' OR ("payload"->>'status' = 'working' AND ("payload"->>'claimedAt')::bigint < ${now - STALE_CLAIM_MS}))
      ORDER BY ("payload"->>'at')::bigint LIMIT 3)
    RETURNING "payload"`;
  return rows.map((r) => r.payload as { id: string; job: RelayJob }).map((p) => ({ id: p.id, job: p.job }));
}

/** Store the Mac's answer for a job it claimed; size-capped, items re-validated by the parser. */
export async function submitResult(body: Record<string, unknown>): Promise<boolean> {
  const id = typeof body.id === 'string' && /^[0-9a-f]{32}$/.test(body.id) ? body.id : null;
  if (!id || !(await get(JOB + id))) return false;
  const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  if (JSON.stringify(items).length > MAX_RESULT_BYTES) return false;
  const ok = body.ok === true;
  const error = typeof body.error === 'string' ? body.error.slice(0, 120) : null;
  await put(RES + id, { ok, items: ok ? items : [], error: ok ? null : error, at: Date.now() }, ok ? RESULT_TTL : 60_000);
  await remove(JOB + id);
  return true;
}

/** /api/integrations?op=shop-relay — the Mac bridge only. GET: heartbeat + claim jobs; POST: submit a result. */
export async function relayEndpoint(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!relayConfigured()) { json(res, 404, { error: 'not configured' }); return; }
  if (!relayAuthorized(req.headers.authorization)) { json(res, 401, { error: 'unauthorized' }); return; }
  try {
    if (req.method === 'GET') { json(res, 200, { jobs: await claimJobs() }); return; }
    if (req.method === 'POST') { json(res, (await submitResult(await readBody(req))) ? 200 : 409, { ok: true }); return; }
    json(res, 405, { error: 'method' });
  } catch {
    json(res, 500, { error: 'relay storage unavailable' });
  }
}

export const _test = { memory, jobId };
