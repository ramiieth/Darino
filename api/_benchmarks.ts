/** ============================================================
 * سری‌های تاریخی بازارهای مقایسه — «عملکرد و مقایسه سرمایه»
 *
 *  GET /api/intel?op=benchmarks&from=<ms>&coins=AAVE,LINK
 *   ایران:  tgju (طلای ۱۸، سکه امامی)
 *   جهانی: Hyperliquid کندل روزانه (BTC/ETH/SOL/HYPE/ZEC + ارزهای منتخب) · Yahoo (طلای جهانی، S&P، نزدک، MSCI World)
 *   تورم:   BLS (CPI-U آمریکا، ماهانه) · بانک جهانی (CPI ایران، سالانه)
 *  هر سری جدا کش می‌شود (۱۲ ساعت)؛ منبعی که خطا بدهد فقط در failed می‌آید — هیچ عددی جایگزین نمی‌شود.
 *  فقط GET/POST عمومی بدون کلید؛ هیچ دادهٔ کاربر به این منابع نمی‌رود.
 * ============================================================ */
import { providerCacheKey, readProviderCache, writeProviderCache } from './_providerCache.js';
import { hlInfo } from './_hyperliquid.js';
import { parseBlsCpi, parseHlCandles, parseTgju, parseWorldBank, parseYahooChart } from '../src/features/performance/domain/parsers.js';
import { EXTRA_COIN_RE, HL_COINS, MAX_EXTRA_COINS, SERVER_SERIES, SOURCE_FA } from '../src/features/performance/domain/markets.js';
import type { BenchmarksPayload, Pt, Series, SeriesFrequency, SeriesUnit } from '../src/features/performance/domain/types.js';

const TTL = 12 * 3_600_000;
/** شروع تاریخچه — پوشش ۱۳۹۹ به بعد */
const HISTORY_FROM = Date.UTC(2020, 0, 1);
const UA = { 'user-agent': 'Mozilla/5.0', accept: 'application/json' };

async function getJson(url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<unknown> {
  const res = await fetch(url, { ...init, headers: { ...UA, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const tgju = (symbol: string) =>
  getJson(`https://api.tgju.org/v1/market/indicator/summary-table-data/${symbol}?lang=fa&start=0&length=3000&order_col=timestamp&order_dir=desc`, { headers: { referer: 'https://www.tgju.org/' } }).then((b) => parseTgju(b));

const yahoo = (symbol: string) =>
  getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${Math.floor(HISTORY_FROM / 1000)}&period2=${Math.floor(Date.now() / 1000)}&interval=1d`).then(parseYahooChart);

async function hlDaily(coin: string): Promise<Pt[]> {
  const body = await hlInfo<unknown>({ type: 'candleSnapshot', req: { coin, interval: '1d', startTime: HISTORY_FROM, endTime: Date.now() } }, 15_000);
  return parseHlCandles(body);
}

async function blsCpi(): Promise<Pt[]> {
  const y = new Date().getUTCFullYear();
  const body = await getJson('https://api.bls.gov/publicAPI/v1/timeseries/data/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seriesid: ['CUUR0000SA0'], startyear: String(y - 9), endyear: String(y) })
  });
  return parseBlsCpi(body);
}

const worldBankIran = () => getJson('https://api.worldbank.org/v2/country/IR/indicator/FP.CPI.TOTL?format=json&per_page=100&date=2010:2035').then(parseWorldBank);

interface Def {
  load: () => Promise<Pt[]>;
  unit: SeriesUnit;
  frequency: SeriesFrequency;
}

const DEFS: Record<string, Def> = {
  ir_gold18: { load: () => tgju('geram18'), unit: 'toman', frequency: 'daily' },
  ir_sekee: { load: () => tgju('sekee'), unit: 'toman', frequency: 'daily' },
  ...Object.fromEntries(Object.entries(HL_COINS).map(([id, coin]) => [id, { load: () => hlDaily(coin), unit: 'usd' as const, frequency: 'daily' as const }])),
  gold_global: { load: () => yahoo('GC=F'), unit: 'usd', frequency: 'daily' },
  spx: { load: () => yahoo('^GSPC'), unit: 'index', frequency: 'daily' },
  ndx: { load: () => yahoo('^IXIC'), unit: 'index', frequency: 'daily' },
  msci_world: { load: () => yahoo('URTH'), unit: 'usd', frequency: 'daily' },
  us_cpi: { load: blsCpi, unit: 'index', frequency: 'monthly' },
  ir_cpi_wb: { load: worldBankIran, unit: 'index', frequency: 'annual' }
};

async function loadSeries(id: string, def: Def, source: { name: string; url: string }): Promise<Series> {
  const key = providerCacheKey(`perf-bench-v1:${id}`);
  const hit = await readProviderCache<Series>(key);
  if (hit) return hit;
  const points = await def.load();
  if (points.length < 2) throw new Error('empty history');
  const series: Series = { id, points, unit: def.unit, frequency: def.frequency, source: source.name, sourceUrl: source.url, fetchedAt: Date.now() };
  await writeProviderCache(key, series, TTL);
  return series;
}

/** coins: نمادهای منتخب اضافه (اعتبارسنجی‌شده) */
export function parseExtraCoins(raw: string | null): string[] {
  return [...new Set((raw ?? '').toUpperCase().split(',').map((s) => s.trim()).filter((s) => EXTRA_COIN_RE.test(s)))].slice(0, MAX_EXTRA_COINS);
}

export async function getBenchmarks(fromTs: number, extraCoins: string[]): Promise<BenchmarksPayload> {
  const jobs: [string, Def, { name: string; url: string }][] = SERVER_SERIES.map((id) => [id, DEFS[id], SOURCE_FA[id]]);
  for (const sym of extraCoins) {
    jobs.push([`coin:${sym}`, { load: () => hlDaily(sym), unit: 'usd', frequency: 'daily' }, { name: `Hyperliquid — ${sym} کندل روزانه`, url: 'https://app.hyperliquid.xyz' }]);
  }
  const settled = await Promise.allSettled(jobs.map(([id, def, src]) => loadSeries(id, def, src)));
  const series: Record<string, Series> = {};
  const failed: Record<string, string> = {};
  // فقط از کمی قبل از اولین تاریخ موردنیاز (سری‌های سالانه کامل)
  const cut = Math.max(HISTORY_FROM, fromTs - 400 * 86_400_000);
  settled.forEach((r, i) => {
    const id = jobs[i][0];
    if (r.status === 'fulfilled') {
      const s = r.value;
      series[id] = s.frequency === 'annual' || s.frequency === 'monthly' ? s : { ...s, points: s.points.filter(([t]) => t >= cut) };
    } else failed[id] = r.reason instanceof Error ? r.reason.message.slice(0, 80) : 'error';
  });
  return { fetchedAt: Date.now(), series, failed };
}
