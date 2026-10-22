/**
 * بازارهای Perpetual برای ماشین‌حساب (فقط داده عمومی — بدون آدرس/کلید کاربر)
 *
 *  Lighter  — GET /api/v1/orderBookDetails  (قیمت مارک، کسرهای مارجین به واحد ۱/۱۰۰۰۰، کارمزد ٪)
 *             GET /api/v1/funding-rates      (نرخ نرمال‌شده به ۸ ساعت → ÷۸ برای نرخ ساعتی؛
 *             تطبیق: نرخ ساعتی Hyperliquid 0.0000125 در همین endpoint برابر 0.0001 است)
 *  Arcus    — GET /v1/markets               (fundingRate ساعتی طبق مستندات، کسرهای مارجین اعشاری)
 *  QFEX     — /api/integrations?op=qfex-perps-public  (api.qfex.com CORS ندارد؛ فاندینگ ساعتی کسری، فقط سهام/شاخص/کالا)
 *  TxFlow   — POST rpc.txflow.com/info perpMeta · webData2 · marketTags  +  wss://rpc.txflow.com/ws allAssetCtxs
 *             (فاندینگ «درصد» ساعتی ÷ ۱۰۰؛ یک پیام WebSocket همهٔ بازارها را دارد — REST دسته‌ای برای فاندینگ نیست)
 *
 * لایتر، آرکوس و TxFlow CORS باز دارند؛ درخواست مستقیم از مرورگر بدون پروکسی.
 */
import { useQuery } from '@tanstack/react-query';
import { arcusGet } from '@/features/arcus/api/client';
import { fetchJson } from '@/repositories/remoteClient';
import { assetDisplayName } from '@/shared/i18n/assetDisplayName';

export type PerpVenue = 'lighter' | 'arcus' | 'qfex' | 'txflow';

export const PERP_VENUES: readonly PerpVenue[] = ['lighter', 'arcus', 'qfex', 'txflow'];

export const PERP_VENUE_LABELS: Record<PerpVenue, string> = {
  lighter: 'لایتر',
  arcus: 'آرکوس',
  qfex: 'کیوفکس',
  txflow: 'تی‌اکس‌فلو'
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

/* ---------------- QFEX ---------------- */

/** خروجی خلاصه‌شدهٔ سرور (api/_perpsRead.ts → trimQfexMarkets) */
export interface QfexPublicMarket {
  market: string;
  base: string;
  category: string;
  maxLeverage: number | null;
  markPrice: number | null;
  fundingHourly: number | null;
  volume24hUsd: number | null;
}

const QFEX_CATEGORY: Record<string, PerpCategory> = { EQUITY: 'equity', COMMODITY: 'commodity', INDEX: 'index' };

/** کارمزد پایهٔ QFEX (ردهٔ ۵، حجم ۳۰ روزه زیر ۲ میلیون) — API عمومی کارمزد نمی‌دهد؛ docs.qfex.com/qfex/fees */
const QFEX_FEES: Partial<Record<PerpCategory, { maker: number; taker: number }>> = {
  equity: { maker: 0.05, taker: 0.1 },
  commodity: { maker: 0.02, taker: 0.05 },
  index: { maker: 0.02, taker: 0.05 }
};

export function normalizeQfex(markets: readonly QfexPublicMarket[]): PerpMarket[] {
  return markets.map((m) => {
    const category = QFEX_CATEGORY[m.category] ?? 'other';
    return {
      venue: 'qfex' as const,
      id: m.market,
      base: m.base,
      display: m.market,
      nameFa: assetDisplayName(m.base).name,
      category,
      markPrice: m.markPrice,
      fundingHourly: m.fundingHourly,
      maxLeverage: m.maxLeverage,
      // API عمومی مارجین نگهداری نمی‌دهد
      maintenanceMarginFraction: null,
      takerFeePct: QFEX_FEES[category]?.taker ?? null,
      makerFeePct: QFEX_FEES[category]?.maker ?? null,
      volume24hUsd: m.volume24hUsd,
      change24hPct: null
    };
  });
}

const fetchQfex = async () =>
  normalizeQfex((await fetchJson<{ markets: QfexPublicMarket[] }>('/api/integrations?op=qfex-perps-public', { timeoutMs: 15_000 })).markets ?? []);

/* ---------------- TxFlow ---------------- */

export const TXFLOW_BASE = 'https://rpc.txflow.com';
const TXFLOW_WS = 'wss://rpc.txflow.com/ws';

/** کارمزد پایهٔ پرپ TxFlow (VIP 0) — همان takerFeeRate/makerFeeRate در perpMetaDetail؛ docs.txflow.com/trade/fees */
const TXFLOW_TAKER_PCT = 0.045;
const TXFLOW_MAKER_PCT = 0.015;

export async function txflowInfo<T>(body: Record<string, unknown>, timeoutMs = 15_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${TXFLOW_BASE}/info`, {
      method: 'POST',
      signal: ctrl.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

interface TxflowInstrument {
  index: number;
  name: string;
  baseCurrency: string;
  maxLeverage?: number;
  delisted?: boolean;
  haltTrading?: boolean;
}
interface TxflowDayCtx {
  instrumentId: number;
  dayNtlVlm?: string;
  lastPrice?: string;
  prevDayPx?: string;
}
export interface TxflowTagsBody {
  l2?: { id: number; name: string }[];
  instrumentTags?: { instrumentId: number; businessLine?: string; tagIds?: number[] }[];
}
export interface TxflowLiveCtx {
  /** کسری ساعتی (درصد API ÷ ۱۰۰)؛ مثبت = لانگ می‌پردازد */
  fundingHourly: number | null;
  markPrice: number | null;
}

const TXFLOW_CATEGORY: Record<string, PerpCategory> = {
  Stocks: 'equity',
  'Pre-IPO': 'equity',
  Commodities: 'commodity',
  Indices: 'index',
  FX: 'other',
  Others: 'other'
};

/** پیام کانال allAssetCtxs → فاندینگ و قیمت مارک هر instrumentId (پیام نامعتبر = خالی) */
export function parseTxflowCtxs(raw: unknown): Record<string, TxflowLiveCtx> {
  const msg = raw && typeof raw === 'object' ? (raw as { channel?: unknown; data?: { ctxs?: unknown } }) : {};
  if (msg.channel !== 'allAssetCtxs' || !Array.isArray(msg.data?.ctxs)) return {};
  const out: Record<string, TxflowLiveCtx> = {};
  for (const item of msg.data.ctxs as unknown[]) {
    const row = item && typeof item === 'object' ? (item as { coin?: unknown; ctx?: Record<string, unknown> }) : {};
    if (typeof row.coin !== 'string' || !/^\d{1,6}$/.test(row.coin) || !row.ctx) continue;
    const pct = num(row.ctx.funding);
    out[row.coin] = { fundingHourly: pct === null ? null : pct / 100, markPrice: num(row.ctx.markPx) || null };
  }
  return out;
}

/** یک عکس از فاندینگ همهٔ بازارها: اتصال، اولین پیام allAssetCtxs، قطع (هر ~۳ ثانیه یک پیام کامل می‌آید) */
function txflowCtxSnapshot(timeoutMs = 12_000): Promise<Record<string, TxflowLiveCtx>> {
  return new Promise((resolve, reject) => {
    if (typeof WebSocket === 'undefined') return reject(new Error('no WebSocket'));
    const ws = new WebSocket(TXFLOW_WS);
    const done = (fn: () => void) => {
      clearTimeout(timer);
      ws.onmessage = ws.onerror = ws.onclose = null;
      ws.close();
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new Error('timeout'))), timeoutMs);
    ws.onopen = () => ws.send(JSON.stringify({ method: 'subscribe', type: 'allAssetCtxs', subscription: { type: 'allAssetCtxs' } }));
    ws.onmessage = (e: MessageEvent) => {
      if (typeof e.data !== 'string' || e.data.length > 1_000_000) return;
      try {
        const ctxs = parseTxflowCtxs(JSON.parse(e.data));
        if (Object.keys(ctxs).length) done(() => resolve(ctxs));
      } catch {
        /* پیام غیر JSON */
      }
    };
    ws.onerror = () => done(() => reject(new Error('WebSocket error')));
  });
}

export function normalizeTxflow(
  universe: readonly TxflowInstrument[],
  dayCtxs: readonly TxflowDayCtx[],
  tags: TxflowTagsBody | null,
  live: Readonly<Record<string, TxflowLiveCtx>>
): PerpMarket[] {
  const day = new Map(dayCtxs.map((c) => [c.instrumentId, c]));
  const tagName = new Map((tags?.l2 ?? []).map((t) => [t.id, t.name]));
  const tagsOf = new Map((tags?.instrumentTags ?? []).filter((t) => (t.businessLine ?? 'perp') === 'perp').map((t) => [t.instrumentId, t.tagIds ?? []]));
  return universe
    .filter((u) => !u.delisted && !u.haltTrading)
    .map((u) => {
      const d = day.get(u.index);
      const l = live[String(u.index)];
      const names = (tagsOf.get(u.index) ?? []).map((id) => tagName.get(id) ?? '');
      const tradfi = names.map((n) => TXFLOW_CATEGORY[n]).find(Boolean);
      const last = num(d?.lastPrice);
      const prev = num(d?.prevDayPx);
      return {
        venue: 'txflow' as const,
        id: String(u.index),
        base: u.baseCurrency,
        display: u.name,
        nameFa: assetDisplayName(u.baseCurrency).name,
        // برچسب‌های رمزارزی (Layer 1، DeFi، Meme…) همه رمزارزند؛ بدون برچسب = سایر
        category: tradfi ?? (names.some(Boolean) ? 'crypto' : 'other'),
        markPrice: l?.markPrice ?? last,
        fundingHourly: l?.fundingHourly ?? null,
        maxLeverage: num(u.maxLeverage),
        // جدول مارجین فقط با perpMetaDetail جداگانهٔ هر دارایی — useTxflowMarginTier
        maintenanceMarginFraction: null,
        takerFeePct: TXFLOW_TAKER_PCT,
        makerFeePct: TXFLOW_MAKER_PCT,
        volume24hUsd: num(d?.dayNtlVlm),
        change24hPct: last !== null && prev ? (last / prev - 1) * 100 : null
      };
    });
}

async function fetchTxflow(): Promise<PerpMarket[]> {
  const [meta, web, tags, live] = await Promise.all([
    txflowInfo<{ universe?: TxflowInstrument[] }>({ type: 'perpMeta', includeDelisted: false }),
    txflowInfo<{ assetCtxs?: TxflowDayCtx[] }>({ type: 'webData2' }).catch(() => ({ assetCtxs: [] })),
    txflowInfo<TxflowTagsBody>({ type: 'marketTags' }).catch(() => null),
    // بدون WebSocket بازارها با فاندینگ نامعلوم نشان داده می‌شوند، نه خطا
    txflowCtxSnapshot().catch(() => ({}))
  ]);
  return normalizeTxflow(meta.universe ?? [], web.assetCtxs ?? [], tags, live);
}

export interface MarginTier {
  maxLeverage: number | null;
  maintenanceMarginFraction: number | null;
}

/** ردهٔ اول جدول مارجین (کوچک‌ترین اندازه) از perpMetaDetail */
export function txflowFirstTier(body: unknown, instrumentId: string): MarginTier | null {
  const list = (body as { instruments?: unknown } | null)?.instruments;
  const inst = (Array.isArray(list) ? list : []).find(
    (i: { perp?: { instrumentId?: unknown } }) => String(i?.perp?.instrumentId) === instrumentId
  ) as { marginTable?: { tiers?: { tier?: number; maxLeverage?: unknown; mmr?: unknown }[] } | null } | undefined;
  const tiers = [...(inst?.marginTable?.tiers ?? [])].sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));
  if (!tiers.length) return null;
  const mmr = num(tiers[0].mmr);
  return { maxLeverage: num(tiers[0].maxLeverage), maintenanceMarginFraction: mmr !== null && mmr > 0 && mmr < 1 ? mmr : null };
}

/** مارجین نگهداری و سقف اهرم واقعی یک بازار TxFlow — فقط برای بازار انتخاب‌شده (یک درخواست) */
export function useTxflowMarginTier(market: PerpMarket | null) {
  const enabled = market?.venue === 'txflow';
  return useQuery({
    queryKey: ['txflow-margin-tier', market?.base ?? '', market?.id ?? ''],
    queryFn: async () => txflowFirstTier(await txflowInfo({ type: 'perpMetaDetail', assetName: market!.base }), market!.id),
    enabled,
    staleTime: 10 * 60_000,
    retry: 1
  });
}

/* ---------------- Hook ---------------- */

const FETCHERS: Record<PerpVenue, () => Promise<PerpMarket[]>> = { lighter: fetchLighter, arcus: fetchArcus, qfex: fetchQfex, txflow: fetchTxflow };

export function usePerpMarkets(venue: PerpVenue) {
  return useQuery({
    queryKey: ['calc-perp-markets', venue],
    queryFn: FETCHERS[venue],
    staleTime: 20_000,
    refetchInterval: 30_000,
    retry: 1,
    select: (list) => [...list].sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0))
  });
}
