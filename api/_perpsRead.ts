/** Fixed public GET destinations. No SDK, signing, cookies or upstream credentials. */
import { ProviderError } from './_zerion.js';
const MAINNET='https://mainnet.zklighter.elliot.ai';
const LIGHTER = 'https://api.rh.lighter.xyz';
const ONDO = 'https://api.ondoperps.xyz';
/** پاسخ لایتر برای آدرسی که هیچ حسابی ندارد: HTTP 400 با {"code":21100,"message":"account not found"} */
const LIGHTER_ACCOUNT_NOT_FOUND = 21100;
async function read(url: string, timeoutMs = 8000): Promise<Record<string, unknown>> {
  const response = await fetch(url, { method: 'GET', headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  if (response.status === 400) {
    const body = await response.json().catch(() => null) as { code?: unknown } | null;
    if (body?.code === LIGHTER_ACCOUNT_NOT_FOUND) throw new ProviderError(404, 'حسابی برای این آدرس پیدا نشد');
  }
  if (!response.ok) throw new ProviderError(response.status === 429 ? 429 : 502, 'دریافت اطلاعات پلتفرم انجام نشد');
  const raw: unknown = await response.json();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ProviderError(502, 'پاسخ پلتفرم معتبر نیست');
  const data = raw as Record<string, unknown>;
  if (!data || typeof data !== 'object' || Array.isArray(data) || (data.code !== undefined && data.code !== 200 && data.code !== 0) || data.success === false) throw new ProviderError(502, 'پاسخ پلتفرم معتبر نیست');
  return data;
}
type Row = Record<string, unknown>;
const asRow = (v: unknown): Row => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const fin = (v: unknown): number | null => {
  if ((typeof v !== 'number' && typeof v !== 'string') || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export interface OndoPublicMarket {
  market: string; base: string; name: string; tags: string[];
  /** کسری (0.00025 = ۰٫۰۲۵٪) */
  makerFee: number | null; takerFee: number | null;
  maxLeverage: number | null; maintenanceMarginRate: number | null; markPrice: number | null;
}
/** Only the public fields the calculators need — the raw payload is ~240KB. */
export function trimOndoMarkets(markets: unknown, prices: unknown): OndoPublicMarket[] {
  const marks = asRow(asRow(prices).result);
  const pairs = asRow(asRow(asRow(markets).result).perps).tradingPairs;
  return (Array.isArray(pairs) ? pairs : []).map(asRow).flatMap((m) => {
    const market = typeof m.market === 'string' ? m.market : '';
    const base = String(asRow(m.pair).base ?? '');
    if (!/^[A-Z0-9]{1,20}-USD\.P$/.test(market) || !/^[A-Z0-9]{1,20}$/.test(base)) return [];
    const tier = asRow(Array.isArray(m.marginInfo) ? m.marginInfo[0] : null);
    return [{
      market, base, name: String(m.longName ?? base).slice(0, 80),
      tags: (Array.isArray(m.tags) ? m.tags : []).filter((t): t is string => typeof t === 'string').slice(0, 5),
      makerFee: fin(m.makerFee), takerFee: fin(m.takerFee),
      maxLeverage: fin(tier.maxLeverage), maintenanceMarginRate: fin(tier.maintenanceMarginRate),
      markPrice: fin(asRow(marks[market]).markPrice)
    }];
  });
}
let ondoPublic: { at: number; data: { markets: OndoPublicMarket[]; fetchedAt: number } } | null = null;
let ondoConfig: { at: number; raw: Record<string, unknown> } | null = null;
/**
 * Public market config for unauthenticated calculators. The ~200KB /v1/markets payload sometimes takes >8s,
 * so it gets a longer timeout and a 10-minute cache (fees/margins rarely change); mark prices refresh each minute.
 * On an upstream failure the last good answer (≤ 30 min old) is served instead of a 502.
 */
export async function getOndoPublicMarkets(): Promise<{ markets: OndoPublicMarket[]; fetchedAt: number }> {
  if (ondoPublic && Date.now() - ondoPublic.at < 60_000) return ondoPublic.data;
  try {
    const configFresh = ondoConfig && Date.now() - ondoConfig.at < 10 * 60_000;
    const [markets, prices] = await Promise.all([configFresh ? Promise.resolve(ondoConfig!.raw) : read(`${ONDO}/v1/markets`, 20_000), read(`${ONDO}/v1/perps/mark_prices`, 15_000)]);
    if (!configFresh) ondoConfig = { at: Date.now(), raw: markets };
    const data = { markets: trimOndoMarkets(markets, prices), fetchedAt: Date.now() };
    if (!data.markets.length) throw new ProviderError(502, 'پاسخ پلتفرم معتبر نیست');
    ondoPublic = { at: data.fetchedAt, data };
    return data;
  } catch (e) {
    if (ondoPublic && Date.now() - ondoPublic.at < 30 * 60_000) return ondoPublic.data;
    throw e;
  }
}
const ONDO_MARKET_RE = /^[A-Z0-9]{1,20}-USD\.P$/;
const publicCache = new Map<string, { at: number; data: unknown }>();
async function cachedPublic<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = publicCache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T;
  const data = await load();
  if (publicCache.size > 400) publicCache.clear();
  publicCache.set(key, { at: Date.now(), data });
  return data;
}
/** Settled hourly funding for the last 30 days: [{t: epoch ms, r: hourly fraction}] — public, no credentials. */
export async function getOndoFundingHistory(market: string): Promise<{ market: string; rates: { t: number; r: number }[] }> {
  if (!ONDO_MARKET_RE.test(market)) throw new ProviderError(400, 'بازار نامعتبر است');
  return cachedPublic(`h:${market}`, 10 * 60_000, async () => {
    const q = new URLSearchParams({ market, limit: '720', startTime: String(Date.now() - 30 * 86_400_000) });
    const data = await read(`${ONDO}/v1/perps/funding_rate_history?${q}`, 15_000);
    const rates = (Array.isArray(data.result) ? data.result : []).map(asRow).flatMap((x) => {
      const t = Date.parse(String(x.time ?? ''));
      const r = fin(x.fundingRate);
      return Number.isFinite(t) && r !== null ? [{ t, r }] : [];
    });
    return { market, rates };
  });
}
type Level = [number, number];
const levels = (v: unknown): Level[] =>
  (Array.isArray(v) ? v : []).slice(0, 100).flatMap((l) => {
    const p = Array.isArray(l) ? fin(l[0]) : null;
    const s = Array.isArray(l) ? fin(l[1]) : null;
    return p !== null && s !== null && p > 0 && s > 0 ? [[p, s] as Level] : [];
  });
/** Public order book (100 levels per side) for slippage estimates. */
export async function getOndoDepth(market: string): Promise<{ market: string; bids: Level[]; asks: Level[] }> {
  if (!ONDO_MARKET_RE.test(market)) throw new ProviderError(400, 'بازار نامعتبر است');
  return cachedPublic(`d:${market}`, 15_000, async () => {
    const data = await read(`${ONDO}/v1/perps/depth?${new URLSearchParams({ market, depth: '100' })}`, 15_000);
    const book = asRow(data.result);
    return { market, bids: levels(book.bids), asks: levels(book.asks) };
  });
}
/* ---------------- QFEX (public market data; api.qfex.com has no CORS for browsers) ---------------- */
const QFEX = 'https://api.qfex.com';
const QFEX_MARKET_RE = /^[A-Z0-9]{1,20}-[A-Z]{3}$/;
export interface QfexPublicMarket {
  market: string; base: string;
  /** refdata product_category: EQUITY · COMMODITY · INDEX · FX */
  category: string;
  maxLeverage: number | null;
  /** last trade (REST has no mark price) → index price */
  markPrice: number | null;
  /** current-window hourly fraction; positive = longs pay (matches premium sign) */
  fundingHourly: number | null;
  volume24hUsd: number | null;
}
/** contracts (price, funding, volume) + refdata (status, category, leverage) → only active perps */
export function trimQfexMarkets(contracts: unknown, refdata: unknown): QfexPublicMarket[] {
  const ref = new Map((Array.isArray(asRow(refdata).data) ? (asRow(refdata).data as unknown[]) : []).map(asRow).map((r) => [String(r.symbol ?? ''), r]));
  return (Array.isArray(asRow(contracts).data) ? (asRow(contracts).data as unknown[]) : []).map(asRow).flatMap((c) => {
    const market = typeof c.ticker_id === 'string' ? c.ticker_id : '';
    const r = ref.get(market);
    const base = String(c.base_currency ?? '');
    if (!QFEX_MARKET_RE.test(market) || !/^[A-Z0-9]{1,20}$/.test(base) || !r || r.status !== 'ACTIVE' || c.product_type !== 'Perpetual') return [];
    return [{
      market, base, category: String(r.product_category ?? '').slice(0, 20),
      maxLeverage: fin(r.default_max_leverage),
      markPrice: fin(c.last_price) || fin(c.index_price),
      fundingHourly: Number(c.funding_interval_minutes) === 60 ? fin(c.funding_rate) : null,
      volume24hUsd: fin(c.target_volume)
    }];
  });
}
let qfexPublic: { at: number; data: { markets: QfexPublicMarket[]; fetchedAt: number } } | null = null;
/** Same caching contract as Ondo: 30s fresh, last good answer (≤ 30 min) on upstream failure. */
export async function getQfexPublicMarkets(): Promise<{ markets: QfexPublicMarket[]; fetchedAt: number }> {
  if (qfexPublic && Date.now() - qfexPublic.at < 30_000) return qfexPublic.data;
  try {
    const [contracts, refdata] = await Promise.all([read(`${QFEX}/md/contracts`, 15_000), read(`${QFEX}/refdata`, 15_000)]);
    const data = { markets: trimQfexMarkets(contracts, refdata), fetchedAt: Date.now() };
    if (!data.markets.length) throw new ProviderError(502, 'پاسخ پلتفرم معتبر نیست');
    qfexPublic = { at: data.fetchedAt, data };
    return data;
  } catch (e) {
    if (qfexPublic && Date.now() - qfexPublic.at < 30 * 60_000) return qfexPublic.data;
    throw e;
  }
}
/** Settled hourly funding, last 30 days: [{t: epoch ms, r: hourly fraction}] — same shape as Ondo. */
export async function getQfexFundingHistory(market: string): Promise<{ market: string; rates: { t: number; r: number }[] }> {
  if (!QFEX_MARKET_RE.test(market)) throw new ProviderError(400, 'بازار نامعتبر است');
  return cachedPublic(`qh:${market}`, 10 * 60_000, async () => {
    const to = new Date();
    const q = new URLSearchParams({ intervalMinutes: '60', fromISO: new Date(to.getTime() - 30 * 86_400_000).toISOString(), toISO: to.toISOString() });
    const data = await read(`${QFEX}/funding/${market}?${q}`, 15_000);
    const rates = (Array.isArray(data.data) ? data.data : []).map(asRow).flatMap((x) => {
      const t = Date.parse(String(x.windowStart ?? ''));
      const r = fin(x.rate);
      return Number.isFinite(t) && r !== null ? [{ t, r }] : [];
    });
    return { market, rates };
  });
}
/** Public order book; QFEX lists empty price levels too, so they are dropped before the 100-level cap. */
export async function getQfexDepth(market: string): Promise<{ market: string; bids: Level[]; asks: Level[] }> {
  if (!QFEX_MARKET_RE.test(market)) throw new ProviderError(400, 'بازار نامعتبر است');
  return cachedPublic(`qd:${market}`, 15_000, async () => {
    const data = await read(`${QFEX}/md/orderbook/${market}`, 15_000);
    const side = (v: unknown) => levels((Array.isArray(v) ? v : []).filter((l) => Array.isArray(l) && Number(l[1]) > 0));
    return { market, bids: side(data.bids), asks: side(data.asks) };
  });
}
/**
 * تاریخچهٔ سود/زیان معاملات یک زیرحساب لایتر (عمومی، بدون امضا)
 * trade_pnl تجمعی از ایجاد حساب است و آخرین نقطه «اکنون» است (شامل سود/زیان باز، فاندینگ و کارمزد).
 * فقط [زمان ثانیه، trade_pnl] برگردانده می‌شود: ساعتی ۷ روز + روزانه ۳۱ روز.
 */
export async function getLighterPnl(op: string, index: string): Promise<{ hourly: [number, number][]; daily: [number, number][]; fetchedAt: number }> {
  if (!['lighter-pnl', 'lighter-mainnet-pnl'].includes(op)) throw new ProviderError(400, 'درخواست ناشناخته');
  if (!/^\d{1,18}$/.test(index)) throw new ProviderError(400, 'شمارهٔ حساب معتبر نیست');
  const host = op === 'lighter-mainnet-pnl' ? MAINNET : LIGHTER;
  const now = Math.floor(Date.now() / 1000);
  const series = async (resolution: '1h' | '1d', seconds: number, count: number) => {
    const query = new URLSearchParams({ by: 'index', value: index, resolution, start_timestamp: String(now - seconds), end_timestamp: String(now), count_back: String(count) });
    const data = await read(`${host}/api/v1/pnl?${query}`);
    if (!Array.isArray(data.pnl)) throw new ProviderError(502, 'پاسخ سود و زیان معتبر نیست');
    return data.pnl.map(asRow).flatMap((p): [number, number][] => {
      const t = fin(p.timestamp), v = fin(p.trade_pnl);
      return t === null || v === null ? [] : [[t, v]];
    });
  };
  const [hourly, daily] = await Promise.all([series('1h', 7 * 86400 + 3600, 170), series('1d', 31 * 86400, 33)]);
  return { hourly, daily, fetchedAt: Date.now() };
}
/** خلاصهٔ هر معاملهٔ لایتر از دید یک حساب — همان شکل LighterTradeLite در src/features/journal/domain/fills.ts */
export interface LighterTradeLite {
  id: string; t: number; sym: string; side: 'buy' | 'sell'; px: number; sz: number; usd: number;
  fee: number | null; pnl: number | null; before: number | null; maker: boolean; liq: boolean;
}

/**
 * یک معاملهٔ خام لایتر → دید همین حساب. سمت از bid/ask، نقش از is_maker_ask، پوزیشن قبل از maker/taker_position_size_before،
 * سود بسته‌شده از {bid|ask}_account_pnl (فقط وقتی پوزیشن کم شده). کارمزد لایتر به میلیونیم (ppm) است.
 * لایتر فیلد کارمزد صفر را حذف می‌کند (حساب‌های استاندارد بدون کارمزدند؛ در فید عمومی کارمزد غیرصفر دیده می‌شود)، پس نبودِ فیلد = صفر.
 */
export function trimLighterTrade(raw: unknown, index: string): LighterTradeLite | null {
  const t = asRow(raw);
  const bid = String(t.bid_account_id ?? '') === index;
  const ask = String(t.ask_account_id ?? '') === index;
  if (bid === ask) return null; // خودمعامله یا نامربوط
  const px = fin(t.price), sz = fin(t.size), time = fin(t.timestamp);
  const sym = typeof t.market_symbol === 'string' ? t.market_symbol : '';
  if (px === null || sz === null || time === null || !sym || (t.market_kind !== undefined && t.market_kind !== 'perps')) return null;
  const makerIsAsk = t.is_maker_ask === true;
  const maker = ask ? makerIsAsk : !makerIsAsk;
  const role = maker ? 'maker' : 'taker';
  const before = fin(t[`${role}_position_size_before`]);
  const rate = fin(t[`${role}_fee`]);
  const usd = fin(t.usd_amount) ?? px * sz;
  const pnl = fin(t[bid ? 'bid_account_pnl' : 'ask_account_pnl']);
  return {
    id: String(t.trade_id_str ?? t.trade_id ?? `${time}:${px}:${sz}`),
    t: time, sym, side: bid ? 'buy' : 'sell', px, sz, usd,
    fee: ((rate ?? 0) * usd) / 1e6,
    pnl, before, maker,
    liq: t.type === 'liquidation' || t.type === 'deleverage'
  };
}

/**
 * تاریخچهٔ معاملات یک زیرحساب لایتر (عمومی، بدون امضا) — جدیدترین اول، با cursor.
 * هر درخواست حداکثر ۲۰ صفحهٔ ۱۰۰تایی؛ وقتی به `since` (ms) برسد یا صفحه‌ها تمام شود complete=true.
 * کلاینت با next ادامه می‌دهد تا سهمیهٔ درخواست کاربر رعایت شود.
 */
export async function getLighterTrades(op: string, index: string, sinceMs: number, cursor: string): Promise<{ trades: LighterTradeLite[]; next: string | null; complete: boolean; fetchedAt: number }> {
  if (!['lighter-trades', 'lighter-mainnet-trades'].includes(op)) throw new ProviderError(400, 'درخواست ناشناخته');
  if (!/^\d{1,18}$/.test(index)) throw new ProviderError(400, 'شمارهٔ حساب معتبر نیست');
  if (cursor && !/^[A-Za-z0-9+/=_-]{1,400}$/.test(cursor)) throw new ProviderError(400, 'ادامهٔ صفحه معتبر نیست');
  const host = op === 'lighter-mainnet-trades' ? MAINNET : LIGHTER;
  const out: LighterTradeLite[] = [];
  let next = cursor;
  const started = Date.now();
  // سقف زمانی هر درخواست تا فانکشن سرور به مهلت نخورد؛ بقیه با next در درخواست بعدی
  for (let page = 0; page < 20 && Date.now() - started < 7_000; page++) {
    const q = new URLSearchParams({ sort_by: 'timestamp', limit: '100', account_index: index });
    if (next) q.set('cursor', next);
    const data = await read(`${host}/api/v1/trades?${q}`, 10_000);
    const rows = Array.isArray(data.trades) ? data.trades : [];
    let reachedSince = false;
    for (const r of rows) {
      const lite = trimLighterTrade(r, index);
      if (!lite) continue;
      if (lite.t < sinceMs) { reachedSince = true; continue; }
      out.push(lite);
    }
    const c = typeof data.next_cursor === 'string' && data.next_cursor ? data.next_cursor : null;
    if (reachedSince || !c || rows.length < 100) return { trades: out, next: null, complete: true, fetchedAt: Date.now() };
    if (c === next) break;
    next = c;
  }
  return { trades: out, next: next || null, complete: false, fetchedAt: Date.now() };
}

/** سری روزانهٔ حساب لایتر تا ۱۸۰ روز: [ثانیه، trade_pnl تجمعی، حجم روز] — برای دفتر دلتا نوترال */
export async function getLighterDaily(op: string, index: string, days: number): Promise<{ daily: [number, number, number][]; fetchedAt: number }> {
  if (!['lighter-daily', 'lighter-mainnet-daily'].includes(op)) throw new ProviderError(400, 'درخواست ناشناخته');
  if (!/^\d{1,18}$/.test(index)) throw new ProviderError(400, 'شمارهٔ حساب معتبر نیست');
  const span = Math.min(Math.max(Math.floor(days) || 90, 1), 180);
  const host = op === 'lighter-mainnet-daily' ? MAINNET : LIGHTER;
  const now = Math.floor(Date.now() / 1000);
  const q = new URLSearchParams({ by: 'index', value: index, resolution: '1d', start_timestamp: String(now - span * 86400), end_timestamp: String(now), count_back: String(span + 2) });
  const data = await read(`${host}/api/v1/pnl?${q}`);
  if (!Array.isArray(data.pnl)) throw new ProviderError(502, 'پاسخ سود و زیان معتبر نیست');
  const daily = data.pnl.map(asRow).flatMap((p): [number, number, number][] => {
    const t = fin(p.timestamp), v = fin(p.trade_pnl), vol = fin(p.volume);
    return t === null || v === null ? [] : [[t, v, vol ?? 0]];
  });
  return { daily, fetchedAt: Date.now() };
}

export async function getPerpsRead(op: string, address: string): Promise<unknown> {
  if (op === 'lighter-mainnet-markets'||op === 'lighter-markets') {
    const host=op==='lighter-mainnet-markets'?MAINNET:LIGHTER;
    const [books,metadata]=await Promise.all([read(`${host}/api/v1/orderBookDetails`),read(`${host}/api/v1/tokenlist`).catch(()=>null)]);
    return {...books,...(Array.isArray(metadata?.tokens)?{tokens:metadata.tokens}:{})};
  }
  if (op === 'ondo-markets') {
    const [markets, prices] = await Promise.all([read(`${ONDO}/v1/markets`), read(`${ONDO}/v1/perps/mark_prices`)]);
    return { markets, prices };
  }
  if (!['lighter-account','lighter-mainnet-account'].includes(op)) throw new ProviderError(400, 'درخواست ناشناخته');
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new ProviderError(400, 'آدرس عمومی EVM معتبر وارد کنید');
  const host=op==='lighter-mainnet-account'?MAINNET:LIGHTER;
  const accounts: unknown[] = []; const cursors = new Set<string>(); let cursor = '';
  // Bounded pagination: never silently present a partial equity total.
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ by: 'l1_address', value: address, active_only: 'true' });
    if (cursor) query.set('cursor', cursor);
    // آدرس بدون حساب = فهرست خالی، نه خطا (فقط صفحهٔ اول؛ وسط صفحه‌بندی یعنی پاسخ ناسازگار)
    const data = await read(`${host}/api/v1/account?${query}`).catch((e: unknown): Record<string, unknown> => {
      if (!cursor && e instanceof ProviderError && e.status === 404) return { accounts: [] };
      throw e;
    });
    if (!Array.isArray(data.accounts)) throw new ProviderError(502, 'پاسخ حساب معتبر نیست');
    accounts.push(...data.accounts);
    if (!data.next_cursor) return { accounts, fetchedAt: Date.now() };
    cursor = String(data.next_cursor);
    if (cursors.has(cursor) || cursor.length > 2048) break;
    cursors.add(cursor);
  }
  throw new ProviderError(502, 'فهرست حساب‌ها کامل دریافت نشد');
}
