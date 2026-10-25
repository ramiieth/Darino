/** ============================================================
 * غربال میم‌کوین «محافظ سرمایه» — ساخت تدریجی روی سرور
 *
 *  • فهرست پایه: میم‌های سولانای CoinGecko با ارزش بازار ≥ ۵ میلیون و حجم ≥ ۱۰۰ هزار دلار (روزی یک بار)
 *  • هر کوین: تاریخچهٔ روزانهٔ ۱۲۰ روزه (CoinGecko) + گزارش امنیت RugCheck؛ تازه‌سازی هر ~۲۰ ساعت
 *  • تیک اعلان‌ها (هر ۱۰ دقیقه) هر بار ۴ کوین را تازه می‌کند (سقف CoinGecko و ۶۰ ثانیهٔ فانکشن)؛ پر شدن اول ~۲.۵ ساعت
 *  • خروجی آماده در کش سرور؛ صفحه فقط آن را می‌خواند
 * ============================================================ */
import { providerCacheKey, readProviderCache, writeProviderCache } from './_providerCache.js';
import { CG_KEY } from './_cgRoute.js';
import { parseMarketChart, parseRugReport, regimeOf, screenCoin, GATE, type CoinInput, type CoinScreen, type DailyBar, type MemeScreenPayload, type SafetyInfo } from '../src/features/intel/domain/memeScreen.js';

const CG = 'https://api.coingecko.com/api/v3';
const UNIVERSE_MS = 24 * 3_600_000;
const CHART_STALE_MS = 20 * 3_600_000;
const SAFETY_STALE_MS = 24 * 3_600_000;
const MAX_COINS = 60;
const DAY_MS = 86_400_000;

interface UniverseCoin { id: string; symbol: string; name: string; image: string | null; marketCap: number; volume24h: number; athChangePct: number | null }
interface Universe { fetchedAt: number; coins: UniverseCoin[] }
interface CoinEntry { mint: string | null; metaAt: number; bars: DailyBar[]; chartAt: number; safety: SafetyInfo | null; safetyAt: number }
type Coins = Record<string, CoinEntry>;

const key = (name: string) => providerCacheKey(`meme-screen-v1:${name}`);

async function getJson(url: string, timeoutMs = 6_000): Promise<unknown> {
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
const cg = (path: string) => getJson(`${CG}${path}${path.includes('?') ? '&' : '?'}x_cg_demo_api_key=${CG_KEY}`);

async function loadUniverse(now: number): Promise<Universe | null> {
  const cached = await readProviderCache<Universe>(key('universe'));
  if (cached) return cached;
  const rows = await cg('/coins/markets?vs_currency=usd&category=solana-meme-coins&order=market_cap_desc&per_page=250&page=1');
  if (!Array.isArray(rows)) return null;
  const coins = (rows as Record<string, unknown>[])
    .map((r) => ({
      id: String(r.id ?? ''),
      symbol: String(r.symbol ?? '').toUpperCase().slice(0, 20),
      name: String(r.name ?? '').slice(0, 60),
      image: typeof r.image === 'string' && r.image.startsWith('https://') ? r.image : null,
      marketCap: Number(r.market_cap) || 0,
      volume24h: Number(r.total_volume) || 0,
      athChangePct: Number.isFinite(Number(r.ath_change_percentage)) ? Number(r.ath_change_percentage) : null
    }))
    .filter((c) => /^[a-z0-9-]{1,80}$/.test(c.id) && c.marketCap >= GATE.minMarketCap && c.volume24h >= GATE.minVolume7d)
    .slice(0, MAX_COINS);
  const u = { fetchedAt: now, coins };
  await writeProviderCache(key('universe'), u, UNIVERSE_MS);
  return u;
}

async function refreshCoin(id: string, prev: CoinEntry | undefined, now: number): Promise<CoinEntry> {
  const e: CoinEntry = prev ? { ...prev } : { mint: null, metaAt: 0, bars: [], chartAt: 0, safety: null, safetyAt: 0 };
  if (!e.mint && now - e.metaAt > 7 * DAY_MS) {
    const meta = (await cg(`/coins/${id}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`)) as { platforms?: Record<string, string> } | null;
    const mint = meta?.platforms?.solana;
    if (meta) e.metaAt = now;
    if (typeof mint === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) e.mint = mint;
  }
  if (now - e.chartAt > CHART_STALE_MS) {
    const bars = parseMarketChart(await cg(`/coins/${id}/market_chart?vs_currency=usd&days=120&interval=daily`));
    if (bars.length) { e.bars = bars; e.chartAt = now; }
  }
  if (e.mint && now - e.safetyAt > SAFETY_STALE_MS) {
    const s = parseRugReport(await getJson(`https://api.rugcheck.xyz/v1/tokens/${e.mint}/report`, 8_000));
    if (s) { e.safety = s; e.safetyAt = now; }
  }
  return e;
}

const stale = (e: CoinEntry | undefined, now: number) =>
  !e || now - e.chartAt > CHART_STALE_MS || (!!e.mint && now - e.safetyAt > SAFETY_STALE_MS) || (!e.mint && now - e.metaAt > 7 * DAY_MS);

export function buildPayload(u: Universe, coins: Coins, now: number): MemeScreenPayload {
  const inputs: CoinInput[] = u.coins
    .filter((c) => coins[c.id]?.bars.length)
    .map((c) => ({ ...c, mint: coins[c.id].mint, bars: coins[c.id].bars, safety: coins[c.id].safety }));
  const rank = (s: CoinScreen) => (s.passes ? 0 : s.watchWorthy ? 1 : 2);
  const screened = inputs.map(screenCoin).sort((a, b) => rank(a) - rank(b) || b.marketCap - a.marketCap);
  return { fetchedAt: now, regime: regimeOf(inputs), coins: screened, pending: u.coins.length - inputs.length, total: u.coins.length };
}

/** از تیک اعلان‌ها: تا `budget` کوین کهنه را تازه می‌کند و خروجی را دوباره می‌سازد */
export async function warmMemeScreen(budget = 4, deadlineMs = 15_000, now = Date.now()): Promise<number> {
  const started = Date.now();
  const u = await loadUniverse(now);
  if (!u) return -1;
  const coins = (await readProviderCache<Coins>(key('coins'))) ?? {};
  const todo = u.coins.filter((c) => stale(coins[c.id], now)).sort((a, b) => (coins[a.id]?.chartAt ?? 0) - (coins[b.id]?.chartAt ?? 0));
  let done = 0;
  for (const c of todo.slice(0, budget)) {
    if (Date.now() - started > deadlineMs) break;
    coins[c.id] = await refreshCoin(c.id, coins[c.id], now);
    done++;
  }
  // فقط کوین‌های فهرست فعلی نگه داشته می‌شوند
  const kept: Coins = {};
  for (const c of u.coins) if (coins[c.id]) kept[c.id] = coins[c.id];
  await writeProviderCache(key('coins'), kept, 7 * DAY_MS);
  await writeProviderCache(key('payload'), buildPayload(u, kept, now), 3 * DAY_MS);
  return todo.length - done;
}

/** فقط خواندن کش (برای تیک و فهرست انتظار؛ پر کردن کار تیک است) */
export function readMemeScreen(): Promise<MemeScreenPayload | null> {
  return readProviderCache<MemeScreenPayload>(key('payload'));
}

/** برای صفحه: اگر هنوز چیزی ساخته نشده، چند کوین را همین الان می‌سازد */
export async function getMemeScreen(): Promise<MemeScreenPayload | null> {
  const cached = await readProviderCache<MemeScreenPayload>(key('payload'));
  if (cached) return cached;
  await warmMemeScreen(3, 8_000);
  return readProviderCache<MemeScreenPayload>(key('payload'));
}
