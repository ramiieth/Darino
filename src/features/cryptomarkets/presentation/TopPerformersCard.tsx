/**
 * Market movers — biggest gainers / losers over a period (top-60 market-cap universe).
 * Shows 5 per side; expands to 30. Period is shared with the what-if module.
 */
import { useMemo, useState } from 'react';
import { RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { Button, IconButton } from '@/shared/components/ui/Button';
import { PercentValue } from '@/shared/components/ui/FinancialValue';
import { StatusDot } from '@/shared/components/ui/Badge';
import { Notice } from '@/shared/components/ui/StateViews';
import {
  useTopPerformers,
  refreshTopPerformers,
  rankRows,
  type PerfCoin,
  type PerfPeriod
} from '@/features/cryptomarkets/data/useTopPerformers';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { useNow } from '@/shared/hooks/useNow';
import { cn } from '@/shared/lib/cn';
import { t } from '@/shared/i18n/fa';

export const PERF_PERIODS: { value: PerfPeriod; label: string }[] = [
  { value: '1d', label: t('perf1d') },
  { value: '7d', label: t('perf7d') },
  { value: '30d', label: t('perf30') },
  { value: '60d', label: t('perf60') },
  { value: '90d', label: t('perf90') }
];

const COLLAPSED = 5;

function MoverList({
  title,
  rows,
  tone,
  limit
}: {
  title: string;
  rows: { coin: PerfCoin; pct: number }[];
  tone: 'up' | 'down';
  limit: number;
}) {
  const Icon = tone === 'up' ? TrendingUp : TrendingDown;
  return (
    <div className="min-w-0">
      <h3 className={cn('mb-1 flex items-center gap-1.5 text-sm font-semibold', tone === 'up' ? 'text-positive' : 'text-negative')}>
        <Icon aria-hidden className="h-4 w-4" />
        {title}
      </h3>
      <ol className="divide-y divide-divider">
        {rows.slice(0, limit).map((r, i) => (
          <li key={r.coin.symbol} className="flex items-center gap-3 py-2.5">
            <span className="num-ltr w-5 shrink-0 text-center text-xs text-subtle">{i + 1}</span>
            <AssetLogo symbol={r.coin.symbol} kind={r.coin.kind} size={28} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{r.coin.nameFa}</p>

            </div>
            <PercentValue value={r.pct} className="shrink-0 text-sm font-semibold" />
          </li>
        ))}
      </ol>
    </div>
  );
}

export function TopPerformersCard({
  period: periodProp,
  onPeriodChange
}: {
  period?: PerfPeriod;
  onPeriodChange?: (p: PerfPeriod) => void;
}) {
  const { coins, perf1d, perf7d, perf30, perf60, perf90, loading, historyDone, stale, stockSync, loadedAt } = useTopPerformers();
  const now = useNow(10_000);
  const [periodInt, setPeriodInt] = useState<PerfPeriod>('30d');
  const [expanded, setExpanded] = useState(false);
  const period = periodProp ?? periodInt;
  const setPeriod = onPeriodChange ?? setPeriodInt;

  const perf =
    period === '1d' ? perf1d : period === '7d' ? perf7d : period === '30d' ? perf30 : period === '60d' ? perf60 : perf90;

  const { gainers, losers } = useMemo(() => rankRows(coins, perf, 30), [coins, perf]);

  const anyTradFiData = useMemo(() => coins.some((c) => c.kind === 'tradfi' && perf30[c.symbol] != null), [coins, perf30]);

  const needHistory = period === '60d' || period === '90d';
  const noData = gainers.length === 0 && losers.length === 0;
  const historyUnavailable = needHistory && historyDone && noData && !loading;
  const limit = expanded ? 30 : COLLAPSED;

  return (
    <Section
      id="movers"
      title={t('topPerformers')}
      description={t('perfSubtitle')}
      action={
        <IconButton size="sm" aria-label={t('refresh')} onClick={refreshTopPerformers}>
          <RefreshCw className={cn(loading && 'animate-spin')} />
        </IconButton>
      }
    >
      <Surface className="p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl options={PERF_PERIODS} value={period} onChange={setPeriod} label="بازه زمانی" size="sm" />
          <StatusDot
            tone={stale ? 'warn' : 'gain'}
            className="font-normal text-muted"
            label={loadedAt ? `${stale ? t('perfStale') : 'به‌روز'} · ${fmtRelativeAge(loadedAt, now)}` : t('refreshingStocks')}
          />
        </div>

        {stockSync && stockSync.done > 0 && stockSync.done < stockSync.total && (
          <p className="mt-3 text-xs text-muted">
            {t('perfStockSync')} {toFaDigits(stockSync.done)}/{toFaDigits(stockSync.total)}
          </p>
        )}
        {!stockSync && historyDone && !anyTradFiData && (
          <Notice tone="warn" className="mt-3">
            {t('perfAvExhausted')}
          </Notice>
        )}

        <div className="mt-4">
          {loading && noData ? (
            <div className="grid gap-6 sm:grid-cols-2">
              {[0, 1].map((k) => (
                <div key={k} className="space-y-3">
                  {Array.from({ length: COLLAPSED }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-7 w-7 rounded-full" />
                      <Skeleton className="h-3.5 flex-1" />
                      <Skeleton className="h-3.5 w-14" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : noData ? (
            <p className="rounded-field bg-surface-2 px-4 py-6 text-center text-sm text-muted">
              {historyUnavailable ? t('perfUnavailable') : t('perfEmpty')}
            </p>
          ) : (
            <>
              <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                <MoverList title={t('topGainers')} rows={gainers} tone="up" limit={limit} />
                <MoverList title={t('topLosers')} rows={losers} tone="down" limit={limit} />
              </div>
              {Math.max(gainers.length, losers.length) > COLLAPSED && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full text-accent"
                  onClick={() => setExpanded((e) => !e)}
                  aria-expanded={expanded}
                >
                  {expanded ? 'نمایش کمتر' : `نمایش ${toFaDigits(Math.max(gainers.length, losers.length))} مورد`}
                </Button>
              )}
            </>
          )}
        </div>
      </Surface>
    </Section>
  );
}
