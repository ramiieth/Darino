/**
 * «اگر به‌جای تتر/یو اس دی سی، دلار بازده‌دار خریده بودم» — بخش خالص
 *
 *   داده: DeFiLlama yields (/pools برای فهرست، /chart/{pool} برای APY روزانهٔ واقعی هر بازار)
 *   محاسبه: سرمایه × ∏ (1 + APY روز/100)^(1/365) روی همان روزهای بازه — بازدهی که واقعاً پرداخت شده، نه نرخ امروز.
 *   مبنا: نگه داشتن تتر/یو اس دی سی بی‌کار = صفر بازده.
 *   پاداش توکنی (apyReward) جداست: قیمتش تضمین‌شده نیست، پیش‌فرض حساب نمی‌شود.
 *   محدودیت صادقانه: نوسان قیمت توکن (دی‌پگ) در APY نیست؛ ریسک هر بازار جدا نوشته می‌شود.
 */

export interface PoolRow {
  pool: string;
  project: string;
  chain: string;
  symbol: string;
  tvlUsd: number;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  stablecoin: boolean;
  exposure: string | null;
  outlier: boolean;
  poolMeta: string | null;
}

export interface ChartPoint {
  timestamp: string;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
}

export type MarketKind = 'savings' | 'synthetic' | 'credit' | 'lending' | 'vault' | 'treasury' | 'newer';

export interface StableMarket {
  pool: string;
  project: string;
  chain: string;
  symbol: string;
  meta: string | null;
  tvlUsd: number;
  apyNow: number | null;
  rewardNow: number;
  kind: MarketKind;
  /** فقط سرمایه‌گذار نهادی/تأییدشده (KYC، حداقل سرمایهٔ بالا) */
  restricted: boolean;
  /** دورهٔ انتظار خروج از متن بازار (مثلاً «۷ روز») */
  lockup: string | null;
  /** همین دارایی را مستقیم با تتر یا یو اس دی سی می‌گیرد (بی‌نیاز از تبدیل) */
  direct: 'USDT' | 'USDC' | null;
}

export const KIND_FA: Record<MarketKind, { label: string; risk: string }> = {
  savings: { label: 'نرخ پس‌انداز پروتکل', risk: 'نرخ را حاکمیت پروتکل تعیین می‌کند و ممکن است کم شود؛ ریسک قرارداد هوشمند.' },
  synthetic: { label: 'دلار مصنوعی (فاندینگ)', risk: 'بازده از فاندینگ پرپ‌هاست؛ در بازار نزولی کم یا منفی می‌شود و احتمال دی‌پگ هست.' },
  credit: { label: 'وام اعتباری نهادی', risk: 'به وام‌گیرندگان نهادی قرض داده می‌شود؛ ریسک نکول و صف خروج.' },
  lending: { label: 'وام‌دهی', risk: 'نرخ متغیر با تقاضای وام؛ در استفادهٔ بالا برداشت ممکن است کند شود.' },
  vault: { label: 'خزانهٔ مدیریت‌شده', risk: 'یک مدیر (curator) پول را بین بازارهای وام پخش می‌کند؛ ریسک انتخاب وثیقه‌ها.' },
  treasury: { label: 'اوراق خزانهٔ آمریکا', risk: 'کم‌ریسک‌ترین منبع بازده؛ معمولاً KYC و حداقل سرمایه دارد.' },
  newer: { label: 'پروتکل جدیدتر', risk: 'سابقهٔ کوتاه و ساختار پیچیده‌تر؛ بازده بالاتر یعنی ریسک بالاتر.' }
};

const KIND_BY_PROJECT: Record<string, MarketKind> = {
  'sky-lending': 'savings',
  'spark-savings': 'savings',
  'aave-v3': 'lending',
  sparklend: 'lending',
  'compound-v3': 'lending',
  'fluid-lending': 'lending',
  'jupiter-lend': 'lending',
  'kamino-lend': 'lending',
  'justlend-v1': 'lending',
  'lista-lending': 'lending',
  'hyperliquid-earn': 'lending',
  'euler-v2': 'lending',
  'morpho-blue': 'vault',
  'sentora-curator': 'vault',
  'ethena-usde': 'synthetic',
  maple: 'credit',
  'pareto-credit': 'credit',
  'blackrock-buidl': 'treasury',
  'invesco-ustb': 'treasury',
  'centrifuge-protocol': 'treasury',
  'ondo-finance': 'treasury',
  'midas-rwa': 'treasury',
  'franklin-templeton': 'treasury'
};

/** فقط سرمایه‌گذار نهادی/تأییدشده */
const RESTRICTED = new Set(['blackrock-buidl', 'invesco-ustb', 'centrifuge-protocol', 'franklin-templeton', 'midas-rwa']);

/** پول‌هایی که دلار بازده‌دار نیستند (صندوق بازارساز، وثیقهٔ بی‌بازده) */
const EXCLUDED_PROJECTS = new Set(['hyperliquid-hlp']);

const NON_USD = /EUR|CHF|GBP|JPY|AUD|CAD|SGD|XAU|GOLD|BRL|TRY/i;

export const PROJECT_FA: Record<string, string> = {
  'sky-lending': 'اسکای',
  'spark-savings': 'اسپارک',
  sparklend: 'اسپارک‌لند',
  maple: 'میپل',
  'ethena-usde': 'اتنا',
  'blackrock-buidl': 'بلک‌راک BUIDL',
  'aave-v3': 'آوه',
  'morpho-blue': 'مورفو',
  'jupiter-lend': 'ژوپیتر',
  'kamino-lend': 'کامینو',
  'fluid-lending': 'فلوئید',
  'usual-usd0': 'یوژوال',
  'usd-ai': 'یو‌اس‌دی ای‌آی',
  'invesco-ustb': 'اینوسکو USTB',
  'centrifuge-protocol': 'سنتری‌فیوج',
  'justlend-v1': 'جاست‌لند',
  'hyperliquid-earn': 'هایپرلیکوئید',
  'sentora-curator': 'سنتورا',
  'pareto-credit': 'پارتو',
  'midas-rwa': 'میداس',
  'compound-v3': 'کامپاوند',
  'lista-lending': 'لیستا',
  'euler-v2': 'اویلر'
};

function lockupOf(meta: string | null): string | null {
  if (!meta) return null;
  const m = /(\d+)\s*-?\s*(d|day|days)\b/i.exec(meta);
  if (m) return `${m[1].replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])} روز`;
  return /lock|unstak|cooldown/i.test(meta) ? 'دارد' : null;
}

/**
 * فهرست بازارهای دلار بازده‌دار از روی همهٔ پول‌ها:
 *   استیبل، تک‌دارایی، دلاری، TVL کافی، بازده مثبت، بدون داده پرت؛ هر محصول (پروژه+نماد+متا) یک بار — بزرگ‌ترین شبکه.
 */
export function pickStableMarkets(pools: readonly PoolRow[], opts: { minTvlUsd?: number; limit?: number } = {}): StableMarket[] {
  const minTvl = opts.minTvlUsd ?? 40e6;
  const best = new Map<string, PoolRow>();
  for (const p of pools) {
    if (!p.stablecoin || p.exposure !== 'single' || p.outlier) continue;
    if (EXCLUDED_PROJECTS.has(p.project) || NON_USD.test(p.symbol)) continue;
    if (!(p.tvlUsd >= minTvl)) continue;
    if (!((p.apy ?? 0) > 0.05)) continue;
    const key = `${p.project}|${p.symbol.toUpperCase()}|${(p.poolMeta ?? '').toLowerCase()}`;
    const prev = best.get(key);
    if (!prev || p.tvlUsd > prev.tvlUsd) best.set(key, p);
  }
  return [...best.values()]
    .sort((a, b) => b.tvlUsd - a.tvlUsd)
    .slice(0, opts.limit ?? 24)
    .map((p) => {
      const sym = p.symbol.toUpperCase();
      return {
        pool: p.pool,
        project: p.project,
        chain: p.chain,
        symbol: p.symbol,
        meta: p.poolMeta,
        tvlUsd: p.tvlUsd,
        apyNow: p.apy,
        rewardNow: p.apyReward ?? 0,
        kind: KIND_BY_PROJECT[p.project] ?? 'newer',
        restricted: RESTRICTED.has(p.project),
        lockup: lockupOf(p.poolMeta),
        direct: sym === 'USDT' || sym === 'USDT0' ? 'USDT' : sym === 'USDC' ? 'USDC' : null
      };
    });
}

/** نرخ یک روز: بدون پاداش = apyBase (اگر نبود و پاداشی هم نبود، apy)؛ با پاداش = apy */
export function dayRate(p: ChartPoint, includeRewards: boolean): number | null {
  if (includeRewards) return p.apy ?? (p.apyBase !== null || p.apyReward !== null ? (p.apyBase ?? 0) + (p.apyReward ?? 0) : null);
  if (p.apyBase !== null && p.apyBase !== undefined) return p.apyBase;
  return p.apyReward ? null : p.apy;
}

export interface YieldSim {
  /** ضریب رشد سرمایه در بازه (۱ = بی‌تغییر) */
  growth: number;
  /** میانگین APY روزهای دارای داده */
  avgApy: number | null;
  /** روزهای بازه که داده داشتند */
  coveredDays: number;
  totalDays: number;
  /** اولین روز دارای داده داخل بازه (اگر دیرتر از شروع بازه بود، بازه ناقص است) */
  firstDay: number | null;
  partial: boolean;
  /** ارزش روزانه به‌ازای ۱ دلار (برای نمودار) */
  daily: { t: number; growth: number }[];
}

const DAY = 86_400_000;
/** نبود دادهٔ چند روزه با آخرین نرخ پر می‌شود؛ بیشتر از این = روز بدون داده */
const MAX_CARRY_DAYS = 7;

export function simulateYield(chart: readonly ChartPoint[], from: number, to: number, includeRewards: boolean): YieldSim {
  const pts = chart
    .map((p) => ({ t: Date.parse(p.timestamp), r: dayRate(p, includeRewards) }))
    .filter((p): p is { t: number; r: number } => Number.isFinite(p.t) && p.r !== null && Number.isFinite(p.r))
    .sort((a, b) => a.t - b.t);
  const start = Math.floor(from / DAY) * DAY;
  const end = Math.floor(to / DAY) * DAY;
  const totalDays = Math.max(0, Math.round((end - start) / DAY));
  let growth = 1;
  let covered = 0;
  let sum = 0;
  let firstDay: number | null = null;
  let j = -1;
  const daily: { t: number; growth: number }[] = [];
  for (let d = start; d < end; d += DAY) {
    while (j + 1 < pts.length && pts[j + 1].t < d + DAY) j++;
    const last = j >= 0 ? pts[j] : null;
    if (last && d - last.t <= MAX_CARRY_DAYS * DAY) {
      // APY منفی/عجیب پرت را محدود می‌کنیم تا یک داده خراب کل بازه را نبرد
      const r = Math.max(-50, Math.min(200, last.r));
      growth *= Math.pow(1 + r / 100, 1 / 365);
      covered++;
      sum += r;
      firstDay ??= d;
    }
    daily.push({ t: d + DAY, growth });
  }
  return {
    growth,
    avgApy: covered ? sum / covered : null,
    coveredDays: covered,
    totalDays,
    firstDay,
    partial: totalDays > 0 && (firstDay === null || firstDay - start > 2 * DAY || covered < totalDays - MAX_CARRY_DAYS),
    daily
  };
}

/** موجودی تتر و یو اس دی سی کیف پول‌ها (از دادهٔ موجود «دارایی من»، بدون درخواست تازه) */
export function stableBalance(positions: readonly { symbol: string; value: number | null; type?: string }[]): { usdt: number; usdc: number } {
  let usdt = 0;
  let usdc = 0;
  for (const p of positions) {
    if (p.type && p.type !== 'wallet') continue;
    const s = p.symbol.toUpperCase();
    const v = p.value ?? 0;
    if (!(v > 0)) continue;
    if (s === 'USDT' || s === 'USDT0' || s === 'USD₮0') usdt += v;
    else if (s === 'USDC' || s === 'USDC.E') usdc += v;
  }
  return { usdt, usdc };
}
