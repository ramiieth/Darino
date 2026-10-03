import { EntryRecommendations } from './EntryRecommendations';
import type { PreviewDraft } from '../domain/workflow';
import { Disclosure } from '@/shared/components/ui/Disclosure';
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
import { SimulatorTab } from './SimulatorTab';
import { AccountTab } from './AccountTab';
import { BorosGuide } from './BorosGuide';
import type { BorosDirection } from '../domain/types';

type Tab='opp'|'sim'|'account';
const TABS:{value:Tab;label:string}[]=[{value:'opp',label:'بازارها'},{value:'sim',label:'پیش‌نمایش ورود'},{value:'account',label:'حساب من'}];

export default function BorosDashboard() {
  const { markets, loading, error, stale, syncProgress, loadedAt } = useBoros();
  const [tab, changeTab] = useState<Tab>('opp');
  const [visited,setVisited]=useState({opp:true,sim:false,account:false});
  const setTab=(v:Tab)=>{setVisited(s=>({...s,[v]:true}));changeTab(v);};
  const [target,setTarget]=useState<{marketId:number;direction:BorosDirection;entry?:EntrySelection;draft?:PreviewDraft}|undefined>();
  const inspect=(marketId:number,direction:BorosDirection='long',draft?:PreviewDraft)=>{setTarget({marketId,direction,draft});setTab('sim');};

  // automatic retry after an error (temporary rate limit — no user action needed)
  useEffect(() => {
    if (error) retryBorosSoon(15_000);
  }, [error]);

  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[]);
  const activeIds=markets.filter(m=>m.maturity*1000>now&&m.isUiWhitelisted&&m.status==='GOOD').map(m=>m.marketId).join(',');
  const activeMarkets = useMemo(() => markets.filter((m) => m.maturity * 1000 > Date.now() && m.isUiWhitelisted && m.status==='GOOD'), [markets,activeIds]);
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
        {tab !== 'account' && loading && markets.length === 0 && <PageSkeleton />}
        {tab !== 'account' && error && markets.length === 0 && <ErrorState message="ارتباط با سرویس بوروس برقرار نشد" onRetry={() => void loadBoros()} />}
        <section hidden={tab!=='opp'} aria-label="بخش بازارها"><EntryRecommendations markets={activeMarkets} active={tab==='opp'} onAccount={()=>setTab('account')} onInspect={inspect} onSelect={entry=>{setTarget({marketId:entry.marketId,direction:entry.direction,entry});setTab('sim');}}/></section>
        {visited.sim&&<section hidden={tab!=='sim'} aria-label="بخش پیش‌نمایش"><SimulatorTab markets={activeMarkets} initial={target} active={tab==='sim'} onMarkets={()=>setTab('opp')}/></section>}
        {visited.account&&<section hidden={tab!=='account'} aria-label="بخش حساب من"><AccountTab markets={markets} active={tab==='account'}/></section>}
        <Disclosure summary="راهنمای بوروس"><BorosGuide/></Disclosure>
      </div>
    </div>
    </Page>
  );
}
