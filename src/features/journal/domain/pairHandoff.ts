/**
 * همگام‌سازی «ماشین‌حساب دلتا نوترال» ↔ «راهنمای جفت ژورنال» — خالص و آزمون‌پذیر
 *
 *   انتخاب ماشین‌حساب (دو صرافی، بازار، ارزش هر پا، سمت لانگ، اهرم) با یک لینک به ژورنال می‌رود
 *   (/funding?tab=run&pv=a,b&pb=BASE&pa=1000&pl=venue&plev=3) و همان‌جا اندازهٔ دقیق هر پا آماده است — بدون انتخاب دوباره.
 *
 *   کم کردن لغزش هنگام باز کردن دستی دو پا (دارینو سفارش ثبت نمی‌کند):
 *     • قیمت سقف هر پا: لانگ ≤ مارک × (۱ + تحمل)، شورت ≥ مارک × (۱ − تحمل) → سفارش محدود به‌جای بازار
 *     • ترتیب: اول پایی که کارمزد تیکرش بیشتر است با سفارش محدود (میکر)، بلافاصله بعد از پر شدن پای دوم
 *     • بعد از باز شدن، ژورنال خودش دو پا را از پوزیشن زندهٔ صرافی‌ها پیدا و عدم تعادل را یادآوری می‌کند.
 */
import { HEDGE_VENUES, type HedgeLeg, type HedgePlan, type HedgeVenue } from './hedge';

export interface PairHandoff {
  venues: [HedgeVenue, HedgeVenue];
  base: string;
  notional: number | null;
  long: HedgeVenue | null;
  leverage: number | null;
}

const isVenue = (v: string): v is HedgeVenue => (HEDGE_VENUES as readonly string[]).includes(v);

/** آیا این دو صرافی ماشین‌حساب در راهنمای جفت ژورنال هم هستند؟ */
export function handoffVenues(a: string, b: string): [HedgeVenue, HedgeVenue] | null {
  return isVenue(a) && isVenue(b) && a !== b ? [a, b] : null;
}

export function pairHandoffUrl(h: PairHandoff): string {
  const q = new URLSearchParams({ tab: 'run', pv: h.venues.join(','), pb: h.base });
  if (h.notional && h.notional > 0) q.set('pa', String(Math.round(h.notional)));
  if (h.long) q.set('pl', h.long);
  if (h.leverage && h.leverage > 0) q.set('plev', String(h.leverage));
  return `/funding?${q}`;
}

export function readPairHandoff(p: URLSearchParams): PairHandoff | null {
  const [a, b] = (p.get('pv') ?? '').split(',');
  const venues = handoffVenues(a ?? '', b ?? '');
  const base = (p.get('pb') ?? '').toUpperCase().replace(/[^A-Z0-9.]/g, '').slice(0, 20);
  if (!venues || !base) return null;
  const num = (k: string) => { const n = Number(p.get(k)); return Number.isFinite(n) && n > 0 ? n : null; };
  const long = p.get('pl') ?? '';
  return { venues, base, notional: num('pa'), long: isVenue(long) && venues.includes(long) ? long : null, leverage: num('plev') };
}

/** قیمت سقف/کف سفارش محدود هر پا با تحمل لغزش (درصد) */
export function guardPrice(leg: Pick<HedgeLeg, 'side' | 'price'>, tolerancePct: number): number {
  const t = Math.max(0, tolerancePct) / 100;
  return leg.side === 'long' ? leg.price * (1 + t) : leg.price * (1 - t);
}

/** ترتیب اجرا: اول پای با کارمزد تیکر بیشتر (به‌صورت محدود/میکر)، بعد پای دیگر */
export function executionOrder(plan: Pick<HedgePlan, 'legs' | 'notional'>): [HedgeLeg, HedgeLeg] {
  const [x, y] = plan.legs;
  const rate = (l: HedgeLeg) => (l.feeUsd !== null && l.notional > 0 ? l.feeUsd / l.notional : -1);
  return rate(y) > rate(x) ? [y, x] : [x, y];
}

/** بیشترین زیان لغزش اگر هر دو پا تا مرز تحمل پر شوند (دلار) */
export function worstSlippageUsd(plan: Pick<HedgePlan, 'legs'>, tolerancePct: number): number {
  return plan.legs.reduce((s, l) => s + l.units * Math.abs(guardPrice(l, tolerancePct) - l.price), 0);
}
