/**
 * تب «بازار مشتقات» — بازارهای پرپ هایپرلیکوئید: فاندینگ سالانه، رژیم ۳۰ روزه، OI، حجم و جهت برترها
 * دسکتاپ: جدول · موبایل: کارت. رژیم فاندینگ برای ۱۲ بازار اول خودکار، بقیه با باز کردن.
 */
import { useMemo, useState } from 'react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge, type Tone } from '@/shared/components/ui/Badge';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { SearchField } from '@/shared/components/ui/Input';
import { ErrorState, ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { toFaDigits } from '@/shared/utils/formatters';
import { aggregatePositions } from '@/features/traders/domain/positions';
import { usePositions } from '@/features/traders/data/useTraders';
import { REGIME_FA, hourlyToApr, type FundingStats } from '../domain/funding';
import { useFundingStats, usePerpMarkets, type PerpMarket } from '../data/intelApi';
import { SplitBar, fmtPrice } from './parts';

const AUTO_STATS = 12;
const LIMIT = 30;

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

export function DerivativesTab({ onCoin }: { onCoin: (coin: string) => void }) {
  const markets = usePerpMarkets();
  const positions = usePositions();
  const [query, setQuery] = useState('');
  const bias = useMemo(() => new Map(aggregatePositions(positions.data?.positions ?? []).map((c) => [c.coin, c])), [positions.data]);
  const rows = useMemo(() => {
    const all = markets.data ?? [];
    const q = query.trim().toUpperCase();
    return (q ? all.filter((m) => m.coin.toUpperCase().includes(q)) : all).slice(0, LIMIT);
  }, [markets.data, query]);

  if (markets.isLoading) return <ListSkeleton rows={8} />;
  if (markets.isError) return <ErrorState message="بازارهای هایپرلیکوئید دریافت نشد" onRetry={() => void markets.refetch()} />;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <SearchField value={query} onChange={setQuery} placeholder="جستجوی بازار (BTC، ETH، HYPE…)" className="w-full sm:w-72" />
        <p className="text-xs text-muted">{toFaDigits(markets.data?.length ?? 0)} بازار · مرتب بر اساس OI</p>
      </div>
      <Notice tone="info" className="mb-5">
        «رژیم» نرخ فاندینگ فعلی را با همهٔ ساعت‌های ۳۰ روز گذشته مقایسه می‌کند. «داغ» یعنی بالاتر از ۹۰٪ ماه گذشته: معمولاً به میانگین برمی‌گردد، پس APR امروز را مبنای دلتا نوترال نکنید.
      </Notice>

      <Surface className="hidden overflow-x-auto md:block">
        <table className="data-table">
          <thead>
            <tr>
              <th>بازار</th>
              <th className="col-num">قیمت</th>
              <th className="col-num">۲۴ ساعت</th>
              <th className="col-num">فاندینگ سالانه</th>
              <th>رژیم ۳۰ روزه</th>
              <th className="col-num">OI</th>
              <th className="col-num">حجم ۲۴ ساعت</th>
              <th className="min-w-36">جهت برترها</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => (
              <MarketRow key={m.coin} m={m} auto={i < AUTO_STATS && !query} bias={bias.get(m.coin)} onOpen={() => onCoin(m.coin)} />
            ))}
          </tbody>
        </table>
      </Surface>

      <div className="grid gap-3 md:hidden">
        {rows.map((m, i) => (
          <MarketCard key={m.coin} m={m} auto={i < AUTO_STATS && !query} bias={bias.get(m.coin)} onOpen={() => onCoin(m.coin)} />
        ))}
      </div>
    </>
  );
}

type RowProps = { m: PerpMarket; auto: boolean; bias?: { longUsd: number; shortUsd: number }; onOpen: () => void };

function FundingApr({ hourly }: { hourly: number }) {
  return <PercentValue value={hourlyToApr(hourly)} digits={1} />;
}

function MarketRow({ m, auto, bias, onOpen }: RowProps) {
  const stats = useFundingStats(m.coin, m.fundingHourly, auto);
  return (
    <tr className="cursor-pointer" onClick={onOpen} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <td className="font-bold text-ink"><bdi dir="ltr">{m.coin}</bdi> <span className="text-2xs font-medium text-subtle">{toFaDigits(m.maxLeverage)}x</span></td>
      <td className="col-num"><bdi dir="ltr">{fmtPrice(m.markPx)}</bdi></td>
      <td className="col-num"><PercentValue value={m.change24h} digits={1} /></td>
      <td className="col-num"><FundingApr hourly={m.fundingHourly} /></td>
      <td><RegimeBadge stats={stats.data} loading={auto && stats.isLoading} /></td>
      <td className="col-num"><MoneyValue value={m.openInterestUsd} compact /></td>
      <td className="col-num"><MoneyValue value={m.volume24h} compact /></td>
      <td>{bias ? <SplitBar long={bias.longUsd} short={bias.shortUsd} labels={false} /> : <span className="text-xs text-subtle">—</span>}</td>
    </tr>
  );
}

function MarketCard({ m, auto, bias, onOpen }: RowProps) {
  const stats = useFundingStats(m.coin, m.fundingHourly, auto);
  return (
    <Surface as="article" className="p-4">
      <button type="button" onClick={onOpen} className="block w-full text-start">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-base font-extrabold text-ink"><bdi dir="ltr">{m.coin}</bdi> <span className="text-2xs font-medium text-subtle">{toFaDigits(m.maxLeverage)}x</span></p>
            <p className="text-xs text-muted"><bdi dir="ltr">{fmtPrice(m.markPx)}</bdi> · <PercentValue value={m.change24h} digits={1} /></p>
          </div>
          <RegimeBadge stats={stats.data} loading={auto && stats.isLoading} />
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div><dt className="text-muted">فاندینگ سالانه</dt><dd className="font-bold"><FundingApr hourly={m.fundingHourly} /></dd></div>
          <div><dt className="text-muted">OI</dt><dd className="font-bold text-ink"><MoneyValue value={m.openInterestUsd} compact /></dd></div>
          <div><dt className="text-muted">حجم ۲۴ ساعت</dt><dd className="font-bold text-ink"><MoneyValue value={m.volume24h} compact /></dd></div>
        </dl>
        {bias && (
          <div className="mt-3">
            <p className="mb-1 text-2xs font-semibold text-muted">جهت برترها</p>
            <SplitBar long={bias.longUsd} short={bias.shortUsd} />
          </div>
        )}
      </button>
    </Surface>
  );
}
