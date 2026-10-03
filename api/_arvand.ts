/** ============================================================
 * خودروهای اروند — عملیات سرور (از /api/propertyMarket صدا زده می‌شود)
 *
 * POST arvandSearch   {city, query, pagination?} → یک صفحه جستجوی خودرو دیوار
 * POST arvandDetails  {tokens[]}                → جزئیات پارس‌شده (در سقف زمان)
 * POST arvandPersist  {ads[], removed[], snapshot?} → Neon (نشست لازم)
 * GET  ?market=arvand                           → آگهی‌ها + Snapshotها از Neon
 *
 *  مرورگر به دیوار مستقیم نمی‌زند (CORS)؛ ساخت/ادغام/حذف آگهی سمت کلاینت است.
 * ============================================================ */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { db, isDbConfigured, json } from './_neon.js';
import { requireSession } from './_authCore.js';
import { ensureSchema } from './_schema.js';
import { requestJson, safeHeaders, sleep } from '../src/features/propertyMarket/collector/client.js';
import { DIVAR_DETAIL_URL, DIVAR_POSTLIST_URL } from '../src/features/propertyMarket/collector/endpoints.js';
import { DIVAR_CITY_IDS, buildCarSearchBody, parseCarDetail, parseCarList, type ParsedDetail } from '../src/features/arvandCars/collector/divarCar.js';
import type { ArvandSnapshot, CarAd } from '../src/features/arvandCars/domain/types.js';

const DETAILS_BUDGET_MS = 38_000;
const DETAIL_PAUSE_MS = 350;
const MAX_TOKENS = 60;
const MAX_PERSIST = 4000;
const TOKEN_RE = /^[A-Za-z0-9_-]{5,16}$/;

type City = keyof typeof DIVAR_CITY_IDS;
const isCity = (v: unknown): v is City => typeof v === 'string' && v in DIVAR_CITY_IDS;

function fromJsonb<T>(p: T | string): T {
  return typeof p === 'string' ? (JSON.parse(p) as T) : p;
}

async function dbUsable(): Promise<boolean> {
  if (!isDbConfigured()) return false;
  try {
    return await ensureSchema(db());
  } catch {
    return false;
  }
}

function netError(e: unknown): string {
  const raw = e instanceof Error ? e.message.slice(0, 160) : '';
  if (!raw || raw === 'fetch failed' || /abort/i.test(raw)) return 'source unreachable';
  return raw;
}

/** توضیحات بلند کوتاه می‌شود (حجم پاسخ) */
function compactDetail(d: ParsedDetail): ParsedDetail {
  return { ...d, description: d.description.slice(0, 2500) };
}

export async function handleArvandGet(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!(await dbUsable())) {
    json(res, 200, { configured: false, ads: [], snapshots: [] });
    return;
  }
  const auth = await requireSession(req, res);
  if (!auth) return;
  try {
    const ads = (await db()`SELECT payload FROM "arvandAds"`) as unknown as { payload: CarAd | string }[];
    const snaps = (await db()`
      SELECT payload FROM "arvandSnapshots" ORDER BY "dateTs" DESC LIMIT 400
    `) as unknown as { payload: ArvandSnapshot | string }[];
    json(res, 200, { configured: true, ads: ads.map((r) => fromJsonb(r.payload)), snapshots: snaps.map((r) => fromJsonb(r.payload)).reverse() });
  } catch {
    json(res, 200, { configured: false, ads: [], snapshots: [] });
  }
}

/** true = این action مربوط به اروند بود و پاسخ داده شد */
export async function handleArvandAction(action: string, body: Record<string, unknown>, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (action === 'arvandSearch') {
    const city = body.city;
    const query = typeof body.query === 'string' ? body.query.trim().slice(0, 80) : '';
    if (!isCity(city) || !query) {
      json(res, 400, { ok: false, error: 'invalid search' });
      return true;
    }
    try {
      const page = await requestJson<unknown>(undefined, DIVAR_POSTLIST_URL, {
        method: 'POST',
        headers: safeHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(buildCarSearchBody([DIVAR_CITY_IDS[city]], query, body.pagination ?? undefined))
      });
      const parsed = parseCarList(page);
      json(res, 200, { ok: true, rows: parsed.rows, next: parsed.next });
    } catch (e) {
      json(res, 200, { ok: false, error: netError(e) });
    }
    return true;
  }

  if (action === 'arvandDetails') {
    const tokens = (Array.isArray(body.tokens) ? body.tokens : []).filter((t): t is string => typeof t === 'string' && TOKEN_RE.test(t)).slice(0, MAX_TOKENS);
    const started = Date.now();
    const details: Record<string, ParsedDetail> = {};
    const failed: string[] = [];
    let i = 0;
    for (; i < tokens.length; i++) {
      if (Date.now() - started > DETAILS_BUDGET_MS) break;
      try {
        const d = await requestJson<unknown>(undefined, DIVAR_DETAIL_URL(tokens[i]), { headers: safeHeaders() }, { retries: 1, timeoutMs: 12_000 });
        details[tokens[i]] = compactDetail(parseCarDetail(d));
      } catch {
        failed.push(tokens[i]); // حذف‌شده/خطا — کلاینت آن را کنار می‌گذارد
      }
      await sleep(DETAIL_PAUSE_MS);
    }
    json(res, 200, { ok: true, details, failed, remaining: tokens.slice(i) });
    return true;
  }

  if (action === 'arvandPersist') {
    if (!(await dbUsable())) {
      json(res, 200, { ok: true, persisted: false });
      return true;
    }
    const auth = await requireSession(req, res);
    if (!auth) return true;
    const ads = (Array.isArray(body.ads) ? body.ads : [])
      .slice(0, MAX_PERSIST)
      .filter((a): a is CarAd => !!a && typeof a === 'object' && typeof (a as CarAd).token === 'string' && TOKEN_RE.test((a as CarAd).token));
    for (const a of ads) {
      await db()`
        INSERT INTO "arvandAds" (token, region, "lastSeenAt", payload)
        VALUES (${a.token}, ${a.region === 'tehran' ? 'tehran' : 'khuz'}, ${a.lastSeenAt ?? Date.now()}, ${JSON.stringify(a)}::jsonb)
        ON CONFLICT (token) DO UPDATE SET payload = EXCLUDED.payload, "lastSeenAt" = EXCLUDED."lastSeenAt", region = EXCLUDED.region
        WHERE "arvandAds"."lastSeenAt" <= EXCLUDED."lastSeenAt"
      `;
    }
    const removed = (Array.isArray(body.removed) ? body.removed : []).filter((t): t is string => typeof t === 'string' && TOKEN_RE.test(t)).slice(0, MAX_PERSIST);
    if (removed.length > 0) await db()`DELETE FROM "arvandAds" WHERE token = ANY(${removed})`;
    const s = body.snapshot as ArvandSnapshot | undefined;
    if (s && typeof s === 'object' && typeof s.id === 'string' && /^arv-\d{4}-\d{2}-\d{2}$/.test(s.id) && typeof s.dateTs === 'number') {
      await db()`
        INSERT INTO "arvandSnapshots" (id, "dateTs", payload) VALUES (${s.id}, ${s.dateTs}, ${JSON.stringify(s)}::jsonb)
        ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, "dateTs" = EXCLUDED."dateTs"
        WHERE "arvandSnapshots"."dateTs" < EXCLUDED."dateTs"
      `;
    }
    json(res, 200, { ok: true, persisted: true, ads: ads.length, removed: removed.length });
    return true;
  }
  return false;
}
