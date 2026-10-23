/**
 * داشبورد — بخش پرپچوال: سود/زیان کل همهٔ پلتفرم‌ها + یک کارت برای هر حساب (آرکوس، لایتر رابین‌هود، لایتر)
 * محاسبات در domain/perpPortfolio؛ آرکوس از همان store داشبورد، لایتر از همان کش صفحهٔ لایتر.
 */
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { LogoImage } from '@/shared/components/ui/EntityLogo';
import { buttonClass } from '@/shared/components/ui/Button';
import { Metric, MetricGrid, MoneyValue } from '@/shared/components/ui/FinancialValue';
import { faNumber, toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import { useCustody } from '@/features/custody/data/useCustody';
import type { ConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
import { lighterAccounts } from '../domain/model';
import { fromArcus, fromLighter, perpTotals, type PerpVenue, type PerpVenueAccount } from '../domain/perpPortfolio';
import { LIGHTER_PLATFORM, lighterAccountQuery, type LighterNetwork } from '../data/lighterAccount';
import { MarketAssetIdentity } from './MarketAssetIdentity';

const VENUE: Record<PerpVenue, { name: string; logo: string; network?: string; to: string }> = {
  arcus: { name: 'آرکوس', logo: '/logos/platform-arcus.png', to: '/arcus' },
  'lighter-robinhood': { name: 'لایتر رابین‌هود', logo: '/logos/platform-lighter.png', network: '/logos/chain-4663.svg', to: '/lighter-robinhood' },
  'lighter-mainnet': { name: 'لایتر', logo: '/logos/platform-lighter.png', to: '/lighter' }
};
const qty = (n: number | null) => (n === null ? '—' : faNumber(n, { maximumFractionDigits: 6 }));

function useLighterVenues(): PerpVenueAccount[] {
  const custody = useCustody();
  const linked = custody.holdings.flatMap((h) => {
    if (h.kind !== 'platform' || h.archivedAt || !h.address) return [];
    const network = (Object.keys(LIGHTER_PLATFORM) as LighterNetwork[]).find((n) => LIGHTER_PLATFORM[n] === h.platformId);
    return network ? [{ id: h.id, label: h.label, address: h.address, network }] : [];
  });
  const queries = useQueries({ queries: linked.map((l) => lighterAccountQuery(l.address, l.network)) });
  return linked.map((l, i) => {
    const q = queries[i];
    const status = q.isPending ? 'loading' : q.isError && !q.data ? 'error' : 'ready';
    return fromLighter(l.id, l.label, LIGHTER_PLATFORM[l.network] as 'lighter-robinhood' | 'lighter-mainnet', q.data ? lighterAccounts(q.data, l.address) : null, status, q.isError && !!q.data);
  });
}

function arcusVenues(arcus: ConnectedPortfolio['arcus']): PerpVenueAccount[] {
  return arcus
    .filter((s) => s.holding.arcus!.env === 'mainnet')
    .map((s) => {
      const acc = s.state?.account;
      const status = !acc || (acc.loading && !acc.fetchedAt) ? 'loading' : acc.error && !acc.fetchedAt ? 'error' : 'ready';
      return fromArcus(s.holding.id, s.holding.label, acc?.fetchedAt ? acc.data : undefined, s.state?.positions.fetchedAt ? s.state.positions.data : null, status, s.stale);
    });
}

function StatusBadge({ a }: { a: PerpVenueAccount }) {
  if (a.status === 'loading') return <Badge>در حال دریافت</Badge>;
  if (a.status === 'error') return <Badge tone="warn">دریافت نشد</Badge>;
  if (a.stale) return <Badge tone="warn">قدیمی</Badge>;
  return null;
}

function VenueCard({ a }: { a: PerpVenueAccount }) {
  const v = VENUE[a.venue];
  return (
    <Surface className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative shrink-0">
            <LogoImage src={v.logo} label={v.name} size={36} />
            {v.network && (
              <span className="absolute -bottom-1 -end-1 rounded-full bg-card p-px">
                <LogoImage src={v.network} label="رابین‌هود" size={15} />
              </span>
            )}
          </span>
          <div className="min-w-0">
            <p className="font-bold text-ink">{v.name}</p>
            <p className="truncate text-xs text-muted">{a.label}</p>
          </div>
        </div>
        <StatusBadge a={a} />
      </div>
      <MetricGrid cols={a.venue === 'arcus' ? 3 : 2} className="!gap-x-4">
        <Metric size="sm" label="ارزش حساب" value={<MoneyValue value={a.equity} />} />
        <Metric size="sm" label="سود/زیان باز" value={<MoneyValue value={a.unrealizedPnl} signed tone="auto" />} />
        {a.venue === 'arcus' && <Metric size="sm" label="سود/زیان کل" value={<MoneyValue value={a.allTimePnl} signed tone="auto" />} sub="ارزش − خالص واریز" />}
      </MetricGrid>
      <div className="mt-auto border-t border-divider pt-1">
        {a.positions.length ? (
          <Disclosure summary={`${toFaDigits(a.positions.length)} پوزیشن باز`}>
            <ul className="divide-y divide-divider">
              {a.positions.map((p, i) => (
                <li key={`${p.symbol}-${i}`} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <MarketAssetIdentity symbol={p.symbol} robinhood={a.venue === 'lighter-robinhood'} />
                    <p className="mt-1 text-2xs text-muted">
                      <Badge tone={p.side === 'long' ? 'gain' : 'loss'} className="me-1.5">{p.side === 'long' ? 'لانگ' : 'شورت'}</Badge>
                      {qty(p.size)} @ {qty(p.entry)}
                      {p.liquidation !== null && <> · لیکویید {qty(p.liquidation)}</>}
                    </p>
                  </div>
                  <MoneyValue value={p.pnl} signed tone="auto" className="shrink-0 text-sm font-semibold" />
                </li>
              ))}
            </ul>
          </Disclosure>
        ) : (
          <p className="py-2 text-xs text-muted">{a.status === 'ready' ? 'پوزیشن بازی وجود ندارد.' : ' '}</p>
        )}
        <Link to={v.to} className={cn(buttonClass('ghost', 'sm'), 'w-full justify-between')}>
          جزئیات {v.name}
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </Surface>
  );
}

export function PerpPortfolioSection({ arcus }: { arcus: ConnectedPortfolio['arcus'] }) {
  const lighter = useLighterVenues();
  const accounts = [...arcusVenues(arcus), ...lighter];
  if (!accounts.length) return null;
  const t = perpTotals(accounts);
  const hasArcus = accounts.some((a) => a.venue === 'arcus');
  return (
    <section aria-labelledby="perp-portfolio-title" className="space-y-4">
      <Surface variant="focal" className="p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="perp-portfolio-title" className="text-sm font-semibold text-muted">سود/زیان باز کل پرپچوال</h2>
            <div className="mt-1 text-3xl font-extrabold tracking-tight md:text-4xl">
              <MoneyValue value={t.unrealizedPnl} signed tone="auto" />
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {toFaDigits(t.accounts)} حساب · {toFaDigits(t.positions)} پوزیشن باز{t.partial && ' · برخی مقادیر هنوز دریافت نشده‌اند'}
            </p>
          </div>
          <MetricGrid cols={2} className="min-w-[16rem]">
            <Metric label="ارزش کل حساب‌ها" value={<MoneyValue value={t.equity} />} />
            {hasArcus && <Metric label="سود/زیان کل آرکوس" value={<MoneyValue value={t.allTimePnl} signed tone="auto" />} />}
          </MetricGrid>
        </div>
      </Surface>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => (
          <VenueCard key={a.id} a={a} />
        ))}
      </div>
      <p className="text-2xs text-muted">واحد حساب‌ها یو‌اس‌دی‌سی/یو‌اس‌دی‌جی است و ≈ ۱ دلار در نظر گرفته شده. این مبالغ جدا از مجموع کیف پول‌ها نمایش داده می‌شوند.</p>
    </section>
  );
}
