/** ============================================================
 * Swing Backtest — آزمون سیگنال‌های سوینگ روی کریپتو و سهام/کامودیتی/شاخص‌های هایپرلیکوئید
 *
 *  دو گروه، جدا آزموده می‌شوند (رفتار و ساعت بازارشان فرق دارد):
 *   • کریپتو: نسخهٔ realistic همهٔ پرپ‌های هایپرلیکوئید، حذف‌شده‌ها هم (MATIC، FTM، …)؛ نسخهٔ personal
 *     فقط فعال‌ها منهای EXCLUDE (خوش‌بینانه، سوگیری بقا). جهان هر روز = ۶۰ کوین بزرگ همان روز به حجم دلاری ۳۰ روز گذشته.
 *     فاندینگ کامل برای کوین‌هایی که دست‌کم ۹۰ روز در جهان بوده‌اند (سقف درخواست هایپرلیکوئید)؛
 *     D و F فقط روی همین‌ها آزموده می‌شوند.
 *   • سهام/کامودیتی/شاخص (بازارهای HIP-3 «xyz»): تاریخچهٔ هایپرلیکوئید کمتر از یک سال است، پس قیمت
 *     دارایی پایه از Yahoo Finance از ۲۰۱۰ آزموده می‌شود. فهرست از بازارهای امروز است (سوگیری بقا
 *     به‌ویژه در سهام برنده)؛ نفت و طلا قرارداد آتی پیوسته‌اند (جهش روز تعویض قرارداد).
 *     هزینهٔ پرپ: میانگین فاندینگ روزانهٔ همان بازار در هایپرلیکوئید از راه‌اندازی × روزهای نگه‌داری.
 *
 *  هر سیگنال روی بستهٔ کندل روز t حساب می‌شود و ورود با بازشدن روز t+1 است (بدون نگاه به آینده).
 *  خروج پس از H کندل (۵ و ۲۰) با بستهٔ کندل. هر دارایی تا خروج قفل است (رویدادهای هم‌پوشان شمرده نمی‌شوند).
 *
 *  قواعد حکم (پیش از دیدن نتیجه ثابت شده‌اند):
 *   - هزینهٔ اسپات ۰.۳٪ رفت‌وبرگشت (کارمزد ۰.۱٪×۲ + لغزش)، پرپ کریپتو ۰.۱۵٪ و HIP-3 ۰.۳٪ + فاندینگ
 *   - ۱۸۰ روز آخر مهروموم: فقط سیگنال‌هایی که در داخل‌نمونه قبول شوند روی آن سنجیده می‌شوند
 *   - نال: همهٔ ورودها با یک جابه‌جایی تصادفی مشترک در زمان شیفت می‌خورند (هم‌زمانی بین دارایی‌ها حفظ
 *     می‌شود)؛ p = سهم نال‌هایی که میانگین آن‌ها ≥ واقعی است
 *   - قبولی: ≥ ۳۰ معامله، میانگین خالص > ۰، p < 0.05/K (K = همهٔ آزمون‌های هر دو گروه، بونفرونی)،
 *     و برای نسخه‌های +E: بهتر از خود E در همان گروه و افق
 *   - F (شلوغی، فقط کریپتو) سیگنال ورود نیست؛ احتمال افت بزرگ را در روزهای شلوغ و عادی مقایسه می‌کند
 *
 *  اجرا (Node 24، بدون باندل):
 *   node scripts/swing-backtest.ts <dataDir>                          ← نسخهٔ شخصی
 *   SWING_VARIANT=realistic node scripts/swing-backtest.ts <dataDir>  ← با حذف‌شده‌ها (مبنای تصمیم)
 * ============================================================ */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const INFO = 'https://api.hyperliquid.xyz/info';
const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart';
const DAY = 86_400_000;
const CRYPTO_UNIVERSE = 60;
const MIN_FUNDING_DAYS = 90;
/**
 * personal: فقط کوین‌های فعال، بدون EXCLUDE (حد بالای خوش‌بینانه)
 * realistic: همه، حذف‌شده‌ها و EXCLUDE هم (امروز نمی‌دانید کدام کوین سال بعد می‌میرد) ← مبنای تصمیم؛
 *   فاندینگ تازه دانلود نمی‌کند، پس D و F در این نسخه فقط روی کوین‌های نسخهٔ personal‌اند
 */
const VARIANT = process.env.SWING_VARIANT === 'realistic' ? 'realistic' : 'personal';
/** کوین‌هایی که کاربر هرگز معامله نمی‌کند (در اسکنر هم فیلتر می‌شوند) */
const EXCLUDE = new Set([
  'BLUR', 'BIO', 'TURBO', 'MERL', 'AXS', 'ZETA', 'PNUT', 'YGG', 'MANTA', 'DYM', 'BRETT', 'UMA', 'MOODENG',
  'BIGTIME', 'CELO', 'BERA', 'IOTA', 'KAS', 'ICP'
]);
const MIN_HISTORY = 200;
const MAX_GAP = 5;
const HOLDOUT_DAYS = 180;
const HORIZONS = [5, 20];
/** کاندیدهایی که پس از دور اول و پیش از دیدن ۱۸۰ روز مهروموم اعلام شدند؛ فقط همین‌ها روی آن سنجیده می‌شوند
 *  (حد قبولی p < 0.05 / تعدادشان) */
const CANDIDATES: Record<'crypto' | 'tradfi', [string, number][]> = {
  crypto: [['B7_momentum+E', 20], ['D_negFunding+E', 20]],
  tradfi: []
};
const SPOT_COST = 0.003;
const NULL_DRAWS = 2000;
const MIN_TRADES = 30;
const ALPHA = 0.05;
const CRYPTO_START = Date.UTC(2023, 0, 1);
const TRADFI_START = Date.UTC(2010, 0, 1);

/** بازار xyz هایپرلیکوئید ← نماد Yahoo (فقط جاهایی که دارایی پایه بی‌ابهام است و به دلار قیمت دارد) */
const TRADFI: Record<string, string> = {
  SP500: '^GSPC', XYZ100: '^NDX', JP225: '^N225',
  GOLD: 'GC=F', SILVER: 'SI=F', PLATINUM: 'PL=F', COPPER: 'HG=F', CL: 'CL=F', BRENTOIL: 'BZ=F', NATGAS: 'NG=F',
  EUR: 'EURUSD=X',
  EWZ: 'EWZ', EWY: 'EWY', SMH: 'SMH', SOXL: 'SOXL', KORU: 'KORU',
  NVDA: 'NVDA', TSLA: 'TSLA', META: 'META', GOOGL: 'GOOGL', MSFT: 'MSFT', AAPL: 'AAPL', AMZN: 'AMZN', AMD: 'AMD',
  MU: 'MU', INTC: 'INTC', MRVL: 'MRVL', MSTR: 'MSTR', ORCL: 'ORCL', PLTR: 'PLTR', HOOD: 'HOOD', COIN: 'COIN',
  AVGO: 'AVGO', NFLX: 'NFLX', CRWD: 'CRWD', DELL: 'DELL', GME: 'GME', WDC: 'WDC', ASML: 'ASML', NOK: 'NOK',
  ARM: 'ARM', TSM: 'TSM', HIMS: 'HIMS', BABA: 'BABA', AMAT: 'AMAT', RKLB: 'RKLB', NBIS: 'NBIS', CRCL: 'CRCL',
  CRWV: 'CRWV', SNDK: 'SNDK', BE: 'BE', LITE: 'LITE', IREN: 'IREN', MRNA: 'MRNA', NET: 'NET'
};

type Bar = { o: number; h: number; l: number; c: number; usd: number; filled?: true };
type Asset = { name: string; bars: (Bar | null)[]; funding: number[]; fundPerBar: number; hasFunding: boolean };
type Feat = { sma50: number; sma200: number; ret7: number; ret28: number; dd30: number; vol30: number; fund3: number; fund7: number };
type Ctx = { universe: Set<number>; breadth: number; regime: boolean; rank7: Map<number, number>; rank28: Map<number, number> };
type Event = { asset: number; day: number };
type Group = { id: 'crypto' | 'tradfi'; assets: Asset[]; days: number[]; feats: (Feat | null)[][]; ctx: Ctx[]; anchor: number; perpCost: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const safe = (s: string) => s.replace(/[^A-Za-z0-9]/g, '_');
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

async function cached<T>(cacheFile: string, paceMs: number, load: () => Promise<Response>): Promise<T> {
  try {
    return JSON.parse(await readFile(cacheFile, 'utf8')) as T;
  } catch { /* fetch */ }
  for (let attempt = 0; attempt < 6; attempt++) {
    const started = Date.now();
    const res = await load().catch(() => null); // قطعی شبکه (ECONNRESET، timeout) مثل 429 دوباره تلاش می‌شود
    if (!res || res.status === 429 || res.status >= 500) { await sleep(10_000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`${res.status} ${cacheFile}`);
    const j = (await res.json()) as T;
    await writeFile(cacheFile, JSON.stringify(j));
    await sleep(Math.max(0, paceMs - (Date.now() - started))); // paceMs = فاصلهٔ شروع تا شروع درخواست‌ها
    return j;
  }
  throw new Error(`rate limited: ${cacheFile}`);
}

// وزن candleSnapshot ≈ ۳۷ و fundingHistory ≈ ۴۵ از سقف ۱۲۰۰ در دقیقه برای هر IP
const info = <T>(body: object, file: string, paceMs: number) =>
  cached<T>(file, paceMs, () => fetch(INFO, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

/** کندل‌های روزانه روی محور روزها؛ شکاف تا maxGap روز با بستهٔ قبلی پر می‌شود (تعطیلی، قیمت نامعتبر).
 *  کریپتو ۲۴/۷ است و شکاف ندارد؛ پایان داده یعنی حذف از صرافی، پس آنجا پر نمی‌شود (نه قیمت ساختگی، نه فاندینگ) */
function align(byDay: Map<number, Bar>, days: number[], maxGap = MAX_GAP): (Bar | null)[] {
  let prev: Bar | null = null;
  let gap = 0;
  return days.map((d) => {
    const b = byDay.get(d);
    if (b) { prev = b; gap = 0; return b; }
    if (prev && ++gap <= maxGap) return { o: prev.c, h: prev.c, l: prev.c, c: prev.c, usd: 0, filled: true };
    return null;
  });
}

async function hlCandles(dir: string, coin: string, start: number, now: number): Promise<Map<number, Bar>> {
  const raw = await info<{ t: number; o: string; h: string; l: string; c: string; v: string }[]>(
    { type: 'candleSnapshot', req: { coin, interval: '1d', startTime: start, endTime: now } }, join(dir, `candles-${safe(coin)}.json`), 2_000);
  const out = new Map<number, Bar>();
  for (const k of raw) {
    if (k.t + DAY > now) continue; // کندل امروز هنوز بسته نشده
    const c = Number(k.c);
    if (c > 0) out.set(k.t, { o: Number(k.o), h: Number(k.h), l: Number(k.l), c, usd: Number(k.v) * c });
  }
  return out;
}

async function hlFunding(dir: string, coin: string, start: number): Promise<Map<number, number>> {
  const daily = new Map<number, number>();
  let from = start;
  for (let page = 0; page < 300; page++) {
    const rows = await info<{ time: number; fundingRate: string }[]>(
      { type: 'fundingHistory', coin, startTime: from }, join(dir, `funding-${safe(coin)}-${page}.json`), 2_400);
    for (const r of rows) {
      const d = Math.floor(r.time / DAY) * DAY;
      daily.set(d, (daily.get(d) ?? 0) + Number(r.fundingRate));
    }
    if (rows.length < 500) break;
    from = rows[rows.length - 1].time + 1;
  }
  return daily;
}

async function yahoo(dir: string, symbol: string, now: number): Promise<Map<number, Bar>> {
  type Chart = { chart: { result: { meta: { gmtoffset: number }; timestamp?: number[]; indicators: { quote: { open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] }[] } }[] } };
  const url = `${YAHOO}/${encodeURIComponent(symbol)}?period1=${TRADFI_START / 1000}&period2=${Math.floor(now / 1000)}&interval=1d`;
  const j = await cached<Chart>(join(dir, `yahoo-${safe(symbol)}.json`), 1_000, () => fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } }));
  const r = j.chart.result[0];
  const q = r.indicators.quote[0];
  const out = new Map<number, Bar>();
  const today = Math.floor(now / DAY) * DAY;
  (r.timestamp ?? []).forEach((t, i) => {
    const d = Math.floor((t + r.meta.gmtoffset) / 86_400) * DAY;
    const [o, h, l, c] = [q.open[i], q.high[i], q.low[i], q.close[i]];
    if (d >= today || !o || !h || !l || !c || o <= 0 || l <= 0 || c <= 0) return;
    out.set(d, { o, h, l, c, usd: (q.volume[i] ?? 0) * c });
  });
  return out;
}

function features(a: Asset): (Feat | null)[] {
  const { bars, funding } = a;
  return bars.map((b, i) => {
    if (!b || i < MIN_HISTORY) return null;
    const win = bars.slice(i - 199, i + 1);
    if (win.some((x) => !x)) return null;
    const w = win as Bar[];
    const closes = w.map((x) => x.c);
    const last30 = w.slice(-30);
    return {
      sma50: mean(closes.slice(-50)),
      sma200: mean(closes),
      ret7: b.c / closes[closes.length - 8] - 1,
      ret28: b.c / closes[closes.length - 29] - 1,
      dd30: b.c / Math.max(...last30.map((x) => x.h)) - 1,
      vol30: last30.reduce((s, x) => s + x.usd, 0),
      fund3: a.hasFunding ? mean(funding.slice(i - 2, i + 1)) : NaN,
      fund7: a.hasFunding ? mean(funding.slice(i - 6, i + 1)) : NaN
    };
  });
}

function contexts(assets: Asset[], feats: (Feat | null)[][], anchor: number, size: number): Ctx[] {
  return assets[0].bars.map((_, i) => {
    const live = assets.map((_, k) => k).filter((k) => feats[k][i]);
    const universe = new Set(live.sort((a, b) => feats[b][i]!.vol30 - feats[a][i]!.vol30).slice(0, size));
    const members = [...universe];
    const up = members.filter((k) => assets[k].bars[i]!.c > feats[k][i]!.sma50).length;
    const breadth = members.length ? up / members.length : 0;
    const f = feats[anchor][i];
    const regime = !!f && assets[anchor].bars[i]!.c > f.sma200 && breadth >= 0.5;
    const rank = (key: 'ret7' | 'ret28') =>
      new Map([...members].sort((x, y) => feats[y][i]![key] - feats[x][i]![key]).map((k, r) => [k, r]));
    return { universe, breadth, regime, rank7: rank('ret7'), rank28: rank('ret28') };
  });
}

type Signal = (f: Feat, close: number, ctx: Ctx, k: number) => boolean;
const BASE: Record<string, Signal> = {
  A_trend: (f, c) => c > f.sma50 && f.sma50 > f.sma200,
  B7_momentum: (f, _c, x, k) => (x.rank7.get(k) ?? 99) < 5 && f.ret7 > 0,
  B28_momentum: (f, _c, x, k) => (x.rank28.get(k) ?? 99) < 5 && f.ret28 > 0,
  C_pullback: (f, c) => c > f.sma200 && f.sma50 > f.sma200 && f.dd30 <= -0.10 && f.dd30 >= -0.25,
  D_negFunding: (f, c) => f.fund3 < 0 && c > f.sma50
};
const withRegime = (base: Record<string, Signal>): Record<string, Signal> => ({
  ...base,
  E_regime: (_f, _c, x) => x.regime,
  ...Object.fromEntries(Object.entries(base).map(([n, s]) => [`${n}+E`, ((f, c, x, k) => x.regime && s(f, c, x, k)) as Signal]))
});
/** D به تاریخچهٔ فاندینگ نیاز دارد که برای سهام/کامودیتی پیش از HIP-3 وجود ندارد */
const SIGNALS = {
  crypto: withRegime(BASE),
  tradfi: withRegime(Object.fromEntries(Object.entries(BASE).filter(([n]) => n !== 'D_negFunding')))
};

type Leg = { gross: number; mae: number; maeClose: number; fund: number };
type Trade = Leg & { bench: number };
/** اگر داده وسط معامله تمام شود (حذف کوین از صرافی)، خروج اجباری با آخرین بسته؛ حذفش معاملات بازنده را پنهان می‌کرد */
function trade(a: Asset, day: number, h: number): Leg | null {
  const entry = a.bars[day + 1];
  if (!entry || entry.filled) return null;
  let low = Infinity;
  let lowClose = Infinity;
  let fund = 0;
  let exit = entry.c;
  for (let j = day + 1; j <= day + h; j++) {
    const b = a.bars[j];
    if (!b) break;
    low = Math.min(low, b.l);
    lowClose = Math.min(lowClose, b.c);
    fund += a.funding[j] || a.fundPerBar;
    exit = b.c;
  }
  return { gross: exit / entry.o - 1, mae: low / entry.o - 1, maeClose: lowClose / entry.o - 1, fund };
}

/** معاملات رویدادها + بازده دارایی مرجع (BTC / S&P 500) در همان بازه، برای «بهتر از فقط نگه‌داشتن مرجع؟» */
function tradesOf(g: Group, evs: Event[], h: number): Trade[] {
  const out: Trade[] = [];
  for (const e of evs) {
    const t = trade(g.assets[e.asset], e.day, h);
    if (!t) continue;
    out.push({ ...t, bench: trade(g.assets[g.anchor], e.day, h)?.gross ?? NaN });
  }
  return out;
}

function events(g: Group, sig: Signal, h: number, from: number, to: number): Event[] {
  const out: Event[] = [];
  g.assets.forEach((a, k) => {
    for (let i = from; i + h <= to; i++) {
      const f = g.feats[k][i];
      if (!f || a.bars[i]!.filled || !g.ctx[i].universe.has(k) || !sig(f, a.bars[i]!.c, g.ctx[i], k)) continue;
      out.push({ asset: k, day: i });
      i += h; // قفل تا خروج
    }
  });
  return out;
}

const spotNet = (t: Leg) => t.gross - SPOT_COST;
const p5 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.05)] ?? 0;

function stats(trades: Trade[], perpCost: number) {
  const net = trades.map(spotNet).sort((a, b) => a - b);
  const vsBench = trades.filter((t) => Number.isFinite(t.bench));
  return {
    n: trades.length,
    meanSpot: mean(net),
    meanPerp: mean(trades.map((t) => t.gross - perpCost - t.fund)),
    median: median(net) ?? 0,
    win: net.filter((x) => x > 0).length / Math.max(1, net.length),
    worst: net[0] ?? 0,
    mae5: p5(trades.map((t) => t.mae)),
    maeClose5: p5(trades.map((t) => t.maeClose)),
    /** میانگین بازده منهای بازده مرجع در همان بازه، و سهم معاملاتی که از مرجع بهتر بودند */
    excess: mean(vsBench.map((t) => t.gross - t.bench)),
    beatBench: vsBench.filter((t) => t.gross > t.bench).length / Math.max(1, vsBench.length)
  };
}

/** نال جابه‌جایی مشترک: همهٔ ورودها با یک آفست تصادفی در بازهٔ [from, to-h] چرخانده می‌شوند */
function nullP(g: Group, evs: Event[], real: number, h: number, from: number, to: number, rnd: () => number, draws = NULL_DRAWS): number {
  const span = to - h - from + 1;
  if (span < 2 * h || !evs.length) return 1;
  let beat = 0;
  for (let d = 0; d < draws; d++) {
    const off = h + Math.floor(rnd() * (span - 2 * h));
    let sum = 0, n = 0;
    for (const e of evs) {
      // فقط روزهایی که همان دارایی در جهان بوده؛ وگرنه نال روزهای پرنوسانِ پس از لیست‌شدن را هم می‌گیرد
      // و آزمون بی‌جهت سخت‌گیر می‌شود (واسنجی دور اول: میانگین p تصادفی ≈ ۰.۷ به‌جای ۰.۵)
      const day = from + ((e.day - from + off) % span);
      if (!g.ctx[day].universe.has(e.asset) || g.assets[e.asset].bars[day]?.filled) continue;
      const t = trade(g.assets[e.asset], day, h);
      if (t) { sum += spotNet(t); n++; }
    }
    if (n && sum / n >= real) beat++;
  }
  return (beat + 1) / (draws + 1);
}

/** واسنجی آزمون: ورودهای کاملاً تصادفی (۳٪ روزها، همان قفل تا خروج). اگر آزمون سالم باشد p این‌ها
 *  باید پخش یکنواخت داشته باشد: حدود ۵٪ زیر ۰.۰۵ و تقریباً هیچ‌کدام زیر آستانهٔ بونفرونی */
function calibration(g: Group, from: number, to: number, runs = 20, h = 5): number[] {
  const ps: number[] = [];
  for (let s = 0; s < runs; s++) {
    const r = mulberry(1_000 + s);
    const evs: Event[] = [];
    g.assets.forEach((a, k) => {
      for (let i = from; i + h <= to; i++) {
        if (!g.feats[k][i] || a.bars[i]!.filled || !g.ctx[i].universe.has(k) || r() >= 0.03) continue;
        evs.push({ asset: k, day: i });
        i += h;
      }
    });
    const real = mean(tradesOf(g, evs, h).map(spotNet));
    ps.push(nullP(g, evs, real, h, from, to, mulberry(7_000 + s), 500));
  }
  return ps;
}

/** کندل‌های مشکوک: فتیلهٔ پایین بیش از ۵۰٪ زیر کمینهٔ باز/بسته (معمولاً معاملهٔ اشتباه در دفتر کم‌عمق) */
function wickAudit(g: Group) {
  const out: { asset: string; day: string; wick: number }[] = [];
  let bars = 0;
  g.assets.forEach((a) => a.bars.forEach((b, i) => {
    if (!b || b.filled) return;
    bars++;
    const wick = b.l / Math.min(b.o, b.c) - 1;
    if (wick <= -0.5) out.push({ asset: a.name, day: iso(g.days[i]), wick });
  }));
  return { bars, suspicious: out.length, worst: out.sort((x, y) => x.wick - y.wick).slice(0, 8) };
}

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** F: آیا روزهای شلوغ (فاندینگ ۷ روزه در دهک بالای گذشتهٔ خودش) احتمال افت بزرگ را بالا می‌برند؟ */
function crowding(g: Group) {
  const { assets, feats, ctx, days, anchor } = g;
  const coinLevel = { hot: { n: 0, hit: 0 }, normal: { n: 0, hit: 0 } };
  assets.forEach((a, k) => {
    for (let i = MIN_HISTORY + 90; i + 7 < days.length; i++) {
      const f = feats[k][i];
      if (!f || !a.hasFunding || !ctx[i].universe.has(k)) continue;
      const past = feats[k].slice(i - 90, i).filter((x): x is Feat => !!x).map((x) => x.fund7);
      if (past.length < 60) continue;
      const t = trade(a, i, 7);
      if (!t) continue;
      const grp = past.filter((x) => x < f.fund7).length / past.length >= 0.9 ? coinLevel.hot : coinLevel.normal;
      grp.n++;
      if (t.mae <= -0.15) grp.hit++;
    }
  });
  const mkt = days.map((_, i) => {
    const m = [...ctx[i].universe].map((k) => feats[k][i]!.fund7).filter(Number.isFinite);
    return m.length >= 5 ? median(m) : NaN;
  });
  const pctileBefore = (i: number) => {
    const past = mkt.slice(Math.max(0, i - 180), i).filter(Number.isFinite);
    return past.length >= 120 && Number.isFinite(mkt[i]) ? past.filter((x) => x < mkt[i]).length / past.length : null;
  };
  // روزهای شلوغ پشت سر هم‌اند؛ «دوره» = رشتهٔ پیوستهٔ روزهای شلوغ. hitClose = افت با قیمت بسته (بدون فتیله)
  const market = { hot: { n: 0, hit: 0, hitClose: 0, episodes: 0, episodesWithDrop: 0 }, normal: { n: 0, hit: 0, hitClose: 0 } };
  let inEpisode = false;
  let episodeDrop = false;
  for (let i = MIN_HISTORY; i + 7 < days.length; i++) {
    const p = pctileBefore(i);
    const t = trade(assets[anchor], i, 7);
    if (p == null || !t) continue;
    const hot = p >= 0.9;
    if (hot && !inEpisode) { market.hot.episodes++; episodeDrop = false; }
    if (!hot && inEpisode && episodeDrop) market.hot.episodesWithDrop++;
    inEpisode = hot;
    const grp = hot ? market.hot : market.normal;
    grp.n++;
    if (t.mae <= -0.10) { grp.hit++; if (hot) episodeDrop = true; }
    if (t.maeClose <= -0.10) grp.hitClose++;
  }
  if (inEpisode && episodeDrop) market.hot.episodesWithDrop++;
  // بدترین روزهای بازار (میانهٔ بازده یک‌روزهٔ جهان) و شلوغی روز قبلشان
  const dayRet = days.map((_, i) => {
    if (i === 0) return NaN;
    const r = [...ctx[i - 1].universe].map((k) => {
      const [b, p] = [assets[k].bars[i], assets[k].bars[i - 1]];
      return b && p ? b.c / p.c - 1 : NaN;
    }).filter(Number.isFinite);
    return r.length >= 10 ? median(r) : NaN;
  });
  const worst = days.map((d, i) => ({ d, i, r: dayRet[i] })).filter((x) => Number.isFinite(x.r)).sort((a, b) => a.r - b.r).slice(0, 10)
    .map(({ d, i, r }) => ({ day: iso(d), medianRet: r, crowdPctileDayBefore: pctileBefore(i - 1) }));
  return { coinLevel, market, worst };
}

function finish(g: Group, size: number): Group {
  g.feats = g.assets.map(features);
  g.ctx = contexts(g.assets, g.feats, g.anchor, size);
  return g;
}

async function cryptoGroup(dir: string, now: number): Promise<Group> {
  const days: number[] = [];
  for (let d = CRYPTO_START; d + DAY <= now; d += DAY) days.push(d);
  const [meta] = await info<[{ universe: { name: string; isDelisted?: boolean }[] }, unknown]>({ type: 'metaAndAssetCtxs' }, join(dir, 'meta.json'), 500);
  const names = meta.universe.filter((u) => VARIANT === 'realistic' || (!u.isDelisted && !EXCLUDE.has(u.name))).map((u) => u.name);
  const assets: Asset[] = [];
  for (const name of names) {
    process.stderr.write(`candles ${name}\n`);
    assets.push({ name, bars: align(await hlCandles(dir, name, CRYPTO_START, now), days, 0), funding: days.map(() => 0), fundPerBar: 0, hasFunding: false });
  }
  const anchor = names.indexOf('BTC');
  // مرحلهٔ دوم: فاندینگ کامل فقط برای کوین‌هایی که دست‌کم MIN_FUNDING_DAYS روز در جهان بوده‌اند (سقف درخواست
  // هایپرلیکوئید)؛ D و F فقط روی این‌ها، هزینهٔ پرپ بقیه = میانهٔ فاندینگ روزانهٔ این‌ها
  const g = finish({ id: 'crypto', assets, days, feats: [], ctx: [], anchor, perpCost: 0.0015 }, CRYPTO_UNIVERSE);
  const daysIn = new Map<number, number>();
  for (const c of g.ctx) for (const k of c.universe) daysIn.set(k, (daysIn.get(k) ?? 0) + 1);
  let top = [...daysIn].filter(([, n]) => n >= MIN_FUNDING_DAYS).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  if (VARIANT === 'realistic') {
    // فقط فاندینگ‌هایی که نسخهٔ personal دانلود کرده؛ سیگنال‌های اسپات به فاندینگ نیاز ندارند
    const has = await Promise.all(top.map((k) => readFile(join(dir, `funding-${safe(assets[k].name)}-0.json`)).then(() => true, () => false)));
    top = top.filter((_, i) => has[i]);
  }
  process.stderr.write(`funding for ${top.length} of ${daysIn.size} coins\n`);
  for (const k of top) {
    process.stderr.write(`funding ${assets[k].name}\n`);
    const daily = await hlFunding(dir, assets[k].name, CRYPTO_START);
    assets[k].funding = days.map((d) => daily.get(d) ?? 0);
    assets[k].hasFunding = true;
  }
  const typical = median(top.map((k) => mean([...assets[k].funding].filter((x) => x !== 0))));
  for (const a of assets) if (!a.hasFunding) a.fundPerBar = typical;
  return finish(g, CRYPTO_UNIVERSE);
}

async function tradfiGroup(dir: string, now: number): Promise<Group> {
  const raw = new Map<string, Map<number, Bar>>();
  for (const [market, symbol] of Object.entries(TRADFI)) {
    process.stderr.write(`yahoo ${symbol}\n`);
    try {
      raw.set(market, await yahoo(dir, symbol, now));
    } catch (e) {
      process.stderr.write(`  skip ${symbol}: ${e instanceof Error ? e.message : e}\n`);
    }
  }
  const days = [...new Set([...raw.values()].flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);
  const assets: Asset[] = [];
  for (const [market, bars] of raw) {
    // میانگین فاندینگ روزانهٔ بازار HIP-3 از راه‌اندازی، هزینهٔ پرپ کل دوره فرض می‌شود
    process.stderr.write(`funding xyz:${market}\n`);
    const daily = await hlFunding(dir, `xyz:${market}`, CRYPTO_START).catch(() => new Map<number, number>());
    const fundPerBar = daily.size ? mean([...daily.values()]) * (7 / 5) : 0; // روز معاملاتی ← روز تقویمی
    assets.push({ name: market, bars: align(bars, days), funding: days.map(() => 0), fundPerBar, hasFunding: false });
  }
  return finish({ id: 'tradfi', assets, days, feats: [], ctx: [], anchor: assets.findIndex((a) => a.name === 'SP500'), perpCost: 0.003 }, Infinity);
}

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: node scripts/swing-backtest.ts <dataDir>');
  await mkdir(dir, { recursive: true });
  const now = Date.now();
  const groups = [await cryptoGroup(dir, now), await tradfiGroup(dir, now)];
  const K = groups.reduce((s, g) => s + Object.keys(SIGNALS[g.id]).length * HORIZONS.length, 0);
  const rnd = mulberry(42);

  const report: Record<string, unknown> = { generatedAt: new Date(now).toISOString(), tests: K, pThreshold: ALPHA / K };
  for (const g of groups) {
    const first = g.ctx.findIndex((x) => x.universe.size >= 10);
    const holdStart = g.days.findIndex((d) => d >= now - HOLDOUT_DAYS * DAY);
    const last = g.days.length - 1;
    const rows: Record<string, unknown>[] = [];
    const eMean = new Map<number, number>();
    for (const h of HORIZONS) {
      for (const [name, sig] of Object.entries(SIGNALS[g.id])) {
        const evs = events(g, sig, h, first, holdStart - 1);
        const trades = tradesOf(g, evs, h);
        const s = stats(trades, g.perpCost);
        if (name === 'E_regime') eMean.set(h, s.meanSpot);
        const p = nullP(g, evs, s.meanSpot, h, first, holdStart - 1, rnd);
        const beatsE = !name.endsWith('+E') || s.meanSpot > (eMean.get(h) ?? Infinity);
        const pass = s.n >= MIN_TRADES && s.meanSpot > 0 && p < ALPHA / K && beatsE;
        const candidate = CANDIDATES[g.id].some(([n, hh]) => n === name && hh === h);
        const row: Record<string, unknown> = { signal: name, h, ...s, p, beatsE, pass, candidate };
        if (pass || candidate) {
          const hev = events(g, sig, h, holdStart, last);
          const hs = stats(tradesOf(g, hev, h), g.perpCost);
          row.holdout = { ...hs, p: nullP(g, hev, hs.meanSpot, h, holdStart, last, rnd) };
        }
        rows.push(row);
      }
    }
    const used = new Set(g.ctx.flatMap((c) => [...c.universe]));
    report[g.id] = {
      assets: g.assets.filter((_, k) => used.has(k)).map((a) => a.name),
      inSample: [iso(g.days[first]), iso(g.days[holdStart - 1])],
      holdout: [iso(g.days[holdStart]), iso(g.days[last])],
      rows,
      calibration: calibration(g, first, holdStart - 1),
      wicks: wickAudit(g),
      crowd: g.id === 'crypto' ? crowding(g) : undefined
    };
  }
  await writeFile(join(dir, `report-${VARIANT}.json`), JSON.stringify(report, null, 1));

  console.log(`variant=${VARIANT} | K=${K} tests, p < ${(ALPHA / K).toFixed(5)}`);
  for (const g of groups) {
    const r = report[g.id] as any;
    console.log(`\n=== ${g.id}: ${r.assets.length} assets | in-sample ${r.inSample.join(' → ')} | holdout ${r.holdout.join(' → ')}`);
    console.log('signal | H | n | win | mean spot | mean perp | median | excess vs anchor | beat anchor | MAE p5 (low/close) | p | pass | holdout n/win/mean/excess/p');
    for (const x of r.rows) {
      const ho = x.holdout ? `${x.holdout.n} / ${pct(x.holdout.win)} / ${pct(x.holdout.meanSpot)} / ${pct(x.holdout.excess)} / ${x.holdout.p.toFixed(3)}` : '-';
      console.log(`${x.signal}${x.candidate ? '*' : ''} | ${x.h} | ${x.n} | ${pct(x.win)} | ${pct(x.meanSpot)} | ${pct(x.meanPerp)} | ${pct(x.median)} | ${pct(x.excess)} | ${pct(x.beatBench)} | ${pct(x.mae5)}/${pct(x.maeClose5)} | ${x.p.toFixed(4)} | ${x.pass ? 'PASS' : 'fail'} | ${ho}`);
    }
    const cal = r.calibration as number[];
    console.log(`calibration (20 random signals, h=5): p<0.05 in ${cal.filter((p) => p < 0.05).length}/20, p<${(ALPHA / K).toFixed(5)} in ${cal.filter((p) => p < ALPHA / K).length}/20; ps=${cal.map((p) => p.toFixed(2)).join(',')}`);
    console.log(`wick audit: ${r.wicks.suspicious} of ${r.wicks.bars} bars with low >50% below body; worst: ${r.wicks.worst.map((w: any) => `${w.asset} ${w.day} ${pct(w.wick)}`).join(', ')}`);
    if (r.crowd) {
      const rate = (q: { n: number; hit: number }) => `${q.hit}/${q.n} = ${pct(q.hit / Math.max(1, q.n))}`;
      const m = r.crowd.market;
      console.log(`\nF coin: P(MAE7 ≤ -15%) hot ${rate(r.crowd.coinLevel.hot)} | normal ${rate(r.crowd.coinLevel.normal)}`);
      console.log(`F market: P(BTC MAE7 ≤ -10%) hot ${rate(m.hot)} | normal ${rate(m.normal)}`);
      console.log(`F market (close-based): hot ${m.hot.hitClose}/${m.hot.n} | normal ${m.normal.hitClose}/${m.normal.n}; hot episodes ${m.hot.episodes}, with a ≥10% BTC drop ${m.hot.episodesWithDrop}`);
      console.log('worst market days (median coin return, crowding pctile day before):');
      for (const w of r.crowd.worst) console.log(`  ${w.day} ${pct(w.medianRet)} ${w.crowdPctileDayBefore == null ? '-' : pct(w.crowdPctileDayBefore)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
