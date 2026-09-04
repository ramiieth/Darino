/**
 * Boros Intelligence Dashboard
 *  - Best Opportunities (فرصت‌های برتر)
 *  - Market Comparison (مقایسه بازارها)
 *  - Simulator (شبیه‌ساز با موتور محاسباتی)
 *  - Risk Monitor (مانیتور ریسک)
 * فقط Read Only + Simulation — بدون معامله/کیف پول
 */
import { useMemo, useState } from 'react';
import { Sparkles, GitCompare, Calculator, ShieldAlert, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/shared/components/layout/Page';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { ErrorState } from '@/shared/components/ui/StateViews';
import { useBoros, loadBoros, resetBorosLoad, retryBorosSoon } from '@/features/boros/data/useBoros';
import { FreshnessBar } from '@/shared/components/ui/FreshnessBar';
import { useEffect } from 'react';
import { OpportunitiesTab } from './OpportunitiesTab';
import { ComparisonTab } from './ComparisonTab';
import { SimulatorTab } from './SimulatorTab';
import { RiskMonitorTab } from './RiskMonitorTab';
import { AuditTab } from './AuditTab';

type Tab = 'opp' | 'compare' | 'sim' | 'risk' | 'audit';

export default function BorosDashboard() {
  const { markets, loading, error, stale, syncProgress, loadedAt } = useBoros();
  const [tab, setTab] = useState<Tab>('opp');

  // تلاش مجدد خودکار پس از خطا (Rate Limit موقت — بدون دخالت کاربر)
  useEffect(() => {
    if (error) retryBorosSoon(15_000);
  }, [error]);

  const activeMarkets = useMemo(() => markets.filter((m) => m.maturity * 1000 > Date.now()), [markets]);

  if (loading && markets.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="تحلیل Boros" subtitle="موتور هوش بازدهی — بازارهای نرخ تأمین‌مالی" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }
  if (error && markets.length === 0) {
    return <ErrorState message="ارتباط با API بوروس برقرار نشد" onRetry={() => void loadBoros()} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="تحلیل Boros"
        subtitle="موتور هوش بازدهی — بازارهای Yield و Funding Rate (فقط تحلیل)"
      />

      <FreshnessBar
        loadedAt={loadedAt}
        stale={stale}
        error={error}
        syncing={syncProgress !== null}
        sourceLabel="Pendle Boros API"
        autoMs={2 * 60_000}
        onRefresh={() => {
          resetBorosLoad();
          void loadBoros();
        }}
      />

      {!error && stale && markets.length > 0 && (
        <div className="glass-soft flex items-center gap-2 rounded-2xl px-3.5 py-2">
          <span className="badge bg-warn/10 text-warn ring-1 ring-warn/20">داده کش‌شده</span>
          <p className="flex-1 text-[10px] font-bold text-muted">
            ارتباط زنده با API بوروس برقرار نیست — آخرین داده ذخیره‌شده نمایش داده می‌شود (تلاش مجدد خودکار)
          </p>
          <button
            onClick={() => {
              resetBorosLoad();
              void loadBoros();
            }}
            className="text-[10px] font-black text-accent"
          >
            تلاش مجدد
          </button>
        </div>
      )}

      {syncProgress && (
        <div className="glass-soft flex items-center gap-2 rounded-2xl px-3.5 py-2">
          <ShieldAlert className="h-3.5 w-3.5 animate-pulse text-accent" />
          <p className="flex-1 text-[10px] font-bold text-muted">
            همگام‌سازی تاریخچه APR: {syncProgress.done}/{syncProgress.total}
          </p>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line/10">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${(syncProgress.done / Math.max(1, syncProgress.total)) * 100}%` }}
            />
          </div>
        </div>
      )}

      <SegmentedControl
        options={[
          { value: 'opp' as const, label: 'فرصت‌ها', icon: <Sparkles className="h-3.5 w-3.5" /> },
          { value: 'compare' as const, label: 'مقایسه', icon: <GitCompare className="h-3.5 w-3.5" /> },
          { value: 'sim' as const, label: 'شبیه‌ساز', icon: <Calculator className="h-3.5 w-3.5" /> },
          { value: 'risk' as const, label: 'مانیتور ریسک', icon: <ShieldAlert className="h-3.5 w-3.5" /> },
          { value: 'audit' as const, label: 'ممیزی', icon: <ShieldCheck className="h-3.5 w-3.5" /> }
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'opp' && <OpportunitiesTab markets={activeMarkets} />}
      {tab === 'compare' && <ComparisonTab markets={activeMarkets} />}
      {tab === 'sim' && <SimulatorTab markets={activeMarkets} />}
      {tab === 'risk' && <RiskMonitorTab markets={activeMarkets} />}
      {tab === 'audit' && <AuditTab markets={activeMarkets} />}
    </div>
  );
}
