/** ============================================================
 * Gold Backtest — آیا «حباب پایین» طلای ۱۸ عیار و سکه در بازار ایران نشانهٔ خرید بوده است؟
 *
 *  داده: tgju (روزانه، از ۲۰۱۳): geram18 (ریال/گرم)، price_dollar_rl (دلار آزاد، ریال)، ons (انس، دلار)،
 *        sekee / nim / rob (سکهٔ امامی، نیم، ربع، ریال)
 *  حباب = قیمت ایران ÷ ارزش طلای خالص با انس × دلار آزاد − ۱
 *        طلای ۱۸: ۰.۷۵ گرم خالص در هر گرم؛ سکهٔ امامی ۷.۳۲۲۴ گرم خالص (۸.۱۳۶ گرم × ۰.۹)، نیم و ربع نصف و یک‌چهارم
 *
 *  قاعده‌ها (پیش از دیدن نتیجه ثابت شده‌اند):
 *   - سیگنال روی بستهٔ روز t، ورود بستهٔ روز معاملاتی بعد، خروج پس از H روز معاملاتی (۲۰ و ۶۰)، قفل تا خروج
 *   - هزینهٔ رفت‌وبرگشت: طلای آب‌شده آنلاین ۱٪، سکه ۲٪ (اختلاف خرید و فروش صرافی‌ها)
 *   - LOW_PCT: حباب امروز در ۲۰٪ پایین ۲۵۰ روز گذشتهٔ خودش؛ LOW_ABS: حباب زیر −۳٪ (فقط طلای ۱۸)
 *   - نال جابه‌جایی زمانی مشترک (مثل swing-backtest)، بونفرونی روی همهٔ آزمون‌ها، دو سال آخر مهروموم
 *   - سازوکار: آیا بعد از حباب پایین، خودِ حباب بالا رفته (بازگشت به میانگین)؟
 *
 *  اجرا: node scripts/gold-backtest.ts <dataDir>
 * ============================================================ */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const API = 'https://api.tgju.org/v1/market/indicator/summary-table-data';
const SYMBOLS = ['geram18', 'price_dollar_rl', 'ons', 'sekee', 'nim', 'rob'] as const;
const GRAMS_PER_OUNCE = 31.1034768;
const PURE_GRAMS: Record<string, number> = { geram18: 0.75, sekee: 7.3224, nim: 3.6612, rob: 1.8306 };
const COST: Record<string, number> = { geram18: 0.01, sekee: 0.02, nim: 0.02, rob: 0.02 };
const HORIZONS = [20, 60];
const LOOKBACK = 250;
const HOLDOUT_DAYS = 730;
const NULL_DRAWS = 2000;
const MIN_TRADES = 20;
const ALPHA = 0.05;
const DAY = 86_400_000;

type Row = { t: number; close: number };
const num = (s: string) => Number(String(s).replace(/,/g, ''));
const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);

async function history(dir: string, symbol: string): Promise<Map<number, number>> {
  const file = join(dir, `tgju-${symbol}.json`);
  let body: { data: string[][] };
  try {
    body = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    const res = await fetch(`${API}/${symbol}?lang=fa&start=0&length=20000&order_col=timestamp&order_dir=desc`, {
      headers: { accept: 'application/json', referer: 'https://www.tgju.org/', 'user-agent': 'Mozilla/5.0' }
    });
    if (!res.ok) throw new Error(`${symbol} HTTP ${res.status}`);
    body = (await res.json()) as { data: string[][] };
    await writeFile(file, JSON.stringify(body));
    await new Promise((r) => setTimeout(r, 1_500));
  }
  const out = new Map<number, number>();
  for (const r of body.data) {
    const [y, m, d] = String(r[6]).split('/').map(Number);
    const close = num(r[3]);
    if (y && m && d && close > 0) out.set(Date.UTC(y, m - 1, d), close);
  }
  return out;
}

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Series { asset: string; days: number[]; price: number[]; premium: number[] }

/** روزهایی که قیمت ایران، دلار و انس همه دارند (ریال؛ انس آخرین مقدار تا همان روز) */
function series(asset: string, h: Record<string, Map<number, number>>): Series {
  const ons = [...h.ons].sort((a, b) => a[0] - b[0]);
  const days: number[] = [], price: number[] = [], premium: number[] = [];
  let j = 0;
  let o: number | null = null;
  for (const t of [...h[asset].keys()].sort((a, b) => a - b)) {
    while (j < ons.length && ons[j][0] <= t) o = ons[j++][1];
    const usd = h.price_dollar_rl.get(t);
    const p = h[asset].get(t)!;
    if (!o || !usd) continue;
    const intrinsic = (o / GRAMS_PER_OUNCE) * PURE_GRAMS[asset] * usd;
    const prem = p / intrinsic - 1;
    if (!Number.isFinite(prem) || Math.abs(prem) > 1) continue; // دادهٔ خراب
    days.push(t); price.push(p); premium.push(prem);
  }
  return { asset, days, price, premium };
}

type Signal = (s: Series, i: number) => boolean;
const lowPct: Signal = (s, i) => {
  if (i < LOOKBACK) return false;
  const past = s.premium.slice(i - LOOKBACK, i);
  return past.filter((x) => x < s.premium[i]).length / past.length <= 0.2;
};
const lowAbs: Signal = (s, i) => s.premium[i] < -0.03;
const always: Signal = (_s, i) => i >= LOOKBACK;

function events(s: Series, sig: Signal, h: number, from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i + 1 + h <= to; i++) if (sig(s, i)) { out.push(i); i += h; }
  return out;
}
const ret = (s: Series, i: number, h: number) => s.price[i + 1 + h] / s.price[i + 1] - 1 - COST[s.asset];
const premDelta = (s: Series, i: number, h: number) => s.premium[i + 1 + h] - s.premium[i + 1];

function nullP(s: Series, evs: number[], real: number, h: number, from: number, to: number, rnd: () => number): number {
  const span = to - h - 1 - from;
  if (span < 2 * h || !evs.length) return 1;
  let beat = 0;
  for (let d = 0; d < NULL_DRAWS; d++) {
    const off = h + Math.floor(rnd() * (span - 2 * h));
    const m = mean(evs.map((i) => ret(s, from + ((i - from + off) % span), h)));
    if (m >= real) beat++;
  }
  return (beat + 1) / (NULL_DRAWS + 1);
}

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: node scripts/gold-backtest.ts <dataDir>');
  await mkdir(dir, { recursive: true });
  const h: Record<string, Map<number, number>> = {};
  for (const sym of SYMBOLS) h[sym] = await history(dir, sym);
  const assets = ['geram18', 'sekee', 'nim', 'rob'];
  const tests: [string, Signal][] = [['LOW_PCT', lowPct], ['LOW_ABS', lowAbs], ['ALL_DAYS', always]];
  const plan = assets.flatMap((a) => tests.filter(([n]) => n !== 'LOW_ABS' || a === 'geram18').filter(([n]) => n !== 'ALL_DAYS').map(([n, f]) => [a, n, f] as const));
  const K = plan.length * HORIZONS.length;
  const rnd = mulberry(7);
  const now = Date.now();

  console.log(`K=${K} tests, p < ${(ALPHA / K).toFixed(4)}`);
  for (const a of assets) {
    const s = series(a, h);
    const hold = s.days.findIndex((t) => t >= now - HOLDOUT_DAYS * DAY);
    const p = [...s.premium].sort((x, y) => x - y);
    console.log(`\n=== ${a}: ${s.days.length} days ${iso(s.days[0])} → ${iso(s.days[s.days.length - 1])} | holdout from ${iso(s.days[hold])}`);
    console.log(`premium now ${pct(s.premium[s.premium.length - 1])} | p10 ${pct(p[Math.floor(p.length * 0.1)])} median ${pct(p[Math.floor(p.length / 2)])} p90 ${pct(p[Math.floor(p.length * 0.9)])}`);
    console.log('rule | H | n | win | mean net | median | vs all-days | Δpremium after | p | pass | holdout n/win/mean/p');
    for (const hz of HORIZONS) {
      const base = events(s, always, hz, LOOKBACK, hold);
      const baseMean = mean(base.map((i) => ret(s, i, hz)));
      for (const [name, sig] of tests) {
        if (name === 'LOW_ABS' && a !== 'geram18') continue;
        const evs = events(s, sig, hz, LOOKBACK, hold);
        const r = evs.map((i) => ret(s, i, hz)).sort((x, y) => x - y);
        const m = mean(r);
        const dp = mean(evs.map((i) => premDelta(s, i, hz)));
        const isTest = name !== 'ALL_DAYS';
        const pv = isTest ? nullP(s, evs, m, hz, LOOKBACK, hold, rnd) : NaN;
        const pass = isTest && evs.length >= MIN_TRADES && m > baseMean && pv < ALPHA / K;
        let ho = '-';
        if (pass) {
          const hev = events(s, sig, hz, hold, s.days.length);
          const hm = mean(hev.map((i) => ret(s, i, hz)));
          ho = `${hev.length} / ${pct(hev.filter((i) => ret(s, i, hz) > 0).length / Math.max(1, hev.length))} / ${pct(hm)} / ${nullP(s, hev, hm, hz, hold, s.days.length, rnd).toFixed(3)}`;
        }
        console.log(`${name} | ${hz} | ${evs.length} | ${pct(r.filter((x) => x > 0).length / Math.max(1, r.length))} | ${pct(m)} | ${pct(r[Math.floor(r.length / 2)] ?? 0)} | ${pct(m - baseMean)} | ${pct(dp)} | ${isTest ? pv.toFixed(4) : '-'} | ${isTest ? (pass ? 'PASS' : 'fail') : 'baseline'} | ${ho}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
