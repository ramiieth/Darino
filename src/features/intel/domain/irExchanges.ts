/**
 * «صرافی‌های ایران» — بهترین قیمت خرید و فروش یک رمزارز در برابر تومان در ۱۱ صرافی
 *
 *   ask = قیمتی که کاربر می‌خرد (بهترین پیشنهاد فروش)، bid = قیمتی که کاربر می‌فروشد (بهترین پیشنهاد خرید)
 *   اسپرد هر صرافی = (ask − bid) ÷ میانه؛ فاصلهٔ صرافی‌ها = گران‌ترین خرید ÷ ارزان‌ترین خرید − ۱
 *   آربیتراژ ناخالص = بهترین فروش جای دیگر ÷ ارزان‌ترین خرید − ۱ (کارمزد و انتقال در آن نیست)
 *
 * نشانی‌ها و واحدها از github.com/sepehr071/iran-crypto-mcp (MIT، سپهر رادمرد)، بازنویسی‌شده؛ هیچ کد بیرونی اجرا نمی‌شود.
 * نوبیتکس، رمزینکس و او‌ام‌پی‌فینکس ریالی‌اند (÷۱۰). کیف‌پول بیرون ماند: فقط با هش کوئری GraphQL جواب می‌دهد.
 * پاسخ‌های نمونه ۳۱ اکتبر ۲۰۲۶ گرفته شد (irExchanges.test.ts).
 * Pure — مشترک بین سرور و کلاینت.
 */

export const IRX_COINS = ['USDT', 'BTC', 'ETH', 'TRX', 'TON', 'SOL', 'DOGE', 'XRP'] as const;
export type IrxCoin = (typeof IRX_COINS)[number];

export const COIN_FA: Record<IrxCoin, string> = {
  USDT: 'تتر', BTC: 'بیت‌کوین', ETH: 'اتریوم', TRX: 'ترون', TON: 'تون‌کوین', SOL: 'سولانا', DOGE: 'دوج‌کوین', XRP: 'ریپل'
};

export type IrExchange =
  | 'nobitex' | 'wallex' | 'bitpin' | 'ramzinex' | 'tabdeal' | 'ompfinex' | 'exir' | 'bit24' | 'abantether' | 'okex' | 'tetherland';

/** book = دفتر سفارش؛ broker = صرافی خودش قیمت خرید و فروش می‌دهد */
export const EXCHANGE_FA: Record<IrExchange, { name: string; url: string; kind: 'book' | 'broker' }> = {
  nobitex: { name: 'نوبیتکس', url: 'https://nobitex.ir', kind: 'book' },
  wallex: { name: 'والکس', url: 'https://wallex.ir', kind: 'book' },
  bitpin: { name: 'بیت‌پین', url: 'https://bitpin.ir', kind: 'book' },
  ramzinex: { name: 'رمزینکس', url: 'https://ramzinex.com', kind: 'book' },
  tabdeal: { name: 'تبدیل', url: 'https://tabdeal.org', kind: 'book' },
  ompfinex: { name: 'او‌ام‌پی‌فینکس', url: 'https://ompfinex.com', kind: 'book' },
  exir: { name: 'اکسیر', url: 'https://exir.io', kind: 'book' },
  bit24: { name: 'بیت۲۴', url: 'https://bit24.cash', kind: 'book' },
  abantether: { name: 'آبان تتر', url: 'https://abantether.com', kind: 'broker' },
  okex: { name: 'اوکی اکسچنج', url: 'https://ok-ex.io', kind: 'broker' },
  tetherland: { name: 'تترلند', url: 'https://tetherland.com', kind: 'broker' }
};
export const IR_EXCHANGES = Object.keys(EXCHANGE_FA) as IrExchange[];

/** صرافی‌هایی که یک پاسخ برای همهٔ ارزها می‌دهند؛ بقیه برای هر ارز یک درخواست */
const ALL_COINS_URL: Partial<Record<IrExchange, string>> = {
  nobitex: 'https://apiv2.nobitex.ir/market/stats',
  ramzinex: 'https://api.ramzinex.ir/exchange/api/v1.0/exchange/pairs',
  ompfinex: 'https://api.ompfinex.com/v2/market',
  exir: 'https://api.exir.io/v2/orderbooks',
  abantether: 'https://api.abantether.ir/api/v2/manager/coins',
  okex: 'https://azapi.ok-ex.io/api/v1/asset/otc/tickers',
  tetherland: 'https://service.tetherland.com/api/v5/currencies'
};

export function irxUrl(ex: IrExchange, coin: IrxCoin): string {
  switch (ex) {
    case 'wallex': return `https://api.wallex.ir/v1/depth?symbol=${coin}TMN`;
    case 'bitpin': return `https://api.bitpin.ir/api/v1/mth/orderbook/${coin}_IRT/`;
    case 'tabdeal': return `https://api.tabdeal.org/r/api/v1/depth?symbol=${coin}IRT`;
    case 'bit24': return `https://pro.bit24.cash/api/v3/markets/${coin}-IRT/order-books`;
    default: return ALL_COINS_URL[ex]!;
  }
}

/** او‌ام‌پی‌فینکس: قیمت در فهرست بازار هست ولی بید و آسک فقط در دفتر هر بازار (شناسهٔ عددی) */
export const ompDepthUrl = (marketId: number) => `https://api.ompfinex.com/v1/market/${marketId}/depth`;

/** تومان */
export interface IrxQuote { bid: number; ask: number }

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/,/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const quote = (bid: unknown, ask: unknown, scale = 1): IrxQuote | null => {
  const b = num(bid);
  const a = num(ask);
  return b && a ? { bid: b / scale, ask: a / scale } : null;
};

/** دفتر سفارش: ردیف [قیمت، مقدار] یا {price} — بهترین‌ها با min/max تا ترتیب ردیف‌ها مهم نباشد */
const levelPrice = (row: unknown) => num(Array.isArray(row) ? row[0] : obj(row)?.price);
function bookQuote(bids: unknown, asks: unknown, scale = 1): IrxQuote | null {
  const b = arr(bids).map(levelPrice).filter((p): p is number => p !== null);
  const a = arr(asks).map(levelPrice).filter((p): p is number => p !== null);
  return b.length && a.length ? quote(Math.max(...b), Math.min(...a), scale) : null;
}

export function parseOmpMarketId(body: unknown, coin: IrxCoin): number | null {
  const m = arr(obj(body)?.data).map(obj).find((x) => x?.baseCurrencyId === coin && x?.quoteCurrencyId === 'IRR' && x?.status === 'LISTED');
  return typeof m?.id === 'number' ? m.id : null;
}

export function parseIrx(ex: IrExchange, coin: IrxCoin, body: unknown): IrxQuote | null {
  const root = obj(body);
  const c = coin.toLowerCase();
  switch (ex) {
    case 'nobitex': {
      const s = obj(obj(root?.stats)?.[`${c}-rls`]);
      return s && s.isClosed !== true ? quote(s.bestBuy, s.bestSell, 10) : null;
    }
    case 'wallex': {
      const r = obj(root?.result);
      return bookQuote(r?.bid, r?.ask);
    }
    case 'bitpin':
    case 'tabdeal':
      return bookQuote(root?.bids, root?.asks);
    case 'ompfinex': {
      const d = obj(root?.data);
      return bookQuote(d?.bids, d?.asks, 10);
    }
    case 'exir': {
      const b = obj(root?.[`${c}-irt`]);
      return bookQuote(b?.bids, b?.asks);
    }
    case 'bit24': {
      const d = obj(root?.data);
      return bookQuote(d?.buy_orders, d?.sell_orders);
    }
    case 'ramzinex': {
      const p = arr(root?.data).map(obj).find((x) =>
        obj(x?.base_currency_symbol)?.en === c && obj(x?.quote_currency_symbol)?.en === 'irr' && !x?.is_delist && !x?.is_temporarily_suspended);
      return p ? quote(p.buy, p.sell, 10) : null;
    }
    case 'abantether': {
      const p = arr(root?.data).map(obj).find((x) => x?.symbol === coin && x?.coin_type === 'COIN' && x?.is_active === true);
      return p ? quote(p.price_sell, p.price_buy) : null;
    }
    case 'okex': {
      // فیلدهای buyAmt و sellAmt در بعضی ردیف‌ها جابه‌جا است
      const p = arr(body).map(obj).find((x) => x?.asset === coin && x?.allowBuy !== false);
      const a = num(p?.buyAmt);
      const b = num(p?.sellAmt);
      return a && b ? { bid: Math.min(a, b), ask: Math.max(a, b) } : null;
    }
    case 'tetherland': {
      // یک قیمت برای خرید و فروش؛ کارمزد جدا گرفته می‌شود
      const p = arr(root?.data).map(obj).find((x) => x?.symbol === coin);
      return p ? quote(p.toman_amount, p.toman_amount) : null;
    }
  }
}

export interface IrxRow {
  exchange: IrExchange;
  bid: number;
  ask: number;
  /** (ask − bid) ÷ میانه */
  spread: number;
}

export interface IrxPayload {
  coin: IrxCoin;
  fetchedAt: number;
  /** ارزان‌ترین خرید اول */
  rows: IrxRow[];
  /** جواب نداد، این ارز را ندارد، یا قیمتش با بقیه نمی‌خواند */
  missing: IrExchange[];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** ۲۰٪ دورتر از میانهٔ بقیه = واحد اشتباه یا بازار مرده؛ دفتر وارونه (بید بیش از ۲٪ بالای آسک) هم کنار می‌رود */
export const OUTLIER = 0.2;

export function irxRows(quotes: Partial<Record<IrExchange, IrxQuote>>): IrxRow[] {
  const ok = (Object.entries(quotes) as [IrExchange, IrxQuote][]).filter(([, q]) => q.bid <= q.ask * 1.02);
  if (!ok.length) return [];
  const mid = median(ok.map(([, q]) => (q.bid + q.ask) / 2));
  return ok
    .filter(([, q]) => Math.abs((q.bid + q.ask) / 2 / mid - 1) <= OUTLIER)
    .map(([exchange, q]) => ({ exchange, bid: q.bid, ask: q.ask, spread: (q.ask - q.bid) / ((q.ask + q.bid) / 2) }))
    .sort((a, b) => a.ask - b.ask || b.bid - a.bid);
}

export interface IrxSummary {
  cheapest: IrxRow;
  bestSell: IrxRow;
  /** گران‌ترین خرید ÷ ارزان‌ترین خرید − ۱ */
  gap: number;
  /** بهترین فروش در صرافی دیگر ÷ ارزان‌ترین خرید − ۱؛ null یعنی فرصتی نیست */
  arbitrage: { buy: IrxRow; sell: IrxRow; gross: number } | null;
}

export function irxSummary(rows: IrxRow[]): IrxSummary | null {
  if (!rows.length) return null;
  const cheapest = rows[0];
  const bestSell = rows.reduce((b, r) => (r.bid > b.bid ? r : b));
  const gap = rows[rows.length - 1].ask / cheapest.ask - 1;
  const others = rows.filter((r) => r.exchange !== cheapest.exchange);
  const sell = others.length ? others.reduce((b, r) => (r.bid > b.bid ? r : b)) : null;
  const gross = sell ? sell.bid / cheapest.ask - 1 : 0;
  return { cheapest, bestSell, gap, arbitrage: sell && gross > 0 ? { buy: cheapest, sell, gross } : null };
}
