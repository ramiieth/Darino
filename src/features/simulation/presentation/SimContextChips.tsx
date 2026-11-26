import { useMemo } from 'react';
import { Calendar, Coins, TrendingUp } from 'lucide-react';
import type { TimelineResult } from '@/shared/types';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { toFaDigits } from '@/shared/utils/formatters';
import { t } from '@/shared/i18n/fa';

/**
 * Timeline summary card: base capital + ETH benchmark + gain/loss market breadth bar
 */
export function SimContextChips({ result }: { result: TimelineResult }) {
  const ethBenchmarkValue =
    result.ethLivePrice !== null ? (result.baseCapital / result.ethRefPrice) * result.ethLivePrice : null;
  const ethReturnPct =
    result.ethLivePrice !== null && result.ethRefPrice > 0
      ? ((result.ethLivePrice - result.ethRefPrice) / result.ethRefPrice) * 100
      : null;

  const breadth = useMemo(() => {
    let gainers = 0;
    let losers = 0;
    let beatEth = 0;
    for (const r of result.rows) {
      if (r.changePct === null) continue;
      if (r.changePct > 0) gainers++;
      else if (r.changePct < 0) losers++;
      if (r.vsEth !== null && r.vsEth > 0) beatEth++;
    }
    const total = gainers + losers;
    return {
      gainers,
      losers,
      beatEth,
      total,
      gainPct: total > 0 ? Math.round((gainers / total) * 100) : 0
    };
  }, [result.rows]);

  return (
    <Surface className="flex h-full flex-col justify-between gap-4 p-4 md:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-divider/70 bg-surface-2/40 p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Coins aria-hidden className="h-3.5 w-3.5 text-accent" />
            {t('baseCapital')}
          </div>
          <p className="mt-1.5 text-xl font-extrabold tracking-tight text-ink">
            <MoneyValue value={result.baseCapital} />
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-2xs text-subtle">
            <Calendar aria-hidden className="h-3 w-3" />
            {result.timeline === 1 ? t('analyticsDateT1') : t('analyticsDateT2')}
          </p>
        </div>

        <div className="rounded-xl border border-divider/70 bg-surface-2/40 p-3.5">
          <div className="flex items-center justify-between gap-1.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <TrendingUp aria-hidden className="h-3.5 w-3.5 text-accent" />
              {t('ethBenchmark')}
            </span>
            {ethReturnPct !== null && (
              <Badge tone={ethReturnPct >= 0 ? 'gain' : 'loss'} className="text-2xs">
                <PercentValue value={ethReturnPct} digits={1} />
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-xl font-extrabold tracking-tight text-ink">
            <MoneyValue value={ethBenchmarkValue} />
          </p>
          <p className="mt-1 text-2xs text-subtle">
            {result.ethLivePrice !== null ? (
              <>
                قیمت فعلی اتریوم: <MoneyValue value={result.ethLivePrice} />
              </>
            ) : (
              t('na')
            )}
          </p>
        </div>
      </div>

      {breadth.total > 0 && (
        <div className="space-y-2 border-t border-divider/70 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-positive">
              {toFaDigits(breadth.gainers)} دارایی سودده ({toFaDigits(breadth.gainPct)}٪)
            </span>
            <span className="font-semibold text-negative">
              {toFaDigits(breadth.losers)} دارایی زیان‌ده
            </span>
          </div>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-negative/20">
            <div
              className="h-full rounded-full bg-gain transition-all duration-300"
              style={{ width: `${breadth.gainPct}%` }}
            />
          </div>
          <p className="text-2xs text-muted">
            <strong className="text-ink">{toFaDigits(breadth.beatEth)}</strong> دارایی از{' '}
            {toFaDigits(breadth.total)} مورد در این بازه عملکرد بهتری از اتریوم داشته‌اند.
          </p>
        </div>
      )}
    </Surface>
  );
}
