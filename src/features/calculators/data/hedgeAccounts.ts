/**
 * اتصال فقط‌خواندنی به حساب‌های ثبت‌شدهٔ کاربر — لایتر (mainnet)، لایتر رابین‌هود و آرکوس (mainnet)
 * مشترک بین ماشین‌حساب پوشش ریسک و پایش «اجرا و پایش دلتا».
 *
 *  حساب‌ها          custody (همان آدرس‌های عمومی که کاربر در بخش لایتر/آرکوس اضافه کرده؛ بدون کلید)
 *  لایتر            /api/integrations?op=lighter-mainnet-account  (همان query و کش صفحهٔ لایتر)
 *  لایتر رابین‌هود   /api/integrations?op=lighter-account          (همان query و کش صفحهٔ لایتر رابین‌هود)
 *  آرکوس            refreshSummary / getArcusState (همان حافظهٔ جلسهٔ صفحهٔ آرکوس)
 *  بازار            usePerpMarkets / useLighterRobinhoodMarkets — قیمت مارک، فاندینگ لحظه‌ای و کارمزد تیکر
 *
 * هیچ سفارشی ثبت نمی‌شود و چیزی ذخیره نمی‌شود. نرمال‌سازها خالص‌اند و جدا تست می‌شوند.
 */
import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/repositories/remoteClient';
import { useCustody } from '@/features/custody/data/useCustody';
import type { Holding } from '@/features/custody/domain/types';
import { lighterAccounts, type LighterAccount } from '@/features/perps/domain/model';
import { accountKey, getArcusState, refreshSummary, useArcusStoreVersion, type AccountRef } from '@/features/arcus/data/useArcusAccount';
import type { ArcusAccount, ArcusPosition } from '@/features/arcus/api/types';
import { useLighterRobinhoodMarkets, usePerpMarkets, type PerpMarket } from './perpMarkets';

export type HedgeVenue = 'lighter' | 'lighterRh' | 'arcus';

export const HEDGE_VENUE_LABELS: Record<HedgeVenue, string> = { lighter: 'لایتر', lighterRh: 'لایتر رابین‌هود', arcus: 'آرکوس' };

/** کلید کش و endpoint همان صفحه‌های لایتر */
export const LIGHTER_ACCOUNT_QUERY: Record<'lighter' | 'lighterRh', { key: string; op: string }> = {
  lighter: { key: 'lighter-mainnet-account', op: 'lighter-mainnet-account' },
  lighterRh: { key: 'lighter-robinhood-account', op: 'lighter-account' }
};

export interface LinkedHedgeAccount {
  id: string;
  venue: HedgeVenue;
  label: string;
  address: string;
  arcus?: AccountRef;
}

export interface HedgeShort {
  base: string;
  market: string;
  /** ارزش اسمی فعلی (دلار)؛ null = قیمت نامعلوم */
  notional: number | null;
  entry: number | null;
  mark: number | null;
  /** قیمت لیکویید گزارش‌شدهٔ صرافی؛ null = گزارش نمی‌شود */
  liquidation: number | null;
  unrealizedPnl: number | null;
  marginMode: 'CROSS' | 'ISOLATED' | null;
}

export interface HedgeSnapshot {
  venue: HedgeVenue;
  /** زیرحساب لایتر / accountIndex آرکوس */
  subAccount: number;
  /** ارزش خالص فعلی حساب فیوچرز (شامل سود/زیان باز) */
  equity: number | null;
  shorts: HedgeShort[];
  longBases: string[];
  positionCount: number;
  /** دارایی اسپات داخل همین حساب (فقط لایتر) */
  spot: { base: string; quantity: number }[];
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const positive = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
};

/** BTC-USD · BTC/USDC · 1000PEPE → BTC · PEPE */
export const baseOf = (symbol: string): string => symbol.toUpperCase().trim().split(/[-_/\s]/)[0].replace(/^1000(?=[A-Z])/, '');

export function linkedHedgeAccounts(holdings: readonly Holding[]): LinkedHedgeAccount[] {
  return holdings.flatMap((h): LinkedHedgeAccount[] => {
    if (h.archivedAt) return [];
    if (h.kind === 'platform' && h.platformId === 'lighter-mainnet' && h.address) return [{ id: h.id, venue: 'lighter', label: h.label, address: h.address }];
    if (h.kind === 'platform' && h.platformId === 'lighter-robinhood' && h.address) return [{ id: h.id, venue: 'lighterRh', label: h.label, address: h.address }];
    if (h.kind === 'arcus' && h.arcus?.env === 'mainnet') return [{ id: h.id, venue: 'arcus', label: h.label, address: h.arcus.address, arcus: h.arcus }];
    return [];
  });
}

/** لایتر mainnet یا رابین‌هود — ساختار حساب یکی است */
export function lighterSnapshot(acc: LighterAccount, markOf: (base: string) => number | null, venue: 'lighter' | 'lighterRh' = 'lighter'): HedgeSnapshot {
  const shorts = acc.positions
    .filter((p) => p.side === 'short')
    .map((p): HedgeShort => {
      const base = baseOf(p.symbol);
      const mark = markOf(base);
      const price = mark ?? p.entry;
      return {
        base,
        market: p.symbol,
        notional: price !== null && price > 0 ? p.size * price : null,
        entry: p.entry,
        mark,
        liquidation: p.liquidation !== null && p.liquidation > 0 ? p.liquidation : null,
        unrealizedPnl: p.pnl,
        marginMode: null
      };
    });
  return {
    venue,
    subAccount: acc.index,
    equity: acc.equity,
    shorts,
    longBases: acc.positions.filter((p) => p.side === 'long').map((p) => baseOf(p.symbol)),
    positionCount: acc.positions.length,
    spot: acc.assets.flatMap((a) => (a.balance !== null && a.balance > 0 ? [{ base: baseOf(a.symbol), quantity: a.balance }] : []))
  };
}

export function arcusSnapshot(account: ArcusAccount | null, positions: readonly ArcusPosition[], accountIndex: number, markOf: (base: string) => number | null): HedgeSnapshot {
  const shorts = positions
    .filter((p) => p.side === 'SHORT')
    .map((p): HedgeShort => {
      const base = baseOf(p.marketDisplayName);
      const notional = num(p.positionValueNotional);
      return {
        base,
        market: p.marketDisplayName,
        notional: notional === null || notional === 0 ? null : Math.abs(notional),
        entry: positive(p.averageEntryPrice),
        // markPx = "0" یعنی در دسترس نبوده
        mark: positive(p.markPx) ?? markOf(base),
        liquidation: null,
        unrealizedPnl: num(p.unrealizedPnl),
        marginMode: p.marginMode ?? null
      };
    });
  return {
    venue: 'arcus',
    subAccount: accountIndex,
    equity: account ? num(account.equity) : null,
    shorts,
    longBases: positions.filter((p) => p.side === 'LONG').map((p) => baseOf(p.marketDisplayName)),
    positionCount: positions.length,
    spot: []
  };
}

/** مقادیر قابل‌پرکردن فرم از یک Short واقعی؛ null = صرافی این عدد را نمی‌دهد (فیلد دست نمی‌خورد) */
export interface HedgeFill {
  shortNotional: number | null;
  /** ارزش خالص فعلی حساب — سود/زیان باز را از قبل دارد، دوباره اضافه نمی‌شود */
  collateral: number | null;
  feePct: number | null;
  /** نرخ لحظه‌ای هر ۸ ساعت (٪)؛ مثبت = Short دریافت می‌کند */
  fundingPct8h: number | null;
  spotUsd: number | null;
  /** رشد قیمت (٪ از مارک فعلی) تا قیمت لیکویید گزارش‌شدهٔ صرافی */
  liquidationRisePct: number | null;
}

export function hedgeFill(snapshot: HedgeSnapshot, short: HedgeShort, market: PerpMarket | undefined): HedgeFill {
  const spotQty = snapshot.spot.find((s) => s.base === short.base)?.quantity ?? null;
  const price = short.mark ?? market?.markPrice ?? null;
  return {
    shortNotional: short.notional,
    collateral: snapshot.equity !== null && snapshot.equity > 0 ? snapshot.equity : null,
    feePct: market?.takerFeePct ?? null,
    // نرخ ساعتی مثبت → لانگ می‌پردازد → Short دریافت می‌کند
    fundingPct8h: market?.fundingHourly == null ? null : market.fundingHourly * 8 * 100,
    spotUsd: spotQty !== null && price !== null && price > 0 ? spotQty * price : null,
    liquidationRisePct: short.liquidation !== null && price !== null && price > 0 && short.liquidation > price ? (short.liquidation / price - 1) * 100 : null
  };
}

/* ---------------- hooks ---------------- */

export function useLinkedHedgeAccounts(): LinkedHedgeAccount[] {
  const { holdings } = useCustody();
  return useMemo(() => linkedHedgeAccounts(holdings), [holdings]);
}

export interface HedgeAccountData {
  status: 'idle' | 'loading' | 'ready' | 'error';
  snapshots: HedgeSnapshot[];
  markets: PerpMarket[];
  fetchedAt: number | null;
}

const SUMMARY_POLL_MS = 30_000;

export function useHedgeAccount(acc: LinkedHedgeAccount | null): HedgeAccountData {
  const venue = acc?.venue ?? null;
  const lighterMarkets = usePerpMarkets('lighter');
  const lighterRhMarkets = useLighterRobinhoodMarkets();
  const arcusMarkets = usePerpMarkets('arcus');
  const markets = (venue === 'arcus' ? arcusMarkets.data : venue === 'lighterRh' ? lighterRhMarkets.data : lighterMarkets.data) ?? [];
  const markOf = (base: string) => markets.find((m) => m.base.toUpperCase() === base)?.markPrice ?? null;

  // لایتر (mainnet یا رابین‌هود): همان query و کلید کش صفحه‌های لایتر
  const lighterVenue = venue === 'lighter' || venue === 'lighterRh' ? venue : 'lighter';
  const lighter = useQuery({
    queryKey: [LIGHTER_ACCOUNT_QUERY[lighterVenue].key, acc?.address.toLowerCase() ?? ''],
    queryFn: () => fetchJson<unknown>(`/api/integrations?op=${LIGHTER_ACCOUNT_QUERY[lighterVenue].op}&address=${encodeURIComponent(acc!.address)}`, { timeoutMs: 15_000 }),
    enabled: venue === 'lighter' || venue === 'lighterRh',
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: 1
  });

  // آرکوس: همان حافظهٔ جلسهٔ صفحهٔ آرکوس، تازه‌سازی هر ۳۰ ثانیه فقط وقتی صفحه دیده می‌شود
  useArcusStoreVersion();
  const ref = venue === 'arcus' ? acc!.arcus! : null;
  const key = ref ? accountKey(ref) : null;
  useEffect(() => {
    if (!ref) return;
    void refreshSummary(ref);
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void refreshSummary(ref);
    }, SUMMARY_POLL_MS);
    return () => clearInterval(t);
    // ref از key ساخته می‌شود
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const arcus = key ? getArcusState(key) : undefined;

  if (!acc) return { status: 'idle', snapshots: [], markets, fetchedAt: null };
  if (acc.venue === 'lighter' || acc.venue === 'lighterRh') {
    if (!lighter.data) return { status: lighter.isError ? 'error' : 'loading', snapshots: [], markets, fetchedAt: null };
    const v = acc.venue;
    return { status: 'ready', snapshots: lighterAccounts(lighter.data, acc.address).map((a) => lighterSnapshot(a, markOf, v)), markets, fetchedAt: lighter.dataUpdatedAt || null };
  }
  const a = arcus?.account;
  const p = arcus?.positions;
  if (!a?.fetchedAt || !p?.data) return { status: a?.error || p?.error ? 'error' : 'loading', snapshots: [], markets, fetchedAt: null };
  return { status: 'ready', snapshots: [arcusSnapshot(a.data ?? null, p.data, ref!.accountIndex, markOf)], markets, fetchedAt: Math.min(a.fetchedAt, p.fetchedAt ?? a.fetchedAt) };
}
