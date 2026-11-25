/**
 * داشبورد — بخش پرپچوال: سود/زیان همهٔ پلتفرم‌ها در بازهٔ انتخابی (۲۴ ساعت/۷ روز/۳۰ روز/از ابتدا)
 * + سود/زیان بسته‌شده، باز و ارزش حساب؛ یک کارت برای هر حساب (آرکوس، لایتر رابین‌هود، لایتر، هایپرلیکوئید،
 * تی‌اکس‌فلو، و با کلید فقط‌خواندنی env: اوندو پرپس).
 * محاسبات در domain/perpPortfolio؛ داده در data/usePerpVenues.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { LogoImage } from '@/shared/components/ui/EntityLogo';
import { buttonClass } from '@/shared/components/ui/Button';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Metric, MetricGrid, MoneyValue } from '@/shared/components/ui/FinancialValue';
import { faNumber, toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import type { ConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
import { perpTotals, type PnlPeriod, type PerpVenue, type PerpVenueAccount } from '../domain/perpPortfolio';
import { usePerpVenues } from '../data/usePerpVenues';
import { MarketAssetIdentity } from './MarketAssetIdentity';

/** to: مسیر داخلی (کارنامهٔ هایپرلیکوئید در میز معامله) · href: پلتفرم بیرونی */
const VENUE: Record<PerpVenue, { name: string; logo: string; network?: string; to?: (a: PerpVenueAccount) => string; href?: string; cta?: string }> = {
  arcus: { name: 'آرکوس', logo: '/logos/platform-arcus.png', to: () => '/arcus' },
  'lighter-robinhood': { name: 'لایتر رابین‌هود', logo: '/logos/platform-lighter.png', network: '/logos/chain-4663.svg', to: () => '/lighter-robinhood' },
  'lighter-mainnet': { name: 'لایتر', logo: '/logos/platform-lighter.png', to: () => '/lighter' },
  hyperliquid: { name: 'هایپرلیکوئید', logo: '/logos/token-hype.png', to: (a) => `/desk?a=${a.address ?? ''}`, cta: 'کارنامه و تاریخچهٔ معاملات' },
  txflow: { name: 'تی‌اکس‌فلو', logo: '/logos/platform-txflow.png', to: () => '/txflow' },
  ondo: { name: 'اوندو پرپس', logo: '/logos/platform-ondo.png', to: () => '/ondo-perps' },
  variational: { name: 'وریشنال', logo: '/logos/platform-variational.png', network: '/logos/chain-42161.png', to: () => '/variational' }
};
type Range = PnlPeriod | 'all';
const RANGES: { value: Range; label: string; title: string }[] = [
  { value: 'day', label: '۲۴ ساعت', title: '۲۴ ساعت گذشته' },
  { value: 'week', label: '۷ روز', title: '۷ روز گذشته' },
  { value: 'month', label: '۳۰ روز', title: '۳۰ روز گذشته' },
  { value: 'all', label: 'از ابتدا', title: 'از ابتدا' }
];
const rangeTitle = (r: Range) => RANGES.find((x) => x.value === r)!.title;
const pnlIn = (a: { allTimePnl: number | null; periodPnl: Record<PnlPeriod, number | null> }, r: Range) => (r === 'all' ? a.allTimePnl : a.periodPnl[r]);
const qty = (n: number | null) => (n === null ? '—' : faNumber(n, { maximumFractionDigits: 6 }));

function StatusBadge({ a }: { a: PerpVenueAccount }) {
  if (a.status === 'loading') return <Badge>در حال دریافت</Badge>;
  if (a.status === 'error')
    return (
      <span title={a.error}>
        <Badge tone="warn">دریافت نشد</Badge>
      </span>
    );
  if (a.stale) return <Badge tone="warn">قدیمی</Badge>;
  return null;
}

function VenueCard({ a, range }: { a: PerpVenueAccount; range: Range }) {
  const v = VENUE[a.venue];
  const state = a.status === 'loading' ? 'loading' : 'ready';
  return (
    <Surface className="group flex flex-col gap-4 p-4 transition-all duration-200 hover:border-accent/35 hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative shrink-0">
            <LogoImage src={v.logo} label={v.name} size={38} />
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

      <Metric
        size="lg"
        label={`سود/زیان ${rangeTitle(range)}`}
        value={<MoneyValue value={pnlIn(a, range)} signed tone="auto" state={state} />}
        sub={a.venue === 'txflow' && range !== 'all' && pnlIn(a, range) === null ? 'سری دوره‌ای عمومی ندارد (از ابتدا در دسترس است)' : undefined}
      />

      <MetricGrid cols={3} className="!gap-x-3 rounded-xl border border-divider/70 bg-surface-2/50 p-3">
        <Metric size="sm" label="بسته‌شده" value={<MoneyValue value={a.realizedPnl} signed tone="auto" state={state} />} />
        <Metric size="sm" label="باز" value={<MoneyValue value={a.unrealizedPnl} signed tone="auto" state={state} />} />
        <Metric size="sm" label="ارزش حساب" value={<MoneyValue value={a.equity} state={state} />} />
      </MetricGrid>

      <div className="mt-auto border-t border-divider/70 pt-2">
        {a.positions.length ? (
          <Disclosure summary={`${toFaDigits(a.positions.length)} پوزیشن باز`}>
            <ul className="divide-y divide-divider/70">
              {a.positions.map((p, i) => (
                <li key={`${p.symbol}-${i}`} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <MarketAssetIdentity symbol={p.symbol} robinhood={a.venue === 'lighter-robinhood'} />
                    <p className="mt-1 text-2xs text-muted tabular-nums">
                      <Badge tone={p.side === 'long' ? 'gain' : 'loss'} className="me-1.5">
                        {p.side === 'long' ? 'لانگ' : 'شورت'}
                      </Badge>
                      {qty(p.size)} @ {qty(p.entry)}
                      {p.mark !== null && <> · مارک {qty(p.mark)}</>}
                      {p.liquidation !== null && <> · لیکویید {qty(p.liquidation)}</>}
                    </p>
                  </div>
                  <MoneyValue value={p.pnl} signed tone="auto" className="shrink-0 text-sm font-semibold" />
                </li>
              ))}
            </ul>
          </Disclosure>
        ) : (
          <p className="py-2 text-xs text-muted">
            {a.status === 'ready' ? 'پوزیشن بازی وجود ندارد؛ کل سود/زیان این حساب بسته‌شده است.' : ' '}
          </p>
        )}
        {v.to ? (
          <Link to={v.to(a)} className={cn(buttonClass('ghost', 'sm'), 'mt-1 w-full justify-between hover:bg-surface-2/80')}>
            {v.cta ?? `تاریخچه و جزئیات ${v.name}`}
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
          </Link>
        ) : v.href ? (
          <a
            href={v.href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonClass('ghost', 'sm'), 'mt-1 w-full justify-between hover:bg-surface-2/80')}
          >
            باز کردن {v.name}
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
          </a>
        ) : null}
      </div>
    </Surface>
  );
}

export function PerpPortfolioSection({ arcus }: { arcus: ConnectedPortfolio['arcus'] }) {
  const accounts = usePerpVenues(arcus);
  const [range, setRange] = useState<Range>('all');
  if (!accounts.length) return null;
  const t = perpTotals(accounts);
  const loading = accounts.every((a) => a.status === 'loading') ? 'loading' : 'ready';

  return (
    <section aria-labelledby="perp-portfolio-title" className="space-y-4">
      <Surface variant="focal" className="relative space-y-5 overflow-hidden p-5 md:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-l from-accent/80 via-gain/60 to-accent/40"
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <TrendingUp className="h-4 w-4" aria-hidden />
              </span>
              <h2 id="perp-portfolio-title" className="text-sm font-semibold text-muted">
                سود/زیان پرپچوال
              </h2>
            </div>
            <div className="mt-2 text-3xl font-extrabold tracking-tight md:text-4xl">
              <MoneyValue value={pnlIn(t, range)} signed tone="auto" state={loading} />
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {rangeTitle(range)} · {toFaDigits(t.accounts)} حساب · {toFaDigits(t.positions)} پوزیشن باز
              {t.partial && ' · برخی مقادیر در دسترس نیست و در جمع نیامده'}
            </p>
          </div>
          <SegmentedControl
            label="بازهٔ سود/زیان"
            size="sm"
            options={RANGES.map(({ value, label }) => ({ value, label }))}
            value={range}
            onChange={setRange}
          />
        </div>
        <MetricGrid cols={3} className="!gap-3 border-t border-divider/80 pt-4">
          <div className="rounded-xl border border-divider/70 bg-surface-2/50 p-3">
            <Metric
              label="سود/زیان بسته‌شده"
              value={<MoneyValue value={t.realizedPnl} signed tone="auto" state={loading} />}
              sub="معاملات بسته + فاندینگ − کارمزد"
            />
          </div>
          <div className="rounded-xl border border-divider/70 bg-surface-2/50 p-3">
            <Metric
              label="سود/زیان باز"
              value={<MoneyValue value={t.unrealizedPnl} signed tone="auto" state={loading} />}
              sub="پوزیشن‌های فعلی"
            />
          </div>
          <div className="rounded-xl border border-divider/70 bg-surface-2/50 p-3">
            <Metric label="ارزش کل حساب‌ها" value={<MoneyValue value={t.equity} state={loading} />} />
          </div>
        </MetricGrid>
      </Surface>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => (
          <VenueCard key={a.id} a={a} range={range} />
        ))}
      </div>
      <p className="text-2xs leading-5 text-muted">
        سود/زیان از ابتدا: آرکوس و تی‌اکس‌فلو = ارزش حساب − خالص واریز؛ لایتر = سود/زیان معاملات پرپ از تاریخچهٔ خود لایتر (اسپات جداست)؛ هایپرلیکوئید = تاریخچهٔ تجمعی صرافی. بسته‌شده = از ابتدا − باز.
        واحد حساب‌ها یو‌اس‌دی‌سی/یو‌اس‌دی‌جی است و ≈ ۱ دلار در نظر گرفته شده. این مبالغ جدا از مجموع کیف پول‌ها نمایش داده می‌شوند.
      </p>
    </section>
  );
}
