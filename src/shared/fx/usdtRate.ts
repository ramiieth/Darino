/** ============================================================
 * نرخ زنده تتر (USDT/تومان) — والکس و بیت‌پین (خالص، بدون وابستگی)
 *
 *  - والکس:   GET https://api.wallex.ir/v1/trades?symbol=USDTTMN
 *             → result.latestTrades[0].price (تومان) — CORS فقط wallex.ir
 *               ⇒ از مسیر سرور (/api/usdt) خوانده می‌شود
 *  - بیت‌پین: GET https://api.bitpin.ir/api/v1/mkt/tickers/
 *             → [{symbol:"USDT_IRT", price, timestamp}] — CORS «*»
 *               ⇒ مستقیم از مرورگر (بدون نیاز به سرور)
 *
 * ⚠️ این فایل هم در مرورگر و هم در فانکشن سرور import می‌شود:
 *    هیچ alias «@/» یا API مرورگر اینجا مجاز نیست.
 * ============================================================ */

export type UsdtSource = 'wallex' | 'bitpin';

export const USDT_SOURCE_FA: Record<UsdtSource, string> = {
  wallex: 'والکس',
  bitpin: 'بیت‌پین'
};

export const WALLEX_TRADES_URL = 'https://api.wallex.ir/v1/trades?symbol=USDTTMN';
export const BITPIN_TICKERS_URL = 'https://api.bitpin.ir/api/v1/mkt/tickers/';

/** بازه معقول قیمت تتر به تومان — خارج از آن = پاسخ خراب/واحد اشتباه (ریال) */
export const MIN_USDT_TOMAN = 10_000;
export const MAX_USDT_TOMAN = 10_000_000;

export interface UsdtQuote {
  source: UsdtSource;
  /** قیمت آخرین معامله (تومان بر تتر) */
  priceToman: number;
  /** زمان آخرین معامله/تیکر در صرافی (در صورت وجود) */
  tradedAt: number | null;
  /** زمان دریافت توسط دارینو */
  fetchedAt: number;
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function isSaneUsdtPrice(p: number | null): p is number {
  return p !== null && p >= MIN_USDT_TOMAN && p <= MAX_USDT_TOMAN;
}

/** پاسخ trades والکس → قیمت آخرین معامله */
export function parseWallexTrades(json: unknown): { priceToman: number; tradedAt: number | null } | null {
  const trades = (json as { result?: { latestTrades?: unknown } } | null)?.result?.latestTrades;
  if (!Array.isArray(trades) || trades.length === 0) return null;
  const t = trades[0] as { symbol?: unknown; price?: unknown; timestamp?: unknown };
  if (t.symbol !== undefined && t.symbol !== 'USDTTMN') return null;
  const price = num(t.price);
  if (!isSaneUsdtPrice(price)) return null;
  const ts = typeof t.timestamp === 'string' ? Date.parse(t.timestamp) : NaN;
  return { priceToman: Math.round(price), tradedAt: Number.isFinite(ts) ? ts : null };
}

/** پاسخ tickers بیت‌پین → قیمت USDT_IRT (IRT = تومان) */
export function parseBitpinTickers(json: unknown): { priceToman: number; tradedAt: number | null } | null {
  if (!Array.isArray(json)) return null;
  const t = json.find((x) => (x as { symbol?: unknown })?.symbol === 'USDT_IRT') as
    | { price?: unknown; timestamp?: unknown }
    | undefined;
  if (!t) return null;
  const price = num(t.price);
  if (!isSaneUsdtPrice(price)) return null;
  const ts = num(t.timestamp);
  return { priceToman: Math.round(price), tradedAt: ts !== null ? Math.round(ts * 1000) : null };
}

export const USDT_SOURCE_URL: Record<UsdtSource, string> = {
  wallex: WALLEX_TRADES_URL,
  bitpin: BITPIN_TICKERS_URL
};

export function parseUsdtResponse(source: UsdtSource, json: unknown) {
  return source === 'wallex' ? parseWallexTrades(json) : parseBitpinTickers(json);
}

/** واکشی مستقیم از صرافی (سرور؛ یا مرورگر فقط برای بیت‌پین) */
export async function fetchUsdtDirect(
  source: UsdtSource,
  fetcher: (url: string, init?: RequestInit) => Promise<Response> = (u, i) => fetch(u, i),
  timeoutMs = 10_000
): Promise<UsdtQuote> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetcher(USDT_SOURCE_URL[source], {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = parseUsdtResponse(source, await res.json());
    if (!parsed) throw new Error('invalid price');
    return { source, ...parsed, fetchedAt: Date.now() };
  } finally {
    clearTimeout(timer);
  }
}
