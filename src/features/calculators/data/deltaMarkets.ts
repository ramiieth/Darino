/**
 * بازارهای دلتا نوترال — آرکوس، اوندو پرپس و لایتر (فقط دادهٔ عمومی بازار؛ بدون حساب/کلید)
 *
 *  Arcus · Lighter   usePerpMarkets (مستقیم از مرورگر، CORS باز)
 *  Ondo  تنظیمات     /api/integrations?op=ondo-perps-public  (کارمزد، مارجین، قیمت مارک — REST اوندو CORS ندارد)
 *  Ondo  فاندینگ     wss://api.ondoperps.xyz/ws  کانال عمومی fundingRatesPerps (WebSocket محدودیت CORS ندارد)
 *
 * نرخ‌ها همه «ساعتی» هستند: Arcus و Ondo ساعتی تسویه می‌کنند؛ نرخ ۸ساعتهٔ Lighter در usePerpMarkets ÷ ۸ شده است.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/repositories/remoteClient';
import { assetDisplayName } from '@/shared/i18n/assetDisplayName';
import { usePerpMarkets, type PerpCategory, type PerpMarket } from './perpMarkets';

export type DeltaVenue = 'arcus' | 'ondo' | 'lighter';

export const DELTA_VENUE_LABELS: Record<DeltaVenue, string> = {
  arcus: 'آرکوس',
  ondo: 'اوندو پرپس',
  lighter: 'لایتر'
};

export interface VenueQuote {
  venue: DeltaVenue;
  base: string;
  display: string;
  nameFa: string;
  category: PerpCategory;
  markPrice: number | null;
  /** نرخ فاندینگ ساعتی (کسری)؛ مثبت = لانگ می‌پردازد */
  fundingHourly: number | null;
  /** ٪ */
  makerFeePct: number | null;
  takerFeePct: number | null;
  maxLeverage: number | null;
  maintenanceMarginFraction: number | null;
  volume24hUsd: number | null;
}

export type VenueStatus = 'loading' | 'ready' | 'error';

export interface VenueBook {
  status: VenueStatus;
  quotes: VenueQuote[];
}

/* ---------------- Arcus · Lighter ---------------- */

export function fromPerpMarket(m: PerpMarket): VenueQuote {
  return {
    venue: m.venue,
    base: m.base.toUpperCase(),
    display: m.display,
    nameFa: m.nameFa,
    category: m.category,
    markPrice: m.markPrice,
    fundingHourly: m.fundingHourly,
    makerFeePct: m.makerFeePct,
    takerFeePct: m.takerFeePct,
    maxLeverage: m.maxLeverage,
    maintenanceMarginFraction: m.maintenanceMarginFraction,
    volume24hUsd: m.volume24hUsd
  };
}

/* ---------------- Ondo ---------------- */

/** خروجی خلاصه‌شدهٔ سرور (api/_perpsRead.ts → trimOndoMarkets) */
export interface OndoPublicMarket {
  market: string;
  base: string;
  name: string;
  tags: string[];
  makerFee: number | null;
  takerFee: number | null;
  maxLeverage: number | null;
  maintenanceMarginRate: number | null;
  markPrice: number | null;
}

export interface OndoFundingTick {
  rate: number;
  mark: number | null;
}

const ONDO_CATEGORY: Record<string, PerpCategory> = {
  Crypto: 'crypto',
  Stock: 'equity',
  'Pre-IPO': 'equity',
  ETF: 'equity',
  Commodity: 'commodity',
  Index: 'index'
};

const fin = (v: unknown): number | null => {
  if ((typeof v !== 'number' && typeof v !== 'string') || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function normalizeOndo(markets: readonly OndoPublicMarket[], funding: Readonly<Record<string, OndoFundingTick>>): VenueQuote[] {
  return markets.map((m) => {
    const tick = funding[m.market];
    const tag = m.tags.find((t) => ONDO_CATEGORY[t]);
    return {
      venue: 'ondo' as const,
      base: m.base.toUpperCase(),
      display: m.market,
      nameFa: assetDisplayName(m.base, m.name).name,
      category: tag ? ONDO_CATEGORY[tag] : 'other',
      // قیمت زندهٔ WebSocket مقدم بر عکس REST سرور
      markPrice: tick?.mark ?? m.markPrice,
      fundingHourly: tick ? tick.rate : null,
      makerFeePct: m.makerFee === null ? null : m.makerFee * 100,
      takerFeePct: m.takerFee === null ? null : m.takerFee * 100,
      maxLeverage: m.maxLeverage,
      maintenanceMarginFraction: m.maintenanceMarginRate,
      volume24hUsd: null
    };
  });
}

/** پیام کانال fundingRatesPerps → نرخ ساعتی و آخرین قیمت مارک هر بازار (پیام نامعتبر = خالی) */
export function parseOndoFunding(raw: unknown): Record<string, OndoFundingTick> {
  const msg = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  if (msg.type !== 'update' || msg.channel !== 'fundingRatesPerps' || !Array.isArray(msg.data)) return {};
  const out: Record<string, OndoFundingTick> = {};
  for (const item of msg.data) {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const market = typeof row.market === 'string' ? row.market : '';
    const rate = fin(row.rate);
    if (!/^[A-Z0-9]{1,20}-USD\.P$/.test(market) || rate === null) continue;
    const latest = Array.isArray(row.premiums) && row.premiums[0] && typeof row.premiums[0] === 'object' ? (row.premiums[0] as Record<string, unknown>) : {};
    out[market] = { rate, mark: fin(latest.mark) };
  }
  return out;
}

const ONDO_WS = 'wss://api.ondoperps.xyz/ws';

/**
 * فاندینگ زندهٔ Ondo از کانال عمومی — اتصال فقط وقتی enabled است؛ به‌روزرسانی‌ها هر ثانیه یک‌جا اعمال می‌شوند.
 * قطع اتصال → تلاش مجدد با فاصلهٔ رو به افزایش (حداکثر ۶ بار).
 */
export function useOndoFunding(enabled: boolean): { rates: Record<string, OndoFundingTick>; status: VenueStatus } {
  const [rates, setRates] = useState<Record<string, OndoFundingTick>>({});
  const [status, setStatus] = useState<VenueStatus>('loading');

  useEffect(() => {
    if (!enabled || typeof WebSocket === 'undefined') return;
    let ws: WebSocket | null = null;
    let disposed = false;
    let attempts = 0;
    let pending: Record<string, OndoFundingTick> = {};
    let retry: ReturnType<typeof setTimeout> | undefined;

    const flush = setInterval(() => {
      if (!Object.keys(pending).length) return;
      const batch = pending;
      pending = {};
      setRates((prev) => ({ ...prev, ...batch }));
      setStatus('ready');
    }, 1000);
    const ping = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'ping' }));
    }, 60_000);

    const connect = () => {
      if (disposed) return;
      ws = new WebSocket(ONDO_WS);
      ws.onopen = () => {
        attempts = 0;
        ws?.send(JSON.stringify({ op: 'subscribe', channel: 'fundingRatesPerps' }));
      };
      ws.onmessage = (e: MessageEvent) => {
        if (typeof e.data !== 'string' || e.data.length > 64_000) return;
        try {
          Object.assign(pending, parseOndoFunding(JSON.parse(e.data)));
        } catch {
          /* پیام غیر JSON */
        }
      };
      ws.onclose = () => {
        if (disposed) return;
        if (++attempts > 6) {
          setStatus((s) => (s === 'ready' ? s : 'error'));
          return;
        }
        retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempts));
      };
    };
    connect();

    return () => {
      disposed = true;
      clearInterval(flush);
      clearInterval(ping);
      clearTimeout(retry);
      ws?.close();
    };
  }, [enabled]);

  return { rates, status };
}

function useOndoMarkets(enabled: boolean) {
  return useQuery({
    queryKey: ['calc-ondo-public-markets'],
    queryFn: () => fetchJson<{ markets: OndoPublicMarket[] }>('/api/integrations?op=ondo-perps-public', { timeoutMs: 15_000 }),
    enabled,
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1
  });
}

/* ---------------- Hook ---------------- */

const statusOf = (q: { isPending: boolean; isError: boolean; data?: unknown }): VenueStatus =>
  q.data ? 'ready' : q.isError ? 'error' : 'loading';

/** هر سه صرافی؛ برای Ondo وضعیت «آماده» یعنی هم تنظیمات و هم فاندینگ زنده رسیده باشد */
export function useDeltaVenues(): Record<DeltaVenue, VenueBook> {
  const arcus = usePerpMarkets('arcus');
  const lighter = usePerpMarkets('lighter');
  const ondoMarkets = useOndoMarkets(true);
  const ondoFunding = useOndoFunding(true);

  return useMemo(() => {
    const ondoStatus: VenueStatus =
      ondoMarkets.isError ? 'error' : ondoMarkets.data && ondoFunding.status === 'ready' ? 'ready' : ondoFunding.status === 'error' ? 'error' : 'loading';
    return {
      arcus: { status: statusOf(arcus), quotes: (arcus.data ?? []).map(fromPerpMarket) },
      lighter: { status: statusOf(lighter), quotes: (lighter.data ?? []).map(fromPerpMarket) },
      ondo: { status: ondoStatus, quotes: ondoMarkets.data ? normalizeOndo(ondoMarkets.data.markets, ondoFunding.rates) : [] }
    };
  }, [arcus.data, arcus.isError, arcus.isPending, lighter.data, lighter.isError, lighter.isPending, ondoMarkets.data, ondoMarkets.isError, ondoFunding.rates, ondoFunding.status]);
}
