/** ============================================================
 * Boros Backtest — بازپخش موتور فعلی روی بازارهای سررسیدشده
 *
 *  برای هر بازار سررسیدشده و هر روزِ معامله‌شده:
 *   ۱) وضعیت بازار در آن روز بازسازی می‌شود (نرخ ضمنی c، نرخ شناور u، تاریخچه تا همان روز)
 *   ۲) همان BorosCalculationEngine.analyze اپ اجرا می‌شود → سیگنال Long/Short
 *   ۳) نتیجه واقعی تا سررسید: میانگین u واقعی − نرخ ورود، منهای کارمزد همان موتور
 *   ۴) مسیر: آیا با مارجین اولیه (IM) یا 2×IM به Maintenance Margin می‌رسید؟
 *
 *  اجرا:
 *   npx esbuild scripts/boros-backtest.ts --bundle --platform=node --format=esm --outfile=<dir>/bt.mjs
 *   node <dir>/bt.mjs <dataDir>
 *
 *  فرض‌ها (داده تاریخی در API نیست):
 *   - notionalOI ≈ مجموع حجم ۷ روز اخیر (جایگزین)
 *   - bid/ask ناموجود → امتیاز اسپرد خنثی
 *   - قیمت وثیقه = قیمت فعلی (فقط در نمره نقدشوندگی)
 * ============================================================ */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mapMarket } from '../src/features/boros/data/borosService';
import { BorosCalculationEngine, MarginCalculator, type OpportunityStatus } from '../src/features/boros/domain/engine';
import type { BorosDirection, BorosMarket } from '../src/features/boros/domain/types';

const API = 'https://api-boros.pendle.finance/apis/v1';
const DAY = 86400;
const SIZE = 1000;
const SLIPPAGE = Number(process.env.BT_SLIPPAGE ?? 0.002); // ۰.۲ واحد درصد APR
const MIN_DAYS = 2;

type Candle = { ts: number; o: number; h: number; l: number; c: number; v: number };
type Funding = { ts: number; u: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string, cacheFile: string): Promise<any> {
  try {
    return JSON.parse(await readFile(cacheFile, 'utf8'));
  } catch { /* fetch */ }
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) { await sleep(5000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const j = await res.json();
    await writeFile(cacheFile, JSON.stringify(j));
    await sleep(250);
    return j;
  }
  throw new Error(`rate limited: ${url}`);
}

async function maturedMarkets(dir: string): Promise<Record<string, any>[]> {
  const out: Record<string, any>[] = [];
  let token: string | null = null;
  for (let page = 0; page < 20; page++) {
    const q = `${API}/markets?isMatured=true&limit=100${token ? `&resumeToken=${encodeURIComponent(token)}` : ''}`;
    const j = await getJson(q, join(dir, `markets-${page}.json`));
    out.push(...(j.results ?? []));
    token = j.resumeToken ?? (j.cursor?.hasMore ? j.cursor.next ?? null : null);
    if (!token) break;
  }
  const now = Date.now() / 1000;
  return [...new Map(out.map((r) => [r.marketId, r])).values()].filter((r) => (r.imData?.maturity ?? Infinity) < now);
}

/** همه شمع‌ها تا سررسید — API در هر پاسخ حداکثر ۲۰۰ نقطه می‌دهد */
async function candles(dir: string, id: number, maturity: number): Promise<Candle[]> {
  const pts = new Map<number, Candle>();
  let end = maturity;
  for (let i = 0; i < 5; i++) {
    const start = end - 199 * DAY;
    const j = await getJson(`${API}/markets/ohlcv?marketId=${id}&timeFrame=1d&startTimestamp=${start}&endTimestamp=${end}`, join(dir, `ohlcv-${id}-${end}.json`));
    const rs: Candle[] = j.results ?? [];
    rs.forEach((p) => pts.set(p.ts, p));
    if (rs.length < 200 || rs.every((p) => !(p.v > 0))) break;
    end = start - DAY;
  }
  return [...pts.values()].sort((a, b) => a.ts - b.ts);
}

async function funding(dir: string, id: number, maturity: number): Promise<Funding[]> {
  const j = await getJson(`${API}/indicators?marketId=${id}&timeFrame=1d&select=u&startTimestamp=${maturity - 400 * DAY}&endTimestamp=${maturity}`, join(dir, `funding-${id}.json`));
  return (j.results ?? []).filter((p: Funding) => Number.isFinite(p.u)).sort((a: Funding, b: Funding) => a.ts - b.ts);
}

interface Trade {
  marketId: number;
  symbol: string;
  venue: string;
  asset: string;
  maturity: number;
  entryTs: number;
  days: number;
  direction: BorosDirection;
  status: OpportunityStatus;
  entryApr: number;
  floatingAtEntry: number;
  realizedFloating: number;
  predictedNet: number;
  realizedNet: number;
  /** مارجین اولیه (IM) و کمترین (settlement انباشته + MTM − MM) در مسیر — برای ROI روی سرمایه */
  im: number;
  minSlack: number;
  liqAt1x: boolean;
  liqAt2x: boolean;
}

function replayMarket(base: BorosMarket, cs: Candle[], fs: Funding[]): Trade[] {
  const traded = cs.filter((p) => p.v > 0 && Number.isFinite(p.c) && p.ts < base.maturity); // نرخ ضمنی منفی هم معتبر است
  const trades: Trade[] = [];
  for (const day of traded) {
    const nowSec = day.ts + DAY; // تصمیم در پایان روز با close همان روز
    const days = (base.maturity - nowSec) / DAY;
    if (days < MIN_DAYS) continue;
    const histC = traded.filter((p) => p.ts <= day.ts);
    const histU = fs.filter((p) => p.ts <= day.ts);
    const future = fs.filter((p) => p.ts > day.ts && p.ts < base.maturity);
    if (histU.length === 0 || future.length < days * 0.8) continue;
    const vol7 = histC.slice(-7).reduce((s, p) => s + p.v, 0);
    const m: BorosMarket = {
      ...base,
      status: 'GOOD',
      snapshotAt: nowSec * 1000,
      markApr: day.c,
      midApr: day.c,
      lastTradedApr: day.c,
      floatingApr: histU[histU.length - 1].u,
      volume24h: day.v,
      notionalOI: vol7,
      bestBid: Number.NaN,
      bestAsk: Number.NaN,
      dailyVolatility: null,
      ohlcv: histC.map((p) => ({ ts: p.ts, c: p.c })),
      fundingHistory: histU.map((p) => ({ ts: p.ts, c: p.u }))
    };
    const a = BorosCalculationEngine.analyze({ m, size: SIZE, nowSec, gasUsd: 0, slippageRate: SLIPPAGE });
    if (!a.valid) continue;
    const costs = a.fees?.total ?? 0;
    const realizedFloating = future.reduce((s, p) => s + p.u, 0) / future.length;
    for (const direction of ['long', 'short'] as const) {
      const sign = direction === 'long' ? 1 : -1;
      const gross = SIZE * sign * (realizedFloating - day.c) * (days / 365);
      // مسیر: equity = margin + settlement انباشته + MTM ؛ لیکوئید اگر < MM
      const im = MarginCalculator.calcMarket(m, SIZE, day.c, nowSec);
      let accrued = 0;
      let liq1 = false;
      let liq2 = false;
      let minSlack = Infinity;
      for (const s of traded.filter((p) => p.ts > day.ts)) {
        const t = s.ts + DAY;
        if (t >= base.maturity) break;
        const remaining = (base.maturity - t) / DAY;
        const u = fs.find((p) => p.ts === s.ts)?.u;
        if (u !== undefined) accrued += SIZE * sign * (u - day.c) / 365;
        const worst = direction === 'long' ? s.l : s.h;
        const mtm = SIZE * sign * (worst - day.c) * (remaining / 365);
        const mm = SIZE * Math.max(Math.abs(worst), m.marginFloor) * Math.max(remaining / 365, m.ytmFloor ?? 0) * m.kMM;
        minSlack = Math.min(minSlack, accrued + mtm - mm);
        if (im + accrued + mtm < mm) liq1 = true;
        if (2 * im + accrued + mtm < mm) liq2 = true;
      }
      trades.push({
        marketId: m.marketId,
        symbol: m.symbol,
        venue: m.venue,
        asset: m.asset,
        maturity: m.maturity,
        entryTs: day.ts,
        days,
        direction,
        status: direction === 'long' ? a.statusLong : a.statusShort,
        entryApr: day.c,
        floatingAtEntry: m.floatingApr,
        realizedFloating,
        predictedNet: direction === 'long' ? a.expectedLongNet : a.expectedShortNet,
        realizedNet: gross - costs,
        im,
        minSlack: Number.isFinite(minSlack) ? minSlack : 0,
        liqAt1x: liq1,
        liqAt2x: liq2
      });
    }
  }
  return trades;
}

function summarize(label: string, ts: Trade[]) {
  const n = ts.length;
  if (n === 0) return { label, n };
  const wins = ts.filter((t) => t.realizedNet > 0).length;
  const sum = ts.reduce((s, t) => s + t.realizedNet, 0);
  const sorted = ts.map((t) => t.realizedNet).sort((a, b) => a - b);
  return {
    label,
    n,
    markets: new Set(ts.map((t) => t.marketId)).size,
    maturities: new Set(ts.map((t) => t.maturity)).size,
    winRate: +(wins / n * 100).toFixed(1),
    avgNetUsd: +(sum / n).toFixed(2),
    medianNetUsd: +sorted[Math.floor(n / 2)].toFixed(2),
    worstUsd: +sorted[0].toFixed(2),
    avgPredictedUsd: +(ts.reduce((s, t) => s + t.predictedNet, 0) / n).toFixed(2),
    liqAt1xPct: +(ts.filter((t) => t.liqAt1x).length / n * 100).toFixed(1),
    liqAt2xPct: +(ts.filter((t) => t.liqAt2x).length / n * 100).toFixed(1)
  };
}

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: node bt.mjs <dataDir>');
  await mkdir(dir, { recursive: true });
  const raws = await maturedMarkets(dir);
  console.error(`matured markets: ${raws.length}`);
  const all: Trade[] = [];
  const skipped: string[] = [];
  for (const raw of raws) {
    const maturity = raw.imData?.maturity;
    let base: BorosMarket;
    try {
      // بازار سررسیدشده ممکن است data لحظه‌ای نداشته باشد — فقط پیکربندی لازم است
      base = mapMarket({ ...raw, config: { ...raw.config, status: 2 }, data: { ...raw.data, markApr: 0.05, floatingApr: 0.05 } });
    } catch (e) {
      skipped.push(`${raw.marketId}: ${(e as Error).message}`);
      continue;
    }
    const [cs, fs] = await Promise.all([candles(dir, base.marketId, maturity), funding(dir, base.marketId, maturity)]);
    const ts = replayMarket(base, cs, fs);
    if (ts.length === 0) skipped.push(`${base.marketId} ${base.symbol}: no tradable days`);
    all.push(...ts);
    console.error(`${base.marketId} ${base.symbol}: ${ts.length / 2} days`);
  }

  const groups: Record<string, Trade[]> = {
    'baseline: every day long': all.filter((t) => t.direction === 'long'),
    'baseline: every day short': all.filter((t) => t.direction === 'short'),
    'signal potential long': all.filter((t) => t.direction === 'long' && t.status === 'potential'),
    'signal potential short': all.filter((t) => t.direction === 'short' && t.status === 'potential'),
    'signal conditional long': all.filter((t) => t.direction === 'long' && t.status === 'conditional'),
    'signal conditional short': all.filter((t) => t.direction === 'short' && t.status === 'conditional'),
    'signal potential (both)': all.filter((t) => t.status === 'potential'),
    'signal potential+conditional': all.filter((t) => t.status === 'potential' || t.status === 'conditional')
  };
  const summary = Object.entries(groups).map(([k, v]) => summarize(k, v));

  // تفکیک سیگنال potential بر اساس صرافی / دارایی / دوره سررسید
  const pot = groups['signal potential (both)'];
  const by = (key: (t: Trade) => string) =>
    Object.entries(pot.reduce<Record<string, Trade[]>>((acc, t) => ((acc[key(t)] ??= []).push(t), acc), {})).map(([k, v]) => summarize(k, v));
  const report = {
    generatedAt: new Date().toISOString(),
    params: { size: SIZE, slippageApr: SLIPPAGE, minDays: MIN_DAYS },
    marketsReplayed: new Set(all.map((t) => t.marketId)).size,
    skipped,
    summary,
    potentialByVenue: by((t) => t.venue),
    potentialByAsset: by((t) => t.asset),
    potentialByMaturity: by((t) => new Date(t.maturity * 1000).toISOString().slice(0, 10)),
    potentialByDaysLeft: by((t) => (t.days < 14 ? '<14d' : t.days < 30 ? '14-30d' : t.days < 60 ? '30-60d' : '60d+'))
  };
  await writeFile(join(dir, 'trades.json'), JSON.stringify(all));
  await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
