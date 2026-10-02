/**
 * What-if (Historical Performance Simulation) — secondary, clearly hypothetical.
 *   «If my current cash had been invested at the start of the period…»
 *   result = capital × (1 + period return)
 *
 * Fully independent and illustrative: no link to accounting, ledgers or balances.
 * Reads the same performance store as «Market movers» → always in sync.
 */
import { useMemo, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { Button } from '@/shared/components/ui/Button';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import {
  useTopPerformers,
  rankRows,
  simulateInvestment,
  type PerfCoin,
  type PerfPeriod
} from '@/features/cryptomarkets/data/useTopPerformers';
import { useInvestableCash, investableCashOr } from '@/shared/hooks/useInvestableCash';
import { fmtUSD, toFaDigits } from '@/shared/utils/formatters';
import { t } from '@/shared/i18n/fa';
import { PERF_PERIODS } from './TopPerformersCard';

function WhatIfRow({ coin, pct, capital }: { coin: PerfCoin; pct: number; capital: number }) {
  const { profit, finalValue } = simulateInvestment(capital, pct);
  return (
    <li className="flex items-center gap-3 py-2.5">
      <AssetLogo symbol={coin.symbol} kind={coin.kind} size={28} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{coin.nameFa}</p>
        <PercentValue value={pct} className="text-xs" />
      </div>
      <div className="shrink-0 text-end">
        <p className="text-sm font-semibold text-ink">
          <MoneyValue value={finalValue} />
        </p>
        <p className="text-xs">
          <MoneyValue value={profit} signed tone="auto" />
        </p>
      </div>
    </li>
  );
}

export function SimulatedInvestmentCard({
  period: periodProp,
  onPeriodChange
}: {
  period?: PerfPeriod;
  onPeriodChange?: (p: PerfPeriod) => void;
}) {
  const { coins, perf1d, perf7d, perf30, perf60, perf90, loading, historyDone } = useTopPerformers();
  const investable = useInvestableCash();
  // hypothetical capital = current real cash balance
  const capital = investableCashOr(investable.cash);
  const period = periodProp ?? '30d';
  const [expanded, setExpanded] = useState(false);

  const perf =
    period === '1d' ? perf1d : period === '7d' ? perf7d : period === '30d' ? perf30 : period === '60d' ? perf60 : perf90;
  const { gainers, losers } = useMemo(() => rankRows(coins, perf, 30), [coins, perf]);
  const noData = gainers.length === 0 && losers.length === 0;
  const limit = expanded ? 30 : 3;

  return (
    <Section
      id="whatif"
      title={t('hypTitle')}
      description={`اگر ${fmtUSD(capital)} (${investable.mode === 'manual' ? 'سرمایهٔ دستی سناریو' : 'موجودی نقد فعلی'}) در ابتدای بازه سرمایه‌گذاری شده بود`}
    >
      <Surface className="p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            options={PERF_PERIODS}
            value={period}
            onChange={onPeriodChange ?? (() => undefined)}
            label="بازه زمانی"
            size="sm"
          />
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <FlaskConical aria-hidden className="h-3.5 w-3.5" />
            فرضی — بدون اثر روی حساب‌ها
          </span>
        </div>

        <div className="mt-4">
          {loading && noData ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : noData ? (
            <p className="rounded-field bg-surface-2 px-4 py-6 text-center text-sm text-muted">
              {historyDone ? t('perfUnavailable') : t('perfEmpty')}
            </p>
          ) : (
            <>
              <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-positive">{t('topGainers')}</h3>
                  <ul className="divide-y divide-divider">
                    {gainers.slice(0, limit).map((r) => (
                      <WhatIfRow key={r.coin.symbol} coin={r.coin} pct={r.pct} capital={capital} />
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-negative">{t('topLosers')}</h3>
                  <ul className="divide-y divide-divider">
                    {losers.slice(0, limit).map((r) => (
                      <WhatIfRow key={r.coin.symbol} coin={r.coin} pct={r.pct} capital={capital} />
                    ))}
                  </ul>
                </div>
              </div>
              {Math.max(gainers.length, losers.length) > 3 && (
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

        <Notice tone="neutral" className="mt-4">
          {t('hypDisclaimer')}
        </Notice>
      </Surface>
    </Section>
  );
}
