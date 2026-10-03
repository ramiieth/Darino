import { EntryRecommendations } from './EntryRecommendations';
import type { EntrySelection } from './VerifiedOpportunities';
/**
 * Boros intelligence — funding-rate (yield) markets, analysis only
 *   فرصت‌ها · مقایسه · شبیه‌ساز · مانیتور ریسک · ممیزی
 * Read only + simulation — no trading, no wallet.
 */
import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { Tabs } from '@/shared/components/ui/SegmentedControl';
import { Button } from '@/shared/components/ui/Button';
import { PageSkeleton } from '@/shared/components/ui/Skeleton';
import { ErrorState, Notice } from '@/shared/components/ui/StateViews';
import { FreshnessBar } from '@/shared/components/ui/FreshnessBar';
import { useBoros, loadBoros, resetBorosLoad, retryBorosSoon } from '@/features/boros/data/useBoros';
import { toFaDigits } from '@/shared/utils/formatters';
import { OpportunitiesTab } from './OpportunitiesTab';
import { ComparisonTab } from './ComparisonTab';
import { SimulatorTab } from './SimulatorTab';
import { RiskMonitorTab } from './RiskMonitorTab';
import { AccountTab } from './AccountTab';
import { BorosGuide } from './BorosGuide';
import type { BorosDirection } from '../domain/types';
import { AuditTab } from './AuditTab';

type Tab = 'entry' | 'account' | 'opp' | 'compare' | 'sim' | 'risk' | 'audit' | 'guide';

const TABS: { value: Tab; label: string }[] = [
  { value: 'entry', label: 'پیشنهاد ورود' },
  { value: 'account', label: 'حساب من' },
  { value: 'opp', label: 'بازارها و فرصت‌ها' },
  { value: 'compare', label: 'مقایسه بازارها' },
  { value: 'sim', label: 'پیش‌نمایش' },
  { value: 'risk', label: 'مانیتور ریسک' },
  { value:'guide',label:'راهنما' },
  { value: 'audit', label: 'بررسی محاسبات' }
];

export default function BorosDashboard() {
  const { markets, loading, error, stale, syncProgress, loadedAt } = useBoros();
  const [tab, setTab] = useState<Tab>('entry');
  const [target,setTarget]=useState<{marketId:number;direction:BorosDirection;entry?:EntrySelection}|undefined>();
  const inspect=(marketId:number,direction:BorosDirection='long')=>{setTarget({marketId,direction});setTab('sim');};

  // automatic retry after an error (temporary rate limit — no user action needed)
  useEffect(() => {
    if (error) retryBorosSoon(15_000);
  }, [error]);

  const activeMarkets = useMemo(() => markets.filter((m) => m.maturity * 1000 > Date.now() && m.isUiWhitelisted), [markets]);
  const reload = () => {
    resetBorosLoad();
    void loadBoros();
  };

  const header = (
    <PageHeader
      title="تحلیل بوروس"

      meta={
        markets.length > 0 ? (
          <FreshnessBar
            loadedAt={loadedAt}
            stale={stale}
            error={error}
            syncing={syncProgress !== null}
            sourceLabel="بوروس"
            autoMs={2 * 60_000}
            onRefresh={reload}
          />
        ) : undefined
      }
    />
  );


  return (
    <Page>
      <div className="boros-workspace space-y-5">
      {header}

      {!error && stale && (
        <Notice
          tone="stale"
          title="داده ذخیره‌شده"
          action={
            <Button variant="outline" size="sm" icon={<RefreshCw />} onClick={reload}>
              تلاش دوباره
            </Button>
          }
        >
          آخرین دادهٔ ذخیره‌شده نمایش داده می‌شود؛ اتصال در حال بررسی است.
        </Notice>
      )}

      {syncProgress && (
        <div className="flex items-center gap-3 text-xs text-muted" role="status">
          <span className="shrink-0">
            تاریخچه نرخ {toFaDigits(syncProgress.done)}/{toFaDigits(syncProgress.total)}
          </span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-slow"
              style={{ width: `${(syncProgress.done / Math.max(1, syncProgress.total)) * 100}%` }}
            />
          </div>
        </div>
      )}



      <div className="space-y-6">
        <Tabs<Tab> label="بخش‌های بوروس" options={TABS} value={tab} onChange={setTab} />
        {tab === 'account' && <AccountTab markets={markets} />}
        {tab !== 'account' && tab !== 'guide' && loading && markets.length === 0 && <PageSkeleton />}
        {tab !== 'account' && tab !== 'guide' && error && markets.length === 0 && <ErrorState message="ارتباط با سرویس بوروس برقرار نشد" onRetry={() => void loadBoros()} />}
        {tab === 'entry' && <EntryRecommendations markets={activeMarkets} onAccount={()=>setTab('account')} onSelect={entry=>{setTarget({marketId:entry.marketId,direction:entry.direction,entry});setTab('sim');}}/>}
        {tab === 'opp' && <OpportunitiesTab markets={activeMarkets} onInspect={inspect} onRecommend={()=>setTab('entry')} />}
        {tab === 'compare' && <ComparisonTab markets={activeMarkets} onInspect={inspect} />}
        {tab === 'sim' && <SimulatorTab key={target?.marketId+':'+target?.direction} markets={activeMarkets} initial={target} />}
        {tab === 'risk' && <RiskMonitorTab markets={activeMarkets} />}
        {tab === 'guide' && <BorosGuide />}
        {tab === 'audit' && <AuditTab markets={activeMarkets} />}
      </div>
    </div>
    </Page>
  );
}
