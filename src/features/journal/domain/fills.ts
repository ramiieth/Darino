/**
 * نرمال‌سازی اجراها و فاندینگ خام هر پلتفرم به Fill و FundingEvent — خالص و آزمون‌پذیر
 *
 *   هایپرلیکوئید / تی‌اکس‌فلو: info userFillsByTime (coin, px, sz, side B/A, startPosition, closedPnl, fee, tid)
 *                               info userFunding (delta.usdc مثبت = دریافت)
 *   لایتر: /api/v1/trades?account_index — خلاصه‌شده در سرور (api/_perpsRead.ts → trimLighterTrades)
 *   آرکوس: /v1/fills و /v1/funding (زمان میکروثانیه، payment مثبت = دریافت)
 */
import type { Fill, FundingEvent, JournalAccount, Venue } from './types';

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
type Raw = Record<string, unknown>;
const rows = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter((x): x is Raw => !!x && typeof x === 'object') : []);

const VENUE_CODE: Record<Venue, string> = {
  hyperliquid: 'hl',
  txflow: 'tx',
  'lighter-mainnet': 'lm',
  'lighter-robinhood': 'lr',
  arcus: 'ar',
  metatrader: 'mt',
  manual: 'mn'
};

/** کلید کوتاه و پایدار حساب (در شناسهٔ همگام‌سازی جا شود) */
export function accountKey(venue: Venue, address: string, sub?: number): string {
  return `${VENUE_CODE[venue]}:${address.toLowerCase()}${sub === undefined ? '' : `:${sub}`}`;
}

export function venueOfKey(key: string): Venue | null {
  const code = key.split(':')[0];
  return (Object.keys(VENUE_CODE) as Venue[]).find((v) => VENUE_CODE[v] === code) ?? null;
}

/* ---------------- هایپرلیکوئید و سازگارها ---------------- */

export function fromHlFills(acc: JournalAccount, raw: unknown): Fill[] {
  return rows(raw).flatMap((f): Fill[] => {
    const px = num(f.px), sz = num(f.sz), time = num(f.time);
    const coin = typeof f.coin === 'string' ? f.coin : '';
    if (px === null || sz === null || time === null || !coin || (f.side !== 'B' && f.side !== 'A')) return [];
    // خرید/فروش اسپات (@107) و تسویهٔ بازار منقضی جزو معاملهٔ پرپ نیستند
    if (coin.startsWith('@') || f.dir === 'Settlement' || f.dir === 'Spot Dust Conversion') return [];
    const id = f.tid !== undefined ? String(f.tid) : `${f.hash ?? ''}:${f.oid ?? ''}:${time}:${px}:${sz}`;
    return [{
      id: `${acc.key}|${id}`,
      account: acc.key,
      venue: acc.venue,
      symbol: coin,
      side: f.side === 'B' ? 'buy' : 'sell',
      px,
      sz,
      time,
      fee: num(f.fee),
      realized: num(f.closedPnl),
      posBefore: num(f.startPosition),
      maker: f.crossed === undefined ? undefined : f.crossed === false,
      liquidation: !!f.liquidation || /liquidat/i.test(String(f.dir ?? ''))
    }];
  });
}

export function fromHlFunding(acc: JournalAccount, raw: unknown): FundingEvent[] {
  return rows(raw).flatMap((e): FundingEvent[] => {
    const d = (e.delta && typeof e.delta === 'object' ? e.delta : {}) as Raw;
    const time = num(e.time), amount = num(d.usdc);
    const coin = typeof d.coin === 'string' ? d.coin : '';
    if (time === null || amount === null || !coin || (d.type !== undefined && d.type !== 'funding')) return [];
    return [{ id: `${acc.key}|f:${coin}:${time}`, account: acc.key, symbol: coin, time, amount }];
  });
}

/* ---------------- لایتر (خلاصهٔ سرور) ---------------- */

/** شکل خلاصه‌شدهٔ هر معاملهٔ لایتر که سرور برمی‌گرداند */
export interface LighterTradeLite {
  id: string;
  t: number;
  sym: string;
  side: 'buy' | 'sell';
  px: number;
  sz: number;
  /** ارزش دلاری */
  usd: number;
  /** کارمزد دلاری (null = گزارش نشده) */
  fee: number | null;
  /** سود/زیان بسته‌شدهٔ همین حساب طبق لایتر */
  pnl: number | null;
  /** پوزیشن علامت‌دار قبل از معامله */
  before: number | null;
  maker: boolean;
  liq: boolean;
}

export function fromLighterTrades(acc: JournalAccount, raw: readonly LighterTradeLite[]): Fill[] {
  return raw.flatMap((t): Fill[] =>
    t.px > 0 && t.sz > 0 && t.sym
      ? [{
          id: `${acc.key}|${t.id}`,
          account: acc.key,
          venue: acc.venue,
          symbol: t.sym,
          side: t.side,
          px: t.px,
          sz: t.sz,
          time: t.t,
          fee: t.fee,
          realized: t.pnl,
          posBefore: t.before,
          maker: t.maker,
          liquidation: t.liq
        }]
      : []
  );
}

/* ---------------- آرکوس ---------------- */

const usToMs = (v: unknown): number | null => {
  if (typeof v === 'string' && /^\d{13,19}$/.test(v)) return Number(BigInt(v) / 1000n);
  const n = num(v);
  return n === null ? null : n > 1e14 ? Math.floor(n / 1000) : n;
};

export function fromArcusFills(acc: JournalAccount, raw: unknown): Fill[] {
  return rows(raw).flatMap((f): Fill[] => {
    const px = num(f.price), sz = num(f.size), time = usToMs(f.createdAt);
    const sym = typeof f.marketDisplayName === 'string' ? f.marketDisplayName : '';
    if (px === null || sz === null || time === null || !sym || (f.side !== 'BUY' && f.side !== 'SELL')) return [];
    return [{
      id: `${acc.key}|${String(f.tradeId ?? `${time}:${px}:${sz}`)}`,
      account: acc.key,
      venue: 'arcus',
      symbol: sym,
      side: f.side === 'BUY' ? 'buy' : 'sell',
      px,
      sz,
      time,
      fee: num(f.fee),
      realized: num(f.closedPnl),
      posBefore: null,
      maker: f.role === 'MAKER',
      liquidation: !!f.liquidation
    }];
  });
}

export function fromArcusFunding(acc: JournalAccount, raw: unknown): FundingEvent[] {
  return rows(raw).flatMap((e): FundingEvent[] => {
    const time = usToMs(e.time), amount = num(e.payment);
    const sym = typeof e.marketDisplayName === 'string' ? e.marketDisplayName : '';
    if (time === null || amount === null || !sym) return [];
    return [{ id: `${acc.key}|f:${sym}:${time}`, account: acc.key, symbol: sym, time, amount }];
  });
}

/**
 * برای پلتفرمی که «پوزیشن قبل» نمی‌دهد (آرکوس): از پوزیشن فعلی به عقب برمی‌گردیم.
 * پوزیشن قبل از هر اجرا = پوزیشن فعلی − مجموع علامت‌دار اجراهای بعد از آن.
 * فقط برای اولین اجرای هر نماد لازم است (بقیه را بازسازی خودش دنبال می‌کند).
 */
export function inferPosBefore(fills: readonly Fill[], current: ReadonlyMap<string, number>): Fill[] {
  const bySymbol = new Map<string, Fill[]>();
  for (const f of fills) {
    const g = bySymbol.get(f.symbol);
    if (g) g.push(f);
    else bySymbol.set(f.symbol, [f]);
  }
  const out: Fill[] = [];
  for (const [symbol, g] of bySymbol) {
    g.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
    const total = g.reduce((s, f) => s + (f.side === 'buy' ? f.sz : -f.sz), 0);
    const before = (current.get(symbol) ?? 0) - total;
    const clean = Math.abs(before) < 1e-9 * Math.max(1, Math.abs(total)) ? 0 : before;
    g.forEach((f, i) => out.push(i === 0 && f.posBefore === null ? { ...f, posBefore: clean } : f));
  }
  return out;
}

/** حذف تکراری با شناسه — مرز صفحه‌ها عمداً هم‌پوشانی دارند */
export function dedupeById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Map<string, T>();
  for (const x of items) seen.set(x.id, x);
  return [...seen.values()];
}
