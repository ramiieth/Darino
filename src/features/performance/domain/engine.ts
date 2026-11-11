/** ============================================================
 * موتور محاسبات «عملکرد و مقایسه سرمایه» — خالص و تست‌پذیر
 *
 *  همهٔ اعداد بازده، سود/زیان و مقایسه اینجا محاسبه می‌شوند؛ Gemini فقط
 *  همین خروجی را تفسیر می‌کند و هیچ عددی نمی‌سازد.
 *
 *  قواعد:
 *   • قیمت هر بازار در تاریخ شروع و پایان از سری واقعی خوانده می‌شود؛ نبود داده
 *     در حد تحمل → «داده کافی موجود نیست» (هیچ برون‌یابی یا حدسی نیست).
 *   • بازده واقعی = (۱ + بازده اسمی) ÷ (۱ + تورم همان بازه) − ۱
 *   • «تغییر ارزش» ≠ «بازده»: بدون فهرست کامل واریز/برداشت خارجی فقط تغییر ارزش
 *     گزارش می‌شود؛ با آن، TWR (دیتز اصلاح‌شده برای هر زیربازه) و XIRR.
 * ============================================================ */
import type { ExternalFlow, Pt, Series, ValueRecord } from './types';
import type { MarketDef } from './markets';

export const DAY_MS = 86_400_000;
const YEAR_MS = 365 * DAY_MS;

/* ───────────────────────── سری‌ها ───────────────────────── */

export interface At {
  value: number;
  /** تاریخ نقطه‌ای که واقعاً استفاده شد */
  at: number;
  /** درون‌یابی بین دو نقطهٔ ماهانه/سالانه */
  interpolated?: boolean;
}

/** حداکثر فاصلهٔ نقطهٔ «قبل از» تاریخ برای هر نوع سری */
const BACK_TOLERANCE: Record<Series['frequency'], number> = {
  daily: 10 * DAY_MS,
  snapshot: 45 * DAY_MS,
  monthly: 45 * DAY_MS,
  annual: 0
};

/** آخرین اندیس با زمان ≤ ts (نقاط صعودی) */
function lastIndexLE(p: Pt[], ts: number): number {
  let lo = 0;
  let hi = p.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (p[mid][0] <= ts) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export function normalizePoints(points: Pt[]): Pt[] {
  return points.filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v) && v > 0).sort((a, b) => a[0] - b[0]);
}

/**
 * مقدار سری در تاریخ ts:
 *   daily / snapshot  → آخرین نقطهٔ قبل (یا همان روز) در حد تحمل؛ Snapshot تا ۱۵ روز بعد هم پذیرفته می‌شود
 *   monthly / annual  → درون‌یابی هندسی بین دو نقطهٔ احاطه‌کننده؛ ماهانه تا ۴۵ روز بعد از آخرین انتشار
 */
export function valueAt(s: Series, ts: number): At | null {
  const p = s.points;
  if (!p.length) return null;
  // روز کامل: نقطه‌های UTC شروع روز با ساعت ۱۲ محلی همان روز مقایسه شوند
  const probe = ts + DAY_MS / 2;
  const i = lastIndexLE(p, probe);
  if (s.frequency === 'monthly' || s.frequency === 'annual') {
    if (i < 0) return null;
    if (i === p.length - 1) {
      return ts - p[i][0] <= BACK_TOLERANCE[s.frequency] || probe - p[i][0] < DAY_MS ? { value: p[i][1], at: p[i][0] } : null;
    }
    const [t0, v0] = p[i];
    const [t1, v1] = p[i + 1];
    const f = Math.min(1, Math.max(0, (ts - t0) / (t1 - t0)));
    if (f === 0) return { value: v0, at: t0 };
    return { value: v0 * Math.pow(v1 / v0, f), at: ts, interpolated: true };
  }
  if (i >= 0 && ts - p[i][0] <= BACK_TOLERANCE[s.frequency]) return { value: p[i][1], at: p[i][0] };
  if (s.frequency === 'snapshot') {
    const j = i + 1;
    if (j < p.length && p[j][0] - ts <= 15 * DAY_MS) return { value: p[j][1], at: p[j][0] };
  }
  return null;
}

/* ───────────────────────── سوابق ارزش ───────────────────────── */

export interface Endpoint {
  ts: number;
  usd: number;
  rate: number | null;
  toman: number | null;
}

export function tomanOf(r: Pick<ValueRecord, 'usd' | 'rateToman' | 'toman'>): number | null {
  if (r.toman !== null && Number.isFinite(r.toman)) return r.toman;
  return r.rateToman ? r.usd * r.rateToman : null;
}

export function endpointOf(r: ValueRecord): Endpoint {
  return { ts: r.dateTs, usd: r.usd, rate: r.rateToman, toman: tomanOf(r) };
}

/** سوابق فعال، صعودی بر اساس تاریخ */
export function activeRecords(rs: ValueRecord[]): ValueRecord[] {
  return rs.filter((r) => !r.deleted && Number.isFinite(r.usd)).sort((a, b) => a.dateTs - b.dateTs || a.createdAt - b.createdAt);
}

const pct = (a: number | null, b: number | null): number | null => (a !== null && b !== null && b !== 0 ? a / b - 1 : null);

export interface Overview {
  latest: ValueRecord;
  previous: ValueRecord | null;
  changeUsd: number | null;
  changeToman: number | null;
  changePctUsd: number | null;
  changePctToman: number | null;
  /** رکورد مبنای یک سال گذشته (نزدیک‌ترین به ۳۶۵ روز قبل، حداکثر ±۴۵ روز) */
  yearBase: ValueRecord | null;
  yearChangeUsd: number | null;
  yearChangePctUsd: number | null;
  yearChangePctToman: number | null;
  max: ValueRecord;
  min: ValueRecord;
  count: number;
}

export function nearestRecord(rs: ValueRecord[], ts: number, tolerance: number): ValueRecord | null {
  let best: ValueRecord | null = null;
  for (const r of rs) {
    const d = Math.abs(r.dateTs - ts);
    if (d <= tolerance && (!best || d < Math.abs(best.dateTs - ts))) best = r;
  }
  return best;
}

export function overview(records: ValueRecord[]): Overview | null {
  const rs = activeRecords(records);
  if (!rs.length) return null;
  const latest = rs[rs.length - 1];
  const previous = rs.length > 1 ? rs[rs.length - 2] : null;
  const lt = tomanOf(latest);
  const pt = previous ? tomanOf(previous) : null;
  const yearBase = nearestRecord(rs.slice(0, -1), latest.dateTs - YEAR_MS, 45 * DAY_MS);
  const yt = yearBase ? tomanOf(yearBase) : null;
  let max = rs[0];
  let min = rs[0];
  for (const r of rs) {
    if (r.usd > max.usd) max = r;
    if (r.usd < min.usd) min = r;
  }
  return {
    latest,
    previous,
    changeUsd: previous ? latest.usd - previous.usd : null,
    changeToman: lt !== null && pt !== null ? lt - pt : null,
    changePctUsd: previous ? pct(latest.usd, previous.usd) : null,
    changePctToman: pct(lt, pt),
    yearBase,
    yearChangeUsd: yearBase ? latest.usd - yearBase.usd : null,
    yearChangePctUsd: yearBase ? pct(latest.usd, yearBase.usd) : null,
    yearChangePctToman: pct(lt, yt),
    max,
    min,
    count: rs.length
  };
}

/* ───────────────────────── مقایسه با بازارها ───────────────────────── */

export type RowStatus = 'ok' | 'insufficient' | 'no-source';

export interface CompareRow {
  id: string;
  name: string;
  group: MarketDef['group'];
  kind: MarketDef['kind'];
  currency: MarketDef['currency'];
  official?: boolean;
  status: RowStatus;
  reason?: string;
  source?: string;
  sourceUrl?: string;
  updatedAt?: number;
  detail?: string;
  /** تاریخ قیمت‌های استفاده‌شده */
  priceStart?: At;
  priceEnd?: At;
  startUsd: number | null;
  startToman: number | null;
  endUsd: number | null;
  endToman: number | null;
  pnlUsd: number | null;
  pnlToman: number | null;
  returnUsd: number | null;
  returnToman: number | null;
  /** عملکرد واقعی پرتفوی − این بازار (مثبت = پرتفوی جلوتر) */
  vsPortfolioUsd: number | null;
  vsPortfolioToman: number | null;
  /** هزینهٔ فرصت: چقدر بیشتر می‌داشتید اگر اینجا بودید (۰ اگر پرتفوی جلوتر است) */
  opportunityUsd: number | null;
  opportunityToman: number | null;
  /** تاریخ اولین قیمت سری (برای «از چه تاریخی داده داریم») */
  dataFrom?: number;
  /**
   * وقتی سری بعد از شروع دوره آغاز می‌شود: تغییر قیمت از اولین داده تا پایان دوره (بازهٔ کوتاه‌تر؛
   * با بقیهٔ بازارها هم‌بازه نیست و فقط اطلاع است).
   */
  sinceDataStart?: { from: number; to: number; change: number };
  /**
   * خودرو و مسکن: با ارزش تومانی پرتفوی در تاریخ شروع چند دستگاه / چند مترمربع می‌شد خرید
   * و ارزش فروش همان مقدار در تاریخ پایان (= endToman).
   */
  units?: { count: number; label: string; priceStart: number; priceEnd: number };
}

export interface PortfolioRow {
  startUsd: number;
  endUsd: number;
  startToman: number | null;
  endToman: number | null;
  pnlUsd: number;
  pnlToman: number | null;
  returnUsd: number | null;
  returnToman: number | null;
}

export function portfolioRow(start: Endpoint, end: Endpoint): PortfolioRow {
  return {
    startUsd: start.usd,
    endUsd: end.usd,
    startToman: start.toman,
    endToman: end.toman,
    pnlUsd: end.usd - start.usd,
    pnlToman: start.toman !== null && end.toman !== null ? end.toman - start.toman : null,
    returnUsd: pct(end.usd, start.usd),
    returnToman: pct(end.toman, start.toman)
  };
}

const emptyRow = (m: { id: string; name: string; group: MarketDef['group']; kind: MarketDef['kind']; currency: MarketDef['currency']; official?: boolean }, status: RowStatus, reason: string, s?: Series): CompareRow => ({
  id: m.id,
  name: m.name,
  group: m.group,
  kind: m.kind,
  currency: m.currency,
  official: m.official,
  status,
  reason,
  source: s?.source,
  sourceUrl: s?.sourceUrl,
  updatedAt: s?.fetchedAt,
  detail: s?.detail,
  startUsd: null,
  startToman: null,
  endUsd: null,
  endToman: null,
  pnlUsd: null,
  pnlToman: null,
  returnUsd: null,
  returnToman: null,
  vsPortfolioUsd: null,
  vsPortfolioToman: null,
  opportunityUsd: null,
  opportunityToman: null
});

export const INSUFFICIENT = 'داده کافی موجود نیست';

/**
 * «اگر همان سرمایه در تاریخ شروع در این بازار بود، در تاریخ پایان چقدر می‌شد؟»
 *  بازار تومانی: ارزش تومانی شروع (دلار × نرخ همان روز) → واحد بازار → ارزش تومانی پایان → ÷ نرخ پایان
 *  بازار دلاری: ارزش دلاری شروع → واحد بازار → ارزش دلاری پایان → × نرخ پایان
 *  تورم: سرمایه × (شاخص پایان ÷ شاخص شروع) = مبلغی که فقط قدرت خرید را حفظ می‌کرد
 */
export function compareMarket(m: MarketDef & { name: string }, s: Series | undefined, start: Endpoint, end: Endpoint): CompareRow {
  if (m.kind === 'none' || !m.seriesId) return emptyRow(m, 'no-source', m.missingReason ?? INSUFFICIENT);
  if (!s || !s.points.length) return emptyRow(m, 'insufficient', 'منبع داده پاسخ نداد یا تاریخچه‌ای ندارد', s);
  const p0 = valueAt(s, start.ts);
  const p1 = valueAt(s, end.ts);
  if (!p0 || !p1) {
    const first = s.points[0][0];
    const last = s.points[s.points.length - 1][0];
    const why = !p0 && start.ts < first ? 'تاریخچهٔ منبع از بعد از تاریخ شروع دوره آغاز می‌شود' : !p1 && end.ts > last ? 'دادهٔ منبع هنوز به تاریخ پایان دوره نرسیده' : 'برای تاریخ شروع یا پایان قیمت معتبری نیست';
    return { ...emptyRow(m, 'insufficient', `${INSUFFICIENT} — ${why}`, s), priceStart: p0 ?? undefined, priceEnd: p1 ?? undefined };
  }
  const ratio = p1.value / p0.value;
  const startUsd = start.usd;
  const startToman = start.toman;
  let endUsd: number | null;
  let endToman: number | null;
  if (m.currency === 'toman') {
    if (startToman === null) return emptyRow(m, 'insufficient', `${INSUFFICIENT} — نرخ دلار تاریخ شروع ثبت نشده`, s);
    endToman = startToman * ratio;
    endUsd = end.rate ? endToman / end.rate : null;
  } else {
    endUsd = start.usd * ratio;
    endToman = end.rate ? endUsd * end.rate : null;
  }
  const portEndToman = end.toman;
  return {
    ...emptyRow(m, 'ok', '', s),
    reason: undefined,
    priceStart: p0,
    priceEnd: p1,
    startUsd,
    startToman,
    endUsd,
    endToman,
    pnlUsd: endUsd !== null ? endUsd - start.usd : null,
    pnlToman: endToman !== null && startToman !== null ? endToman - startToman : null,
    returnUsd: endUsd !== null ? endUsd / start.usd - 1 : null,
    returnToman: endToman !== null && startToman ? endToman / startToman - 1 : null,
    vsPortfolioUsd: endUsd !== null ? end.usd - endUsd : null,
    vsPortfolioToman: endToman !== null && portEndToman !== null ? portEndToman - endToman : null,
    opportunityUsd: endUsd !== null ? Math.max(0, endUsd - end.usd) : null,
    opportunityToman: endToman !== null && portEndToman !== null ? Math.max(0, endToman - portEndToman) : null
  };
}

export interface CompareSummary {
  /** بازار با بیشترین ارزش دلاری پایان (فقط بازارهای قیمتی، نه تورم) */
  best: CompareRow | null;
  /** بازارهایی که پرتفوی از آن‌ها جلوتر بوده */
  beaten: CompareRow[];
  /** بازارهایی که پرتفوی از آن‌ها عقب مانده (بیشترین عقب‌ماندگی اول) */
  lagged: CompareRow[];
  available: number;
  insufficient: number;
}

export function summarize(rows: CompareRow[]): CompareSummary {
  const ok = rows.filter((r) => r.status === 'ok' && r.vsPortfolioUsd !== null);
  const priced = ok.filter((r) => r.kind === 'price');
  const best = priced.reduce<CompareRow | null>((b, r) => (!b || (r.endUsd ?? -Infinity) > (b.endUsd ?? -Infinity) ? r : b), null);
  return {
    best,
    beaten: ok.filter((r) => (r.vsPortfolioUsd as number) > 0).sort((a, b) => (b.vsPortfolioUsd as number) - (a.vsPortfolioUsd as number)),
    lagged: ok.filter((r) => (r.vsPortfolioUsd as number) < 0).sort((a, b) => (a.vsPortfolioUsd as number) - (b.vsPortfolioUsd as number)),
    available: ok.length,
    insufficient: rows.length - ok.length
  };
}

/* ───────────────────────── تورم و قدرت خرید ───────────────────────── */

export interface InflationLeg {
  /** تورم انباشتهٔ دقیقاً همان بازه */
  cumulative: number;
  from: At;
  to: At;
  source: string;
  official: boolean;
}

export interface InflationAnalysis {
  nominalUsd: number | null;
  nominalToman: number | null;
  iran: InflationLeg | null;
  us: InflationLeg | null;
  /** بازده واقعی تومانی (تعدیل با تورم رسمی ایران) */
  realToman: number | null;
  /** بازده واقعی دلاری (تعدیل با تورم آمریکا) */
  realUsd: number | null;
  /** شاخص‌های جایگزین بازار — جدا از تورم رسمی */
  proxies: { id: string; name: string; change: number; source: string }[];
  /** تفکیک تغییر ارزش تومانی: سهم تغییر ارزش دلاری و سهم تغییر نرخ دلار (جمع = کل) */
  fx: { total: number; fromUsdValue: number; fromRate: number; rateChange: number } | null;
}

export const realReturn = (nominal: number, inflation: number): number => (1 + nominal) / (1 + inflation) - 1;

export function inflationLeg(s: Series | undefined, start: number, end: number, official: boolean): InflationLeg | null {
  if (!s) return null;
  const a = valueAt(s, start);
  const b = valueAt(s, end);
  if (!a || !b) return null;
  return { cumulative: b.value / a.value - 1, from: a, to: b, source: s.source, official };
}

export function inflationAnalysis(
  start: Endpoint,
  end: Endpoint,
  series: { iranCpi?: Series; usCpi?: Series; usdt?: Series; gold18?: Series }
): InflationAnalysis {
  const nominalUsd = pct(end.usd, start.usd);
  const nominalToman = pct(end.toman, start.toman);
  const iran = inflationLeg(series.iranCpi, start.ts, end.ts, true);
  const us = inflationLeg(series.usCpi, start.ts, end.ts, true);
  const proxies: InflationAnalysis['proxies'] = [];
  for (const [id, name, s] of [
    ['usdt', 'نرخ دلار آزاد (تتر)', series.usdt],
    ['gold18', 'طلای ۱۸ عیار ایران', series.gold18]
  ] as const) {
    const leg = inflationLeg(s, start.ts, end.ts, false);
    if (leg && s) proxies.push({ id, name, change: leg.cumulative, source: s.source });
  }
  const fx =
    start.rate && end.rate
      ? {
          total: end.usd * end.rate - start.usd * start.rate,
          fromUsdValue: (end.usd - start.usd) * end.rate,
          fromRate: start.usd * (end.rate - start.rate),
          rateChange: end.rate / start.rate - 1
        }
      : null;
  return {
    nominalUsd,
    nominalToman,
    iran,
    us,
    realToman: nominalToman !== null && iran ? realReturn(nominalToman, iran.cumulative) : null,
    realUsd: nominalUsd !== null && us ? realReturn(nominalUsd, us.cumulative) : null,
    proxies,
    fx
  };
}

/* ───────────────────────── بازده با جریان نقدی ───────────────────────── */

export function activeFlows(fs: ExternalFlow[]): ExternalFlow[] {
  return fs.filter((f) => !f.deleted && Number.isFinite(f.usd) && f.usd !== 0).sort((a, b) => a.dateTs - b.dateTs);
}

/**
 * TWR: زنجیرهٔ بازده زیربازه‌ها بین سوابق متوالی؛ هر زیربازه با دیتز اصلاح‌شده
 *   r = (V₁ − V₀ − ΣF) ÷ (V₀ + Σ wᵢ·Fᵢ) ، wᵢ = سهم باقی‌ماندهٔ زیربازه پس از جریان
 * جریان دقیقاً هم‌روز رکورد شروع → در زیربازهٔ بعد (پس از ثبت ارزش) حساب می‌شود.
 */
export function twr(records: ValueRecord[], flows: ExternalFlow[]): number | null {
  const rs = activeRecords(records);
  if (rs.length < 2) return null;
  const fs = activeFlows(flows);
  let growth = 1;
  for (let i = 1; i < rs.length; i++) {
    const a = rs[i - 1];
    const b = rs[i];
    const span = b.dateTs - a.dateTs;
    if (span <= 0) continue;
    const inside = fs.filter((f) => f.dateTs > a.dateTs && f.dateTs <= b.dateTs);
    const net = inside.reduce((s, f) => s + f.usd, 0);
    const weighted = inside.reduce((s, f) => s + f.usd * ((b.dateTs - f.dateTs) / span), 0);
    const denom = a.usd + weighted;
    if (denom <= 0) return null;
    growth *= 1 + (b.usd - a.usd - net) / denom;
  }
  return growth - 1;
}

/** XIRR: نرخ سالانه‌ای که ارزش فعلی جریان‌ها را صفر می‌کند (شروع = سرمایه‌گذاری، پایان = ارزش) */
export function xirr(cashflows: { ts: number; amount: number }[]): number | null {
  if (cashflows.length < 2) return null;
  const t0 = cashflows[0].ts;
  const hasPos = cashflows.some((c) => c.amount > 0);
  const hasNeg = cashflows.some((c) => c.amount < 0);
  if (!hasPos || !hasNeg) return null;
  const npv = (r: number) => cashflows.reduce((s, c) => s + c.amount / Math.pow(1 + r, (c.ts - t0) / YEAR_MS), 0);
  let lo = -0.9999;
  let hi = 10;
  let flo = npv(lo);
  const fhi = npv(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-9) return mid;
    if (flo * fm < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

export function periodXirr(start: ValueRecord, end: ValueRecord, flows: ExternalFlow[]): number | null {
  if (end.dateTs - start.dateTs < 30 * DAY_MS) return null;
  const inside = activeFlows(flows).filter((f) => f.dateTs > start.dateTs && f.dateTs <= end.dateTs);
  return xirr([{ ts: start.dateTs, amount: -start.usd }, ...inside.map((f) => ({ ts: f.dateTs, amount: -f.usd })), { ts: end.dateTs, amount: end.usd }]);
}

export interface ReturnAnalysis {
  /** «تغییر ارزش» ساده — همیشه */
  valueChangeUsd: number;
  valueChangePct: number | null;
  /** خالص واریز/برداشت خارجی ثبت‌شده در بازه */
  netFlowsUsd: number;
  flowsCount: number;
  /** فقط وقتی کاربر کامل بودن جریان‌ها را تأیید کرده */
  twr: number | null;
  xirr: number | null;
  /** سود سرمایه‌گذاری = تغییر ارزش − خالص جریان‌ها */
  investmentGainUsd: number | null;
  qualified: boolean;
}

export function returnAnalysis(records: ValueRecord[], startId: string, endId: string, flows: ExternalFlow[], flowsComplete: boolean): ReturnAnalysis | null {
  const rs = activeRecords(records);
  const s = rs.find((r) => r.id === startId);
  const e = rs.find((r) => r.id === endId);
  if (!s || !e || e.dateTs <= s.dateTs) return null;
  const inside = activeFlows(flows).filter((f) => f.dateTs > s.dateTs && f.dateTs <= e.dateTs);
  const net = inside.reduce((a, f) => a + f.usd, 0);
  const span = rs.filter((r) => r.dateTs >= s.dateTs && r.dateTs <= e.dateTs);
  return {
    valueChangeUsd: e.usd - s.usd,
    valueChangePct: pct(e.usd, s.usd),
    netFlowsUsd: net,
    flowsCount: inside.length,
    twr: flowsComplete ? twr(span, inside) : null,
    xirr: flowsComplete ? periodXirr(s, e, inside) : null,
    investmentGainUsd: flowsComplete ? e.usd - s.usd - net : null,
    qualified: flowsComplete
  };
}

/* ───────────────────────── تراکنش‌های بخش دارایی (فقط طبقه‌بندی) ───────────────────────── */

export interface OpLike {
  kind: string;
  occurredAt: number | null;
  voidedAt: number | null;
  status?: string;
}

/** عملیات داخلی (سواپ، بریج، انتقال بین حساب‌ها، واریز به پلتفرم) در بازده اثری ندارند */
export const INTERNAL_KINDS = ['swap', 'bridge', 'bridge_swap', 'internal_transfer', 'platform_deposit', 'platform_withdrawal'];

export function classifyOps(ops: OpLike[], from: number, to: number): { internal: number; adjustments: number } {
  let internal = 0;
  let adjustments = 0;
  for (const o of ops) {
    if (o.voidedAt || o.occurredAt === null || o.occurredAt < from || o.occurredAt > to) continue;
    if (INTERNAL_KINDS.includes(o.kind)) internal++;
    else if (o.kind === 'balance_adjustment') adjustments++;
  }
  return { internal, adjustments };
}

/* ───────────────────────── رشد سال‌به‌سال ───────────────────────── */

export interface YearRow {
  year: number;
  at: number | null;
  value: number | null;
  /** تغییر نسبت به ردیف قبل */
  change: number | null;
}

/** مقدار سری در شروع هر سال (yearStart) + ردیف «اکنون»؛ نبود داده → value=null */
export function yearlyRows(s: Series | undefined, years: number[], yearStart: (y: number) => number, now: number): YearRow[] {
  const out: YearRow[] = [];
  let prev: number | null = null;
  const pts = [...years.map((y) => ({ y, ts: yearStart(y) })), { y: 0, ts: now }];
  for (const { y, ts } of pts) {
    if (ts > now && y !== 0) continue;
    const v = s ? valueAt(s, ts) : null;
    out.push({ year: y, at: v?.at ?? null, value: v?.value ?? null, change: v && prev !== null ? v.value / prev - 1 : null });
    prev = v ? v.value : null;
  }
  return out;
}
