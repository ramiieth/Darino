/**
 * عملکرد ۳۰/۶۰/۹۰ روزه — کارت داشبورد
 * دو ستون: بیشترین رشد / بیشترین افت (دنیای ۶۰ سکه برتر مارکت‌کپ)
 */
import { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import {
  useTopPerformers,
  refreshTopPerformers,
  rankRows,
  type PerfCoin,
  type PerfPeriod
} from '@/features/cryptomarkets/data/useTopPerformers';
import { fmtPct, fmtTime, fmtRelativeAge } from '@/shared/utils/formatters';
import { useNow } from '@/shared/hooks/useNow';
import { cn } from '@/shared/lib/cn';
import { t } from '@/shared/i18n/fa';

const PERIODS: { value: PerfPeriod; label: string }[] = [
  { value: '1d', label: t('perf1d') },
  { value: '7d', label: t('perf7d') },
  { value: '30d', label: t('perf30') },
  { value: '60d', label: t('perf60') },
  { value: '90d', label: t('perf90') }
];

interface Row {
  coin: PerfCoin;
  pct: number;
}

function PerfRow({ coin, pct, rank }: { coin: PerfCoin; pct: number; rank: number }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <span className="tnum w-5 shrink-0 text-center text-[10px] font-black text-muted/70">{rank}</span>
      <AssetLogo symbol={coin.symbol} kind={coin.kind} size={26} />
      <div className="min-w-0 flex-1">
        <p className="tnum truncate text-[11px] font-extrabold text-ink">{coin.symbol}</p>
        <p className="truncate text-[9px] font-medium text-muted">{coin.nameFa}</p>
      </div>
      <span className={cn('num-ltr shrink-0 text-[11px] font-black', pct >= 0 ? 'text-positive' : 'text-negative')}>
        {fmtPct(pct)}
      </span>
    </div>
  );
}

function Block({
  title,
  icon,
  rows,
  tone
}: {
  title: string;
  icon: React.ReactNode;
  rows: Row[];
  tone: 'up' | 'down';
}) {
  return (
    <div className="glass-soft rounded-2xl p-3">
      <p className={cn('mb-1.5 flex items-center gap-1.5 text-[11px] font-black', tone === 'up' ? 'text-positive' : 'text-negative')}>
        {icon}
        {title}
      </p>
      <div className="divide-y divide-line/5">
        {rows.map((r, i) => (
          <PerfRow key={r.coin.symbol} coin={r.coin} pct={r.pct} rank={i + 1} />
        ))}
      </div>
    </div>
  );
}

export function TopPerformersCard({
  period: periodProp,
  onPeriodChange
}: {
  /** بازه کنترل‌شده (همگام با کارت شبیه‌سازی) — اختیاری */
  period?: PerfPeriod;
  onPeriodChange?: (p: PerfPeriod) => void;
}) {
  const { coins, perf1d, perf7d, perf30, perf60, perf90, loading, historyDone, stale, stockSync, loadedAt } = useTopPerformers();
  const now = useNow(10_000);
  const [periodInt, setPeriodInt] = useState<PerfPeriod>('30d');
  const period = periodProp ?? periodInt;
  const setPeriod = onPeriodChange ?? setPeriodInt;

  const perf =
    period === '1d' ? perf1d
    : period === '7d' ? perf7d
    : period === '30d' ? perf30
    : period === '60d' ? perf60
    : perf90;

  // ۳۰ نماد بیشترین رشد / بیشترین افت
  const { gainers, losers } = useMemo(() => rankRows(coins, perf, 30), [coins, perf]);

  // آیا هیچ سهم سنتی‌ای داده ندارد (سهمیه آلفا وانتج امروز تمام شده؟)
  const anyTradFiData = useMemo(
    () => coins.some((c) => c.kind === 'tradfi' && perf30[c.symbol] != null),
    [coins, perf30]
  );

  const needHistory = period === '60d' || period === '90d';
  const noData = gainers.length === 0 && losers.length === 0;
  const historyUnavailable = needHistory && historyDone && noData && !loading;

  return (
    <GlassCard variant="soft" className="p-4">
      {/* سربرگ */}
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <TrendingUp className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-black text-ink">{t('topPerformers')}</h3>
          <p className="text-[10px] font-medium text-muted">{t('perfSubtitle')}</p>
        </div>
        {stale && (
          <span className="badge bg-warn/10 text-warn ring-1 ring-warn/20">{t('perfStale')}</span>
        )}
        <button
          onClick={refreshTopPerformers}
          className="flex h-8 w-8 items-center justify-center rounded-xl text-muted transition-colors hover:bg-line/5 hover:text-accent"
          aria-label={t('refresh')}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      {/* سوییچ بازه */}
      <SegmentedControl
        options={PERIODS}
        value={period}
        onChange={setPeriod}
        className="mb-3"
      />

      <p className="mb-2 flex items-center justify-between gap-2 text-[9px] font-bold text-muted/70">
        <span className="flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', stale ? 'bg-amber-400' : 'bg-emerald-400')} />
          {loadedAt ? `${t('perfLastSync')}: ${fmtTime(loadedAt)} (${fmtRelativeAge(loadedAt, now)})` : t('refreshingStocks')}
        </span>
        <span>{t('perfAutoSync')}</span>
      </p>

      {stockSync && stockSync.done > 0 && (
        <p className="mb-2 text-center text-[9px] font-medium text-muted/70">
          {t('perfStockSync')} {stockSync.done}/{stockSync.total}
        </p>
      )}
      {!stockSync && historyDone && !anyTradFiData && (
        <p className="mb-2 text-center text-[9px] font-bold text-warn/80">
          {t('perfAvExhausted')}
        </p>
      )}

      {/* بدنه */}
      {loading && noData ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-5" />
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-3.5 w-14" />
            </div>
          ))}
        </div>
      ) : noData ? (
        <p className="rounded-2xl bg-line/5 px-4 py-6 text-center text-[11px] font-bold leading-6 text-muted">
          {historyUnavailable ? t('perfUnavailable') : t('perfEmpty')}
        </p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Block title={t('topGainers')} icon={<TrendingUp className="h-3.5 w-3.5" />} rows={gainers} tone="up" />
          <Block title={t('topLosers')} icon={<TrendingDown className="h-3.5 w-3.5" />} rows={losers} tone="down" />
        </div>
      )}
    </GlassCard>
  );
}
