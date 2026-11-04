/**
 * دادهٔ راهنمای جفت دلتا نوترال: بازارهای عمومی لایتر رابین‌هود، آرکوس و تی‌اکس‌فلو (قیمت، فاندینگ، کارمزد، گام اندازه)
 * و پوزیشن‌های باز زندهٔ همین سه صرافی (همان دادهٔ «دارایی من» و داشبورد پرپ) — فقط‌خواندنی.
 */
import { useMemo } from 'react';
import { useLighterRobinhoodMarkets, usePerpMarkets, type PerpMarket } from '@/features/calculators/data/perpMarkets';
import { useConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
import { usePerpVenues } from '@/features/perps/data/usePerpVenues';
import { hedgeBase, type HedgeQuote, type HedgeVenue, type LivePosition } from '../domain/hedge';

const toQuote = (venue: HedgeVenue) => (m: PerpMarket): HedgeQuote => ({
  venue,
  base: hedgeBase(m.base),
  display: m.display,
  mark: m.markPrice,
  fundingHourly: m.fundingHourly,
  takerPct: m.takerFeePct,
  step: m.sizeStep ?? null,
  minSize: m.minSize ?? null,
  minNotional: m.minNotional ?? null,
  maxLeverage: m.maxLeverage
});

const VENUE_OF: Record<string, HedgeVenue | undefined> = { 'lighter-robinhood': 'lighterRh', arcus: 'arcus', txflow: 'txflow' };

export function useHedge() {
  const rh = useLighterRobinhoodMarkets();
  const arcus = usePerpMarkets('arcus');
  const txflow = usePerpMarkets('txflow');
  const portfolio = useConnectedPortfolio();
  const accounts = usePerpVenues(portfolio.arcus);

  const quotes = useMemo(() => new Map<HedgeVenue, HedgeQuote[]>([
    ['lighterRh', (rh.data ?? []).map(toQuote('lighterRh'))],
    ['arcus', (arcus.data ?? []).map(toQuote('arcus'))],
    ['txflow', (txflow.data ?? []).map(toQuote('txflow'))]
  ]), [rh.data, arcus.data, txflow.data]);

  const positions = useMemo<LivePosition[]>(() => accounts.flatMap((a) => {
    const venue = VENUE_OF[a.venue];
    if (!venue) return [];
    return a.positions.filter((p) => p.size !== null && p.size > 0).map((p) => ({ venue, account: a.label, symbol: p.symbol, side: p.side, size: Math.abs(p.size!), mark: p.mark }));
  }), [accounts]);

  return {
    quotes,
    positions,
    status: {
      lighterRh: rh.isError ? 'error' : rh.data ? 'ready' : 'loading',
      arcus: arcus.isError ? 'error' : arcus.data ? 'ready' : 'loading',
      txflow: txflow.isError ? 'error' : txflow.data ? 'ready' : 'loading'
    } as Record<HedgeVenue, 'loading' | 'ready' | 'error'>,
    positionsLoading: accounts.some((a) => a.status === 'loading')
  };
}
