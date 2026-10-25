/** ============================================================
 * /api/traders — تریدرهای برتر هایپرلیکوئید (عمومی، فقط‌خواندنی)
 *
 *  GET /api/traders                       ← برترین‌ها از لیدربورد ~۴۰ مگابایتی (کش ۶ ساعته)
 *  GET /api/traders?op=summaries&addresses=… ← خلاصهٔ کارنامهٔ هر آدرس؛ در هر درخواست حداکثر
 *       SUMMARY_BATCH آدرسِ بدون خلاصه محاسبه و برای همهٔ دستگاه‌ها کش می‌شود (تیک اعلان‌ها هم گرم می‌کند)
 *  GET /api/traders?op=positions          ← پوزیشن‌های باز برترها، تجمیع به تفکیک دارایی (کش ۵ دقیقه)
 *
 * endpoint لیدربورد مستند نیست ← خطا هرگز داده نمی‌سازد: یا نسخهٔ قبلی با stale:true یا ۵۰۲.
 * ============================================================ */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { json } from './_neon.js';
import { providerCacheKey, readProviderCache, writeProviderCache } from './_providerCache.js';
import { hlInfo, pool } from './_hyperliquid.js';
import { isHlAddress, parseLeaderboard, selectCandidates, type Candidate } from '../src/features/traders/domain/candidates.js';
import { buildReport } from '../src/features/traders/domain/report.js';
import { isSteady, summarize, type TraderSummary } from '../src/features/traders/domain/summary.js';
import { positionsOf, type TraderPosition } from '../src/features/traders/domain/positions.js';
import type { Fill, HlAccountState, HlPortfolio } from '../src/features/traders/domain/types.js';

const LEADERBOARD_URL = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard';
const FRESH_MS = 6 * 3_600_000;
const LAST_GOOD_MS = 7 * 86_400_000;
const SUMMARY_FRESH_MS = 6 * 3_600_000;
const SUMMARY_KEEP_MS = 3 * 86_400_000;
const POSITIONS_MS = 5 * 60_000;
export const SUMMARY_BATCH = 3;
const MAX_ADDRESSES = 120;

export interface TradersPayload {
  fetchedAt: number;
  totalAccounts: number;
  candidates: Candidate[];
  stale?: boolean;
}
export interface PositionsPayload {
  fetchedAt: number;
  traders: number;
  steadyTraders: number;
  /** همهٔ پوزیشن‌های باز (تجمیع و فیلتر «فقط ثابت‌قدم‌ها» سمت کلاینت با aggregatePositions) */
  positions: TraderPosition[];
}
type SummaryBlob = Record<string, TraderSummary>;

const listKey = () => providerCacheKey('hl-leaderboard-v1');
const lastKey = () => providerCacheKey('hl-leaderboard-v1:last');
const summariesKey = () => providerCacheKey('hl-summaries-v1');
const positionsKey = () => providerCacheKey('hl-positions-v1');

let inflightList: Promise<TradersPayload> | null = null;
let inflightPositions: Promise<PositionsPayload> | null = null;

async function loadList(): Promise<TradersPayload> {
  const res = await fetch(LEADERBOARD_URL, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`leaderboard HTTP ${res.status}`);
  const rows = parseLeaderboard(JSON.parse(await res.text()));
  if (!rows.length) throw new Error('leaderboard empty');
  return { fetchedAt: Date.now(), totalAccounts: rows.length, candidates: selectCandidates(rows) };
}

/** فهرست برترین‌ها از کش یا منبع؛ در قطعی منبع آخرین نسخهٔ موفق با stale:true */
export async function getTradersList(): Promise<TradersPayload> {
  const cached = await readProviderCache<TradersPayload>(listKey());
  if (cached) return cached;
  try {
    inflightList ??= loadList().finally(() => { inflightList = null; });
    const payload = await inflightList;
    await Promise.all([writeProviderCache(listKey(), payload, FRESH_MS), writeProviderCache(lastKey(), payload, LAST_GOOD_MS)]);
    return payload;
  } catch (e) {
    const last = await readProviderCache<TradersPayload>(lastKey());
    if (last) return { ...last, stale: true };
    throw e;
  }
}

async function computeSummary(address: string): Promise<TraderSummary> {
  const [portfolio, fills] = await Promise.all([
    hlInfo<HlPortfolio>({ type: 'portfolio', user: address }),
    hlInfo<Fill[]>({ type: 'userFills', user: address, aggregateByTime: true })
  ]);
  return summarize(address, buildReport(Array.isArray(fills) ? fills : [], Array.isArray(portfolio) ? portfolio : null));
}

/** خلاصهٔ آدرس‌های داده‌شده؛ حداکثر `budget` خلاصهٔ تازه/کهنه را محاسبه می‌کند (به ترتیب درخواست) */
export async function getSummaries(addresses: string[], budget = SUMMARY_BATCH, now = Date.now()): Promise<{ summaries: SummaryBlob; pending: number }> {
  const blob = (await readProviderCache<SummaryBlob>(summariesKey())) ?? {};
  const due = addresses.filter((a) => !blob[a] || now - blob[a].computedAt > SUMMARY_FRESH_MS);
  const fresh = (await pool(due.slice(0, budget), 2, computeSummary)).filter((s): s is TraderSummary => !!s);
  if (fresh.length) {
    // ادغام با آخرین نسخه (درخواست هم‌زمان دیگری ممکن است نوشته باشد) و حذف خلاصه‌های خیلی کهنه
    const latest = (await readProviderCache<SummaryBlob>(summariesKey(), true)) ?? blob;
    const merged: SummaryBlob = {};
    for (const [a, s] of Object.entries({ ...latest, ...Object.fromEntries(fresh.map((s) => [s.address, s])) })) if (now - s.computedAt < SUMMARY_KEEP_MS) merged[a] = s;
    await writeProviderCache(summariesKey(), merged, SUMMARY_KEEP_MS);
    Object.assign(blob, merged);
  }
  const summaries: SummaryBlob = {};
  for (const a of addresses) if (blob[a]) summaries[a] = blob[a];
  return { summaries, pending: Math.max(0, due.length - fresh.length) };
}

/** گرم کردن خلاصهٔ برترین‌ها از تیک اعلان‌ها (بدون نیاز به باز بودن صفحه) */
export async function warmSummaries(budget = SUMMARY_BATCH): Promise<number> {
  const list = await getTradersList();
  return (await getSummaries(list.candidates.map((c) => c.address), budget)).pending;
}

async function loadPositions(): Promise<PositionsPayload> {
  const list = await getTradersList();
  const blob = (await readProviderCache<SummaryBlob>(summariesKey())) ?? {};
  const addresses = list.candidates.map((c) => c.address);
  const states = await pool(addresses, 6, (user) => hlInfo<HlAccountState>({ type: 'clearinghouseState', user }, 8_000));
  const positions = addresses.flatMap((a, i) => positionsOf(a, isSteady(blob[a]), states[i])).filter((p) => p.sizeUsd >= 1_000);
  return { fetchedAt: Date.now(), traders: states.filter(Boolean).length, steadyTraders: addresses.filter((a) => isSteady(blob[a])).length, positions };
}

async function getPositions(): Promise<PositionsPayload> {
  const cached = await readProviderCache<PositionsPayload>(positionsKey());
  if (cached) return cached;
  inflightPositions ??= loadPositions().finally(() => { inflightPositions = null; });
  const payload = await inflightPositions;
  if (payload.traders > 0) await writeProviderCache(positionsKey(), payload, POSITIONS_MS);
  return payload;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if ((req.method ?? 'GET') !== 'GET') {
    json(res, 405, { error: 'method_not_allowed' });
    return;
  }
  const params = new URL(req.url ?? '/', 'http://internal').searchParams;
  const op = params.get('op') ?? 'list';
  try {
    if (op === 'list') {
      const payload = await getTradersList();
      res.setHeader('Cache-Control', payload.stale ? 'no-store' : 'public, max-age=600, s-maxage=3600, stale-while-revalidate=21600');
      json(res, 200, payload);
      return;
    }
    if (op === 'summaries') {
      const addresses = [...new Set((params.get('addresses') ?? '').split(',').map((a) => a.trim().toLowerCase()).filter(isHlAddress))].slice(0, MAX_ADDRESSES);
      res.setHeader('Cache-Control', 'no-store');
      json(res, 200, addresses.length ? await getSummaries(addresses) : { summaries: {}, pending: 0 });
      return;
    }
    if (op === 'positions') {
      res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=300');
      json(res, 200, await getPositions());
      return;
    }
    json(res, 404, { error: 'unknown_op' });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    json(res, 502, { error: 'دادهٔ هایپرلیکوئید در دسترس نیست', detail: e instanceof Error ? e.message.slice(0, 120) : 'error' });
  }
}
