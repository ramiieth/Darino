/**
 * هوک اصلی ژورنال: کشف حساب‌ها → دریافت تاریخچه (کش افزایشی) → ساخت معاملات → حسابرسی دو دفتر
 *
 *   حساب‌ها از همان منبع داشبورد پرپچوال: پلتفرم‌های ثبت‌شده در «دارایی من»، آدرس‌های env و حساب‌های آرکوس.
 *   حساب نوترال لایتر فقط N روز اخیر اجرا می‌خواند (حجم فارم خیلی زیاد است)؛ آمار بلندمدتش از سری روزانهٔ لایتر.
 *   آرکوس همیشه از ابتدا خوانده می‌شود تا جهت اولین اجرا معلوم باشد (پوزیشن قبل را گزارش نمی‌کند).
 */
import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useCustody } from '@/features/custody/data/useCustody';
import { hlLikeAccountQuery, keyedPerpsQuery } from '@/features/perps/data/usePerpVenues';
import { lighterAccountQuery, LIGHTER_PLATFORM, type LighterNetwork } from '@/features/perps/data/lighterAccount';
import { lighterAccounts } from '@/features/perps/domain/model';
import type { JournalAccount, Venue } from '../domain/types';
import { accountKey } from '../domain/fills';
import { buildTrades } from '../domain/roundTrips';
import { roleOf } from '../domain/classify';
import { fundingAccounts, runJournal, type JournalAudit } from '../domain/audit';
import type { DailyAccountPoint } from '../domain/neutral';
import { localTimeZone } from '../domain/time';
import { loadAccountHistory, loadLighterDaily, type AccountHistory } from './fetchHistory';
import { useJournalData, type JournalData } from './journalStore';
import type { OrderCoverage } from '../domain/autoPlan';
import { hlLivePositions, mergeLivePositions, type LivePosition } from '../domain/livePositions';

const EVM = /^0x[0-9a-fA-F]{40}$/;
const HL_PLATFORMS: Record<string, Venue> = { hyperliquid: 'hyperliquid', txflow: 'txflow' };

/** حساب‌های قابل‌خواندن ژورنال (بدون تکرار) */
export function useJournalAccounts(): { accounts: JournalAccount[]; live: LivePosition[]; loading: boolean } {
  const custody = useCustody();
  const env = useQuery(keyedPerpsQuery);
  const links: { venue: Venue; label: string; address: string; network?: LighterNetwork; sub?: number }[] = [];
  for (const h of custody.holdings) {
    if (h.archivedAt) continue;
    if (h.kind === 'arcus' && h.arcus?.env === 'mainnet') links.push({ venue: 'arcus', label: h.label || 'آرکوس', address: h.arcus.address, sub: h.arcus.accountIndex });
    if (h.kind !== 'platform' || !h.address || !EVM.test(h.address)) continue;
    if (h.platformId && HL_PLATFORMS[h.platformId]) links.push({ venue: HL_PLATFORMS[h.platformId], label: h.label, address: h.address });
    const network = (Object.keys(LIGHTER_PLATFORM) as LighterNetwork[]).find((n) => LIGHTER_PLATFORM[n] === h.platformId);
    if (network) links.push({ venue: network === 'mainnet' ? 'lighter-mainnet' : 'lighter-robinhood', label: h.label, address: h.address, network });
  }
  const envA = env.data?.addresses ?? {};
  for (const a of envA.hyperliquid ?? []) links.push({ venue: 'hyperliquid', label: 'حساب هایپرلیکوئید', address: a });
  for (const a of envA.txflow ?? []) links.push({ venue: 'txflow', label: 'حساب تی‌اکس‌فلو', address: a });
  for (const a of envA['lighter-mainnet'] ?? []) links.push({ venue: 'lighter-mainnet', label: 'حساب لایتر', address: a, network: 'mainnet' });
  for (const a of envA['lighter-robinhood'] ?? []) links.push({ venue: 'lighter-robinhood', label: 'حساب لایتر رابین‌هود', address: a, network: 'robinhood' });

  const lighterLinks = [...new Map(links.filter((l) => l.network).map((l) => [`${l.network}:${l.address.toLowerCase()}`, l])).values()];
  const lq = useQueries({ queries: lighterLinks.map((l) => lighterAccountQuery(l.address, l.network!)) });

  const accounts = useMemo(() => {
    const out = new Map<string, JournalAccount>();
    for (const l of links) {
      if (l.network) continue;
      const key = accountKey(l.venue, l.address, l.sub);
      if (!out.has(key)) out.set(key, { key, venue: l.venue, label: l.label, address: l.address.toLowerCase(), sub: l.sub });
    }
    lighterLinks.forEach((l, i) => {
      for (const a of lq[i].data ? lighterAccounts(lq[i].data, l.address) : []) {
        const key = accountKey(l.venue, l.address, a.index);
        if (!out.has(key)) out.set(key, { key, venue: l.venue, label: `${l.label} · #${a.index}`, address: l.address.toLowerCase(), sub: a.index });
      }
    });
    return [...out.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(links), lq.map((q) => q.dataUpdatedAt).join(',')]);

  // پوزیشن‌های باز لحظه‌ای (همان کش داشبورد پرپچوال) — برای «برنامهٔ معامله» حتی وقتی اجرای ورود در تاریخچه نیست
  const hlAccounts = accounts.filter((a) => a.venue === 'hyperliquid' || a.venue === 'txflow');
  const hq = useQueries({ queries: hlAccounts.map((a) => hlLikeAccountQuery(a.venue as 'hyperliquid' | 'txflow', a.address)) });
  const live = useMemo(() => {
    const out: LivePosition[] = [];
    lighterLinks.forEach((l, i) => {
      for (const a of lq[i].data ? lighterAccounts(lq[i].data, l.address) : []) {
        const key = accountKey(l.venue, l.address, a.index);
        for (const p of a.positions) out.push({ account: key, venue: l.venue, symbol: p.symbol, direction: p.side, size: p.size, entry: p.entry, mark: p.mark ?? null, pnl: p.pnl });
      }
    });
    hlAccounts.forEach((a, i) => out.push(...hlLivePositions(a.key, a.venue, hq[i].data?.state ?? null)));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, lq.map((q) => q.dataUpdatedAt).join(','), hq.map((q) => q.dataUpdatedAt).join(',')]);
  return { accounts, live, loading: env.isPending || lq.some((q) => q.isPending) };
}

export type RangeKey = '30' | '90' | '180' | 'all';
export const RANGE_FA: Record<RangeKey, string> = { '30': '۳۰ روز', '90': '۹۰ روز', '180': '۱۸۰ روز', all: 'همه' };

export interface JournalState {
  data: JournalData;
  accounts: JournalAccount[];
  histories: { account: JournalAccount; status: 'loading' | 'ready' | 'error'; history: AccountHistory | null; error: string | null }[];
  audit: JournalAudit | null;
  tz: string;
  accountSize: number | null;
  loading: boolean;
  refetch: () => void;
}

export function useJournal(range: RangeKey, liveEquity: number | null): JournalState {
  const data = useJournalData();
  const { accounts, live, loading: accLoading } = useJournalAccounts();
  const tz = localTimeZone();
  const now = Date.now();
  const neutralFrom = now - data.settings.neutralFillDays * 86_400_000;

  const hq = useQueries({
    queries: accounts.map((a) => {
      const role = roleOf(a.key, a.venue, data.settings.roles);
      const windowFrom = a.venue === 'arcus' || role !== 'neutral' ? 0 : Math.floor(neutralFrom / 86_400_000) * 86_400_000;
      return {
        queryKey: ['journal-history', a.key, windowFrom],
        queryFn: () => loadAccountHistory(a, windowFrom),
        staleTime: 120_000,
        refetchInterval: 300_000,
        retry: 1
      };
    })
  });
  const lighter = accounts.filter((a) => a.venue === 'lighter-mainnet' || a.venue === 'lighter-robinhood');
  const dq = useQueries({ queries: lighter.map((a) => ({ queryKey: ['journal-lighter-daily', a.key], queryFn: () => loadLighterDaily(a), staleTime: 600_000, retry: 1 })) });

  const stamp = hq.map((q) => q.dataUpdatedAt).join(',') + '|' + dq.map((q) => q.dataUpdatedAt).join(',');
  const accountSize = data.settings.accountSize ?? liveEquity;

  const audit = useMemo(() => {
    if (!data.loaded) return null;
    const ready = hq.map((q) => q.data).filter((x): x is AccountHistory => !!x);
    const fills = ready.flatMap((h) => h.fills);
    const funding = ready.flatMap((h) => h.funding);
    const fAcc = fundingAccounts(accounts, new Set(ready.filter((h) => h.fundingFetched).map((h) => h.key)));
    // پوزیشن باز صرافی که اجرای ورودش در تاریخچه نیست هم معاملهٔ باز است (قیمت ورود از خود صرافی)
    const trades = mergeLivePositions(buildTrades(fills, funding, fAcc), live, now);
    const orders = ready.flatMap((h) => h.orders);
    const orderCoverage = new Map<string, OrderCoverage>(ready.map((h) => [h.key, h.orderCoverage]));
    const daily = new Map<string, DailyAccountPoint[]>();
    lighter.forEach((a, i) => dq[i].data && daily.set(a.key, dq[i].data!));
    const from = range === 'all' ? 0 : now - Number(range) * 86_400_000;
    const sourceNotes = ready.filter((h) => h.limitation).map((h) => `${accounts.find((a) => a.key === h.key)?.label ?? h.key}: ${h.limitation}`);
    hq.forEach((q, i) => q.isError && !q.data && sourceNotes.push(`${accounts[i].label}: دریافت تاریخچه انجام نشد.`));
    return runJournal({ trades, fills, funding, accounts, notes: data.notes, plans: data.plans, settings: data.settings, accountSize, platformDaily: daily, from, tz, sourceNotes, orders, orderCoverage, now });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, data, range, accountSize, accounts, live]);

  return {
    data,
    accounts,
    histories: accounts.map((a, i) => ({ account: a, status: hq[i].isPending ? 'loading' : hq[i].isError && !hq[i].data ? 'error' : 'ready', history: hq[i].data ?? null, error: hq[i].error ? String((hq[i].error as Error).message ?? hq[i].error) : null })),
    audit,
    tz,
    accountSize,
    loading: accLoading || hq.some((q) => q.isPending),
    refetch: () => hq.forEach((q) => void q.refetch())
  };
}
