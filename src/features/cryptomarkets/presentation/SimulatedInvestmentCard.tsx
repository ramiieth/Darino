/**
 * شبیه‌سازی نمایشی سرمایه‌گذاری (Historical Performance Simulation)
 *
 * کنار کارت «عملکرد» — صرفاً یک سناریوی فرضی:
 *  «اگر ۲۳٬۱۲۶ دلار در ابتدای دوره روی این نماد سرمایه‌گذاری می‌کردم…»
 *  نتیجه احتمالی امروز = سرمایه × (۱ + بازده بازه)
 *
 * ⚠️ کاملاً مستقل و نمایشی:
 *  - هیچ ارتباطی با حسابداری، دفتر کل، ثبت تراکنش و موجودی واقعی ندارد
 *  - هیچ داده‌ای به سیستم مالی اپ منتقل نمی‌شود
 *  - از همان داده استور «عملکرد» (usePerfStore) می‌خواند → همیشه هماهنگ
 */
import { useMemo } from 'react';
import { FlaskConical, TrendingUp, TrendingDown, Info } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import {
  useTopPerformers,
  rankRows,
  simulateInvestment,
  type PerfCoin,
  type PerfPeriod
} from '@/features/cryptomarkets/data/useTopPerformers';
import { useInvestableCash, investableCashOr } from '@/shared/hooks/useInvestableCash';
import { fmtUSD, fmtPct } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import { t } from '@/shared/i18n/fa';

const PERIODS: { value: PerfPeriod; label: string }[] = [
  { value: '1d', label: t('perf1d') },
  { value: '7d', label: t('perf7d') },
  { value: '30d', label: t('perf30') },
  { value: '60d', label: t('perf60') },
  { value: '90d', label: t('perf90') }
];

function SimRow({
  coin,
  pct,
  periodLabel,
  capital
}: {
  coin: PerfCoin;
  pct: number;
  periodLabel: string;
  capital: number;
}) {
  const { profit, finalValue } = simulateInvestment(capital, pct);
  const isLoss = profit !== null && profit < 0;

  return (
    <div className="rounded-2xl bg-line/5 p-2.5">
      {/* سربرگ نماد */}
      <div className="flex items-center gap-2.5">
        <AssetLogo symbol={coin.symbol} kind={coin.kind} size={26} />
        <div className="min-w-0 flex-1">
          <p className="tnum truncate text-[11px] font-extrabold text-ink">{coin.symbol}</p>
          <p className="truncate text-[9px] font-medium text-muted">{coin.nameFa}</p>
        </div>
        <span
          className={cn(
            'badge shrink-0 ring-1',
            pct >= 0
              ? 'bg-positive/10 text-positive ring-positive/20'
              : 'bg-negative/10 text-negative ring-negative/20'
          )}
        >
          {periodLabel}: {fmtPct(pct)}
        </span>
      </div>
      {/* نتیجه شبیه‌سازی */}
      <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] font-medium">
        <span className="text-muted">{t('hypCapital')}</span>
        <span className="num-ltr text-end font-bold text-ink">{fmtUSD(capital)}</span>
        <span className={isLoss ? 'text-negative' : 'text-positive'}>
          {isLoss ? t('hypLoss') : t('hypGain')}
        </span>
        <span
          className={cn(
            'num-ltr text-end font-black',
            isLoss ? 'text-negative' : 'text-positive'
          )}
        >
          {profit !== null ? `${profit >= 0 ? '+' : ''}${fmtUSD(profit)}` : '—'}
        </span>
        <span className="text-muted">{t('hypFinalValue')}</span>
        <span className="num-ltr text-end font-black text-ink">
          {finalValue !== null ? fmtUSD(finalValue) : '—'}
        </span>
      </div>
    </div>
  );
}

function SimBlock({
  title,
  icon,
  rows,
  tone,
  periodLabel,
  capital
}: {
  title: string;
  icon: React.ReactNode;
  rows: { coin: PerfCoin; pct: number }[];
  tone: 'up' | 'down';
  periodLabel: string;
  capital: number;
}) {
  return (
    <div className="glass-soft rounded-2xl p-3">
      <p
        className={cn(
          'mb-1.5 flex items-center gap-1.5 text-[11px] font-black',
          tone === 'up' ? 'text-positive' : 'text-negative'
        )}
      >
        {icon}
        {title}
      </p>
      <div className="space-y-2">
        {rows.map((r) => (
          <SimRow key={r.coin.symbol} coin={r.coin} pct={r.pct} periodLabel={periodLabel} capital={capital} />
        ))}
      </div>
    </div>
  );
}

export function SimulatedInvestmentCard({
  period: periodProp,
  onPeriodChange
}: {
  /** بازه کنترل‌شده (همگام با کارت عملکرد) — اختیاری */
  period?: PerfPeriod;
  onPeriodChange?: (p: PerfPeriod) => void;
}) {
  const { coins, perf1d, perf7d, perf30, perf60, perf90, loading, historyDone } = useTopPerformers();
  const investable = useInvestableCash();
  // سرمایه فرضی = موجودی نقد واقعی و به‌روز (پس از برداشت‌های مخارج کاهش می‌یابد)
  const capital = investableCashOr(investable.cash);
  const period = periodProp ?? '30d';

  const perf =
    period === '1d' ? perf1d
    : period === '7d' ? perf7d
    : period === '30d' ? perf30
    : period === '60d' ? perf60
    : perf90;
  // ۳۰ نماد بیشترین رشد / بیشترین افت
  const { gainers, losers } = useMemo(() => rankRows(coins, perf, 30), [coins, perf]);
  const noData = gainers.length === 0 && losers.length === 0;

  const periodLabel = PERIODS.find((p) => p.value === period)?.label ?? t('perf30');

  return (
    <GlassCard variant="soft" className="p-4">
      {/* سربرگ */}
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-400/15 text-teal-400">
          <FlaskConical className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-black text-ink">{t('hypTitle')}</h3>
        </div>
      </div>

      {/* سوییچ بازه — هماهنگ با کارت عملکرد */}
      <SegmentedControl
        options={PERIODS}
        value={period}
        onChange={onPeriodChange ?? (() => undefined)}
        className="mb-3"
      />

      {/* بدنه */}
      {loading && noData ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      ) : noData ? (
        <p className="rounded-2xl bg-line/5 px-4 py-6 text-center text-[11px] font-bold leading-6 text-muted">
          {historyDone ? t('perfUnavailable') : t('perfEmpty')}
        </p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <SimBlock
            title={t('topGainers')}
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            rows={gainers}
            tone="up"
            periodLabel={periodLabel}
            capital={capital}
          />
          <SimBlock
            title={t('topLosers')}
            icon={<TrendingDown className="h-3.5 w-3.5" />}
            rows={losers}
            tone="down"
            periodLabel={periodLabel}
            capital={capital}
          />
        </div>
      )}

      {/* سلب مسئولیت */}
      <p className="mt-3 flex items-start gap-1.5 text-[9px] font-medium leading-4 text-muted/70">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        {t('hypDisclaimer')}
      </p>
    </GlassCard>
  );
}
