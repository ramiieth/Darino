/**
 * حساب‌های پرپچوال کاربر در مدل مشترک domain/perpPortfolio
 *   آرکوس: همان store داشبورد (حساب، پوزیشن‌ها، سری portfolio)
 *   لایتر: همان کش صفحهٔ لایتر + سری سود/زیان هر زیرحساب
 *   هایپرلیکوئید: info/clearinghouseState + info/portfolio (عمومی، فقط آدرس)
 *   تی‌اکس‌فلو: rpc.txflow.com/info clearinghouseState + دفتر واریز/برداشت (API سازگار با هایپرلیکوئید)
 *   اوندو پرپس: /api/integrations?op=keyed-perps با کلید فقط‌خواندنی در env ورسل (فقط کاربر واردشده)
 *   آدرس‌های env (HYPERLIQUID_ADDRESS، LIGHTER_ADDRESS، …) از همان پاسخ؛ مثل حساب ثبت‌شده خوانده می‌شوند
 * هر حساب «پلتفرم» با آدرس عمومی در مدیریت کیف پول‌ها ثبت می‌شود؛ بدون کلید یا امضا.
 */
import { useQueries, useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/repositories/remoteClient';
import { useCustody } from '@/features/custody/data/useCustody';
import type { ConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
import { lighterAccounts } from '../domain/model';
import { fromArcus, fromHlLike, fromKeyed, fromLighter, fromVariational, type HlLikeState, type HlPortfolioSeries, type LedgerUpdate, type PerpVenueAccount } from '../domain/perpPortfolio';
import { hlClearinghouseState, hlPortfolio } from '@/features/hyperliquid/data/hyperliquidService';
import { txflowInfo } from '@/features/calculators/data/perpMarkets';
import { LIGHTER_PLATFORM, lighterAccountQuery, lighterPnlQuery, type LighterNetwork } from './lighterAccount';

type KeyedResponse = { venues: Parameters<typeof fromKeyed>[0][]; addresses?: Partial<Record<'hyperliquid' | 'lighter-mainnet' | 'lighter-robinhood' | 'txflow' | 'variational', string[]>> };

/** یک درخواست برای حساب‌های کلیددار و آدرس‌های env؛ بدون ورود یا بدون env → خالی */
export const keyedPerpsQuery = {
  queryKey: ['perp-keyed'],
  queryFn: () => fetchJson<KeyedResponse>('/api/integrations?op=keyed-perps', { timeoutMs: 20_000 }),
  staleTime: 30_000,
  refetchInterval: 60_000,
  retry: 0
} as const;

const EVM = /^0x[0-9a-fA-F]{40}$/;

const ENV_LABEL = { hyperliquid: 'حساب هایپرلیکوئید', 'lighter-mainnet': 'حساب لایتر', 'lighter-robinhood': 'حساب لایتر رابین‌هود', txflow: 'حساب تی‌اکس‌فلو', variational: 'حساب وریشنال' } as const;

/** آدرس‌های عمومی env یک پلتفرم که هنوز به‌عنوان حساب ثبت نشده‌اند */
function useEnvAddresses(platform: keyof typeof ENV_LABEL, registered: readonly string[]): { id: string; label: string; address: string }[] {
  const q = useQuery(keyedPerpsQuery);
  const seen = new Set(registered.map((a) => a.toLowerCase()));
  return (q.data?.addresses?.[platform] ?? []).filter((a) => !seen.has(a.toLowerCase())).map((address) => ({ id: `env:${platform}:${address}`, label: ENV_LABEL[platform], address }));
}

export function useLighterVenues(): PerpVenueAccount[] {
  const custody = useCustody();
  const fromHoldings = custody.holdings.flatMap((h) => {
    if (h.kind !== 'platform' || h.archivedAt || !h.address) return [];
    const network = (Object.keys(LIGHTER_PLATFORM) as LighterNetwork[]).find((n) => LIGHTER_PLATFORM[n] === h.platformId);
    return network ? [{ id: h.id, label: h.label, address: h.address, network }] : [];
  });
  const envMain = useEnvAddresses('lighter-mainnet', fromHoldings.filter((l) => l.network === 'mainnet').map((l) => l.address));
  const envRh = useEnvAddresses('lighter-robinhood', fromHoldings.filter((l) => l.network === 'robinhood').map((l) => l.address));
  const linked = [...fromHoldings, ...envMain.map((e) => ({ ...e, network: 'mainnet' as const })), ...envRh.map((e) => ({ ...e, network: 'robinhood' as const }))];
  const queries = useQueries({ queries: linked.map((l) => lighterAccountQuery(l.address, l.network)) });
  const accounts = linked.map((l, i) => (queries[i].data ? lighterAccounts(queries[i].data, l.address) : null));
  const subs = linked.flatMap((l, i) => (accounts[i] ?? []).map((a) => ({ link: i, index: a.index, network: l.network })));
  const pnl = useQueries({ queries: subs.map((s) => lighterPnlQuery(s.index, s.network)) });
  return linked.map((l, i) => {
    const q = queries[i];
    const status = q.isPending ? 'loading' : q.isError && !q.data ? 'error' : 'ready';
    const series = subs.flatMap((s, j) => (s.link === i ? [pnl[j].data] : []));
    const stale = (q.isError && !!q.data) || subs.some((s, j) => s.link === i && pnl[j].isError && !!pnl[j].data);
    return fromLighter(l.id, l.label, LIGHTER_PLATFORM[l.network] as 'lighter-robinhood' | 'lighter-mainnet', accounts[i], status, stale, series);
  });
}

export const HL_LIKE_PLATFORMS = { hyperliquid: 'hyperliquid', txflow: 'txflow' } as const;
type HlLikeVenue = keyof typeof HL_LIKE_PLATFORMS;

/** وضعیت حساب + دادهٔ سود/زیان کل (portfolio هایپرلیکوئید یا دفتر واریز تی‌اکس‌فلو) */
export const hlLikeAccountQuery = (venue: HlLikeVenue, address: string) => ({
  queryKey: ['perp-account', venue, address.toLowerCase()],
  queryFn: async () => {
    if (venue === 'hyperliquid') {
      const [state, portfolio] = await Promise.all([
        hlClearinghouseState(address) as Promise<HlLikeState>,
        hlPortfolio<HlPortfolioSeries>(address).catch(() => null)
      ]);
      return { state, portfolio, ledger: null };
    }
    const [state, ledger] = await Promise.all([
      txflowInfo<HlLikeState>({ type: 'clearinghouseState', user: address }),
      txflowInfo<LedgerUpdate[]>({ type: 'userNonFundingLedgerUpdates', user: address }).catch(() => null)
    ]);
    return { state, portfolio: null, ledger };
  },
  staleTime: 30_000,
  refetchInterval: 60_000,
  retry: 1
});

export function useHlLikeVenues(): PerpVenueAccount[] {
  const custody = useCustody();
  const fromHoldings = custody.holdings.flatMap((h) => {
    if (h.kind !== 'platform' || h.archivedAt || !h.address) return [];
    const venue = (Object.keys(HL_LIKE_PLATFORMS) as HlLikeVenue[]).find((v) => HL_LIKE_PLATFORMS[v] === h.platformId);
    return venue ? [{ id: h.id, label: h.label, address: h.address, venue }] : [];
  });
  const envHl = useEnvAddresses('hyperliquid', fromHoldings.filter((l) => l.venue === 'hyperliquid').map((l) => l.address));
  const envTx = useEnvAddresses('txflow', fromHoldings.filter((l) => l.venue === 'txflow').map((l) => l.address));
  const envMain = useEnvAddresses('lighter-mainnet', []);
  const envRh = useEnvAddresses('lighter-robinhood', []);

  // اگر حساب تی‌اکس‌فلو اختصاصی ثبت نشده و TXFLOW_ADDRESS در env نبود،
  // از آدرس معتبر هایپرلیکوئید، لایتر، آرکوس یا کیف پول متصل برای ساخت کارت تی‌اکس‌فلو در بخش پرپچوال استفاده می‌شود
  const hasTxflowHolding = fromHoldings.some((l) => l.venue === 'txflow');
  const fallbackTxAddress =
    !hasTxflowHolding && envTx.length === 0
      ? envHl[0]?.address ||
        envMain[0]?.address ||
        envRh[0]?.address ||
        fromHoldings.find((l) => l.address && EVM.test(l.address))?.address ||
        custody.holdings.find((h) => !h.archivedAt && h.address && EVM.test(h.address))?.address
      : null;

  const txEnvList =
    envTx.length > 0
      ? envTx
      : fallbackTxAddress
        ? [{ id: `env:txflow:${fallbackTxAddress.toLowerCase()}`, label: 'حساب تی‌اکس‌فلو', address: fallbackTxAddress }]
        : [];

  const linked = [
    ...fromHoldings,
    ...envHl.map((e) => ({ ...e, venue: 'hyperliquid' as const })),
    ...txEnvList.map((e) => ({ ...e, venue: 'txflow' as const }))
  ];
  // کیف پول‌های EVM متصل که روی تی‌اکس‌فلو حساب فعال دارند ولی جداگانه ثبت نشده‌اند (بدون نیاز به «افزودن حساب»)
  const seenTx = new Set(linked.filter((l) => l.venue === 'txflow').map((l) => l.address.toLowerCase()));
  const walletTx = [
    ...new Map(
      custody.holdings
        .filter((h) => h.kind === 'wallet' && !h.archivedAt && h.address && EVM.test(h.address) && !seenTx.has(h.address.toLowerCase()))
        .map((h) => [h.address!.toLowerCase(), { id: `wallet:txflow:${h.address!.toLowerCase()}`, label: `${h.label} · تی‌اکس‌فلو`, address: h.address!, venue: 'txflow' as const }])
    ).values()
  ];
  const queries = useQueries({ queries: [...linked, ...walletTx].map((l) => hlLikeAccountQuery(l.venue, l.address)) });
  const toAccount = (l: (typeof linked)[number], q: (typeof queries)[number]) => {
    const status = q.isPending ? 'loading' : q.isError && !q.data ? 'error' : 'ready';
    return fromHlLike(l.id, l.label, l.venue, l.address, q.data?.state ?? null, status, q.isError && !!q.data, { portfolio: q.data?.portfolio, ledger: q.data?.ledger });
  };
  const active = walletTx.flatMap((l, i) => {
    const q = queries[linked.length + i];
    const state = q.data?.state;
    const ledger = q.data?.ledger;
    const open = (state?.assetPositions ?? []).some((p) => Number(p.position?.szi));
    const hasEquity = Number(state?.marginSummary?.accountValue ?? 0) > 0;
    const hasLedger = Array.isArray(ledger) && ledger.length > 0;
    return hasEquity || open || hasLedger ? [toAccount(l, q)] : [];
  });
  return [...linked.map((l, i) => toAccount(l, queries[i])), ...active];
}

const KEYED_LABEL = { ondo: 'حساب اوندو پرپس' } as const;

/**
 * پلتفرم‌هایی که کلیدشان در env ورسل تنظیم شده؛ بدون کلید یا بدون ورود → هیچ کارتی (خطا نشان داده نمی‌شود)
 */
export function useKeyedVenues(): PerpVenueAccount[] {
  const q = useQuery(keyedPerpsQuery);
  return (q.data?.venues ?? []).map((r) => ({ ...fromKeyed(r, KEYED_LABEL[r.venue]), stale: q.isError && !!q.data }));
}

/** پوزیشن‌های پلتفرمی (لایتر، هایپرلیکوئید، تی‌اکس‌فلو، اوندو) برای «پوزیشن‌های واقعی» */

export const VARIATIONAL_BASE = 'https://omni-client-api.prod.ap-northeast-1.variational.io';

export const variationalAccountQuery = (address: string) => ({
  queryKey: ['perp-account', 'variational', address.toLowerCase()],
  queryFn: async () => {
    try {
      const res = await fetch(`${VARIATIONAL_BASE}/portfolio/positions?address=${address}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(10_000)
      });
      if (!res.ok) {
        return { equity: 0, unrealizedPnl: 0, allTimePnl: 0, realizedPnl: 0, positions: [] };
      }
      return await res.json();
    } catch {
      return { equity: 0, unrealizedPnl: 0, allTimePnl: 0, realizedPnl: 0, positions: [] };
    }
  },
  staleTime: 30_000,
  refetchInterval: 60_000,
  retry: 1
});

export function useVariationalVenues(): PerpVenueAccount[] {
  const custody = useCustody();
  const fromHoldings = custody.holdings.flatMap((h) => {
    if (h.kind !== 'platform' || h.archivedAt || !h.address || h.platformId !== 'variational') return [];
    return [{ id: h.id, label: h.label, address: h.address }];
  });
  const envVariational = useEnvAddresses('variational', fromHoldings.map((l) => l.address));
  const envHl = useEnvAddresses('hyperliquid', []);
  const envTx = useEnvAddresses('txflow', []);
  const envMain = useEnvAddresses('lighter-mainnet', []);
  const envRh = useEnvAddresses('lighter-robinhood', []);

  const hasVariationalHolding = fromHoldings.length > 0;
  const fallbackAddress =
    !hasVariationalHolding && envVariational.length === 0
      ? envHl[0]?.address ||
        envTx[0]?.address ||
        envMain[0]?.address ||
        envRh[0]?.address ||
        custody.holdings.find((h) => !h.archivedAt && h.address && EVM.test(h.address))?.address
      : null;

  const varEnvList =
    envVariational.length > 0
      ? envVariational
      : fallbackAddress
        ? [{ id: `env:variational:${fallbackAddress.toLowerCase()}`, label: 'حساب وریشنال', address: fallbackAddress }]
        : [];

  const linked = [...fromHoldings, ...varEnvList];
  const seen = new Set(linked.map((l) => l.address.toLowerCase()));
  const walletVar = [
    ...new Map(
      custody.holdings
        .filter((h) => h.kind === 'wallet' && !h.archivedAt && h.address && EVM.test(h.address) && !seen.has(h.address.toLowerCase()))
        .map((h) => [h.address!.toLowerCase(), { id: `wallet:variational:${h.address!.toLowerCase()}`, label: `${h.label} · وریشنال`, address: h.address! }])
    ).values()
  ];

  const queries = useQueries({ queries: [...linked, ...walletVar].map((l) => variationalAccountQuery(l.address)) });
  const toAccount = (l: (typeof linked)[number], q: (typeof queries)[number]) => {
    const status = q.isPending ? 'loading' : q.isError && !q.data ? 'error' : 'ready';
    return fromVariational(l.id, l.label, l.address, q.data ?? null, status, q.isError && !!q.data);
  };

  const active = walletVar.flatMap((l, i) => {
    const q = queries[linked.length + i];
    const data = q.data as { equity?: number; positions?: unknown[] } | undefined;
    const open = Array.isArray(data?.positions) && data.positions.length > 0;
    const hasEquity = Number(data?.equity ?? 0) > 0;
    return hasEquity || open ? [toAccount(l, q)] : [];
  });

  return [...linked.map((l, i) => toAccount(l, queries[i])), ...active];
}

export function usePlatformPerpVenues(): PerpVenueAccount[] {
  return [...useLighterVenues(), ...useHlLikeVenues(), ...useVariationalVenues(), ...useKeyedVenues()];
}

export function arcusVenues(arcus: ConnectedPortfolio['arcus']): PerpVenueAccount[] {
  return arcus
    .filter((s) => s.holding.arcus!.env === 'mainnet')
    .map((s) => {
      const acc = s.state?.account;
      const status = !acc || (acc.loading && !acc.fetchedAt) ? 'loading' : acc.error && !acc.fetchedAt ? 'error' : 'ready';
      return fromArcus(s.holding.id, s.holding.label, acc?.fetchedAt ? acc.data : undefined, s.state?.positions.fetchedAt ? s.state.positions.data : null, status, s.stale, s.state?.portfolio?.data);
    });
}

export function usePerpVenues(arcus: ConnectedPortfolio['arcus']): PerpVenueAccount[] {
  return [...arcusVenues(arcus), ...usePlatformPerpVenues()];
}
