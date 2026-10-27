/** ============================================================
 * «طلای ایران» — قیمت ۱۸ عیار در ۴ پلتفرم و سکه‌ها، در برابر ارزش طلای خالص (انس × دلار آزاد)
 *
 *  • زنده (کش ۶۰ ثانیه): میلی، وال‌گلد، ملی‌گلد، دریک؛ انس از xyz:GOLD هایپرلیکوئید؛ دلار آزاد، طلای بازار
 *    و سکه‌ها از آخرین ردیف tgju؛ اگر دلار آزاد نبود، تتر والکس (و آستانهٔ ارزش‌گذاری گشادتر)
 *  • تاریخی (کش ۱۲ ساعت، فقط خلاصه): توزیع حباب ۱۸ عیار و سکه‌ها از ۲۰۱۳، و مقادیر ۷ و ۳۰ روز پیش برای تجزیه
 *  • تیک اعلان‌ها حباب امروز را ثبت می‌کند (یک ردیف در روز تهران)
 *  فقط GET به همین میزبان‌ها؛ بدون کلید، کوکی کاربر یا امضا.
 * ============================================================ */
import { providerCacheKey, readProviderCache, writeProviderCache } from './_providerCache.js';
import { hlInfo, pool } from './_hyperliquid.js';
import { fetchUsdtDirect } from '../src/shared/fx/usdtRate.js';
import { tehranDayKey } from '../src/shared/fx/usdtHistory.js';
import {
  PLATFORM_URL, PURE_GRAMS, decompose, median, parseQuote, parseTgjuHistory, platformRows, premiumSeries, premiumStats,
  pureValueToman, tgjuHistoryUrl,
  type Coin, type CoinRow, type DayClose, type GoldPayload, type GoldPlatform, type PremiumStats, type Quote, type RecordedDay, type TgjuSymbol
} from '../src/features/intel/domain/gold.js';

const DAY_MS = 86_400_000;
const LIVE_MS = 60_000;
const HISTORY_MS = 12 * 3_600_000;
const HISTORY_ROWS = 5_000;
const KEEP_DAYS = 1500;
const PLATFORMS = Object.keys(PLATFORM_URL) as GoldPlatform[];
const COINS: Coin[] = ['sekee', 'nim', 'rob'];

interface Anchor { geram18: number; ons: number; dollar: number }
interface HistorySummary { stats: PremiumStats | null; coins: Record<Coin, PremiumStats | null>; anchors: Record<'7' | '30', Anchor | null> }

const key = (name: string) => providerCacheKey(`gold-v2:${name}`);

/** GET JSON؛ ملی‌گلد پشت ArvanCloud است: بار اول کوکی و ۳۰۷ می‌دهد، با همان کوکی دوباره */
async function getJson(url: string, timeoutMs = 8_000, referer?: string): Promise<unknown> {
  const init = (cookie?: string): RequestInit => ({
    headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0', ...(referer ? { referer } : {}), ...(cookie ? { cookie } : {}) },
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs)
  });
  let res = await fetch(url, init());
  if (res.status === 307 || res.status === 302) {
    const cookie = res.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) throw new Error(`redirect without cookie ${res.status}`);
    res = await fetch(url, init(cookie));
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const tgju = (symbol: TgjuSymbol, rows: number) => getJson(tgjuHistoryUrl(symbol, rows), 15_000, 'https://www.tgju.org/').then(parseTgjuHistory);

/** انس طلا: مارک xyz:GOLD (HIP-3)، وگرنه PAXG */
async function ounceNow(): Promise<number | null> {
  const pick = async (dex: string | null, coin: string) => {
    const [meta, ctxs] = await hlInfo<[{ universe: { name: string }[] }, { markPx?: string }[]]>({ type: 'metaAndAssetCtxs', ...(dex ? { dex } : {}) });
    const i = meta.universe.findIndex((u) => u.name === coin);
    const px = Number(ctxs[i]?.markPx);
    return i >= 0 && px > 0 ? px : null;
  };
  return (await pick('xyz', 'xyz:GOLD').catch(() => null)) ?? (await pick(null, 'PAXG').catch(() => null));
}

async function usdtNow(): Promise<number | null> {
  for (const s of ['wallex', 'bitpin'] as const) {
    const q = await fetchUsdtDirect(s, undefined, 8_000).catch(() => null);
    if (q) return q.priceToman;
  }
  return null;
}

/** آخرین مقدار تا لحظهٔ ts */
const at = (xs: DayClose[], ts: number) => [...xs].reverse().find((x) => x.t <= ts)?.close ?? null;

async function loadHistory(now: number): Promise<HistorySummary> {
  const cached = await readProviderCache<HistorySummary>(key('history'));
  if (cached) return cached;
  const [geram18, dollar, ons, ...coinRows] = await Promise.all(
    (['geram18', 'price_dollar_rl', 'ons', ...COINS] as TgjuSymbol[]).map((s) => tgju(s, HISTORY_ROWS).catch(() => [] as DayClose[]))
  );
  const anchor = (days: number): Anchor | null => {
    const ts = now - days * DAY_MS;
    const g = at(geram18, ts), o = at(ons, ts), d = at(dollar, ts);
    return g && o && d ? { geram18: g, ons: o, dollar: d } : null;
  };
  const summary: HistorySummary = {
    stats: premiumStats(premiumSeries(geram18, ons, dollar, PURE_GRAMS.geram18)),
    coins: Object.fromEntries(COINS.map((c, i) => [c, premiumStats(premiumSeries(coinRows[i], ons, dollar, PURE_GRAMS[c]))])) as Record<Coin, PremiumStats | null>,
    anchors: { '7': anchor(7), '30': anchor(30) }
  };
  if (summary.stats) await writeProviderCache(key('history'), summary, HISTORY_MS);
  return summary;
}

async function build(now: number): Promise<GoldPayload> {
  const [quotes, ounceUsd, usdtToman, history, recorded, latest] = await Promise.all([
    pool(PLATFORMS, 4, async (p) => parseQuote(p, await getJson(PLATFORM_URL[p]))),
    ounceNow(),
    usdtNow(),
    loadHistory(now),
    readProviderCache<RecordedDay[]>(key('days')),
    pool(['price_dollar_rl', 'geram18', ...COINS] as TgjuSymbol[], 2, async (s) => (await tgju(s, 1))[0]?.close ?? null)
  ]);
  const [dollarRial, geramRial, ...coinRial] = latest;
  const ok: Partial<Record<GoldPlatform, Quote>> = {};
  PLATFORMS.forEach((p, i) => { if (quotes[i]) ok[p] = quotes[i]!; });

  const free = dollarRial ? dollarRial / 10 : null;
  const dollarToman = free ?? usdtToman;
  const intrinsic = ounceUsd && dollarToman ? pureValueToman(PURE_GRAMS.geram18, ounceUsd, dollarToman) : null;
  const rows = platformRows(ok, intrinsic);

  const coins: CoinRow[] = COINS.flatMap((coin, i) => {
    const r = coinRial[i];
    if (!r || !ounceUsd || !free) return [];
    const price = r / 10;
    return [{ coin, price, premium: price / pureValueToman(PURE_GRAMS[coin], ounceUsd, free) - 1, stats: history.coins[coin] }];
  });

  const decomposition = (['7', '30'] as const).flatMap((d) => {
    const a = history.anchors[d];
    return a && geramRial && ounceUsd && dollarRial ? [decompose(Number(d), [a.geram18, geramRial], [a.ons, ounceUsd], [a.dollar, dollarRial])] : [];
  });

  return {
    fetchedAt: now,
    ounceUsd,
    dollarToman,
    dollarSource: free ? 'free' : 'usdt',
    usdtToman,
    intrinsic,
    bazaar: geramRial ? geramRial / 10 : null,
    rows,
    failed: PLATFORMS.filter((p) => !ok[p]),
    // حباب بازار با تاریخچهٔ بازار مقایسه می‌شود؛ پلتفرم‌های آنلاین معمولاً ~۱.۵٪ زیر بازارند (دور نقد ۲۷ اکتبر)
    premium: geramRial && intrinsic ? geramRial / 10 / intrinsic - 1 : median(rows.map((r) => r.premium).filter(Number.isFinite)),
    stats: history.stats,
    coins,
    decomposition,
    recordedDays: recorded?.length ?? 0
  };
}

export async function getGold(now = Date.now()): Promise<GoldPayload> {
  const cached = await readProviderCache<GoldPayload>(key('payload'));
  if (cached) return cached;
  const payload = await build(now);
  if (payload.rows.length) await writeProviderCache(key('payload'), payload, LIVE_MS);
  return payload;
}

/** از تیک اعلان‌ها: حباب امروز را ثبت می‌کند (ردیف امروز تا پایان روز تهران بازنویسی می‌شود) */
export async function recordGold(now = Date.now()): Promise<void> {
  const p = await build(now);
  const iran = p.bazaar ?? median(p.rows.map((r) => (r.buy + r.sell) / 2));
  if (p.premium === null || !iran || !p.ounceUsd || !p.dollarToman || p.dollarSource !== 'free') return;
  const day = tehranDayKey(now);
  const days = ((await readProviderCache<RecordedDay[]>(key('days'), true)) ?? []).filter((d) => d.day !== day);
  days.push({ day, premium: p.premium, iran, ounce: p.ounceUsd, dollar: p.dollarToman });
  await writeProviderCache(key('days'), days.slice(-KEEP_DAYS), 5 * 365 * DAY_MS);
  await writeProviderCache(key('payload'), { ...p, recordedDays: Math.min(days.length, KEEP_DAYS) }, LIVE_MS);
}
