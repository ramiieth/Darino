/**
 * ⑫ برگهٔ سفارش دستی دلتا نوترال — بدون کلید و بدون ارسال سفارش؛ فقط عدد و ترتیب
 *
 *   تعداد هر طرف (Q)    = ارزش هر طرف ÷ میانگین قیمت دو صرافی، رو به پایین گرد به گام درشت‌تر دو صرافی
 *                        (تعداد دو طرف دقیقاً برابر؛ برابری دلاری با اختلاف قیمت به‌هم می‌خورد)
 *   تکه‌ها              = Q ÷ تعداد تکه، گرد به گام؛ باقی‌مانده به تکهٔ آخر
 *   پای اول             = صرافی کم‌حجم‌تر (سفارش limit، بیشترین ریسک اجرا) → بعد از پر شدن، پای دیگر با market
 *   پیشرفت              = مقدار اجراشدهٔ هر طرف از روی پوزیشن واقعی؛ عدم توازن = لانگ − شورت
 */

export type TicketMode = 'open' | 'close';
export type TicketSide = 'long' | 'short';

export interface TicketLeg {
  venue: string;
  price: number | null;
  /** گام تعداد سفارش در این صرافی؛ ۰ = بدون گرد کردن */
  stepQty: number;
  minQty: number;
  volume24hUsd: number | null;
}

export interface TicketInput {
  mode: TicketMode;
  /** ارزش هر طرف (دلار)؛ با qtyPerSide نادیده گرفته می‌شود */
  notionalPerSide: number;
  /** تعداد مستقیم هر طرف (مثلاً اندازهٔ پوزیشن فعلی برای بستن) */
  qtyPerSide?: number | null;
  chunks: number;
  long: TicketLeg;
  short: TicketLeg;
}

export interface TicketChunk {
  n: number;
  qty: number;
  /** تعداد تجمعی پس از این تکه */
  cumQty: number;
  longUsd: number;
  shortUsd: number;
}

export type TicketWarning = 'noPrice' | 'roundedToZero' | 'belowMin' | 'chunkBelowMin';

export interface OrderTicket {
  mode: TicketMode;
  qtyPerSide: number;
  step: number;
  refPrice: number | null;
  /** (قیمت شورت ÷ قیمت لانگ − ۱) × ۱۰۰؛ مثبت = گران‌تر می‌فروشید */
  basisPct: number | null;
  chunks: TicketChunk[];
  firstLeg: TicketSide;
  /** پای اول بر اساس حجم ۲۴ساعته انتخاب شد یا پیش‌فرض (حجم نامعلوم) */
  firstLegByVolume: boolean;
  /** بیشترین تعداد تکه که هر تکه ≥ حداقل سفارش بماند */
  maxChunks: number | null;
  /** ارزشی که با گرد کردن کنار گذاشته شد (دلار) */
  roundingLeftoverUsd: number;
  warnings: TicketWarning[];
}

const pos = (v: number | null | undefined): number => (v !== null && v !== undefined && Number.isFinite(v) && v > 0 ? v : 0);
const EPS = 1e-9;

/** گرد رو به پایین به گام، بدون خطای ممیز شناور (۰٫۳ ÷ ۰٫۱) */
export function floorToStep(v: number, step: number): number {
  if (!(step > 0)) return v;
  const n = Math.floor(v / step + EPS);
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
  return Number((n * step).toFixed(Math.min(decimals + 2, 12)));
}

export function buildOrderTicket(i: TicketInput): OrderTicket {
  const pl = pos(i.long.price);
  const ps = pos(i.short.price);
  const refPrice = pl && ps ? (pl + ps) / 2 : pl || ps || null;
  const step = Math.max(pos(i.long.stepQty), pos(i.short.stepQty));
  const minQty = Math.max(pos(i.long.minQty), pos(i.short.minQty));
  const warnings: TicketWarning[] = [];

  const rawQty = pos(i.qtyPerSide) || (refPrice ? pos(i.notionalPerSide) / refPrice : 0);
  if (!pos(i.qtyPerSide) && !refPrice) warnings.push('noPrice');
  const qty = floorToStep(rawQty, step);
  if (rawQty > 0 && qty <= 0) warnings.push('roundedToZero');
  if (qty > 0 && minQty > 0 && qty < minQty) warnings.push('belowMin');

  const n = Math.max(1, Math.floor(pos(i.chunks)) || 1);
  const per = floorToStep(qty / n, step);
  const chunks: TicketChunk[] = [];
  let cum = 0;
  for (let k = 1; k <= n && qty > 0; k++) {
    const q = k === n || per <= 0 ? floorToStep(qty - cum, step) || qty - cum : per;
    if (q <= EPS) break;
    cum = Number((cum + q).toFixed(12));
    chunks.push({ n: chunks.length + 1, qty: q, cumQty: cum, longUsd: q * (pl || refPrice || 0), shortUsd: q * (ps || refPrice || 0) });
    if (cum >= qty - EPS) break;
  }
  if (minQty > 0 && chunks.some((c) => c.qty < minQty - EPS)) warnings.push('chunkBelowMin');

  const vl = i.long.volume24hUsd;
  const vs = i.short.volume24hUsd;
  const firstLegByVolume = vl !== null && vs !== null && vl > 0 && vs > 0 && vl !== vs;
  return {
    mode: i.mode,
    qtyPerSide: qty,
    step,
    refPrice,
    basisPct: pl && ps ? (ps / pl - 1) * 100 : null,
    chunks,
    firstLeg: firstLegByVolume ? (vl! < vs! ? 'long' : 'short') : 'long',
    firstLegByVolume,
    maxChunks: minQty > 0 && qty > 0 ? Math.max(1, Math.floor(qty / minQty + EPS)) : null,
    roundingLeftoverUsd: Math.max(0, rawQty - qty) * (refPrice ?? 0),
    warnings
  };
}

export interface TicketProgress {
  /** مقدار اجراشدهٔ هر طرف (باز شده یا بسته شده) */
  doneLong: number;
  doneShort: number;
  /** تکه‌هایی که هر دو طرف به تعداد تجمعی‌شان رسیده‌اند */
  doneChunks: number;
  /** مثبت = لانگ جلوتر */
  imbalanceQty: number;
  imbalancePct: number | null;
  /** اقدام بعدی؛ null = برگه کامل شده */
  next: { side: TicketSide; qty: number; reason: 'rebalance' | 'chunk' } | null;
  complete: boolean;
}

/**
 * پیشرفت از روی پوزیشن واقعی
 *   باز کردن: اجراشده = پوزیشن فعلی − پوزیشن پیش از شروع
 *   بستن:    اجراشده = پوزیشن پیش از شروع − پوزیشن فعلی
 */
export function ticketProgress(
  t: OrderTicket,
  start: { long: number; short: number },
  current: { long: number; short: number }
): TicketProgress {
  const dir = t.mode === 'open' ? 1 : -1;
  const clamp = (v: number) => Math.min(t.qtyPerSide, Math.max(0, v));
  const doneLong = clamp(dir * (current.long - start.long));
  const doneShort = clamp(dir * (current.short - start.short));
  const both = Math.min(doneLong, doneShort);
  const doneChunks = t.chunks.filter((c) => both >= c.cumQty - Math.max(t.step / 2, EPS)).length;
  const imbalanceQty = doneLong - doneShort;
  const tol = Math.max(t.step / 2, t.qtyPerSide * 1e-6);
  const larger = Math.max(doneLong, doneShort);

  let next: TicketProgress['next'] = null;
  if (Math.abs(imbalanceQty) > tol) {
    next = { side: imbalanceQty > 0 ? 'short' : 'long', qty: floorToStep(Math.abs(imbalanceQty), t.step) || Math.abs(imbalanceQty), reason: 'rebalance' };
  } else if (doneChunks < t.chunks.length) {
    const c = t.chunks[doneChunks];
    next = { side: t.firstLeg, qty: Number((c.cumQty - both).toFixed(12)), reason: 'chunk' };
  }
  return {
    doneLong,
    doneShort,
    doneChunks,
    imbalanceQty,
    imbalancePct: larger > 0 ? (Math.abs(imbalanceQty) / larger) * 100 : null,
    next,
    complete: next === null && t.chunks.length > 0
  };
}
