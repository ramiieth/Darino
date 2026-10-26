/**
 * تب «بازار مشتقات» — به‌جای جدول خام همهٔ بازارها، جواب «کجا بازار شلوغ است و برای من یعنی چه؟»
 *   ۱) بازارهای اصلی: فاندینگ، رژیم ۳۰ روزه و جهت برترها روی BTC / ETH / SOL / HYPE
 *   ۲) لانگ‌های شلوغ و شورت‌های شلوغ: فقط بازارهای با OI کافی و فاندینگ غیرعادی، با معنی عملی‌اش
 *   ۳) همهٔ بازارها پشت یک بازشو برای جستجو
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, TrendingDown, TrendingUp } from 'lucide-react';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { Badge, type Tone } from '@/shared/components/ui/Badge';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { SearchField } from '@/shared/components/ui/Input';
import { ErrorState, ListSkeleton } from '@/shared/components/ui/StateViews';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { toFaDigits } from '@/shared/utils/formatters';
import { aggregatePositions, type CoinPositioning } from '@/features/traders/domain/positions';
import { usePositions } from '@/features/traders/data/useTraders';
import { REGIME_FA, hourlyToApr, type FundingStats } from '../domain/funding';
import { MAJORS, MIN_SIGNAL_OI, dailyCostPct, fundingExtremes, fundingState } from '../domain/marketSignals';
import { useFundingStats, usePerpMarkets, type PerpMarket } from '../data/intelApi';
import { SplitBar, fmtPrice } from './parts';

const SEARCH_LIMIT = 40;

export const REGIME_TONE: Record<FundingStats['regime'], Tone> = { hot: 'loss', cold: 'info', normal: 'neutral', negative: 'warn', unknown: 'neutral' };

export function RegimeBadge({ stats, loading }: { stats?: FundingStats; loading?: boolean }) {
  if (!stats) return loading ? <Skeleton className="h-5 w-14" /> : <span className="text-xs text-subtle">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={REGIME_TONE[stats.regime]}>{REGIME_FA[stats.regime].label}</Badge>
      {stats.percentile !== null && <span className="text-2xs text-muted">صدک {toFaDigits(Math.round(stats.percentile))}</span>}
    </span>
  );
}

const STATE_FA = {
  crowdedLong: { label: 'لانگ‌ها شلوغ', tone: 'loss' as Tone },
  crowdedShort: { label: 'شورت‌ها شلوغ', tone: 'warn' as Tone },
  normal: { label: 'عادی', tone: 'neutral' as Tone }
};

export function DerivativesTab({ onCoin }: { onCoin: (coin: string) => void }) {
  const markets = usePerpMarkets();
  const positions = usePositions();
  const bias = useMemo(() => new Map(aggregatePositions(positions.data?.positions ?? []).map((c) => [c.coin, c])), [positions.data]);
  const all = markets.data ?? [];
  const majors = useMemo(() => MAJORS.map((c) => all.find((m) => m.coin === c)).filter((m): m is PerpMarket => !!m), [all]);
  const extremes = useMemo(() => fundingExtremes(all), [all]);

  if (markets.isLoading) return <ListSkeleton rows={6} />;
  if (markets.isError) return <ErrorState message="بازارهای هایپرلیکوئید دریافت نشد" onRetry={() => void markets.refetch()} />;
  return (
    <div className="space-y-8">
      <Section title="بازارهای اصلی" headingLevel={3}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {majors.map((m) => (
            <MajorCard key={m.coin} m={m} bias={bias.get(m.coin)} biasLoading={positions.isLoading} onOpen={() => onCoin(m.coin)} />
          ))}
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <SignalList
          kind="long"
          rows={extremes.crowdedLong}
          onOpen={onCoin}
          title="لانگ‌های شلوغ"
          meaning="لانگ‌ها هزینهٔ بالایی می‌پردازند تا پوزیشن را نگه دارند. لانگ پراهرم اینجا در معرض آبشار است. برای درآمد دلتا نوترال (خرید اسپات + شورت پرپ) جذاب است، به شرط این‌که رژیم «داغ» نباشد؛ فاندینگ داغ معمولاً زود برمی‌گردد."
        />
        <SignalList
          kind="short"
          rows={extremes.crowdedShort}
          onOpen={onCoin}
          title="شورت‌های شلوغ"
          meaning="شورت‌ها به لانگ‌ها پول می‌دهند. شورت پراهرم اینجا در معرض جهش ناگهانی (short squeeze) است. دلتا نوترال کلاسیک اینجا هزینه دارد، نه درآمد."
        />
      </div>

      <p className="text-xs leading-6 text-subtle">
        «شلوغ» یعنی فاندینگ سالانه دست‌کم دو برابر نرخ پایهٔ هایپرلیکوئید (~۱۱٪) یا منفی، و فقط در بازارهایی با OI بالای <MoneyValue value={MIN_SIGNAL_OI} compact />؛ فاندینگ بازار کم‌عمق نویز است.
        «رژیم» نرخ امروز را با همهٔ ساعت‌های ۳۰ روز گذشته مقایسه می‌کند. پیش‌بینی جهت قیمت نیست.{' '}
        <Link to="/calculators" className="font-semibold text-brand hover:underline">محاسبهٔ سود خالص دلتا نوترال روی صرافی‌های شما</Link>
      </p>

      <Disclosure summary={`همهٔ بازارها (${toFaDigits(all.length)})`}>
        <AllMarkets markets={all} onOpen={onCoin} />
      </Disclosure>
    </div>
  );
}

function MajorCard({ m, bias, biasLoading, onOpen }: { m: PerpMarket; bias?: CoinPositioning; biasLoading: boolean; onOpen: () => void }) {
  const stats = useFundingStats(m.coin, m.fundingHourly);
  const state = STATE_FA[fundingState(m.fundingHourly)];
  return (
    <Surface as="article" className="p-4 transition-shadow hover:shadow-card">
      <button type="button" onClick={onOpen} className="block w-full text-start">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-base font-extrabold text-ink"><bdi dir="ltr">{m.coin}</bdi></p>
            <p className="text-xs text-muted"><bdi dir="ltr">{fmtPrice(m.markPx)}</bdi> · <PercentValue value={m.change24h} digits={1} /></p>
          </div>
          <Badge tone={state.tone}>{state.label}</Badge>
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-2">
          <span className="text-2xs text-muted">فاندینگ سالانه</span>
          <span className="text-sm font-bold"><PercentValue value={hourlyToApr(m.fundingHourly)} digits={1} /></span>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-2xs text-muted">نسبت به ۳۰ روز</span>
          <RegimeBadge stats={stats.data} loading={stats.isLoading} />
        </div>
        <div className="mt-3">
          <p className="mb-1 text-2xs font-semibold text-muted">جهت برترها</p>
          {bias ? <SplitBar long={bias.longUsd} short={bias.shortUsd} /> : biasLoading ? <Skeleton className="h-2 w-full" /> : <p className="text-2xs text-subtle">برترها پوزیشنی ندارند</p>}
        </div>
      </button>
    </Surface>
  );
}

function SignalList({ kind, rows, title, meaning, onOpen }: { kind: 'long' | 'short'; rows: PerpMarket[]; title: string; meaning: string; onOpen: (coin: string) => void }) {
  const Icon = kind === 'long' ? TrendingUp : TrendingDown;
  return (
    <Surface className="p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
        <Icon className={kind === 'long' ? 'h-4 w-4 text-negative' : 'h-4 w-4 text-warn'} aria-hidden />
        {title}
        <span className="text-xs font-medium text-subtle">({toFaDigits(rows.length)})</span>
      </h3>
      <p className="mt-1.5 text-xs leading-6 text-muted">{meaning}</p>
      {rows.length === 0 ? (
        <p className="mt-3 rounded-field bg-surface-2/70 px-3 py-2.5 text-xs text-muted">الان هیچ بازار نقدشونده‌ای در این وضعیت نیست.</p>
      ) : (
        <ul className="mt-3 divide-y divide-divider">
          {rows.map((m) => (
            <SignalRow key={m.coin} m={m} kind={kind} onOpen={() => onOpen(m.coin)} />
          ))}
        </ul>
      )}
    </Surface>
  );
}

function SignalRow({ m, kind, onOpen }: { m: PerpMarket; kind: 'long' | 'short'; onOpen: () => void }) {
  const stats = useFundingStats(m.coin, m.fundingHourly);
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 py-2.5 text-start hover:bg-surface-2/50">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink"><bdi dir="ltr">{m.coin}</bdi> <span className="text-2xs font-medium text-subtle">OI <MoneyValue value={m.openInterestUsd} compact /></span></p>
          <p className="text-2xs text-muted">
            {kind === 'long' ? 'لانگ' : 'شورت'} روزانه {toFaDigits(dailyCostPct(m.fundingHourly).toLocaleString('en-US', { maximumFractionDigits: 3 }))}٪ حجم می‌پردازد
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-bold"><PercentValue value={hourlyToApr(m.fundingHourly)} digits={0} /></span>
          <RegimeBadge stats={stats.data} loading={stats.isLoading} />
        </div>
        <ChevronLeft className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
      </button>
    </li>
  );
}

function AllMarkets({ markets, onOpen }: { markets: PerpMarket[]; onOpen: (coin: string) => void }) {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    return (q ? markets.filter((m) => m.coin.toUpperCase().includes(q)) : markets).slice(0, SEARCH_LIMIT);
  }, [markets, query]);
  return (
    <div className="pt-2">
      <SearchField value={query} onChange={setQuery} placeholder="جستجوی بازار (BTC، ETH، HYPE…)" className="mb-3 w-full sm:w-72" />
      <Surface className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>بازار</th>
              <th className="col-num">قیمت</th>
              <th className="col-num">۲۴ ساعت</th>
              <th className="col-num">فاندینگ سالانه</th>
              <th className="col-num">OI</th>
              <th className="col-num">حجم ۲۴ ساعت</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.coin} className="cursor-pointer" onClick={() => onOpen(m.coin)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(m.coin)}>
                <td className="font-bold text-ink"><bdi dir="ltr">{m.coin}</bdi> <span className="text-2xs font-medium text-subtle">{toFaDigits(m.maxLeverage)}x</span></td>
                <td className="col-num"><bdi dir="ltr">{fmtPrice(m.markPx)}</bdi></td>
                <td className="col-num"><PercentValue value={m.change24h} digits={1} /></td>
                <td className="col-num"><PercentValue value={hourlyToApr(m.fundingHourly)} digits={1} /></td>
                <td className="col-num"><MoneyValue value={m.openInterestUsd} compact /></td>
                <td className="col-num"><MoneyValue value={m.volume24h} compact /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Surface>
    </div>
  );
}
