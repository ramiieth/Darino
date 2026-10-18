/**
 * پوزیشن‌های واقعی دلتا نوترال — همهٔ حساب‌های ثبت‌شدهٔ لایتر (mainnet)، لایتر رابین‌هود و آرکوس (mainnet)، فقط‌خواندنی
 *
 * Long و Short روی یک دارایی، در یک یا چند حساب، یک «جفت» می‌سازند (مثلاً اجرای ربات Tread.fi روی دو حساب).
 * منابع همان اتصال‌های موجود اپ‌اند:
 *   لایتر mainnet      /api/integrations?op=lighter-mainnet-account  (همان کش صفحهٔ لایتر و ماشین‌حساب هج)
 *   لایتر رابین‌هود     /api/integrations?op=lighter-account           (همان کش صفحهٔ لایتر رابین‌هود)
 *   آرکوس              حافظهٔ جلسهٔ صفحهٔ آرکوس (refreshSummary)
 * حساب اوندو در Darino خواندنی نیست. هیچ سفارشی ثبت نمی‌شود.
 */
import { useEffect, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { fetchJson } from '@/repositories/remoteClient';
import { lighterAccounts, type LighterAccount } from '@/features/perps/domain/model';
import { accountKey, getArcusState, refreshSummary, useArcusStoreVersion } from '@/features/arcus/data/useArcusAccount';
import type { ArcusPosition } from '@/features/arcus/api/types';
import { pairExposure, type LiveLeg, type PairExposure } from '@/features/calculators/domain';
import { baseOf, HEDGE_VENUE_LABELS, LIGHTER_ACCOUNT_QUERY, linkedHedgeAccounts, useLinkedHedgeAccounts, type HedgeVenue, type LinkedHedgeAccount } from './hedgeAccounts';
import { useLighterRobinhoodMarkets, usePerpMarkets } from './perpMarkets';

/** همان فهرست حساب‌های ماشین‌حساب پوشش ریسک (یک منبع برای هر دو) */
export type DeltaAccountVenue = HedgeVenue;
export type DeltaAccount = LinkedHedgeAccount;
export const DELTA_ACCOUNT_LABELS = HEDGE_VENUE_LABELS;
export const linkedDeltaAccounts = linkedHedgeAccounts;

export interface AccountLeg extends LiveLeg {
  accountId: string;
  accountLabel: string;
  venue: DeltaAccountVenue;
  sub: number;
  base: string;
  market: string;
  entry: number | null;
  mark: number | null;
  liquidation: number | null;
  /** فاندینگ تجمعی خام آرکوس از زمان باز شدن — علامتش در مستندات روشن نیست؛ جمع زده نمی‌شود */
  rawFundingSinceOpen: number | null;
}

export interface LivePair {
  base: string;
  legs: AccountLeg[];
  exposure: PairExposure;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const positive = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
};

/** لایتر mainnet یا رابین‌هود — ساختار حساب یکی است */
export function lighterLegs(acc: DeltaAccount, accounts: readonly LighterAccount[], markOf: (base: string) => number | null): AccountLeg[] {
  return accounts.flatMap((a) =>
    a.positions.map((p): AccountLeg => {
      const base = baseOf(p.symbol);
      const mark = markOf(base);
      const price = mark ?? p.entry;
      return {
        accountId: acc.id,
        accountLabel: acc.label,
        venue: acc.venue,
        sub: a.index,
        side: p.side,
        base,
        market: p.symbol,
        notional: price !== null && price > 0 ? p.size * price : null,
        unrealizedPnl: p.pnl,
        entry: p.entry,
        mark,
        liquidation: p.liquidation !== null && p.liquidation > 0 ? p.liquidation : null,
        rawFundingSinceOpen: null
      };
    })
  );
}

export function arcusLegs(acc: DeltaAccount, positions: readonly ArcusPosition[], markOf: (base: string) => number | null): AccountLeg[] {
  return positions.map((p): AccountLeg => {
    const base = baseOf(p.marketDisplayName);
    const notional = num(p.positionValueNotional);
    return {
      accountId: acc.id,
      accountLabel: acc.label,
      venue: 'arcus',
      sub: p.accountIndex,
      side: p.side === 'SHORT' ? 'short' : 'long',
      base,
      market: p.marketDisplayName,
      notional: notional === null || notional === 0 ? null : Math.abs(notional),
      unrealizedPnl: num(p.unrealizedPnl),
      entry: positive(p.averageEntryPrice),
      mark: positive(p.markPx) ?? markOf(base),
      liquidation: null,
      rawFundingSinceOpen: p.cumulativeFunding ? num(p.cumulativeFunding.sinceOpen) : null
    };
  });
}

/** فقط دارایی‌هایی که هم Long و هم Short دارند، بزرگ‌ترین مواجهه اول */
export function groupDeltaPairs(legs: readonly AccountLeg[]): LivePair[] {
  const byBase = new Map<string, AccountLeg[]>();
  for (const l of legs) byBase.set(l.base, [...(byBase.get(l.base) ?? []), l]);
  return [...byBase]
    .filter(([, ls]) => ls.some((l) => l.side === 'long') && ls.some((l) => l.side === 'short'))
    .map(([base, ls]) => ({ base, legs: ls, exposure: pairExposure(ls) }))
    .sort((a, b) => b.exposure.totalUsd - a.exposure.totalUsd);
}

export interface AccountStatus {
  account: DeltaAccount;
  status: 'loading' | 'ready' | 'error';
}

export interface LinkedDeltaLegs {
  accounts: AccountStatus[];
  legs: AccountLeg[];
  pairs: LivePair[];
  fetchedAt: number | null;
}

const SUMMARY_POLL_MS = 30_000;

export function useLinkedDeltaLegs(): LinkedDeltaLegs {
  const accounts = useLinkedHedgeAccounts();
  const lighterAccs = accounts.filter((a): a is DeltaAccount & { venue: 'lighter' | 'lighterRh' } => a.venue !== 'arcus');
  const arcusAccs = accounts.filter((a) => a.venue === 'arcus');
  const lighterMarkets = usePerpMarkets('lighter');
  const lighterRhMarkets = useLighterRobinhoodMarkets();
  const arcusMarkets = usePerpMarkets('arcus');

  const lighter = useQueries({
    queries: lighterAccs.map((a) => ({
      queryKey: [LIGHTER_ACCOUNT_QUERY[a.venue].key, a.address.toLowerCase()],
      queryFn: () => fetchJson<unknown>(`/api/integrations?op=${LIGHTER_ACCOUNT_QUERY[a.venue].op}&address=${encodeURIComponent(a.address)}`, { timeoutMs: 15_000 }),
      staleTime: 30_000,
      refetchInterval: 30_000,
      retry: 1
    }))
  });

  // آرکوس: حافظهٔ جلسهٔ صفحهٔ آرکوس؛ تازه‌سازی فقط وقتی صفحه دیده می‌شود
  useArcusStoreVersion();
  const arcusKeys = arcusAccs.map((a) => accountKey(a.arcus!)).join('|');
  useEffect(() => {
    const refs = arcusAccs.map((a) => a.arcus!);
    if (!refs.length) return;
    refs.forEach((ref) => void refreshSummary(ref));
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') refs.forEach((ref) => void refreshSummary(ref));
    }, SUMMARY_POLL_MS);
    return () => clearInterval(t);
    // refs از arcusKeys ساخته می‌شوند
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arcusKeys]);

  const lighterStamp = lighter.map((q) => `${q.status}@${q.dataUpdatedAt}`).join();
  const arcusStamp = arcusAccs
    .map((a) => {
      const s = getArcusState(accountKey(a.arcus!));
      return `${s?.positions.fetchedAt ?? 0}:${s?.positions.error ? 1 : 0}`;
    })
    .join();

  return useMemo(() => {
    const marketsOf = { lighter: lighterMarkets.data, lighterRh: lighterRhMarkets.data, arcus: arcusMarkets.data };
    const markOf = (venue: DeltaAccountVenue) => (base: string) => (marketsOf[venue] ?? []).find((m) => m.base.toUpperCase() === base)?.markPrice ?? null;
    const statuses: AccountStatus[] = [];
    const legs: AccountLeg[] = [];
    const times: number[] = [];
    lighterAccs.forEach((a, i) => {
      const q = lighter[i];
      if (!q?.data) {
        statuses.push({ account: a, status: q?.isError ? 'error' : 'loading' });
        return;
      }
      statuses.push({ account: a, status: 'ready' });
      legs.push(...lighterLegs(a, lighterAccounts(q.data, a.address), markOf(a.venue)));
      if (q.dataUpdatedAt) times.push(q.dataUpdatedAt);
    });
    arcusAccs.forEach((a) => {
      const p = getArcusState(accountKey(a.arcus!))?.positions;
      if (!p?.data) {
        statuses.push({ account: a, status: p?.error ? 'error' : 'loading' });
        return;
      }
      statuses.push({ account: a, status: 'ready' });
      legs.push(...arcusLegs(a, p.data, markOf('arcus')));
      if (p.fetchedAt) times.push(p.fetchedAt);
    });
    return { accounts: statuses, legs, pairs: groupDeltaPairs(legs), fetchedAt: times.length ? Math.min(...times) : null };
    // stampها هر تغییر دادهٔ لایتر/آرکوس را پوشش می‌دهند
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, lighterStamp, arcusStamp, lighterMarkets.data, lighterRhMarkets.data, arcusMarkets.data]);
}
