/**
 * معاملهٔ کامل (Round Trip) — از باز شدن پوزیشن روی یک نماد تا صفر شدن آن
 *
 * هایپرلیکوئید هر سفارش را به چند fill می‌شکند؛ نرخ برد روی fill گمراه‌کننده است
 * (fillهای باز شدن سود صفر دارند). اینجا fillها به معاملهٔ کامل تبدیل می‌شوند:
 *  - startPosition هر fill مرجع است (نه جمع ما) ← خطای تجمعی ندارد
 *  - عبور از صفر («Long > Short») معامله را می‌بندد و معاملهٔ تازه باز می‌کند
 *  - معامله‌ای که پیش از شروع پنجرهٔ داده باز شده «ناقص» است و در آمار نمی‌آید
 *  - فقط پرپ؛ fillهای اسپات (@107 ، PURR/USDC) کنار می‌روند
 * Pure — بدون شبکه.
 */
import type { Fill } from './types.js';

export interface RoundTrip {
  coin: string;
  side: 'long' | 'short';
  openTime: number;
  /** null = هنوز باز */
  closeTime: number | null;
  /** میانگین وزنی قیمت ورود (فقط بخش‌های افزایش پوزیشن داخل پنجره) */
  entryPx: number | null;
  /** میانگین وزنی قیمت خروج */
  exitPx: number | null;
  /** بزرگ‌ترین ارزش دلاری پوزیشن در طول معامله */
  maxNotional: number;
  /** سود تحقق‌یافتهٔ ناخالص (closedPnl) */
  grossPnl: number;
  /** کارمزد (منفی = ریبیت میکر) */
  fees: number;
  /** سود خالص = ناخالص − کارمزد */
  net: number;
  fills: number;
  /** از پوزیشن صفر داخل پنجرهٔ داده شروع شده */
  complete: boolean;
}

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function isPerpCoin(coin: string): boolean {
  return !!coin && !coin.startsWith('@') && !coin.includes('/');
}

interface Leg {
  trip: RoundTrip;
  entryQty: number;
  entryNotional: number;
  exitQty: number;
  exitNotional: number;
}

function openLeg(coin: string, side: RoundTrip['side'], time: number, complete: boolean): Leg {
  return {
    trip: { coin, side, openTime: time, closeTime: null, entryPx: null, exitPx: null, maxNotional: 0, grossPnl: 0, fees: 0, net: 0, fills: 0, complete },
    entryQty: 0,
    entryNotional: 0,
    exitQty: 0,
    exitNotional: 0
  };
}

function finish(leg: Leg, closeTime: number | null): RoundTrip {
  const t = leg.trip;
  t.closeTime = closeTime;
  t.entryPx = leg.entryQty > 0 ? leg.entryNotional / leg.entryQty : null;
  t.exitPx = leg.exitQty > 0 ? leg.exitNotional / leg.exitQty : null;
  t.net = t.grossPnl - t.fees;
  return t;
}

const endOf = (f: Fill) => num(f.startPosition) + (f.side === 'B' ? 1 : -1) * Math.abs(num(f.sz));

/**
 * ترتیب واقعی fillهای یک نماد. tid ترتیبی نیست، پس fillهای هم‌زمان با زنجیرهٔ پوزیشن مرتب می‌شوند:
 * fill بعدی آن است که startPosition آن به پایان fill قبلی نزدیک‌تر است.
 */
export function chainOrder(fills: Fill[]): Fill[] {
  const byTime = [...fills].sort((a, b) => a.time - b.time);
  const out: Fill[] = [];
  let pos: number | null = null;
  for (let i = 0; i < byTime.length; ) {
    let j = i;
    while (j < byTime.length && byTime[j].time === byTime[i].time) j++;
    const tied = byTime.slice(i, j);
    while (tied.length) {
      let k = 0;
      if (pos !== null) {
        const p = pos;
        tied.forEach((f, idx) => {
          if (Math.abs(num(f.startPosition) - p) < Math.abs(num(tied[k].startPosition) - p)) k = idx;
        });
      }
      const [f] = tied.splice(k, 1);
      out.push(f);
      pos = endOf(f);
    }
    i = j;
  }
  return out;
}

/** همهٔ معاملات (بسته و باز) به ترتیب زمان باز شدن */
export function buildRoundTrips(fills: Fill[]): RoundTrip[] {
  const byCoin = new Map<string, Fill[]>();
  for (const f of fills) if (isPerpCoin(f.coin)) byCoin.set(f.coin, [...(byCoin.get(f.coin) ?? []), f]);
  const sorted = [...byCoin.values()].flatMap(chainOrder);
  const legs = new Map<string, Leg>();
  const out: RoundTrip[] = [];

  for (const f of sorted) {
    const px = num(f.px);
    const sz = Math.abs(num(f.sz));
    if (!(px > 0) || !(sz > 0)) continue;
    const start = num(f.startPosition);
    const delta = f.side === 'B' ? sz : -sz;
    const end = start + delta;
    const eps = 1e-9 * Math.max(1, Math.abs(start), sz);
    const fee = num(f.fee);
    const pnl = num(f.closedPnl);

    let leg = legs.get(f.coin);
    // پوزیشن مرجع با معاملهٔ جاری ما نمی‌خواند (fill گم‌شده) → معاملهٔ جاری ناقص است
    if (leg && Math.abs(start) <= eps) {
      leg.trip.complete = false;
      out.push(finish(leg, f.time));
      legs.delete(f.coin);
      leg = undefined;
    }
    if (!leg) {
      if (Math.abs(start) <= eps && Math.abs(end) <= eps) continue;
      const ref = Math.abs(start) > eps ? start : end;
      leg = openLeg(f.coin, ref > 0 ? 'long' : 'short', f.time, Math.abs(start) <= eps);
      legs.set(f.coin, leg);
    }

    const dirSign = leg.trip.side === 'long' ? 1 : -1;
    const crosses = Math.abs(end) > eps && Math.sign(end) !== dirSign && Math.abs(start) > eps;
    // سهم این fill که مربوط به معاملهٔ جاری است (در عبور از صفر فقط تا صفر)
    const closingQty = crosses ? Math.abs(start) : sz;
    const share = closingQty / sz;
    const t = leg.trip;
    t.fills++;
    t.fees += fee * share;
    t.grossPnl += pnl; // closedPnl فقط مال بخش بستن است
    if (Math.sign(delta) === dirSign) {
      leg.entryQty += sz;
      leg.entryNotional += sz * px;
    } else {
      leg.exitQty += closingQty;
      leg.exitNotional += closingQty * px;
    }
    // هر اندازه با قیمت همان fill که به آن رسید ارزش‌گذاری می‌شود
    const qty = crosses ? 0 : Math.abs(end);
    t.maxNotional = Math.max(t.maxNotional, qty * px, t.fills === 1 ? Math.abs(start) * px : 0);

    if (crosses || Math.abs(end) <= eps) {
      out.push(finish(leg, f.time));
      legs.delete(f.coin);
      if (crosses) {
        const next = openLeg(f.coin, end > 0 ? 'long' : 'short', f.time, true);
        const rest = Math.abs(end);
        next.trip.fills = 1;
        next.trip.fees = fee * (1 - share);
        next.entryQty = rest;
        next.entryNotional = rest * px;
        next.trip.maxNotional = rest * px;
        legs.set(f.coin, next);
      }
    }
  }
  for (const leg of legs.values()) out.push(finish(leg, null));
  return out.sort((a, b) => a.openTime - b.openTime);
}
