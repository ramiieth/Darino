/**
 * ژورنال معاملاتی — کاملاً خودکار و بدون نیاز به نوشتن دستی:
 * معاملات پرپ، استاپ و هدف صرافی، و سواپ‌های اسپات کیف پول به‌صورت خودکار خوانده و تحلیل می‌شوند.
 */
import { useCallback, useMemo } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { CalendarCheck, ClipboardList, Coins, ListChecks, Scale, Settings2, Sparkles, Zap } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { VENUE_FA } from '../domain/types';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { ChipGroup, SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Surface } from '@/shared/components/ui/GlassCard';
import { EmptyState, ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { Button } from '@/shared/components/ui/Button';
import { usePublishInsight } from '@/shared/assistant/insights';
import { RANGE_FA, useJournal, type RangeKey } from '../data/useJournal';
import { useSpot } from '../data/useSpot';
import { AuditTab } from './AuditTab';
import { TradesTab } from './TradesTab';
import { PlanTab } from './PlanTab';
import { ReviewTab } from './ReviewTab';
import { SettingsTab } from './SettingsTab';
import { SpotTab } from './SpotTab';
import { useLiveEquity } from './NeutralLedger';
import { fa } from './parts';

type Tab = 'audit' | 'trades' | 'plan' | 'review' | 'settings';
const TABS: Tab[] = ['audit', 'trades', 'plan', 'review', 'settings'];
type TradesView = 'perp' | 'spot';
const RANGES: RangeKey[] = ['30', '90', '180', 'all'];

const TAB_ITEMS: { value: Tab; label: string; desc: string; icon: typeof Scale }[] = [
  { value: 'audit', label: 'گزارش و کارنامه', desc: 'سود، ضرر و علت‌ها به زبان ساده', icon: Scale },
  { value: 'trades', label: 'معاملات', desc: 'فهرست خودکار پرپ و اسپات', icon: ListChecks },
  { value: 'plan', label: 'برنامه خودکار', desc: 'حد ضرر، هدف و نظم معاملات', icon: ClipboardList },
  { value: 'review', label: 'مرور هفتگی', desc: 'جمع‌بندی هوشمند هر هفته', icon: CalendarCheck },
  { value: 'settings', label: 'تنظیمات', desc: 'حساب‌ها و سقف ریسک', icon: Settings2 }
];

export default function JournalPage() {
  const [params] = useSearchParams();
  if (params.get('tab') === 'neutral') {
    const next = new URLSearchParams(params);
    next.set('tab', params.get('pv') ? 'run' : 'ledger');
    return <Navigate to={`/funding?${next}`} replace />;
  }
  return <JournalView />;
}

function JournalView() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = raw === 'spot' ? 'trades' : raw && (TABS as string[]).includes(raw) ? (raw as Tab) : 'audit';
  const tradesView: TradesView = raw === 'spot' || params.get('view') === 'spot' ? 'spot' : 'perp';
  const range = (RANGES.includes(params.get('range') as RangeKey) ? params.get('range') : '90') as RangeKey;
  const update = useCallback(
    (patch: Record<string, string | null>) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          for (const [k, v] of Object.entries(patch)) v === null ? next.delete(k) : next.set(k, v);
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );

  const liveEquity = useLiveEquity();
  const j = useJournal(range, liveEquity);
  const spotFrom = useMemo(() => Math.floor(Date.now() / 3_600_000) * 3_600_000 - Number(range === 'all' ? 0 : range) * 86_400_000, [range]);
  const spot = useSpot(range === 'all' ? 0 : spotFrom);
  const a = j.audit;
  const d = a?.directional;

  usePublishInsight(
    'journalAudit',
    'حسابرسی دفتر جهت‌دار',
    d
      ? {
          trades: d.core.n,
          netPnl: d.core.netPnl,
          winRatePct: d.core.winRateDecisive,
          payoff: d.core.payoff,
          profitFactor: d.core.profitFactor === Infinity ? null : d.core.profitFactor,
          expectancy: d.core.expectancy,
          maxDrawdownUsd: d.core.maxDrawdown,
          maxDrawdownPct: d.core.maxDrawdownPct,
          feeDragPct: d.core.feeDragPct,
          tradesPerActiveDay: d.core.tradesPerActiveDay,
          avgR: d.core.avgR,
          riskPctAvg: d.core.riskPctAvg,
          openPositions: d.open.length,
          rangeDays: range === 'all' ? null : Number(range)
        }
      : null,
    'api',
    'ready',
    undefined,
    `journal:${range}`
  );
  usePublishInsight(
    'journalLeaks',
    'نشتی‌های رتبه‌بندی‌شده (هزینهٔ دلاری)',
    d ? Object.fromEntries(d.behavior.leaks.slice(0, 8).map((l, i) => [`leak${i + 1}Cost`, l.cost])) : null,
    'api',
    'ready'
  );
  usePublishInsight(
    'journalNeutral',
    'دفتر دلتا نوترال و فارم',
    a
      ? {
          volumeUsd: a.neutral.totals.volume,
          fundingUsd: a.neutral.totals.funding,
          feesUsd: a.neutral.totals.fees,
          netUsd: a.neutral.totals.net,
          costPerMillion: a.neutral.totals.costPerMillion,
          hedges: a.neutral.hedges.length
        }
      : null,
    'api',
    'ready'
  );

  const prefill = useMemo(() => {
    const m = params.get('m');
    if (tab !== 'plan' || !m) return null;
    return {
      symbol: m.toUpperCase().slice(0, 20),
      direction: params.get('side') === 'short' ? ('short' as const) : ('long' as const),
      leverage: Number(params.get('lev')) || null
    };
  }, [params, tab]);
  const clearPrefill = useCallback(() => update({ m: null, side: null, lev: null }), [update]);

  const directionalTrades = a ? a.all : [];
  const noAccounts = !j.accounts.length;
  const empty = (
    <EmptyState
      message={noAccounts ? 'هنوز حسابی وصل نیست' : 'معامله‌ای در این بازه پیدا نشد'}
      hint={noAccounts ? 'کیف پول یا حساب صرافی خودت را وصل کن تا همه معاملاتت خودکار اینجا ثبت و تحلیل شوند.' : 'بازه زمانی را روی «همه» بگذار یا حساب‌های متصل را بررسی کن.'}
      action={
        noAccounts ? (
          <Link to="/wallets">
            <Button size="sm">اتصال کیف پول و حساب</Button>
          </Link>
        ) : (
          <Button size="sm" variant="outline" onClick={() => update({ range: 'all' })}>
            نمایش همهٔ زمان‌ها
          </Button>
        )
      }
    />
  );

  return (
    <Page>
      <PageHeader
        eyebrow="ثبت و تحلیل ۱۰۰٪ خودکار · بدون نیاز به نوشتن دستی"
        title="ژورنال معاملاتی"
        subtitle="همه معاملاتت خودکار از صرافی و کیف پول خوانده می‌شوند و به زبان ساده می‌بینی کجا سود کردی و کجا ضرر."
      />

      <Sources histories={j.histories} />

      {/* نوار تب‌های مدرن و آیکون‌دار */}
      <Surface className="relative overflow-hidden p-3 md:p-3.5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-l from-accent via-gain/70 to-transparent"
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="tablist" aria-label="بخش‌های ژورنال">
          {TAB_ITEMS.map(({ value, label, desc, icon: Icon }) => {
            const active = tab === value;
            const badge =
              value === 'trades' && directionalTrades.length > 0
                ? directionalTrades.length
                : value === 'plan' && a?.all.filter((t) => t.open).length
                  ? a.all.filter((t) => t.open).length
                  : null;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => update({ tab: value === 'audit' ? null : value, view: null })}
                className={cn(
                  'flex items-start gap-2.5 rounded-xl border p-2.5 text-start transition-all duration-150',
                  active
                    ? 'border-accent/45 bg-accent/[0.07] shadow-sm'
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
                <span className="min-w-0 flex-1">
                  <span className={cn('flex items-center gap-1.5 text-xs font-bold', active ? 'text-accent' : 'text-ink')}>
                    <span className="truncate">{label}</span>
                    {badge !== null && (
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                          active ? 'bg-accent/15 text-accent' : 'bg-surface-2 text-muted'
                        )}
                      >
                        {fa(badge)}
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

      <div className="mt-4 space-y-4" role="tabpanel">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {tab === 'trades' && (
            <SegmentedControl<TradesView>
              label="نوع معاملات"
              value={tradesView}
              onChange={(v) => update({ tab: 'trades', view: v === 'perp' ? null : v })}
              options={[
                { value: 'perp', label: 'معاملات صرافی (پرپ)', icon: <ListChecks /> },
                { value: 'spot', label: 'سواپ کیف پول (اسپات)', icon: <Coins /> }
              ]}
            />
          )}
          {(tab === 'audit' || (tab === 'trades' && tradesView === 'spot')) && (
            <ChipGroup
              label="بازهٔ زمانی"
              value={range}
              onChange={(v) => update({ range: v === '90' ? null : v })}
              options={RANGES.map((r) => ({ value: r, label: RANGE_FA[r] }))}
            />
          )}
        </div>

        {j.histories.some((h) => h.status === 'error') && tab !== 'settings' && (
          <Notice tone="warn" title="اطلاعات برخی حساب‌ها موقتاً دریافت نشد">
            {j.histories
              .filter((h) => h.status === 'error')
              .map((h) => h.account.label)
              .join('، ')}{' '}
            ·{' '}
            <button type="button" className="font-semibold underline" onClick={j.refetch}>
              تلاش دوباره
            </button>
          </Notice>
        )}

        {!a ? (
          <ListSkeleton rows={6} />
        ) : (
          <>
            {j.loading && tab !== 'settings' && (
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Sparkles className="h-3.5 w-3.5 animate-pulse text-accent" aria-hidden />
                در حال دریافت خودکار معاملات از {fa(j.histories.filter((h) => h.status === 'loading').length)} حساب…
              </p>
            )}
            {tab === 'audit' && d && (
              <AuditTab
                a={d}
                fallbackAudit={a.allPerp}
                spotBook={spot.book}
                outsideRangeCount={a.directionalOutsideRange}
                onShowAllRange={() => update({ range: 'all' })}
                empty={empty}
                tz={j.tz}
                settings={j.data.settings}
                reviews={j.data.reviews}
              />
            )}
            {tab === 'trades' && tradesView === 'perp' && (
              <TradesTab trades={directionalTrades} notes={a.notes} links={a.links} auto={a.auto} settings={j.data.settings} />
            )}
            {tab === 'plan' && (
              <PlanTab
                plans={j.data.plans}
                trades={a.all}
                links={a.links}
                auto={a.auto}
                settings={j.data.settings}
                accounts={j.accounts}
                accountSize={j.accountSize}
                spotBook={spot.book}
                prefill={prefill}
                onPrefillUsed={clearPrefill}
              />
            )}
            {tab === 'trades' && tradesView === 'spot' && <SpotTab from={range === 'all' ? 0 : spotFrom} />}
            {tab === 'review' && (
              <ReviewTab
                trades={a.all.filter((t) => t.book === 'directional' && !t.open && !t.truncated)}
                notes={a.notes}
                links={a.links}
                auto={a.auto}
                reviews={j.data.reviews}
                settings={j.data.settings}
                tz={j.tz}
                accountSize={j.accountSize}
              />
            )}
            {tab === 'settings' && (
              <SettingsTab
                settings={j.data.settings}
                accounts={j.accounts}
                histories={j.histories}
                liveEquity={liveEquity}
                onRefetch={j.refetch}
              />
            )}
          </>
        )}
      </div>
    </Page>
  );
}

/** منبع‌های خودکار ژورنال: هر حساب با وضعیت همگام‌سازی — تایپی در کار نیست */
function Sources({ histories }: { histories: ReturnType<typeof useJournal>['histories'] }) {
  if (!histories.length) return null;
  return (
    <div className="no-scrollbar -mx-1 mb-3 flex items-center gap-2 overflow-x-auto px-1 pb-1">
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">
        <Zap className="h-3.5 w-3.5" aria-hidden />
        دریافت خودکار از
      </span>
      {histories.map((h) => (
        <span
          key={h.account.key}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-divider/80 bg-card px-2.5 py-1 text-[11px] shadow-xs"
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              h.status === 'ready' ? 'bg-gain' : h.status === 'error' ? 'bg-negative' : 'animate-pulse bg-warn'
            )}
            aria-hidden
          />
          <span className="font-semibold text-ink">{VENUE_FA[h.account.venue]}</span>
          <span className="max-w-[9rem] truncate text-subtle">{h.account.label}</span>
          {h.history && <span className="text-subtle">· {fa(h.history.orders.length)} سفارش حد ضرر/سود</span>}
        </span>
      ))}
    </div>
  );
}
