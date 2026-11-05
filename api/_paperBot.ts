/** ============================================================
 * بات کاغذی کری — سرور (فقط دادهٔ عمومی؛ بدون کلید، کیف پول یا سفارش)
 *
 *  • روی همان تیک اعلان‌ها (GitHub Actions هر ۱۰ دقیقه) اجرا می‌شود؛ فقط وقتی ساعت تازه‌ای تسویه شده کار می‌کند.
 *  • دفتر هر کاربر در "alertsStore" با کلید paperBot؛ منطق کاملاً در src/features/carry-lab/domain/paper.ts
 *    (همان استپر بک‌تست) تا کاغذی و بک‌تست از یک کد بیایند.
 *  • ثبت ساعتیِ فاندینگ چند صرافی در جدول "fundingLog" — دیتاستی که بیشتر صرافی‌ها تاریخچه‌اش را نمی‌دهند.
 * ============================================================ */
import { db, isDbConfigured } from './_neon.js';
import { hlInfo, pool } from './_hyperliquid.js';
import type { AlertsStore } from './_alerts.js';
import type { PushMessage } from './_webpush.js';
import { carryClose, floorToHour, HOUR_MS, type FundingPoint, type PriceBar } from '../src/features/carry-lab/domain/engine.js';
import { usdText } from '../src/shared/utils/formatters.js';
import {
  advanceLeg,
  needsTick,
  newBook,
  PAPER_STRATEGIES,
  parseHlFunding,
  parseHourBars,
  parseLighterFunding,
  recordTick,
  summarize,
  type PaperBook,
  type PaperEvent,
  type PaperStrategy
} from '../src/features/carry-lab/domain/paper.js';

const LIGHTER = 'https://mainnet.zklighter.elliot.ai';
const ARCUS = 'https://api.arcus.xyz';
const KEY = 'paperBot';
const SYSTEM = '__system';
const WARM_HOURS = 170;
/** سقف عقب‌افتادگی در یک تیک (قطعی طولانی): بقیه در تیک‌های بعد */
const MAX_CATCHUP_HOURS = 24 * 14;
const NOTIFY_WINDOW_MS = 48 * HOUR_MS;

type Notify = (userId: string, msg: PushMessage) => Promise<unknown>;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ---------------- دریافت دادهٔ زنده ---------------- */

async function hlFunding(coin: string, since: number): Promise<FundingPoint[]> {
  const out: FundingPoint[] = [];
  let cursor = since;
  for (let page = 0; page < 4; page++) {
    const list = await hlInfo<unknown[]>({ type: 'fundingHistory', coin, startTime: cursor });
    out.push(...parseHlFunding(list));
    if (!Array.isArray(list) || list.length < 500) break;
    cursor = out[out.length - 1].hour + 1;
  }
  return out;
}

async function lighterFunding(marketId: string, since: number, now: number): Promise<FundingPoint[]> {
  const hours = Math.min(750, Math.ceil((now - since) / HOUR_MS) + 2);
  const q = new URLSearchParams({ market_id: marketId, resolution: '1h', start_timestamp: String(Math.floor(since / 1000)), end_timestamp: String(Math.floor(now / 1000)), count_back: String(hours) });
  return parseLighterFunding(await getJson(`${LIGHTER}/api/v1/fundings?${q}`)).filter((p) => p.hour >= since);
}

async function bars(st: PaperStrategy, since: number, now: number): Promise<PriceBar[]> {
  if (st.venue === 'hyperliquid') return parseHourBars(await hlInfo({ type: 'candleSnapshot', req: { coin: st.market, interval: '1h', startTime: since, endTime: now } }));
  const hours = Math.min(750, Math.ceil((now - since) / HOUR_MS) + 2);
  const q = new URLSearchParams({ market_id: st.market, resolution: '1h', start_timestamp: String(Math.floor(since / 1000)), end_timestamp: String(Math.floor(now / 1000)), count_back: String(hours) });
  return parseHourBars(await getJson(`${LIGHTER}/api/v1/candles?${q}`));
}

const funding = (st: PaperStrategy, since: number, now: number) => (st.venue === 'hyperliquid' ? hlFunding(st.market, since) : lighterFunding(st.market, since, now));

/* ---------------- دفتر ---------------- */

export async function getBook(store: AlertsStore, userId: string): Promise<PaperBook | null> {
  const b = await store.get<PaperBook | null>(userId, KEY);
  return b && b.version === 1 ? b : null;
}

export async function startBook(store: AlertsStore, userId: string, capitalUsd: number, now = Date.now()): Promise<PaperBook> {
  const since = floorToHour(now) - WARM_HOURS * HOUR_MS;
  const warm = await Promise.all(PAPER_STRATEGIES.map((st) => funding(st, since, now).catch(() => [] as FundingPoint[])));
  const book = newBook(capitalUsd, Object.fromEntries(PAPER_STRATEGIES.map((st, i) => [st.id, warm[i]])), now);
  await store.put(userId, KEY, book);
  return book;
}

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}٪`;
const usd = (v: number) => usdText(Math.round(v), { plain: true });

function message(ev: PaperEvent, book: PaperBook): PushMessage | null {
  const st = PAPER_STRATEGIES.find((s) => s.id === ev.strategy);
  if (!st) return null;
  const share = book.capitalUsd / PAPER_STRATEGIES.length;
  const base = { url: '/carry-lab?tab=bot', tag: `paper-${ev.strategy}-${ev.kind}` };
  switch (ev.kind) {
    case 'enter':
      return { ...base, title: `بات کاغذی: ورود ${st.label}`, body: `اسپات لانگ + پرپ شورت ${st.cost.leverage}× در قیمت ${ev.price?.toLocaleString('en-US')}؛ هر پا حدود ${usd((ev.amount ?? 0) * share)}` };
    case 'exit':
      return { ...base, title: `بات کاغذی: خروج ${st.label}`, body: 'میانگین فاندینگ ۷ روزه به صفر یا زیر آن رسید؛ پوزیشن بسته شد و سرمایه در استیبل است.' };
    case 'liquidation':
      return { ...base, title: `بات کاغذی: لیکوئید ${st.label}`, body: `پای شورت در ${ev.price?.toLocaleString('en-US')} لیکوئید شد؛ زیان حدود ${pct(ev.amount ?? 0, 2)} سرمایهٔ این پا.` };
    case 'near-liquidation':
      return { ...base, title: `بات کاغذی: نزدیک لیکوئید ${st.label}`, body: `${pct(ev.amount ?? 0, 0)} فاصلهٔ لیکوئید مصرف شد (قیمت ${ev.price?.toLocaleString('en-US')}). در حالت واقعی این‌جا مارجین اضافه می‌شد.` };
    default:
      return null;
  }
}

/** یک دفتر را تا آخرین ساعت تسویه‌شده جلو می‌برد */
export async function advanceBook(book: PaperBook, now = Date.now()): Promise<PaperEvent[]> {
  const errors: string[] = [];
  const events: PaperEvent[] = [];
  await pool([...PAPER_STRATEGIES], 2, async (st) => {
    const leg = book.legs[st.id];
    if (!leg) return;
    const last = leg.state.lastHour ?? floorToHour(now) - 2 * HOUR_MS;
    const since = Math.max(last + 1, now - MAX_CATCHUP_HOURS * HOUR_MS);
    const barSince = (leg.state.lastBarEnd ?? last - HOUR_MS) - HOUR_MS;
    try {
      const [f, b] = await Promise.all([funding(st, since, now), bars(st, barSince, now)]);
      events.push(...advanceLeg(leg, st, f, b, now));
    } catch {
      errors.push(st.id);
    }
  });
  recordTick(book, events, now, errors);
  return events;
}

/* ---------------- ثبت فاندینگ چند صرافی ---------------- */

const LOG_MARKETS: { venue: 'hyperliquid' | 'lighter' | 'arcus'; market: string }[] = [
  ...['BTC', 'ETH', 'SOL', 'HYPE', 'PAXG', 'xyz:GOLD'].map((market) => ({ venue: 'hyperliquid' as const, market })),
  ...['1', '0', '2', '24', '48', '92'].map((market) => ({ venue: 'lighter' as const, market })),
  ...['BTC-USD', 'ETH-USD', 'SOL-USD'].map((market) => ({ venue: 'arcus' as const, market }))
];

const parseArcus = (body: unknown): FundingPoint[] => {
  const list = (body as { fundingRates?: unknown } | null)?.fundingRates;
  return (Array.isArray(list) ? list : []).flatMap((f: { fundingRate?: unknown; time?: unknown }) => {
    const rate = Number(f.fundingRate);
    const t = typeof f.time === 'string' || typeof f.time === 'number' ? String(f.time) : '';
    return Number.isFinite(rate) && /^\d{13,17}$/.test(t) ? [{ hour: floorToHour(Number(BigInt(t) / 1000n)), rate }] : [];
  });
};

/** زمان‌بند GitHub در عمل گاهی ۸ ساعت یا بیشتر فاصله می‌اندازد → از آخرین ساعت ثبت‌شده جبران (تا ۷۲ ساعت) */
const LOG_CATCHUP_HOURS = 72;

/** هر ساعت حداکثر یک بار: از آخرین ساعت ثبت‌شده (با همپوشانی ۲ ساعته) تا الان؛ upsert */
export async function logFunding(store: AlertsStore, now = Date.now()): Promise<number> {
  if (!isDbConfigured()) return 0;
  const hour = floorToHour(now);
  const info = (await store.get<{ lastHour?: number }>(SYSTEM, 'fundingLog')) ?? {};
  if (info.lastHour === hour) return 0;
  const since = Math.max(hour - LOG_CATCHUP_HOURS * HOUR_MS, (info.lastHour ?? 0) - 2 * HOUR_MS);
  const sql = db();
  const got = await pool(LOG_MARKETS, 4, async (m) => {
    const pts =
      m.venue === 'hyperliquid'
        ? await hlInfo<unknown[]>({ type: 'fundingHistory', coin: m.market, startTime: since }).then(parseHlFunding)
        : m.venue === 'lighter'
          ? await lighterFunding(m.market, since, now)
          : parseArcus(await getJson(`${ARCUS}/v1/fundingRates?market=${encodeURIComponent(m.market)}&limit=${LOG_CATCHUP_HOURS + 4}`));
    const fresh = pts.filter((p) => p.hour >= since && p.hour <= hour);
    if (!fresh.length) return 0;
    // یک کوئری برای هر بازار (نه یکی برای هر ساعت): جبران ۷۲ ساعته × ۱۵ بازار ≈ ۱۰۰۰ ردیف بود و تیک را از سقف ۶۰ ثانیه رد می‌کرد
    await sql`INSERT INTO "fundingLog" (venue, market, hour, rate)
      SELECT ${m.venue}::text, ${m.market}::text, h, r FROM unnest(${fresh.map((p) => p.hour)}::bigint[], ${fresh.map((p) => p.rate)}::float8[]) AS t(h, r)
      ON CONFLICT (venue, market, hour) DO UPDATE SET rate = EXCLUDED.rate`;
    return fresh.length;
  });
  await store.put(SYSTEM, 'fundingLog', { lastHour: hour, at: now });
  return got.reduce<number>((a, n) => a + (n ?? 0), 0);
}

/* ---------------- تیک ---------------- */

/** همهٔ دفترهای فعال؛ اعلان فقط برای ورود، خروج، لیکوئید و نزدیک لیکوئید */
export async function runPaperBots(store: AlertsStore, notify: Notify, now = Date.now()): Promise<{ books: number; events: number }> {
  await logFunding(store, now).catch(() => 0);
  if (!isDbConfigured()) return { books: 0, events: 0 };
  const users = ((await db()`SELECT "userId" FROM "alertsStore" WHERE "key"=${KEY} AND payload <> 'null'::jsonb`) as { userId: string }[]).map((r) => r.userId);
  let total = 0;
  for (const userId of users) {
    const book = await getBook(store, userId);
    if (!book || !needsTick(book, now)) continue;
    const events = await advanceBook(book, now);
    await store.put(userId, KEY, book);
    total += events.length;
    // زمان‌بند ممکن است ساعت‌ها دیر بیاید: رویدادهای ۴۸ ساعت اخیر اعلان می‌شوند (با ذکر تأخیر)،
    // هر نوع رویداد هر پا فقط آخرینش، تا بعد از قطعی سیل اعلان نیاید
    const latest = new Map<string, PaperEvent>();
    for (const ev of events) if (now - ev.at < NOTIFY_WINDOW_MS) latest.set(`${ev.strategy}:${ev.kind}`, ev);
    for (const ev of [...latest.values()].sort((a, b) => a.at - b.at)) {
      const msg = message(ev, book);
      if (!msg) continue;
      const lagH = Math.floor((now - ev.at) / HOUR_MS);
      await notify(userId, lagH >= 2 ? { ...msg, body: `${msg.body} (${lagH} ساعت پیش؛ زمان‌بند دیر اجرا شد)` } : msg).catch(() => undefined);
    }
  }
  return { books: users.length, events: total };
}

/* ---------------- مسیرهای احراز‌شده ---------------- */

export const PAPER_OPS = ['paper-status', 'paper-start', 'paper-stop', 'paper-reset'] as const;

export async function handlePaperOp(store: AlertsStore, op: string, method: string, userId: string, readBody: () => Promise<Record<string, unknown>>): Promise<[number, unknown]> {
  const tick = await store.get<{ lastAt?: number; hash?: string }>(SYSTEM, 'tick');
  const tickInfo = { configured: !!tick?.hash, lastAt: tick?.lastAt ?? null };
  if (op === 'paper-status' && method === 'GET') {
    const book = await getBook(store, userId);
    return [200, { book, summary: book ? summarize(book, Date.now()) : null, tick: tickInfo }];
  }
  if (method !== 'POST') return [405, { error: 'روش درخواست مجاز نیست' }];
  const body = await readBody();
  if (op === 'paper-start') {
    const cap = Number(body.capitalUsd);
    if (!Number.isFinite(cap) || cap < 100 || cap > 10_000_000) return [400, { error: 'سرمایهٔ مجازی باید بین ۱۰۰ و ۱۰ میلیون دلار باشد' }];
    const existing = await getBook(store, userId);
    if (existing?.running) return [409, { error: 'بات کاغذی همین الان در حال اجراست' }];
    const book = await startBook(store, userId, cap);
    return [200, { book, summary: summarize(book, Date.now()), tick: tickInfo }];
  }
  if (op === 'paper-stop') {
    const book = await getBook(store, userId);
    if (!book) return [404, { error: 'باتی در حال اجرا نیست' }];
    // بستن مجازی پوزیشن‌های باز با هزینهٔ خروج، تا عدد نهایی واقعی باشد
    if (book.running) for (const st of PAPER_STRATEGIES) carryClose(book.legs[st.id].state, st.cost, Date.now());
    book.running = false;
    await store.put(userId, KEY, book);
    return [200, { book, summary: summarize(book, Date.now()), tick: tickInfo }];
  }
  if (op === 'paper-reset') {
    await store.put(userId, KEY, null);
    return [200, { book: null, summary: null, tick: tickInfo }];
  }
  return [404, { error: 'درخواست ناشناخته' }];
}
