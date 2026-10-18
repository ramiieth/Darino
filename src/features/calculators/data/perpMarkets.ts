/**
 * بازارهای Perpetual برای ماشین‌حساب (فقط داده عمومی — بدون آدرس/کلید کاربر)
 *
 *  Lighter  — GET /api/v1/orderBookDetails  (قیمت مارک، کسرهای مارجین به واحد ۱/۱۰۰۰۰، کارمزد ٪)
 *             GET /api/v1/funding-rates      (نرخ نرمال‌شده به ۸ ساعت → ÷۸ برای نرخ ساعتی؛
 *             تطبیق: نرخ ساعتی Hyperliquid 0.0000125 در همین endpoint برابر 0.0001 است)
 *  Arcus    — GET /v1/markets               (fundingRate ساعتی طبق مستندات، کسرهای مارجین اعشاری)
 *
 * هر دو میزبان CORS باز دارند؛ درخواست مستقیم از مرورگر بدون پروکسی.
 */
import { useQuery } from '@tanstack/react-query';
import { arcusGet } from '@/features/arcus/api/client';
import { assetDisplayName } from '@/shared/i18n/assetDisplayName';

export type PerpVenue = 'lighter' | 'arcus';

export const PERP_VENUE_LABELS: Record<PerpVenue, string> = {
  lighter: 'لایتر',
  arcus: 'آرکوس'
};

export type PerpCategory = 'crypto' | 'equity' | 'commodity' | 'index' | 'other';

export const PERP_CATEGORY_LABELS: Record<PerpCategory, string> = {
  crypto: 'رمزارز',
  equity: 'سهام',
  commodity: 'کالا',
  index: 'شاخص',
  other: 'سایر'
};

export interface PerpMarket {
  venue: PerpVenue;
  id: string;
  /** دارایی پایه (برای لوگو و نام) */
  base: string;
  /** نماد بازار مثل BTC-USD */
  display: string;
  nameFa: string;
  category: PerpCategory;
  markPrice: number | null;
  /** نرخ فاندینگ ساعتی (کسری)؛ مثبت = لانگ می‌پردازد */
  fundingHourly: number | null;
  maxLeverage: number | null;
  maintenanceMarginFraction: number | null;
  /** کارمزد تیکر (٪) — null یعنی از API در دسترس نیست */
  takerFeePct: number | null;
  /** کارمزد میکر (٪، منفی = ربیت) — null یعنی از API در دسترس نیست */
  makerFeePct: number | null;
  volume24hUsd: number | null;
  change24hPct: number | null;
}

const LIGHTER_BASE = 'https://mainnet.zklighter.elliot.ai';

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

async function getJson<T>(url: string, timeoutMs = 15_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer', headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- Lighter ---------------- */

interface LighterBook {
  symbol: string;
  market_id: number;
  market_type?: string;
  status?: string;
  taker_fee?: string;
  maker_fee?: string;
  min_initial_margin_fraction?: number;
  maintenance_margin_fraction?: number;
  mark_price?: string;
  last_trade_price?: number;
  daily_quote_token_volume?: number;
  daily_price_change?: number;
  market_config?: { hidden?: boolean };
}

export function normalizeLighter(books: LighterBook[], rates: { market_id: number; exchange: string; rate: number }[]): PerpMarket[] {
  const fundingById = new Map<number, number>();
  for (const r of rates) if (r.exchange === 'lighter' && Number.isFinite(r.rate)) fundingById.set(r.market_id, r.rate / 8);
  return books
    .filter((b) => (b.market_type ?? 'perp') === 'perp' && b.status === 'active' && !b.market_config?.hidden)
    .map((b) => {
      const imf = num(b.min_initial_margin_fraction);
      const mmf = num(b.maintenance_margin_fraction);
      return {
        venue: 'lighter' as const,
        id: String(b.market_id),
        base: b.symbol,
        display: `${b.symbol}-USD`,
        nameFa: assetDisplayName(b.symbol).name,
        category: 'other' as const,
        markPrice: num(b.mark_price) ?? num(b.last_trade_price),
        fundingHourly: fundingById.get(b.market_id) ?? null,
        maxLeverage: imf && imf > 0 ? Math.floor(10_000 / imf) : null,
        maintenanceMarginFraction: mmf === null ? null : mmf / 10_000,
        takerFeePct: num(b.taker_fee),
        makerFeePct: num(b.maker_fee),
        volume24hUsd: num(b.daily_quote_token_volume),
        change24hPct: num(b.daily_price_change)
      };
    });
}

async function fetchLighterFrom(base: string): Promise<PerpMarket[]> {
  const [books, rates] = await Promise.all([
    getJson<{ order_book_details?: LighterBook[] }>(`${base}/api/v1/orderBookDetails`),
    getJson<{ funding_rates?: { market_id: number; exchange: string; rate: number }[] }>(`${base}/api/v1/funding-rates`).catch(() => ({ funding_rates: [] }))
  ]);
  return normalizeLighter(books.order_book_details ?? [], rates.funding_rates ?? []);
}

const fetchLighter = () => fetchLighterFrom(LIGHTER_BASE);

/** لایتر شبکهٔ رابین‌هود — همان API عمومی و همان ساختار mainnet (CORS باز)؛ فقط برای ابزارهای دلتا */
const LIGHTER_RH_BASE = 'https://api.rh.lighter.xyz';

export function useLighterRobinhoodMarkets() {
  return useQuery({
    queryKey: ['calc-perp-markets', 'lighter-robinhood'],
    queryFn: () => fetchLighterFrom(LIGHTER_RH_BASE),
    staleTime: 20_000,
    refetchInterval: 30_000,
    retry: 1
  });
}

/* ---------------- Arcus ---------------- */

interface ArcusMarketFull {
  marketDisplayName: string;
  fullAssetName?: string;
  marketId: number;
  status?: string;
  baseAsset?: string;
  type?: string;
  category?: string;
  markPrice?: string | null;
  oraclePrice?: string | null;
  fundingRate?: string | null;
  initialMarginFraction?: string | null;
  maintenanceMarginFraction?: string | null;
  volume24hNotional?: string | null;
  priceChange24h?: string | null;
  /** کارمزد پایهٔ حساب عمومی به واحد ppm (۲۲۵ = ۰٫۰۲۲۵٪) */
  effectiveTakerFeePpm?: number | null;
  effectiveMakerFeePpm?: number | null;
}

/** ppm → ٪ (۱٬۰۰۰٬۰۰۰ ppm = ۱۰۰٪) */
const ppmPct = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : n / 10_000;
};

const ARCUS_CATEGORY: Record<string, PerpCategory> = {
  CRYPTO: 'crypto',
  EQUITIES: 'equity',
  COMMODITIES: 'commodity',
  INDICES: 'index'
};

export function normalizeArcus(markets: ArcusMarketFull[]): PerpMarket[] {
  return markets
    .filter((m) => (m.type ?? 'PERPETUAL') === 'PERPETUAL' && (m.status ?? 'ONLINE') === 'ONLINE')
    .map((m) => {
      const base = m.baseAsset ?? m.marketDisplayName.split('-')[0];
      const imf = num(m.initialMarginFraction);
      const change = num(m.priceChange24h);
      return {
        venue: 'arcus' as const,
        id: String(m.marketId),
        base,
        display: m.marketDisplayName,
        nameFa: assetDisplayName(base, m.fullAssetName).name,
        category: ARCUS_CATEGORY[m.category ?? ''] ?? 'other',
        markPrice: num(m.markPrice) || num(m.oraclePrice),
        fundingHourly: num(m.fundingRate),
        maxLeverage: imf && imf > 0 ? Math.floor(1 / imf) : null,
        maintenanceMarginFraction: num(m.maintenanceMarginFraction),
        takerFeePct: ppmPct(m.effectiveTakerFeePpm),
        makerFeePct: ppmPct(m.effectiveMakerFeePpm),
        volume24hUsd: num(m.volume24hNotional),
        change24hPct: change === null ? null : change * 100
      };
    });
}

async function fetchArcus(): Promise<PerpMarket[]> {
  const body = await arcusGet<{ markets?: ArcusMarketFull[] }>('mainnet', '/v1/markets', {});
  return normalizeArcus(body.markets ?? []);
}

/* ---------------- Hook ---------------- */

export function usePerpMarkets(venue: PerpVenue) {
  return useQuery({
    queryKey: ['calc-perp-markets', venue],
    queryFn: () => (venue === 'lighter' ? fetchLighter() : fetchArcus()),
    staleTime: 20_000,
    refetchInterval: 30_000,
    retry: 1,
    select: (list) => [...list].sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0))
  });
}
