import { FUNDING_TABS, SectionTabs } from '@/shared/components/layout/SectionTabs';
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
import { BarChart3, Calculator, RefreshCw, Wallet } from 'lucide-react';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { Button } from '@/shared/components/ui/Button';
import { PageSkeleton } from '@/shared/components/ui/Skeleton';
import { ErrorState, Notice } from '@/shared/components/ui/StateViews';
import { FreshnessBar } from '@/shared/components/ui/FreshnessBar';
import { Surface } from '@/shared/components/ui/GlassCard';
import { cn } from '@/shared/lib/cn';
import { useBoros, loadBoros, resetBorosLoad, retryBorosSoon } from '@/features/boros/data/useBoros';
import { toFaDigits } from '@/shared/utils/formatters';
import { SimulatorTab } from './SimulatorTab';
import { AccountTab } from './AccountTab';
import { BorosGuide } from './BorosGuide';
import type { BorosDirection } from '../domain/types';

type Tab = 'opp' | 'sim' | 'account';
const TABS: { value: Tab; label: string; desc: string; icon: typeof BarChart3 }[] = [
  { value: 'opp', label: 'بازارها', desc: 'فرصت‌های فعال نرخ ثابت بوروس', icon: BarChart3 },
  { value: 'sim', label: 'پیش‌نمایش ورود', desc: 'شبیه‌سازی سود، مارجین و لیکویید', icon: Calculator },
  { value: 'account', label: 'حساب من', desc: 'پوزیشن‌ها و وضعیت ریسک حساب', icon: Wallet }
];

export default function BorosDashboard() {
  const { markets, loading, error, stale, syncProgress, loadedAt } = useBoros();
  const [tab, changeTab] = useState<Tab>('opp');
  const [visited, setVisited] = useState({ opp: true, sim: false, account: false });
  const setTab = (v: Tab) => {
    setVisited((s) => ({ ...s, [v]: true }));
    changeTab(v);
  };
  const [target, setTarget] = useState<{ marketId: number; direction: BorosDirection; entry?: EntrySelection; draft?: PreviewDraft } | undefined>();
  const inspect = (marketId: number, direction: BorosDirection = 'long', draft?: PreviewDraft) => {
    setTarget({ marketId, direction, draft });
    setTab('sim');
  };

  // automatic retry after an error (temporary rate limit — no user action needed)
  useEffect(() => {
    if (error) retryBorosSoon(15_000);
  }, [error]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const activeIds = markets
    .filter((m) => m.maturity * 1000 > now && m.isUiWhitelisted && m.status === 'GOOD')
    .map((m) => m.marketId)
    .join(',');
  const activeMarkets = useMemo(
    () => markets.filter((m) => m.maturity * 1000 > Date.now() && m.isUiWhitelisted && m.status === 'GOOD'),
    [markets, activeIds]
  );
  const reload = () => {
    resetBorosLoad();
    void loadBoros();
  };

  const header = (
    <PageHeader
      eyebrow="Pendle Boros · بازار نرخ ثابت فاندینگ"
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
        <SectionTabs tabs={FUNDING_TABS} label="بخش‌های درآمد فاندینگ" />

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
          <Surface className="flex items-center gap-3 px-4 py-3 text-xs text-muted" role="status">
            <span className="shrink-0 font-medium">
              تاریخچه نرخ {toFaDigits(syncProgress.done)}/{toFaDigits(syncProgress.total)}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-slow"
                style={{ width: `${(syncProgress.done / Math.max(1, syncProgress.total)) * 100}%` }}
              />
            </div>
          </Surface>
        )}

        <Surface className="relative overflow-hidden p-3.5 md:p-4">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-l from-accent/80 via-gain/60 to-transparent"
          />
          <div className="grid gap-2 sm:grid-cols-3" role="tablist" aria-label="بخش‌های بوروس">
            {TABS.map(({ value, label, desc, icon: Icon }) => {
              const active = tab === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(value)}
                  className={cn(
                    'flex items-start gap-2.5 rounded-xl border p-3 text-start transition-all duration-150',
                    active
                      ? 'border-accent/45 bg-accent/[0.06] shadow-sm'
                      : 'border-divider/70 bg-card hover:border-divider-strong hover:bg-surface-2/50'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                      active ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className={cn('flex items-center gap-1.5 text-xs font-bold', active ? 'text-accent' : 'text-ink')}>
                      {label}
                      {value === 'opp' && activeMarkets.length > 0 && (
                        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted tabular-nums">
                          {toFaDigits(activeMarkets.length)}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block line-clamp-1 text-[11px] text-muted">{desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Surface>

        <div className="space-y-6">
          {tab !== 'account' && loading && markets.length === 0 && <PageSkeleton />}
          {tab !== 'account' && error && markets.length === 0 && <ErrorState message="ارتباط با سرویس بوروس برقرار نشد" onRetry={() => void loadBoros()} />}
          <section hidden={tab !== 'opp'} aria-label="بخش بازارها">
            <EntryRecommendations
              markets={activeMarkets}
              active={tab === 'opp'}
              onAccount={() => setTab('account')}
              onInspect={inspect}
              onSelect={(entry) => {
                setTarget({ marketId: entry.marketId, direction: entry.direction, entry });
                setTab('sim');
              }}
            />
          </section>
          {visited.sim && (
            <section hidden={tab !== 'sim'} aria-label="بخش پیش‌نمایش">
              <SimulatorTab markets={activeMarkets} initial={target} active={tab === 'sim'} onMarkets={() => setTab('opp')} />
            </section>
          )}
          {visited.account && (
            <section hidden={tab !== 'account'} aria-label="بخش حساب من">
              <AccountTab markets={markets} active={tab === 'account'} />
            </section>
          )}
          <Disclosure summary="راهنمای بوروس">
            <BorosGuide />
          </Disclosure>
        </div>
      </div>
    </Page>
  );
}
