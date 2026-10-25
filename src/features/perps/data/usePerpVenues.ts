/**
 * حساب‌های پرپچوال کاربر در مدل مشترک domain/perpPortfolio
 *   آرکوس: همان store داشبورد (حساب، پوزیشن‌ها، سری portfolio)
 *   لایتر: همان کش صفحهٔ لایتر + سری سود/زیان هر زیرحساب
 */
import { useQueries } from '@tanstack/react-query';
import { useCustody } from '@/features/custody/data/useCustody';
import type { ConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
import { lighterAccounts } from '../domain/model';
import { fromArcus, fromLighter, type PerpVenueAccount } from '../domain/perpPortfolio';
import { LIGHTER_PLATFORM, lighterAccountQuery, lighterPnlQuery, type LighterNetwork } from './lighterAccount';

export function useLighterVenues(): PerpVenueAccount[] {
  const custody = useCustody();
  const linked = custody.holdings.flatMap((h) => {
    if (h.kind !== 'platform' || h.archivedAt || !h.address) return [];
    const network = (Object.keys(LIGHTER_PLATFORM) as LighterNetwork[]).find((n) => LIGHTER_PLATFORM[n] === h.platformId);
    return network ? [{ id: h.id, label: h.label, address: h.address, network }] : [];
  });
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
  return [...arcusVenues(arcus), ...useLighterVenues()];
}
