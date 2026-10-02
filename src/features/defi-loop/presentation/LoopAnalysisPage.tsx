/**
 * DeFi yield loop analytics
 *  - explorer (filters + ranked pools)
 *  - calculator (drill-in on a pool)
 *  - independent from accounting; analysis only
 */
import { useState } from 'react';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { FreshnessBar } from '@/shared/components/ui/FreshnessBar';
import { Notice } from '@/shared/components/ui/StateViews';
import { LoopExplorer } from './LoopExplorer';
import { LoopCalculator } from './LoopCalculator';
import { useYieldPools, loadYieldPools, resetYieldLoad } from '@/features/defi-loop/data/useYieldLoops';
import type { YieldPool } from '@/features/defi-loop/data/yieldsService';
import { PercentValue, MoneyValue } from '@/shared/components/ui/FinancialValue';

export default function LoopAnalysisPage() {
  const [selected, setSelected] = useState<YieldPool | null>(null);
  const yieldData = useYieldPools();
  const refresh = () => {
    resetYieldLoad();
    void loadYieldPools();
  };

  if (selected) {
    return (
      <Page>
        <PageHeader
          back={{
            label: 'فهرست پول‌ها',
            onClick: () => {
              setSelected(null);
              window.scrollTo({ top: 0 });
            }
          }}
          eyebrow={`${selected.chain} · Yield Loop`}
          title={<bdi dir="ltr">{selected.project} · {selected.symbol}</bdi>}
          subtitle={
            <>
              بازده سپرده <PercentValue value={selected.apy} signed={false} tone="none" className="font-semibold text-ink" /> · TVL{' '}
              <MoneyValue value={selected.tvlUsd} compact className="font-semibold text-ink" />
            </>
          }
        />
        <LoopCalculator pool={selected} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="حلقهٔ بازده"
        subtitle="کشف، مقایسه و تحلیل سود واقعی استراتژی‌های اهرمی بازدهی — فقط تحلیل، بدون توصیه معاملاتی"
        meta={
          <FreshnessBar
            loadedAt={yieldData.loadedAt}
            error={yieldData.error}
            syncing={yieldData.loading}
            sourceLabel="بازده‌های دیفای‌لاما"
            autoMs={5 * 60_000}
            onRefresh={refresh}
          />
        }
      />
      <Notice tone="neutral">
        Supply APY، پاداش و TVL از DeFiLlama Yields می‌آیند. Borrow APY، LTV و آستانه لیکوییدیشن در API عمومی نیستند و در
        ماشین‌حساب به‌صورت ورودی شما (برآورد) وارد می‌شوند.
      </Notice>
      <LoopExplorer
        onOpenPool={(p) => {
          setSelected(p);
          window.scrollTo({ top: 0 });
        }}
      />
    </Page>
  );
}
