/**
 * Hyperliquid برای ابزارهای دلتا نوترال — فقط اندپوینت عمومی Info (بدون کیف پول/کلید/امضا)
 *
 *  POST https://api.hyperliquid.xyz/info   (CORS باز؛ درخواست مستقیم از مرورگر)
 *    perpDexs                      فهرست DEXهای HIP-3 (اولین عضو null = بازارهای اصلی)
 *    metaAndAssetCtxs {dex}        بازارها: حداکثر اهرم، deployerFeeScale، growthMode + فاندینگ ساعتی، قیمت مارک، حجم
 *    fundingHistory {coin,...}     فاندینگ تسویه‌شدهٔ ساعتی (حداکثر ۵۰۰ ردیف در هر پاسخ → صفحه‌بندی)
 *    l2Book {coin}                 دفتر سفارش [bids, asks] با px/sz
 *
 * نرخ فاندینگ Hyperliquid ساعتی و کسری است؛ مثبت = لانگ می‌پردازد (همان قرارداد VenueQuote).
 * کارمزد سطح پایه (۰٫۰۴۵٪ تیکر · ۰٫۰۱۵٪ میکر) با فرمول رسمی HIP-3 و growth mode:
 *   https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees
 * مارجین نگهداری = ۱ ÷ (۲ × حداکثر اهرم) — پلهٔ اول جدول مارجین (اندازه‌های کوچک).
 * یک دارایی در چند DEX: بازار اصلی مقدم است، وگرنه پرحجم‌ترین بازار HIP-3.
 */
import { useQuery } from '@tanstack/react-query';
import { assetDisplayName } from '@/shared/i18n/assetDisplayName';
import { floorHour, midPrice, type BookLevel, type RatePoint } from '@/features/calculators/domain';
import type { PerpCategory } from './perpMarkets';

const HL_INFO = 'https://api.hyperliquid.xyz/info';
const BASE_TAKER_PCT = 0.045;
const BASE_MAKER_PCT = 0.015;
const HISTORY_PAGE = 500;
const MAX_PAGES = 3;

const fin = (v: unknown): number | null => {
  if ((typeof v !== 'number' && typeof v !== 'string') || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const rows = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];

async function info(body: Record<string, unknown>, timeoutMs = 15_000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(HL_INFO, {
      method: 'POST',
      signal: ctrl.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** ضریب کل کارمزد بازار HIP-3 (فرمول رسمی)؛ بازار اصلی = ۱ */
export function hip3FeeScale(deployerFeeScale: number | null): number {
  if (deployerFeeScale === null || !(deployerFeeScale >= 0)) return 2;
  return deployerFeeScale < 1 ? deployerFeeScale + 1 : deployerFeeScale * 2;
}

export interface HyperliquidMarket {
  /** نام بازار در API: BTC · xyz:TSLA */
  coin: string;
  /** DEX سازنده (HIP-3)؛ null = بازارهای اصلی Hyperliquid */
  dex: string | null;
  base: string;
  nameFa: string;
  category: PerpCategory;
  markPrice: number | null;
  fundingHourly: number | null;
  maxLeverage: number | null;
  maintenanceMarginFraction: number | null;
  takerFeePct: number;
  makerFeePct: number;
  volume24hUsd: number | null;
}

/** یک پاسخ metaAndAssetCtxs → بازارهای فعال همان DEX */
export function normalizeHyperliquidDex(dex: string | null, body: unknown): HyperliquidMarket[] {
  if (!Array.isArray(body) || body.length < 2) return [];
  const universe = rows((body[0] as { universe?: unknown } | null)?.universe);
  const ctxs = Array.isArray(body[1]) ? body[1] : [];
  return universe.flatMap((u, i): HyperliquidMarket[] => {
    const coin = typeof u.name === 'string' ? u.name : '';
    const ctx = ctxs[i] && typeof ctxs[i] === 'object' ? (ctxs[i] as Record<string, unknown>) : null;
    if (!coin || !ctx || u.isDelisted === true) return [];
    const base = (coin.includes(':') ? coin.slice(coin.indexOf(':') + 1) : coin).toUpperCase();
    const maxLev = fin(u.maxLeverage);
    const scale = (dex ? hip3FeeScale(fin(u.deployerFeeScale)) : 1) * (dex && u.growthMode === 'enabled' ? 0.1 : 1);
    return [
      {
        coin,
        dex,
        base,
        nameFa: assetDisplayName(base).name,
        category: dex ? 'other' : 'crypto',
        markPrice: fin(ctx.markPx) ?? fin(ctx.oraclePx),
        fundingHourly: fin(ctx.funding),
        maxLeverage: maxLev && maxLev > 0 ? maxLev : null,
        maintenanceMarginFraction: maxLev && maxLev > 0 ? 1 / (2 * maxLev) : null,
        takerFeePct: BASE_TAKER_PCT * scale,
        makerFeePct: BASE_MAKER_PCT * scale,
        volume24hUsd: fin(ctx.dayNtlVlm)
      }
    ];
  });
}

/** هر دارایی یک بازار: اصلی مقدم، وگرنه پرحجم‌ترین HIP-3 */
export function pickPerBase(markets: readonly HyperliquidMarket[]): HyperliquidMarket[] {
  const best = new Map<string, HyperliquidMarket>();
  for (const m of markets) {
    const cur = best.get(m.base);
    const better = !cur || (cur.dex !== null && (m.dex === null || (m.volume24hUsd ?? 0) > (cur.volume24hUsd ?? 0)));
    if (better) best.set(m.base, m);
  }
  return [...best.values()].sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));
}

const DEX_NAME = /^[a-z0-9]{1,16}$/;

export async function fetchHyperliquidMarkets(): Promise<HyperliquidMarket[]> {
  const dexes = await info({ type: 'perpDexs' }).catch(() => []);
  const names = rows(dexes).flatMap((d) => (typeof d.name === 'string' && DEX_NAME.test(d.name) ? [d.name] : []));
  const main = normalizeHyperliquidDex(null, await info({ type: 'metaAndAssetCtxs' }));
  // یک DEX خراب نباید کل بازارها را از کار بیندازد
  const hip3 = await Promise.all(names.map((dex) => info({ type: 'metaAndAssetCtxs', dex }).then((b) => normalizeHyperliquidDex(dex, b), () => [])));
  return pickPerBase([...main, ...hip3.flat()]);
}

export function useHyperliquidMarkets() {
  return useQuery({
    queryKey: ['calc-perp-markets', 'hyperliquid'],
    queryFn: fetchHyperliquidMarkets,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1
  });
}

/* ---------------- تاریخچهٔ فاندینگ و دفتر سفارش ---------------- */

const COIN = /^([a-z0-9]{1,16}:)?[A-Za-z0-9]{1,24}$/;

export function parseHyperliquidFundings(body: unknown): RatePoint[] {
  return rows(body).flatMap((f) => {
    const t = fin(f.time);
    const rate = fin(f.fundingRate);
    return t === null || rate === null ? [] : [{ hour: floorHour(t), rate }];
  });
}

/** فاندینگ تسویه‌شدهٔ ساعتی از sinceMs تا الان، صفحه‌به‌صفحه */
export async function fetchHyperliquidFundingHistory(coin: string, sinceMs: number): Promise<RatePoint[]> {
  if (!COIN.test(coin)) throw new Error('invalid market');
  const out: RatePoint[] = [];
  let start = sinceMs;
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await info({ type: 'fundingHistory', coin, startTime: start });
    const list = rows(body);
    out.push(...parseHyperliquidFundings(list));
    const last = fin(list[list.length - 1]?.time);
    if (list.length < HISTORY_PAGE || last === null || last < start) break;
    start = last + 1;
  }
  return out;
}

export function parseHyperliquidBook(body: unknown): { bids: BookLevel[]; asks: BookLevel[]; mid: number | null } {
  const levels = (body as { levels?: unknown } | null)?.levels;
  const side = (v: unknown) =>
    rows(v).flatMap((l) => {
      const price = fin(l.px);
      const size = fin(l.sz);
      return price !== null && size !== null && price > 0 && size > 0 ? [{ price, size }] : [];
    });
  const bids = side(Array.isArray(levels) ? levels[0] : null).sort((a, b) => b.price - a.price);
  const asks = side(Array.isArray(levels) ? levels[1] : null).sort((a, b) => a.price - b.price);
  return { bids, asks, mid: midPrice(bids, asks) };
}

export async function fetchHyperliquidBook(coin: string) {
  if (!COIN.test(coin)) throw new Error('invalid market');
  return parseHyperliquidBook(await info({ type: 'l2Book', coin }));
}
