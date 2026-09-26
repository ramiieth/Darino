import type { TimelineResult } from '@/shared/types';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Metric, MetricGrid, MoneyValue } from '@/shared/components/ui/FinancialValue';
import { t } from '@/shared/i18n/fa';

/**
 * Timeline context: base capital + ETH benchmark (same capital held in ETH)
 */
export function SimContextChips({ result }: { result: TimelineResult }) {
  const ethBenchmarkValue =
    result.ethLivePrice !== null ? (result.baseCapital / result.ethRefPrice) * result.ethLivePrice : null;

  return (
    <Surface className="p-4 md:p-5">
      <MetricGrid cols={2}>
        <Metric
          size="lg"
          label={t('baseCapital')}
          value={<MoneyValue value={result.baseCapital} />}
          sub={result.timeline === 1 ? t('analyticsDateT1') : t('analyticsDateT2')}
        />
        <Metric
          size="lg"
          label={t('ethBenchmark')}
          value={<MoneyValue value={ethBenchmarkValue} />}
          sub={
            result.ethLivePrice !== null ? (
              <>
                ETH <MoneyValue value={result.ethLivePrice} />
              </>
            ) : (
              t('na')
            )
          }
        />
      </MetricGrid>
    </Surface>
  );
}
