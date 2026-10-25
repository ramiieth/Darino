/**
 * غربال میم‌کوین «محافظ سرمایه» — فیلترهای آزموده روی یک سال میم‌کوین‌های سولانا
 *
 * آزمون عقب‌گرد (۱۴۸ کوین تصادفی از ۱۰۰۰ میم سولانای CoinGecko، شامل مرده‌ها، اکتبر ۲۰۲۵ تا اکتبر ۲۰۲۶،
 * شاخص میم‌ها −۹۲٪، هزینهٔ رفت‌وبرگشت ۴٪):
 *   خرید روز لیست      ← ۱۳٪ برد، میانه −۶۲٪، ۶۸٪ بیش از نصف سرمایه را باخت
 *   همهٔ فیلترهای زیر   ← ۲۴٪ برد، میانه −۹٪، هیچ معامله‌ای بیش از ۵۰٪ نباخت (سود نساخت؛ ضرر را مهار کرد)
 * در بازار نزولی هیچ پروفایلی روی نیمهٔ دیدنشدهٔ سال سود نداد؛ کار این غربال دور نگه داشتن کاربر از ضرر
 * سنگین و آماده نگه داشتن فهرست سالم برای روزی است که بازار برگردد.
 *
 * رژیم بازار: «دست‌کم ۷۰٪ کوین‌های غربال بالای میانگین ۵۰ روزهٔ خودشان» — با شاخص آزموده ۸۵٪ هم‌خوان بود
 * (کمی خوش‌بین‌تر: ۳۲ روز روشن در برابر ۲۴). Pure — مشترک بین سرور و کلاینت.
 */

export interface DailyBar {
  /** روز (ms) */
  t: number;
  px: number;
  vol: number;
}

export interface SafetyInfo {
  mintRevoked: boolean;
  freezeRevoked: boolean;
  rugged: boolean;
  dangers: string[];
  /** سهم ۱۰ هولدر بزرگ بدون حساب‌های شناخته‌شده (استخر، صرافی، قفل) — ٪ */
  top10Pct: number | null;
  lpLockedPct: number | null;
  insiders: number | null;
  holders: number | null;
}

export interface CoinInput {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  mint: string | null;
  marketCap: number;
  volume24h: number;
  athChangePct: number | null;
  /** روزانه، صعودی بر اساس زمان */
  bars: DailyBar[];
  safety: SafetyInfo | null;
}

export type ExitLiqReason = 'extended' | 'pumped' | 'distribution' | 'churn';

export interface CoinScreen {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  mint: string | null;
  marketCap: number;
  athChangePct: number | null;
  price: number | null;
  days: number;
  ret30Pct: number | null;
  vsMa20Pct: number | null;
  gate: boolean;
  trend: boolean;
  exitLiq: { ok: boolean; reasons: ExitLiqReason[] };
  safety: { ok: boolean | null; reasons: string[]; info: SafetyInfo | null };
  /** همهٔ فیلترهای تک‌کوین (بدون رژیم) */
  passes: boolean;
  /** امن و زنده ولی روندش هنوز برنگشته: فهرست انتظار */
  watchWorthy: boolean;
}

export interface Regime {
  state: 'on' | 'off' | 'unknown';
  /** سهم کوین‌های بالای میانگین ۵۰ روزهٔ خودشان (۰ تا ۱) */
  breadth: number | null;
  counted: number;
}

export interface MemeScreenPayload {
  fetchedAt: number;
  regime: Regime;
  coins: CoinScreen[];
  /** کوین‌های فهرست که هنوز داده ندارند */
  pending: number;
  total: number;
}

export const GATE = { minMarketCap: 5_000_000, minVolume7d: 100_000, minDays: 30 } as const;
export const SAFETY_MAX_TOP10 = 30;
export const REGIME_BREADTH = 0.7;
const REGIME_MIN_COINS = 10;
export const EXIT_PLAN = { stopPct: 30, halfAtMultiple: 2, trendMa: 20 } as const;

export function sma(xs: number[], i: number, n: number): number {
  const w = xs.slice(Math.max(0, i - n + 1), i + 1);
  return w.reduce((a, b) => a + b, 0) / Math.max(1, w.length);
}

/** ضد «نقدینگی خروج»: وسط پامپ، هنگام توزیع یا با حجم ساختگی نخر */
export function exitLiquidity(px: number[], vol: number[], marketCaps: number[], i: number): { ok: boolean; reasons: ExitLiqReason[] } {
  const reasons: ExitLiqReason[] = [];
  const back7 = px[Math.max(0, i - 7)];
  if (px[i] > 1.5 * sma(px, i, 20)) reasons.push('extended');
  if (back7 > 0 && px[i] / back7 - 1 > 1) reasons.push('pumped');
  const v7 = sma(vol, i, 7), v30 = sma(vol, i, 30);
  if (v30 > 0 && v7 >= 1.5 * v30 && px[i] <= back7) reasons.push('distribution');
  if (marketCaps[i] > 0 && v7 > marketCaps[i]) reasons.push('churn');
  return { ok: reasons.length === 0, reasons };
}

export function safetyVerdict(s: SafetyInfo | null): { ok: boolean | null; reasons: string[] } {
  if (!s) return { ok: null, reasons: ['گزارش امنیت در دسترس نیست'] };
  const reasons: string[] = [];
  if (!s.mintRevoked) reasons.push('مینت باز است');
  if (!s.freezeRevoked) reasons.push('فریز باز است');
  if (s.rugged) reasons.push('rug شده');
  if (s.top10Pct !== null && s.top10Pct > SAFETY_MAX_TOP10) reasons.push(`۱۰ هولدر بزرگ ${Math.round(s.top10Pct)}٪`);
  reasons.push(...s.dangers);
  return { ok: reasons.length === 0, reasons };
}

export function screenCoin(c: CoinInput): CoinScreen {
  const bars = [...c.bars].filter((b) => b.px > 0).sort((a, b) => a.t - b.t);
  const px = bars.map((b) => b.px);
  const vol = bars.map((b) => b.vol);
  const i = px.length - 1;
  const last = i >= 0 ? px[i] : null;
  // ارزش بازار تاریخی ≈ ارزش بازار امروز × نسبت قیمت (عرضهٔ تقریباً ثابت)
  const mcs = px.map((p) => (last ? (c.marketCap * p) / last : 0));
  const enough = px.length >= GATE.minDays;
  const gate = enough && c.marketCap >= GATE.minMarketCap && sma(vol, i, 7) >= GATE.minVolume7d;
  const ret30 = enough ? px[i] / px[Math.max(0, i - 30)] - 1 : null;
  const ma20 = i >= 0 ? sma(px, i, 20) : 0;
  const trend = enough && px[i] > ma20 && (ret30 ?? 0) > 0;
  const exitLiq = enough ? exitLiquidity(px, vol, mcs, i) : { ok: false, reasons: [] as ExitLiqReason[] };
  const sv = safetyVerdict(c.safety);
  return {
    id: c.id,
    symbol: c.symbol,
    name: c.name,
    image: c.image,
    mint: c.mint,
    marketCap: c.marketCap,
    athChangePct: c.athChangePct,
    price: last,
    days: px.length,
    ret30Pct: ret30 === null ? null : ret30 * 100,
    vsMa20Pct: ma20 > 0 && last ? (last / ma20 - 1) * 100 : null,
    gate,
    trend,
    exitLiq,
    safety: { ...sv, info: c.safety },
    passes: gate && trend && exitLiq.ok && sv.ok === true,
    watchWorthy: gate && sv.ok === true && !trend
  };
}

/** رژیم بازار میم: سهم کوین‌های بالای میانگین ۵۰ روزه */
export function regimeOf(coins: Pick<CoinInput, 'bars'>[]): Regime {
  let up = 0, counted = 0;
  for (const c of coins) {
    const px = [...c.bars].sort((a, b) => a.t - b.t).map((b) => b.px).filter((p) => p > 0);
    if (px.length < 50) continue;
    counted++;
    if (px[px.length - 1] > sma(px, px.length - 1, 50)) up++;
  }
  if (counted < REGIME_MIN_COINS) return { state: 'unknown', breadth: counted ? up / counted : null, counted };
  const breadth = up / counted;
  return { state: breadth >= REGIME_BREADTH ? 'on' : 'off', breadth, counted };
}

/** گزارش کامل RugCheck → SafetyInfo (حساب‌های شناخته‌شده از سهم هولدرها کنار می‌روند) */
export function parseRugReport(raw: unknown): SafetyInfo | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || typeof r.mint !== 'string') return null;
  const known = new Set(Object.keys((r.knownAccounts as Record<string, unknown> | undefined) ?? {}));
  const holders = (Array.isArray(r.topHolders) ? r.topHolders : []) as Record<string, unknown>[];
  const own = holders.filter((h) => !known.has(String(h.owner)) && !known.has(String(h.address)));
  const pcts = own.slice(0, 10).map((h) => Number(h.pct)).filter(Number.isFinite);
  const markets = (Array.isArray(r.markets) ? r.markets : []) as Record<string, unknown>[];
  const locked = markets.map((m) => Number((m.lp as Record<string, unknown> | undefined)?.lpLockedPct)).filter(Number.isFinite);
  const risks = (Array.isArray(r.risks) ? r.risks : []) as Record<string, unknown>[];
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    mintRevoked: !r.mintAuthority,
    freezeRevoked: !r.freezeAuthority,
    rugged: r.rugged === true,
    dangers: risks.filter((x) => x.level === 'danger').map((x) => String(x.name ?? '').slice(0, 60)).filter(Boolean),
    top10Pct: own.length ? pcts.reduce((a, b) => a + b, 0) : null,
    lpLockedPct: locked.length ? Math.max(...locked) : null,
    insiders: num(r.graphInsidersDetected),
    holders: num(r.totalHolders)
  };
}

/** CoinGecko market_chart → روزانه (یک ردیف برای هر روز، آخرین مقدار روز) */
export function parseMarketChart(raw: unknown): DailyBar[] {
  const b = raw as { prices?: unknown; total_volumes?: unknown } | null;
  if (!b || !Array.isArray(b.prices)) return [];
  const vols = new Map<number, number>();
  for (const v of (Array.isArray(b.total_volumes) ? b.total_volumes : []) as unknown[]) {
    if (Array.isArray(v) && Number.isFinite(v[0]) && Number.isFinite(v[1])) vols.set(Math.floor(v[0] / 86_400_000), v[1]);
  }
  const days = new Map<number, DailyBar>();
  for (const p of b.prices as unknown[]) {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !(p[1] > 0)) continue;
    const d = Math.floor(p[0] / 86_400_000);
    days.set(d, { t: d * 86_400_000, px: p[1], vol: vols.get(d) ?? 0 });
  }
  return [...days.values()].sort((a, b) => a.t - b.t);
}

/** برنامهٔ خروج آزموده برای قیمت ورود */
export function exitPlan(entry: number) {
  return { stop: entry * (1 - EXIT_PLAN.stopPct / 100), takeHalf: entry * EXIT_PLAN.halfAtMultiple };
}

/**
 * «بلیت بخت‌آزمایی» آگاهانه: کل بودجه حداکثر ۵٪ سرمایه، دست‌کم ۲۰ بلیت مساوی.
 * آزمون: خرید بعد از پامپ با ۵ بلیت ۲۶٪ و با ۵۰ بلیت ۷۵٪ سود کلی داد، ولی کل سود از ۳ معامله از ۶۵ بود
 * (بدون ۲ برندهٔ بزرگ ۲۴٪، بدون ۳ برنده ۰٪).
 */
export const LOTTERY = { maxBudgetPct: 5, minTickets: 20, maxTickets: 50 } as const;
export function lotteryPlan(capital: number, tickets: number) {
  const n = Math.min(LOTTERY.maxTickets, Math.max(LOTTERY.minTickets, Math.round(tickets) || LOTTERY.minTickets));
  const budget = Math.max(0, capital) * (LOTTERY.maxBudgetPct / 100);
  return { tickets: n, budget, perTicket: budget / n, perTicketPct: LOTTERY.maxBudgetPct / n };
}

export const EXIT_LIQ_FA: Record<ExitLiqReason, string> = {
  extended: 'بیش از ۵۰٪ بالای میانگین ۲۰ روزه',
  pumped: 'بیش از ۱۰۰٪ رشد در ۷ روز',
  distribution: 'حجم بالا با قیمت درجا (توزیع)',
  churn: 'حجم روزانه بیشتر از ارزش بازار'
};
