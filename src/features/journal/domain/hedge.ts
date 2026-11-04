/**
 * راهنمای باز کردن جفت دلتا نوترال (لانگ + شورت) بین لایتر رابین‌هود، آرکوس و تی‌اکس‌فلو — خالص و آزمون‌پذیر
 *
 *   سمت‌ها: خودکار لانگ روی صرافی با فاندینگ کمتر، شورت روی بیشتر (شورت فاندینگ مثبت می‌گیرد، لانگ کمتر می‌پردازد).
 *   اندازه: ارزش دلاری ÷ میانگین قیمت مارک، گرد به پایین روی درشت‌ترین گام دو صرافی تا هر دو پا دقیقاً هم‌اندازه باشند.
 *   درآمد: ارزش × (فاندینگ شورت − فاندینگ لانگ) ساعتی × ۲۴ · کارمزد رفت‌وبرگشت = ارزش × (تیکر الف + تیکر ب) × ۲.
 *   یادآور: جفت باز نامتعادل → سفارش دقیق اصلاح؛ فاندینگ جفت باز منفی شد → هزینهٔ روزانه.
 * هیچ سفارشی ثبت نمی‌شود؛ فقط عدد و لینک صفحهٔ معاملهٔ هر صرافی.
 */
import { baseOf } from './roundTrips';

export type HedgeVenue = 'lighterRh' | 'arcus' | 'txflow';
export const HEDGE_VENUES: readonly HedgeVenue[] = ['lighterRh', 'arcus', 'txflow'];
export const HEDGE_VENUE_FA: Record<HedgeVenue, string> = { lighterRh: 'لایتر رابین‌هود', arcus: 'آرکوس', txflow: 'تی‌اکس‌فلو' };

export interface HedgeQuote {
  venue: HedgeVenue;
  base: string;
  /** نماد بازار در همان صرافی (BTC، BTC-USD، BTC-USDC) */
  display: string;
  mark: number | null;
  /** کسری ساعتی؛ مثبت = لانگ می‌پردازد */
  fundingHourly: number | null;
  takerPct: number | null;
  step: number | null;
  minSize: number | null;
  minNotional: number | null;
  maxLeverage: number | null;
}

export function tradeUrl(q: Pick<HedgeQuote, 'venue' | 'base' | 'display'>): string {
  if (q.venue === 'lighterRh') return `https://robinhoodchain.lighter.xyz/trade/${encodeURIComponent(q.base)}`;
  if (q.venue === 'arcus') return `https://app.arcus.xyz/trade/${encodeURIComponent(q.display)}`;
  return `https://app.txflow.com/trade/${encodeURIComponent(q.display)}`;
}

/** کلید تطبیق بازار بین صرافی‌ها (BTC-USD و BTC-USDC و BTC یکی‌اند) */
export const hedgeBase = (symbol: string) => baseOf(symbol.replace(/-USDC?$|-USDT$/i, ''));

/* ---------------- اندازه ---------------- */

const decimalsOf = (step: number) => Math.max(0, Math.min(12, Math.round(-Math.log10(step))));

/** گام مشترک دو صرافی: درشت‌تر (گام‌ها توان ۱۰ هستند، پس مضرب گام ریزتر هم هست) */
export function commonStep(a: number | null, b: number | null): number | null {
  const s = [a, b].filter((x): x is number => x !== null && x > 0);
  return s.length ? Math.max(...s) : null;
}

export function roundDown(units: number, step: number | null): number {
  if (!(units > 0)) return 0;
  if (!step) return Number(units.toPrecision(6));
  const n = Math.floor(units / step + 1e-9);
  return Number((n * step).toFixed(decimalsOf(step)));
}

/* ---------------- برنامهٔ جفت ---------------- */

export interface HedgeLeg {
  venue: HedgeVenue;
  side: 'long' | 'short';
  display: string;
  units: number;
  price: number;
  notional: number;
  feeUsd: number | null;
  url: string;
  /** حداقل سفارش این صرافی رعایت نشده */
  belowMin: boolean;
}

export interface HedgePlan {
  base: string;
  units: number;
  notional: number;
  legs: [HedgeLeg, HedgeLeg];
  /** فاندینگ شورت − لانگ (کسری ساعتی) */
  spreadHourly: number | null;
  dailyUsd: number | null;
  aprPct: number | null;
  /** کارمزد تیکر باز و بسته کردن هر دو پا */
  roundTripFeesUsd: number | null;
  breakevenDays: number | null;
  /** اختلاف قیمت مارک: مثبت = شورت را گران‌تر می‌فروشید (به نفع شما) */
  basisPct: number;
  /** حداقل اهرم لازم برای هر پا با این سرمایه (null = نامعلوم) */
  warnings: string[];
}

export function planHedge(a: HedgeQuote, b: HedgeQuote, notionalUsd: number, longOn: 'auto' | HedgeVenue = 'auto'): HedgePlan | null {
  if (a.venue === b.venue || !(notionalUsd > 0) || !a.mark || !b.mark) return null;
  const fa = a.fundingHourly, fb = b.fundingHourly;
  const aLong = longOn === 'auto' ? (fa ?? 0) <= (fb ?? 0) : longOn === a.venue;
  const L = aLong ? a : b, S = aLong ? b : a;
  const mid = (L.mark! + S.mark!) / 2;
  const step = commonStep(a.step, b.step);
  const units = roundDown(notionalUsd / mid, step);
  if (!(units > 0)) return null;
  const leg = (q: HedgeQuote, side: 'long' | 'short'): HedgeLeg => {
    const notional = units * q.mark!;
    return {
      venue: q.venue, side, display: q.display, units, price: q.mark!, notional,
      feeUsd: q.takerPct === null ? null : (notional * q.takerPct) / 100,
      url: tradeUrl(q),
      belowMin: (q.minSize !== null && units < q.minSize) || (q.minNotional !== null && notional < q.minNotional)
    };
  };
  const legs: [HedgeLeg, HedgeLeg] = [leg(L, 'long'), leg(S, 'short')];
  const notional = units * mid;
  const spreadHourly = L.fundingHourly !== null && S.fundingHourly !== null ? S.fundingHourly - L.fundingHourly : null;
  const dailyUsd = spreadHourly === null ? null : notional * spreadHourly * 24;
  const fees = legs.every((l) => l.feeUsd !== null) ? (legs[0].feeUsd! + legs[1].feeUsd!) * 2 : null;
  const warnings: string[] = [];
  if (legs.some((l) => l.belowMin)) warnings.push('اندازه از حداقل سفارش یکی از صرافی‌ها کمتر است؛ مبلغ را بیشتر کنید.');
  if (spreadHourly !== null && spreadHourly <= 0) warnings.push('با فاندینگ فعلی این جفت درآمد ندارد (فاندینگ شورت از لانگ بیشتر نیست).');
  if (!step) warnings.push('گام اندازهٔ این بازار معلوم نیست؛ اندازه را در صرافی با همان عدد چک کنید.');
  const basisPct = ((S.mark! - L.mark!) / mid) * 100;
  if (Math.abs(basisPct) > 0.3) warnings.push(`قیمت دو صرافی ${Math.abs(basisPct).toFixed(2)}٪ فاصله دارد؛ ${basisPct < 0 ? 'شورت را ارزان‌تر می‌فروشید و این هزینه است' : 'شورت را گران‌تر می‌فروشید'}.`);
  return {
    base: a.base, units, notional, legs, spreadHourly, dailyUsd,
    aprPct: spreadHourly === null ? null : spreadHourly * 24 * 365 * 100,
    roundTripFeesUsd: fees,
    breakevenDays: fees !== null && dailyUsd !== null && dailyUsd > 0 ? fees / dailyUsd : null,
    basisPct,
    warnings
  };
}

/** بازارهای مشترک دو صرافی، بهترین فاندینگ اول */
export function pairMarkets(a: readonly HedgeQuote[], b: readonly HedgeQuote[]): { base: string; a: HedgeQuote; b: HedgeQuote; aprPct: number | null }[] {
  const byB = new Map(b.map((q) => [q.base, q]));
  const out: { base: string; a: HedgeQuote; b: HedgeQuote; aprPct: number | null }[] = [];
  for (const qa of a) {
    const qb = byB.get(qa.base);
    if (!qb || !qa.mark || !qb.mark) continue;
    const fa = qa.fundingHourly, fb = qb.fundingHourly;
    out.push({ base: qa.base, a: qa, b: qb, aprPct: fa === null || fb === null ? null : Math.abs(fa - fb) * 24 * 365 * 100 });
  }
  return out.sort((x, y) => (y.aprPct ?? -1) - (x.aprPct ?? -1));
}

/* ---------------- یادآور جفت‌های باز ---------------- */

export interface LivePosition {
  venue: HedgeVenue;
  account: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  mark: number | null;
}

export interface OpenPair {
  base: string;
  longs: LivePosition[];
  shorts: LivePosition[];
  longUnits: number;
  shortUnits: number;
  /** لانگ − شورت (واحد) */
  net: number;
  netUsd: number | null;
  imbalancePct: number;
  /** سفارش اصلاح: افزودن به پای کوچک‌تر */
  fix: { venue: HedgeVenue; side: 'long' | 'short'; units: number; display: string; url: string } | null;
  /** فاندینگ فعلی جفت: درآمد روزانه (منفی = هزینه) */
  dailyUsd: number | null;
}

export function openPairs(positions: readonly LivePosition[], quotes: ReadonlyMap<HedgeVenue, readonly HedgeQuote[]>, tolerancePct = 2): OpenPair[] {
  const groups = new Map<string, LivePosition[]>();
  for (const p of positions) {
    if (!(p.size > 0)) continue;
    const k = hedgeBase(p.symbol);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(p);
  }
  const quoteOf = (v: HedgeVenue, base: string) => quotes.get(v)?.find((q) => q.base === base) ?? null;
  const out: OpenPair[] = [];
  for (const [base, ps] of groups) {
    const longs = ps.filter((p) => p.side === 'long'), shorts = ps.filter((p) => p.side === 'short');
    if (!longs.length || !shorts.length) continue;
    const longUnits = longs.reduce((s, p) => s + p.size, 0), shortUnits = shorts.reduce((s, p) => s + p.size, 0);
    const net = longUnits - shortUnits;
    const mark = ps.find((p) => p.mark)?.mark ?? null;
    const imbalancePct = (Math.abs(net) / Math.max(longUnits, shortUnits)) * 100;
    let fix: OpenPair['fix'] = null;
    if (imbalancePct > tolerancePct) {
      const small = net > 0 ? shorts : longs;
      const target = [...small].sort((x, y) => y.size - x.size)[0];
      const q = quoteOf(target.venue, base);
      const units = roundDown(Math.abs(net), q?.step ?? null);
      if (units > 0) fix = { venue: target.venue, side: target.side, units, display: q?.display ?? target.symbol, url: tradeUrl(q ?? { venue: target.venue, base, display: target.symbol }) };
    }
    let daily: number | null = 0;
    for (const p of ps) {
      const f = quoteOf(p.venue, base)?.fundingHourly;
      const px = p.mark ?? quoteOf(p.venue, base)?.mark ?? null;
      if (f === null || f === undefined || px === null) { daily = null; break; }
      // لانگ فاندینگ مثبت را می‌پردازد، شورت می‌گیرد
      daily += (p.side === 'short' ? 1 : -1) * p.size * px * f * 24;
    }
    out.push({ base, longs, shorts, longUnits, shortUnits, net, netUsd: mark === null ? null : net * mark, imbalancePct, fix, dailyUsd: daily });
  }
  return out.sort((a, b) => b.imbalancePct - a.imbalancePct);
}
