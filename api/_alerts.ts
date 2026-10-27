/** ============================================================
 * اعلان‌ها — قواعد، اشتراک‌های Web Push، بازوی بله (اختیاری) و بررسی دوره‌ای
 *
 *  • بررسی دوره‌ای (alerts-tick) را GitHub Actions رایگان هر ۱۰ دقیقه صدا می‌زند؛
 *    فقط با کلید زمان‌بند (هش SHA-256 در دیتابیس، مقایسهٔ زمان‌ثابت).
 *  • کلیدهای VAPID یک بار ساخته و در دیتابیس نگه داشته می‌شوند؛ تنظیم دستی لازم نیست.
 *  • همهٔ داده‌های بازار و حساب فقط‌خواندنی و عمومی‌اند (آدرس عمومی؛ بدون کلید خصوصی یا API Key).
 *  • بله فقط وقتی فعال است که BALE_BOT_TOKEN و BALE_CHAT_ID در Vercel تنظیم شده باشند.
 * ============================================================ */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NeonQueryFunction } from '@neondatabase/serverless';
import {
  arcusExposure,
  DEFAULT_RULES,
  evaluateFunding,
  evaluateLiquidation,
  fundingMessage,
  lighterExposures,
  liquidationMessage,
  sanitizeRules,
  type AlertRules,
  type LiqExposure,
  type LiqState
} from '../src/features/alerts/domain/rules.js';
import { getPerpsRead } from './_perpsRead.js';
import { hlInfo, pool } from './_hyperliquid.js';
import { warmSummaries } from './_tradersRoute.js';
import { readMemeScreen, warmMemeScreen } from './_memeScreen.js';
import { warmSwing } from './_swingScreen.js';
import { recordGold } from './_gold.js';
import { warmDivarCars } from './_divarCars.js';
import { sanitizeWatch, watchEvents, watchMessage, type MemeWatchState } from '../src/features/intel/domain/memeWatch.js';
import { followMessage, positionEvents, sanitizeSaved, shortAddr, type SavedTrader } from '../src/features/traders/domain/follow.js';
import type { Fill } from '../src/features/traders/domain/types.js';
import { generateVapidKeys, sendPush, validSubscription, type PushMessage, type PushSubscriptionRecord, type VapidKeys } from './_webpush.js';

const SYSTEM = '__system';
const LIGHTER = 'https://mainnet.zklighter.elliot.ai';
const ARCUS = 'https://api.arcus.xyz';
const ONDO = 'https://api.ondoperps.xyz';
const MIN_TICK_GAP_MS = 60_000;
/** سقف زمان کل تیک؛ زیر maxDuration=60 فانکشن services، با حاشیه برای ذخیرهٔ نتیجه */
const TICK_BUDGET_MS = 52_000;
const MAX_SUBSCRIPTIONS = 10;
const LOG_SIZE = 20;
/** اعلان تریدر دنبال‌شده در هر تیک برای هر کاربر */
const MAX_TRADER_ALERTS = 5;
/** بعد از قطعی طولانی تیک، فقط رویدادهای این بازهٔ اخیر اعلان می‌شوند (نه سیل اعلان قدیمی) */
const FOLLOW_LOOKBACK_MS = 3_600_000;

/** «آدرس‌های من» در حساب کاربر + آخرین fill دیده‌شدهٔ هر تریدر دنبال‌شده */
export interface TradersState { saved: SavedTrader[]; cursors: Record<string, number> }

export interface StoredSubscription extends PushSubscriptionRecord { label: string | null; createdAt: number }
export interface LogEntry { at: number; title: string; body: string; push: number; bale: 'sent' | 'off' | 'failed' }
export interface TickInfo { hash?: string; lastAt?: number; lastResult?: { users: number; sent: number; errors: string[] } }

export interface AlertsStore {
  get<T>(userId: string, key: string): Promise<T | null>;
  put(userId: string, key: string, payload: unknown): Promise<void>;
  subscriptions(userId: string): Promise<StoredSubscription[]>;
  addSubscription(userId: string, sub: PushSubscriptionRecord, label: string | null): Promise<void>;
  removeSubscription(userId: string, endpoint: string): Promise<void>;
  /** کاربرانی که قاعده یا تریدر دنبال‌شده دارند */
  users(): Promise<string[]>;
  holdings(userId: string): Promise<unknown[]>;
}

export function neonAlertsStore(sql: NeonQueryFunction<false, false>): AlertsStore {
  return {
    async get<T>(userId: string, key: string) {
      const rows = (await sql`SELECT payload FROM "alertsStore" WHERE "userId"=${userId} AND "key"=${key}`) as { payload: T }[];
      return rows[0]?.payload ?? null;
    },
    async put(userId, key, payload) {
      await sql`INSERT INTO "alertsStore" ("userId","key",payload,"updatedAt") VALUES (${userId},${key},${JSON.stringify(payload)}::jsonb,${Date.now()})
        ON CONFLICT ("userId","key") DO UPDATE SET payload=EXCLUDED.payload, "updatedAt"=EXCLUDED."updatedAt"`;
    },
    async subscriptions(userId) {
      const rows = (await sql`SELECT endpoint, p256dh, auth, label, "createdAt" FROM "pushSubscriptions" WHERE "userId"=${userId} ORDER BY "createdAt"`) as Record<string, unknown>[];
      return rows.map((r) => ({ endpoint: String(r.endpoint), p256dh: String(r.p256dh), auth: String(r.auth), label: r.label == null ? null : String(r.label), createdAt: Number(r.createdAt) }));
    },
    async addSubscription(userId, sub, label) {
      await sql`INSERT INTO "pushSubscriptions" ("userId",endpoint,p256dh,auth,label,"createdAt") VALUES (${userId},${sub.endpoint},${sub.p256dh},${sub.auth},${label},${Date.now()})
        ON CONFLICT ("userId",endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth, label=EXCLUDED.label`;
    },
    async removeSubscription(userId, endpoint) {
      await sql`DELETE FROM "pushSubscriptions" WHERE "userId"=${userId} AND endpoint=${endpoint}`;
    },
    async users() {
      const rows = (await sql`SELECT DISTINCT "userId" FROM "alertsStore" WHERE "key" IN ('rules','traders') AND "userId"<>${SYSTEM}`) as { userId: string }[];
      return rows.map((r) => r.userId);
    },
    async holdings(userId) {
      const rows = (await sql`SELECT payload FROM "custodyRecords" WHERE "userId"=${userId} AND collection='holdings'`) as { payload: unknown }[];
      return rows.map((r) => r.payload);
    }
  };
}

/* ---------------- کلیدها ---------------- */

export async function vapidKeys(store: AlertsStore): Promise<VapidKeys> {
  const saved = await store.get<VapidKeys>(SYSTEM, 'vapid');
  if (saved?.publicKey && saved.privateKey) return saved;
  const keys = generateVapidKeys();
  await store.put(SYSTEM, 'vapid', keys);
  return keys;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest();

/** کلید تازهٔ زمان‌بند؛ فقط یک بار نمایش داده می‌شود و فقط هشش ذخیره می‌شود */
export async function rotateTickKey(store: AlertsStore): Promise<string> {
  const key = randomBytes(32).toString('base64url');
  const info = (await store.get<TickInfo>(SYSTEM, 'tick')) ?? {};
  await store.put(SYSTEM, 'tick', { ...info, hash: sha256(key).toString('hex') });
  return key;
}

export async function verifyTickKey(store: AlertsStore, provided: string | undefined): Promise<boolean> {
  if (!provided || provided.length < 20 || provided.length > 200) return false;
  const hash = (await store.get<TickInfo>(SYSTEM, 'tick'))?.hash;
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return false;
  return timingSafeEqual(sha256(provided), Buffer.from(hash, 'hex'));
}

/* ---------------- ارسال ---------------- */

const PUSH_SUBJECT = 'mailto:alerts@dariiino.vercel.app';

async function sendBale(text: string): Promise<'sent' | 'off' | 'failed'> {
  const token = process.env.BALE_BOT_TOKEN?.trim(); const chat = process.env.BALE_CHAT_ID?.trim();
  if (!token || !chat) return 'off';
  if (!/^\d{3,15}:[A-Za-z0-9_-]{10,100}$/.test(token) || !/^-?\d{1,20}$/.test(chat)) return 'failed';
  try {
    const res = await fetch(`https://tapi.bale.ai/bot${token}/sendMessage`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: text.slice(0, 1000) })
    });
    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

export async function notify(store: AlertsStore, userId: string, msg: PushMessage): Promise<LogEntry> {
  const keys = await vapidKeys(store);
  let push = 0;
  for (const sub of await store.subscriptions(userId)) {
    const r = await sendPush(sub, msg, keys, PUSH_SUBJECT);
    if (r === 'sent') push++;
    else if (r === 'gone') await store.removeSubscription(userId, sub.endpoint);
  }
  const bale = await sendBale(`${msg.title}\n${msg.body}`);
  const entry: LogEntry = { at: Date.now(), title: msg.title, body: msg.body, push, bale };
  const log = (await store.get<LogEntry[]>(userId, 'log')) ?? [];
  await store.put(userId, 'log', [entry, ...log].slice(0, LOG_SIZE));
  return entry;
}

/* ---------------- دادهٔ بازار و حساب (فقط‌خواندنی) ---------------- */

async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as unknown;
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}
const num = (v: unknown) => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN; return Number.isFinite(n) ? n : null; };
const rows = (v: unknown) => (Array.isArray(v) ? v : []).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');

export interface MarketData {
  /** `venue:ref` → نرخ ساعتی */
  rates: Map<string, number>;
  /** آرکوس: BTC-USD → کسر مارجین نگهداری */
  arcusMmf: Map<string, number>;
}

export async function loadMarketData(need: { lighter: boolean; arcus: boolean; ondo: string[] }, errors: string[]): Promise<MarketData> {
  const rates = new Map<string, number>(); const arcusMmf = new Map<string, number>();
  const jobs: Promise<void>[] = [];
  if (need.lighter) jobs.push(getJson(`${LIGHTER}/api/v1/funding-rates`).then((d) => {
    for (const r of rows(d.funding_rates)) if (r.exchange === 'lighter' && num(r.rate) !== null) rates.set(`lighter:${num(r.market_id)}`, num(r.rate)! / 8);
  }).catch(() => { errors.push('lighter-rates'); }));
  if (need.arcus) jobs.push(getJson(`${ARCUS}/v1/markets`).then((d) => {
    for (const m of rows(d.markets)) {
      const name = String(m.marketDisplayName ?? '');
      if (num(m.fundingRate) !== null) rates.set(`arcus:${name}`, num(m.fundingRate)!);
      if (num(m.maintenanceMarginFraction) !== null) arcusMmf.set(name, num(m.maintenanceMarginFraction)!);
    }
  }).catch(() => { errors.push('arcus-markets'); }));
  for (const market of [...new Set(need.ondo)].filter((m) => /^[A-Z0-9]{1,20}-USD\.P$/.test(m)).slice(0, 15)) {
    jobs.push(getJson(`${ONDO}/v1/perps/funding_rates?${new URLSearchParams({ market })}`).then((d) => {
      const r = num((d.result as Record<string, unknown> | undefined)?.rate);
      if (r !== null) rates.set(`ondo:${market}`, r);
    }).catch(() => { errors.push('ondo-rates'); }));
  }
  await Promise.all(jobs);
  return { rates, arcusMmf };
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export async function loadExposures(holdings: unknown[], market: MarketData, errors: string[]): Promise<LiqExposure[]> {
  const out: LiqExposure[] = [];
  const active = holdings.map((h) => (h ?? {}) as Record<string, unknown>).filter((h) => !h.archivedAt);
  const jobs: Promise<void>[] = [];
  for (const h of active.slice(0, 20)) {
    const address = String(h.address ?? '');
    if (h.kind === 'platform' && (h.platformId === 'lighter-mainnet' || h.platformId === 'lighter-robinhood') && ADDRESS.test(address)) {
      const op = h.platformId === 'lighter-mainnet' ? 'lighter-mainnet-account' : 'lighter-account';
      jobs.push(getPerpsRead(op, address).then((d) => { out.push(...lighterExposures(String(h.platformId), address, d)); }).catch(() => { errors.push('lighter-account'); }));
    }
    const arcus = h.arcus as { env?: string; address?: string; accountIndex?: number } | undefined;
    if (arcus?.env === 'mainnet' && ADDRESS.test(String(arcus.address)) && Number.isInteger(arcus.accountIndex) && arcus.accountIndex! >= 0 && arcus.accountIndex! <= 9) {
      const q = new URLSearchParams({ address: String(arcus.address), accountIndex: String(arcus.accountIndex) });
      jobs.push(getJson(`${ARCUS}/v1/account?${q}`).then((d) => { out.push(...arcusExposure(String(arcus.address), arcus.accountIndex!, d, market.arcusMmf)); }).catch(() => { errors.push('arcus-account'); }));
    }
  }
  await Promise.all(jobs);
  return out;
}

/* ---------------- بررسی ---------------- */

export async function getRules(store: AlertsStore, userId: string): Promise<AlertRules> {
  return sanitizeRules((await store.get<AlertRules>(userId, 'rules')) ?? DEFAULT_RULES);
}

export interface CheckResult { sent: number; flips: number; nearLiquidation: number; exposures: number; errors: string[] }

/** قواعد یک کاربر را بررسی می‌کند، اعلان می‌فرستد و وضعیت را ذخیره می‌کند */
export async function checkUser(store: AlertsStore, userId: string, now = Date.now()): Promise<CheckResult> {
  const errors: string[] = [];
  const rules = await getRules(store, userId);
  const venues = new Set(rules.funding.flatMap((w) => [w.shortVenue, w.longVenue]));
  const holdings = rules.liquidation.enabled ? await store.holdings(userId) : [];
  const hasArcusHolding = holdings.some((h) => !!(h as { arcus?: unknown } | null)?.arcus);
  const market = await loadMarketData({
    lighter: venues.has('lighter'),
    arcus: venues.has('arcus') || hasArcusHolding,
    ondo: rules.funding.flatMap((w) => [w.shortVenue === 'ondo' ? w.shortRef : '', w.longVenue === 'ondo' ? w.longRef : '']).filter(Boolean)
  }, errors);

  let sent = 0;
  const { flips, next } = evaluateFunding(rules.funding, market.rates);
  for (const f of flips) { await notify(store, userId, { ...fundingMessage(f), url: '/calculators', tag: `funding-${f.watch.key}` }); sent++; }
  if (flips.length) await store.put(userId, 'rules', { ...rules, funding: next });

  let near = 0; let exposures = 0;
  if (rules.liquidation.enabled) {
    const list = await loadExposures(holdings, market, errors);
    exposures = list.length;
    const state = (await store.get<Record<string, LiqState>>(userId, 'state')) ?? {};
    const { alerts, next: nextState } = evaluateLiquidation(list, rules.liquidation.thresholdPct, state, now);
    for (const e of alerts) { await notify(store, userId, { ...liquidationMessage(e), url: e.key.startsWith('arcus') ? '/arcus' : '/lighter', tag: `liq-${e.key}` }); sent++; }
    near = alerts.length;
    // فقط خطای دریافت نداشته باشیم وضعیت را جایگزین می‌کنیم؛ وگرنه هشدار تکراری می‌شود
    if (!errors.some((e) => e.endsWith('-account'))) await store.put(userId, 'state', nextState);
  }
  sent += await checkFollowedTraders(store, userId, now, errors);
  sent += await checkMemeWatch(store, userId, errors);
  return { sent, flips: flips.length, nearLiquidation: near, exposures, errors: [...new Set(errors)] };
}

export async function getTradersState(store: AlertsStore, userId: string): Promise<TradersState> {
  const raw = await store.get<TradersState>(userId, 'traders');
  return { saved: sanitizeSaved(raw?.saved), cursors: raw?.cursors && typeof raw.cursors === 'object' ? raw.cursors : {} };
}

/** fillهای تازهٔ تریدرهای دنبال‌شده → یک اعلان برای هر تریدر (باز/بسته/برگشت/تغییر بزرگ) */
async function checkFollowedTraders(store: AlertsStore, userId: string, now: number, errors: string[]): Promise<number> {
  const state = await getTradersState(store, userId);
  const followed = state.saved.filter((s) => s.follow);
  if (!followed.length) return 0;
  const cursors = { ...state.cursors };
  const results = await pool(followed, 3, async (t) => {
    const since = cursors[t.address];
    if (!since) return { t, fills: null as Fill[] | null };
    const fills = await hlInfo<Fill[]>({ type: 'userFillsByTime', user: t.address, startTime: Math.max(since + 1, now - FOLLOW_LOOKBACK_MS), aggregateByTime: true });
    return { t, fills: Array.isArray(fills) ? fills : [] };
  });
  let sent = 0;
  for (const [i, r] of results.entries()) {
    const t = followed[i];
    if (!r) { errors.push('trader-fills'); continue; }
    if (!r.fills) { cursors[t.address] = now; continue; }
    if (r.fills.length) cursors[t.address] = Math.max(...r.fills.map((f) => f.time));
    const events = positionEvents(r.fills);
    if (!events.length || sent >= MAX_TRADER_ALERTS) continue;
    await notify(store, userId, { ...followMessage(t.label ?? shortAddr(t.address), events), url: `/intel?tab=traders&a=${t.address}`, tag: `trader-${t.address}` });
    sent++;
  }
  await store.put(userId, 'traders', { saved: state.saved, cursors });
  return sent;
}

/** فهرست انتظار میم‌کوین: کوینی که همهٔ فیلترها را رد کند و بازار هم صعودی باشد → یک اعلان */
async function checkMemeWatch(store: AlertsStore, userId: string, errors: string[]): Promise<number> {
  const state = await store.get<MemeWatchState>(userId, 'memeWatch');
  const ids = sanitizeWatch(state?.ids);
  if (!ids.length) return 0;
  const screen = await readMemeScreen().catch(() => null);
  if (!screen) { errors.push('meme-screen'); return 0; }
  const { alerts, next } = watchEvents(ids, screen, state?.last ?? {});
  for (const c of alerts) await notify(store, userId, { ...watchMessage(c), url: '/intel?tab=memes', tag: `meme-${c.id}` });
  await store.put(userId, 'memeWatch', { ids, last: next });
  return alerts.length;
}

/** ذخیرهٔ «آدرس‌های من» از هر دستگاه؛ تریدر تازه دنبال‌شده از «الان» پایش می‌شود، نه از گذشته */
export async function saveTraders(store: AlertsStore, userId: string, raw: unknown, now = Date.now()): Promise<SavedTrader[]> {
  const saved = sanitizeSaved(raw);
  const prev = await getTradersState(store, userId);
  const cursors: Record<string, number> = {};
  for (const s of saved) if (s.follow) cursors[s.address] = prev.cursors[s.address] ?? now;
  await store.put(userId, 'traders', { saved, cursors });
  return saved;
}

/** بررسی دوره‌ای همهٔ کاربران؛ اجرای پشت‌سرهم کمتر از یک دقیقه نادیده گرفته می‌شود */
export async function runTick(store: AlertsStore, now = Date.now()): Promise<{ skipped: boolean; users: number; sent: number }> {
  const info = (await store.get<TickInfo>(SYSTEM, 'tick')) ?? {};
  if (info.lastAt && now - info.lastAt < MIN_TICK_GAP_MS) return { skipped: true, users: 0, sent: 0 };
  await store.put(SYSTEM, 'tick', { ...info, lastAt: now });
  const users = await store.users();
  let sent = 0; const errors: string[] = [];
  for (const userId of users) {
    try {
      const r = await checkUser(store, userId, now);
      sent += r.sent; errors.push(...r.errors);
    } catch {
      errors.push('check-failed');
    }
  }
  // گرم‌کن‌های پس‌زمینه با بودجهٔ زمان: فانکشن ۶۰ ثانیه سقف دارد و قبلاً آخری‌ها (دیوار) هرگز نوبت نمی‌گرفتند.
  // هر کدام فقط وقتی اجرا می‌شود که به‌اندازهٔ سقف زمان خودش وقت مانده باشد؛ نماندن وقت = «skip-…» در lastResult
  const warmers: [string, number, () => Promise<unknown>][] = [
    // آگهی‌های خودروی داخلی دیوار تهران، چند صفحه در هر تیک (بازار خودرو)
    ['divar-cars', 11_000, () => warmDivarCars()],
    // رژیم بازار سوینگ و ثبت روزانهٔ کاندید آزمایشی (حتی وقتی کسی صفحه را باز نکرده)
    ['swing-warm', 14_000, () => warmSwing()],
    // حباب طلای ایران: ثبت روزانه برای آزمودن «ارزان/گران» در آینده
    ['gold-record', 16_000, () => recordGold()],
    // غربال میم‌کوین را چند کوین در هر تیک تازه می‌کند (سقف درخواست CoinGecko)
    ['meme-warm', 16_000, () => warmMemeScreen()],
    // خلاصهٔ کارنامهٔ چند تریدر برتر را هم گرم می‌کند تا فهرست بدون باز بودن صفحه آماده باشد
    ['traders-warm', 12_000, () => warmSummaries()]
  ];
  for (const [name, needMs, run] of warmers) {
    if (Date.now() - now + needMs > TICK_BUDGET_MS) { errors.push(`skip-${name}`); continue; }
    await run().catch(() => { errors.push(name); });
  }
  const latest = (await store.get<TickInfo>(SYSTEM, 'tick')) ?? info;
  await store.put(SYSTEM, 'tick', { ...latest, lastAt: now, lastResult: { users: users.length, sent, errors: [...new Set(errors)] } });
  return { skipped: false, users: users.length, sent };
}

export async function saveSubscription(store: AlertsStore, userId: string, raw: unknown, label: unknown): Promise<boolean> {
  const s = (raw ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const sub = { endpoint: String(s.endpoint ?? ''), p256dh: String(s.keys?.p256dh ?? ''), auth: String(s.keys?.auth ?? '') };
  if (!validSubscription(sub)) return false;
  const existing = await store.subscriptions(userId);
  if (existing.length >= MAX_SUBSCRIPTIONS && !existing.some((e) => e.endpoint === sub.endpoint)) await store.removeSubscription(userId, existing[0].endpoint);
  await store.addSubscription(userId, sub, typeof label === 'string' ? label.replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, 40) || null : null);
  return true;
}

/** وضعیت برای صفحهٔ اعلان‌ها — بدون کلید خصوصی یا endpoint کامل */
export async function status(store: AlertsStore, userId: string) {
  const [keys, subs, rules, tick, log] = await Promise.all([vapidKeys(store), store.subscriptions(userId), getRules(store, userId), store.get<TickInfo>(SYSTEM, 'tick'), store.get<LogEntry[]>(userId, 'log')]);
  return {
    vapidPublicKey: keys.publicKey,
    devices: subs.map((s) => ({ id: createHash('sha256').update(s.endpoint).digest('hex').slice(0, 16), label: s.label, host: new URL(s.endpoint).hostname, createdAt: s.createdAt })),
    rules,
    tick: { configured: !!tick?.hash, lastAt: tick?.lastAt ?? null, lastResult: tick?.lastResult ?? null },
    bale: !!(process.env.BALE_BOT_TOKEN && process.env.BALE_CHAT_ID),
    log: log ?? []
  };
}

/** حذف دستگاه با شناسهٔ کوتاه (endpoint کامل هرگز به کلاینت برنمی‌گردد) */
export async function removeDevice(store: AlertsStore, userId: string, id: string): Promise<boolean> {
  for (const s of await store.subscriptions(userId)) {
    if (createHash('sha256').update(s.endpoint).digest('hex').slice(0, 16) === id) { await store.removeSubscription(userId, s.endpoint); return true; }
  }
  return false;
}

/* ---------------- مسیرهای احراز‌شده ---------------- */

export const ALERT_OPS = ['alerts-status', 'alerts-rules', 'alerts-test', 'alerts-check', 'alerts-tick-key', 'push-subscribe', 'push-unsubscribe', 'traders-get', 'traders-put', 'memes-watch-get', 'memes-watch-put'] as const;

/** فقط با نشست معتبر؛ userId از نشست. پاسخ: [status, body] */
export async function handleAlertsOp(store: AlertsStore, op: string, method: string, userId: string, readBody: () => Promise<Record<string, unknown>>): Promise<[number, unknown]> {
  if (op === 'alerts-status' && method === 'GET') return [200, await status(store, userId)];
  if (op === 'traders-get' && method === 'GET') return [200, { saved: (await getTradersState(store, userId)).saved }];
  if (op === 'memes-watch-get' && method === 'GET') return [200, { ids: sanitizeWatch((await store.get<MemeWatchState>(userId, 'memeWatch'))?.ids) }];
  if (method !== 'POST') return [405, { error: 'روش درخواست مجاز نیست' }];
  const body = await readBody();
  switch (op) {
    case 'alerts-rules': {
      const rules = sanitizeRules(body.rules);
      await store.put(userId, 'rules', rules);
      return [200, { rules }];
    }
    case 'push-subscribe':
      return (await saveSubscription(store, userId, body.subscription, body.label)) ? [200, { ok: true }] : [400, { error: 'اشتراک اعلان معتبر نیست' }];
    case 'push-unsubscribe': {
      if (typeof body.endpoint === 'string') { await store.removeSubscription(userId, body.endpoint); return [200, { ok: true }]; }
      if (typeof body.id === 'string' && /^[0-9a-f]{16}$/.test(body.id)) return [200, { ok: await removeDevice(store, userId, body.id) }];
      return [400, { error: 'دستگاه مشخص نیست' }];
    }
    case 'alerts-test': {
      const e = await notify(store, userId, { title: 'اعلان آزمایشی دارینو', body: 'اگر این را می‌بینید، اعلان‌ها روی این دستگاه کار می‌کنند.', url: '/alerts', tag: 'test' });
      return [200, { push: e.push, bale: e.bale }];
    }
    case 'alerts-check':
      return [200, await checkUser(store, userId)];
    case 'traders-put':
      return [200, { saved: await saveTraders(store, userId, body.saved) }];
    case 'memes-watch-put': {
      const ids = sanitizeWatch(body.ids);
      const prev = (await store.get<MemeWatchState>(userId, 'memeWatch'))?.last ?? {};
      // کوین تازه با وضعیت فعلی‌اش شروع می‌شود تا اگر همین الان آماده است، اعلان «تازه» نرود
      const screen = await readMemeScreen().catch(() => null);
      const now = screen ? watchEvents(ids, screen, {}).next : {};
      const last: Record<string, boolean> = {};
      for (const id of ids) last[id] = prev[id] ?? now[id] ?? false;
      await store.put(userId, 'memeWatch', { ids, last });
      return [200, { ids }];
    }
    case 'alerts-tick-key':
      return [200, { key: await rotateTickKey(store) }];
    default:
      return [404, { error: 'درخواست ناشناخته' }];
  }
}
