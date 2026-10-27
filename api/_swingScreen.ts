/** ============================================================
 * «سوینگ» — رژیم بازار و کاندید آزمایشی، ساخت تدریجی روی سرور
 *
 *  • جهان: ۶۰ پرپ پرحجم هایپرلیکوئید (metaAndAssetCtxs، هر ساعت)
 *  • هر کوین: ۲۶۰ کندل روزانه؛ وقتی روز تازه‌ای بسته شد کهنه حساب می‌شود
 *  • تیک اعلان‌ها (هر ۱۰ دقیقه) هر بار تا ۱۵ کوین را تازه می‌کند (وزن ≈ ۴۰۰ از سقف ۱۲۰۰ در دقیقه، سقف ۱۲ ثانیه
 *    تا تیک در ۶۰ ثانیهٔ فانکشن جا شود)؛ پر شدن روزانه ≈ ۴ تیک
 *  • فقط وقتی همهٔ جهان تازه است: کاندید آزمایشی (فاندینگ ۷۲ ساعت فقط برای پیش‌فیلترشده‌ها) و ثبت روزانه
 *  • خروجی آماده در کش سرور؛ صفحه فقط آن را می‌خواند
 * ============================================================ */
import { providerCacheKey, readProviderCache, writeProviderCache } from './_providerCache.js';
import { hlInfo, pool } from './_hyperliquid.js';
import {
  EXCLUDE, UNIVERSE_SIZE, addSignals, isExperimental, mayBeExperimental, regimeOf, settle, summarize, trendOf,
  type CoinTrend, type DayBar, type LogEntry, type SwingCandidate, type SwingPayload
} from '../src/features/intel/domain/swing.js';

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 260;
const UNIVERSE_MS = 3_600_000;
const LOG_KEEP_MS = 3 * 365 * DAY_MS;
const MAX_FUNDING_CHECKS = 10;

interface UniverseCoin { coin: string; vol: number; fundingHourly: number }
interface Universe { fetchedAt: number; coins: UniverseCoin[] }
/** day = آخرین روز بسته‌شده هنگام دریافت؛ کوین تازه‌لیست‌شده بدون کندل بسته هم «تازه» حساب شود و جلوی جهان کامل را نگیرد */
interface CoinEntry { bars: DayBar[]; day: number }
type Coins = Record<string, CoinEntry>;
interface LogState { lastDay: number | null; entries: LogEntry[] }

const key = (name: string) => providerCacheKey(`swing-v2:${name}`);
/** آخرین روز UTC که کندلش بسته شده */
const lastClosedDay = (now: number) => Math.floor(now / DAY_MS) * DAY_MS - DAY_MS;

async function loadUniverse(now: number): Promise<Universe | null> {
  const cached = await readProviderCache<Universe>(key('universe'));
  if (cached) return cached;
  const [meta, ctxs] = await hlInfo<[{ universe: { name: string; isDelisted?: boolean }[] }, { dayNtlVlm?: string; funding?: string }[]]>({ type: 'metaAndAssetCtxs' });
  const all = meta.universe
    .map((u, i) => ({ coin: u.name, delisted: !!u.isDelisted, vol: Number(ctxs[i]?.dayNtlVlm ?? 0), fundingHourly: Number(ctxs[i]?.funding ?? 0) }))
    .filter((c) => !c.delisted && /^[A-Za-z0-9]{1,20}$/.test(c.coin) && Number.isFinite(c.vol))
    .sort((a, b) => b.vol - a.vol);
  const coins = all.slice(0, UNIVERSE_SIZE).map(({ coin, vol, fundingHourly }) => ({ coin, vol, fundingHourly }));
  const btc = all.find((c) => c.coin === 'BTC');
  if (btc && !coins.some((c) => c.coin === 'BTC')) coins.push(btc);
  const u = { fetchedAt: now, coins };
  await writeProviderCache(key('universe'), u, UNIVERSE_MS);
  return u;
}

async function fetchBars(coin: string, now: number): Promise<DayBar[]> {
  const raw = await hlInfo<{ t: number; o: string; h: string; l: string; c: string }[]>({
    type: 'candleSnapshot',
    req: { coin, interval: '1d', startTime: now - HISTORY_DAYS * DAY_MS, endTime: now }
  });
  return raw
    .filter((k) => k.t + DAY_MS <= now) // کندل امروز هنوز بسته نشده
    .map((k) => ({ t: k.t, o: Number(k.o), h: Number(k.h), l: Number(k.l), c: Number(k.c) }))
    .filter((b) => b.c > 0 && b.o > 0)
    .sort((a, b) => a.t - b.t);
}

const stale = (e: CoinEntry | undefined, now: number) => !e || !(e.day >= lastClosedDay(now));

/** میانگین فاندینگ ساعتی ۷۲ ساعت گذشته (یک درخواست، وزن ≈ ۲۴) */
async function funding72h(coin: string, now: number): Promise<number | null> {
  const rows = await hlInfo<{ fundingRate: string }[]>({ type: 'fundingHistory', coin, startTime: now - 72 * 3_600_000 });
  const rates = rows.map((r) => Number(r.fundingRate)).filter(Number.isFinite);
  return rates.length >= 48 ? rates.reduce((s, r) => s + r, 0) / rates.length : null;
}

async function build(u: Universe, coins: Coins, now: number): Promise<SwingPayload> {
  const trends = u.coins.map((c) => (coins[c.coin] ? trendOf(c.coin, coins[c.coin].bars) : null)).filter((t): t is CoinTrend => !!t);
  const btc = trends.find((t) => t.coin === 'BTC') ?? null;
  const regime = regimeOf(btc, trends);
  const pending = u.coins.filter((c) => stale(coins[c.coin], now)).length;
  const day = lastClosedDay(now);

  const state = (await readProviderCache<LogState>(key('log'))) ?? { lastDay: null, entries: [] };
  let candidates: SwingCandidate[] = [];
  if (pending === 0) {
    const fundingOf = new Map(u.coins.map((c) => [c.coin, c.fundingHourly]));
    const pre = trends.filter((t) => !EXCLUDE.has(t.coin) && mayBeExperimental(t, fundingOf.get(t.coin) ?? 0, regime)).slice(0, MAX_FUNDING_CHECKS);
    const f72 = await pool(pre, 2, (t) => funding72h(t.coin, now));
    candidates = pre
      .map((t, i) => ({ t, f: f72[i] }))
      .filter(({ t, f }) => isExperimental(t, f === null ? null : f * 72, regime))
      .map(({ t, f }) => ({ coin: t.coin, close: t.close, sma50: t.sma50!, fundingHourly72h: f! }));
    // ثبت یک بار در روز، فقط با جهان کامل (رژیم ناقص سیگنال غلط ثبت می‌کند)
    if (state.lastDay !== day) {
      state.entries = addSignals(state.entries, candidates.map((c) => c.coin), day);
      state.lastDay = day;
    }
  }
  state.entries = state.entries.map((e) => (e.exit !== null || !coins[e.coin] ? e : settle(e, coins[e.coin].bars)));
  await writeProviderCache(key('log'), state, LOG_KEEP_MS);

  return {
    fetchedAt: now,
    day: btc ? day : null,
    regime,
    btc,
    candidates,
    log: state.entries.slice(-50),
    summary: summarize(state.entries),
    pending,
    total: u.coins.length
  };
}

/** از تیک اعلان‌ها: تا `budget` کوین کهنه را تازه می‌کند و خروجی را دوباره می‌سازد */
export async function warmSwing(budget = 15, deadlineMs = 12_000, now = Date.now()): Promise<number> {
  const started = Date.now();
  const u = await loadUniverse(now);
  if (!u) return -1;
  const coins = (await readProviderCache<Coins>(key('coins'))) ?? {};
  const todo = u.coins.filter((c) => stale(coins[c.coin], now));
  // کوین‌های ثبت‌شده که از جهان بیرون رفته‌اند هم باید تا خروج دنبال شوند
  const state = await readProviderCache<LogState>(key('log'));
  const tracked = [...new Set((state?.entries ?? []).filter((e) => e.exit === null).map((e) => e.coin))]
    .filter((c) => !u.coins.some((x) => x.coin === c) && stale(coins[c], now));
  let done = 0;
  for (const coin of [...todo.map((c) => c.coin), ...tracked].slice(0, budget)) {
    if (Date.now() - started > deadlineMs) break;
    try {
      coins[coin] = { bars: await fetchBars(coin, now), day: lastClosedDay(now) };
      done++;
    } catch {
      break; // احتمالاً سقف درخواست؛ تیک بعدی ادامه می‌دهد
    }
  }
  const keep = new Set([...u.coins.map((c) => c.coin), ...tracked]);
  const kept: Coins = {};
  for (const c of keep) if (coins[c]) kept[c] = coins[c];
  await writeProviderCache(key('coins'), kept, 7 * DAY_MS);
  await writeProviderCache(key('payload'), await build(u, kept, now), 3 * DAY_MS);
  return todo.length - done;
}

/** برای صفحه: اگر هنوز چیزی ساخته نشده، چند کوین را همین الان می‌سازد */
export async function getSwing(): Promise<SwingPayload | null> {
  const cached = await readProviderCache<SwingPayload>(key('payload'));
  if (cached) return cached;
  await warmSwing(12, 8_000);
  return readProviderCache<SwingPayload>(key('payload'));
}
