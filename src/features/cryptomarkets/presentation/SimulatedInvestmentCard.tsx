/**
 * What-if (Short-term 1d–90d Historical Performance Simulation) — secondary, clearly hypothetical.
 *   «If this manually entered capital had been invested at the start of the period…»
 *   result = capital × (1 + period return)
 *
 * Fully independent and illustrative: no link to accounting, ledgers or balances.
 * Reads the same performance store as «Market movers» → always in sync.
 */
import { useMemo, useState } from 'react';
import { FlaskConical, TrendingDown, TrendingUp } from 'lucide-react';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { Button } from '@/shared/components/ui/Button';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import {
  useTopPerformers,
  rankRows,
  simulateInvestment,
  type PerfCoin,
  type PerfPeriod
} from '@/features/cryptomarkets/data/useTopPerformers';
import { useInvestableCash, saveScenarioCash } from '@/shared/hooks/useInvestableCash';
import { fmtUSD, toFaDigits } from '@/shared/utils/formatters';
import { Field, Input } from '@/shared/components/ui/Input';
import { normalizeNumericInput } from '@/features/custody/domain/decimal';
import { toast } from '@/shared/store/toastStore';
import { t } from '@/shared/i18n/fa';
import { cn } from '@/shared/lib/cn';
import { PERF_PERIODS } from './TopPerformersCard';

const QUICK_CAPS = [1_000, 5_000, 10_000, 25_000] as const;

function WhatIfRow({ coin, pct, capital }: { coin: PerfCoin; pct: number; capital: number }) {
  const { profit, finalValue } = simulateInvestment(capital, pct);
  return (
    <li className="flex items-center gap-3 py-2.5">
      <AssetLogo symbol={coin.symbol} kind={coin.kind} size={30} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{coin.nameFa}</p>
        <PercentValue value={pct} className="text-xs" />
      </div>
      <div className="shrink-0 text-end">
        <p className="text-sm font-bold text-ink">
          <MoneyValue value={finalValue} />
        </p>
        <p className="text-xs font-semibold">
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
  // Hypothetical capital is manually entered and independent of wallet balances.
  const capital = investable.cash ?? 0;
  const [draft, setDraft] = useState('');
  const entered = Number(normalizeNumericInput(draft));
  const period = periodProp ?? '30d';
  const [expanded, setExpanded] = useState(false);

  const perf =
    period === '1d' ? perf1d : period === '7d' ? perf7d : period === '30d' ? perf30 : period === '60d' ? perf60 : perf90;
  const { gainers, losers } = useMemo(() => rankRows(coins, perf, 30), [coins, perf]);
  const noData = gainers.length === 0 && losers.length === 0;
  const limit = expanded ? 30 : 4;

  const applyCapital = (val: number) => {
    void saveScenarioCash({ mode: 'manual', manualUsd: val })
      .then(() => toast('success', 'مبلغ شبیه‌سازی کوتاه‌مدت ذخیره شد'))
      .catch(() => toast('error', 'ذخیره انجام نشد'));
  };

  return (
    <Section
      id="whatif"
      title={`${t('hypTitle')} (کوتاه‌مدت ۱ تا ۹۰ روز)`}
      description={
        investable.cash === null
          ? 'مبلغ فرضی کوتاه‌مدت را انتخاب یا وارد کنید'
          : `اگر ${fmtUSD(capital)} در ابتدای این بازه سرمایه‌گذاری شده بود`
      }
    >
      <Surface className="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-divider/70 bg-surface-2/40 p-3">
          <div className="flex flex-wrap items-end gap-2.5">
            <Field label="مبلغ کوتاه‌مدت (USDT)">
              <Input
                dir="ltr"
                inputMode="decimal"
                suffix="USDT"
                value={draft}
                placeholder={investable.cash === null ? 'مثلاً 10000' : String(investable.cash)}
                onChange={(e) => setDraft(e.target.value)}
                className="w-40"
              />
            </Field>
            <Button
              size="sm"
              className="h-10"
              disabled={!draft.trim() || !Number.isFinite(entered) || entered <= 0}
              onClick={() => applyCapital(entered)}
            >
              اعمال
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {QUICK_CAPS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => {
                  setDraft(String(amt));
                  applyCapital(amt);
                }}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-2xs font-bold transition-all',
                  capital === amt
                    ? 'border-accent bg-accent text-on-accent'
                    : 'border-divider bg-card text-muted hover:text-ink'
                )}
              >
                <bdi dir="ltr" className="num-ltr">{toFaDigits(amt.toLocaleString('en-US'))}</bdi> دلار
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            options={PERF_PERIODS}
            value={period}
            onChange={onPeriodChange ?? (() => undefined)}
            label="بازه زمانی"
            size="sm"
          />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-2xs font-semibold text-muted">
            <FlaskConical aria-hidden className="h-3.5 w-3.5 text-accent" />
            فرضی — بدون اثر روی حساب‌ها
          </span>
        </div>

        <div>
          {investable.cash === null ? (
            <p className="rounded-xl bg-surface-2/60 py-6 text-center text-sm text-muted">
              برای نمایش نتیجه، یکی از مبالغ سریع بالا را انتخاب کنید یا مبلغ دلخواه را وارد نمایید.
            </p>
          ) : loading && noData ? (
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
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-gain/20 bg-gain/[0.03] p-3.5">
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-positive">
                    <TrendingUp aria-hidden className="h-4 w-4" />
                    {t('topGainers')}
                  </h3>
                  <ul className="divide-y divide-divider/70">
                    {gainers.slice(0, limit).map((r) => (
                      <WhatIfRow key={r.coin.symbol} coin={r.coin} pct={r.pct} capital={capital} />
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-negative/20 bg-negative/[0.03] p-3.5">
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-negative">
                    <TrendingDown aria-hidden className="h-4 w-4" />
                    {t('topLosers')}
                  </h3>
                  <ul className="divide-y divide-divider/70">
                    {losers.slice(0, limit).map((r) => (
                      <WhatIfRow key={r.coin.symbol} coin={r.coin} pct={r.pct} capital={capital} />
                    ))}
                  </ul>
                </div>
              </div>
              {Math.max(gainers.length, losers.length) > 4 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3 w-full text-accent"
                  onClick={() => setExpanded((e) => !e)}
                  aria-expanded={expanded}
                >
                  {expanded ? 'نمایش کمتر' : `نمایش همه (${toFaDigits(Math.max(gainers.length, losers.length))} مورد)`}
                </Button>
              )}
            </>
          )}
        </div>

        <p className="text-2xs text-subtle">{t('hypDisclaimer')}</p>
      </Surface>
    </Section>
  );
}
