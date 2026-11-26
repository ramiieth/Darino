import { ZerionQuotaStatus } from './ZerionQuotaStatus';
import { CostSummaryPanel } from '@/features/cost-basis/presentation/CostSummaryPanel';
import { NetworkPicker } from './NetworkPicker';
import { AssetValue } from './AssetValue';
import { WalletBalanceChart } from './WalletBalanceChart';
import { useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { Link, useSearchParams } from 'react-router-dom';
import { TransferReview } from './TransferReview';
import { zerionRetryAt, refreshTransactions } from '../data/store';
import { RefreshCw, Wallet, Sparkles, ArrowLeft, Layers, Activity as ActivityIcon, Coins, ChevronDown, TrendingUp } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { Button, buttonClass } from '@/shared/components/ui/Button';
import { PositionsList } from './PositionsList';
import { ActivityExplorer } from './ActivityExplorer';
import { ActivityList } from './ActivityList';
import { ProtocolBadge } from './ProtocolBadge';
import { tokenName } from './identity';
import { visiblePositions, visibleTransaction } from '../domain/visibility';
import { useActivity } from '../data/useActivity';
import type { ConnectedPortfolio } from '../data/useConnectedPortfolio';
import type { LivePosition } from '../domain/model';
import { usePlatformPerpVenues } from '@/features/perps/data/usePerpVenues';
import { perpInNetWorth } from '@/features/perps/domain/perpPortfolio';
import { toFaDigits } from '@/shared/utils/formatters';

const ALLOC_COLORS = ['bg-accent', 'bg-gain', 'bg-chart-3', 'bg-gold', 'bg-chart-4', 'bg-divider-strong'] as const;

export function PortfolioSummary({ portfolio: p }: { portfolio: ConnectedPortfolio }) {
  const [syncOpen, setSyncOpen] = useState(false);
  const platformVenues = usePlatformPerpVenues();
  const [params, setParams] = useSearchParams();
  const tab = params.get('view') === 'activity' ? 'activity' : 'assets';
  const setTab = (value: 'assets' | 'activity') =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value === 'activity') next.set('view', 'activity');
        else next.delete('view');
        return next;
      },
      { replace: true, preventScrollReset: true }
    );
  const [network, setNetwork] = useState('all');
  const [group, setGroup] = useState<'token' | 'platform'>('token');
  const activity = useActivity(p);
  const chains = [...new Map(p.wallets.flatMap((w) => w.state?.data?.chains ?? []).map((c) => [c.id, c])).values()];
  const grouped = new Map<string, LivePosition>();
  for (const w of p.wallets) {
    for (const position of visiblePositions(w.state?.data?.positions ?? [])) {
      const id = position.type === 'wallet' ? `${position.chain}:${position.contract ?? position.tokenId}` : `${w.holding.id}:${position.id}`;
      const old = grouped.get(id);
      grouped.set(
        id,
        old
          ? {
              ...old,
              quantity: new Decimal(old.quantity ?? 0).plus(position.quantity ?? 0).toString(),
              value: old.value === null || position.value === null ? null : new Decimal(old.value).plus(position.value).toNumber()
            }
          : { ...position, id }
      );
    }
  }
  const positions = [...grouped.values()];
  const networks = [...new Set(positions.map((x) => x.chain))];
  const isUnsupportedSolana = (addr: string | null | undefined, msg: string | null | undefined) =>
    !!addr && !addr.startsWith('0x') && !/^bc1/i.test(addr) && !!msg && msg.includes('پشتیبانی نمی‌شود');
  // کدام کیف پول و چرا ناقص است — خطای ۴۰۰ عدم پشتیبانی زریون برای برخی آدرس‌های سولانا باعث نمایش هشدار کاذب روی کل داشبورد نمی‌شود
  const incomplete = p.wallets.flatMap((w) => {
    const st = w.state;
    if (!st) return [];
    if (!st.data) {
      if (isUnsupportedSolana(w.holding.address, st.error)) return [];
      return st.error && !st.loading ? [`${w.holding.label}: ${st.error}`] : [];
    }
    if (st.data.complete || isUnsupportedSolana(w.holding.address, st.data.detailsError)) return [];
    return [`${w.holding.label}: ${st.data.detailsError ?? 'فهرست دارایی‌ها کامل خوانده نشد'}`];
  });
  const snapshot = {
    address: '',
    fetchedAt: Date.now(),
    total: p.total,
    change: null,
    positions: positions.filter((x) => network === 'all' || x.chain === network),
    chains,
    complete: incomplete.length === 0,
    detailsError: incomplete.length ? `جزئیات بعضی کیف پول‌ها کامل نیست — ${incomplete.join(' · ')}` : undefined,
    unpriced: 0
  };
  const walletValue = p.wallets.some((w) => w.value !== null)
    ? p.wallets.reduce((s, w) => s.plus(w.value ?? 0), new Decimal(0)).toNumber()
    : null;
  const realArcus = p.arcus.filter((s) => s.holding.arcus!.env === 'mainnet');
  const arcusValue = realArcus.some((s) => s.value !== null)
    ? realArcus.reduce((s, a) => s.plus(a.value ?? 0), new Decimal(0)).toNumber()
    : null;
  // لایتر (رابین‌هود/اصلی)، هایپرلیکوئید، تی‌اکس‌فلو، اوندو: ارزش حساب جزو ارزش کل (آرکوس از قبل در p.total)
  const perp = perpInNetWorth(
    platformVenues,
    p.wallets.map((w) => ({
      address: w.holding.address ?? '',
      protocols: (w.state?.data?.positions ?? []).map((x) => x.protocol)
    }))
  );
  const total = p.total === null && perp.equity === null ? null : new Decimal(p.total ?? 0).plus(perp.equity ?? 0).toNumber();
  // آرکوس + بقیهٔ پلتفرم‌ها در یک ردیف «حساب‌های پرپچوال»
  const perpCount = realArcus.length + perp.accounts.length;
  const perpValue = arcusValue === null && perp.equity === null ? null : new Decimal(arcusValue ?? 0).plus(perp.equity ?? 0).toNumber();
  const perpPartial = perp.partial || realArcus.some((a) => a.value === null);
  const filteredActivity = activity.rows.filter((r) => (network === 'all' || r.tx?.chain === network) && (!r.tx || visibleTransaction(r.tx)));
  const walletError = p.wallets
    .map((w) => {
      const msg = w.state?.error ?? w.state?.data?.detailsError;
      return isUnsupportedSolana(w.holding.address, msg) ? undefined : msg;
    })
    .find(Boolean);
  const activityError = p.wallets
    .map((w) => {
      const msg = w.state?.historyError;
      return isUnsupportedSolana(w.holding.address, msg) ? undefined : msg;
    })
    .find(Boolean);
  const activityBusy = p.wallets.some((w) => !w.state?.historyLoaded && !w.state?.historyError);
  const platformGroups = new Map<string, LivePosition[]>();
  for (const position of snapshot.positions) {
    const id = position.type === 'wallet' ? 'wallet' : position.protocol ?? position.type;
    platformGroups.set(id, [...(platformGroups.get(id) ?? []), position]);
  }

  // نوار تخصیص ۵ دارایی برتر پرتفولیو (مثل Zerion / DeBank)
  const allocation = useMemo(() => {
    const bySymbol = new Map<string, { label: string; value: number }>();
    let sum = 0;
    for (const pos of positions) {
      if (pos.value === null || pos.value <= 0) continue;
      const key = (pos.symbol || pos.name || pos.id).toUpperCase();
      const prev = bySymbol.get(key);
      bySymbol.set(key, { label: tokenName(pos.symbol, pos.name), value: (prev?.value ?? 0) + pos.value });
      sum += pos.value;
    }
    if (sum <= 0) return [];
    const sorted = [...bySymbol.values()].sort((a, b) => b.value - a.value);
    const top5 = sorted.slice(0, 5);
    const rest = sorted.slice(5).reduce((acc, x) => acc + x.value, 0);
    const items = rest > 0 ? [...top5, { label: 'سایر', value: rest }] : top5;
    return items.map((item, idx) => ({
      ...item,
      pct: (item.value / sum) * 100,
      color: ALLOC_COLORS[idx % ALLOC_COLORS.length]
    }));
  }, [positions]);

  const walletSharePct = total && total > 0 && walletValue !== null ? Math.min(100, Math.max(0, (walletValue / total) * 100)) : null;
  const perpSharePct = total && total > 0 && perpValue !== null ? Math.min(100, Math.max(0, (perpValue / total) * 100)) : null;

  return (
    <>
      <Surface
        variant="focal"
        className="native-portfolio-hero relative overflow-hidden p-5 md:p-7"
      >
        {/* نوار گرادینت پرمیوم و هاله‌های نوری ملایم */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-l from-accent via-chart-3 to-gain"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -end-20 -top-20 h-56 w-56 rounded-full bg-accent/[0.08] blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 start-10 h-44 w-44 rounded-full bg-gain/[0.07] blur-3xl"
        />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 max-w-full items-center gap-3.5 md:gap-5">
            <span className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/18 via-accent/8 to-gain/10 text-accent shadow-sm sm:flex md:h-16 md:w-16">
              <Layers className="h-7 w-7 md:h-8 md:w-8" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-muted md:text-sm">ارزش دارایی‌های متصل</p>
                {p.wallets.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-2/90 px-2.5 py-0.5 text-[11px] font-semibold text-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-positive" aria-hidden />
                    {toFaDigits(p.wallets.length)} کیف پول
                  </span>
                )}
              </div>
              <AssetValue
                value={total}
                stale={p.stale}
                inline
                className="mt-1.5"
                primaryClassName="text-3xl font-extrabold tracking-tight md:text-5xl"
              />
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            aria-label="به‌روزرسانی پرتفولیو"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            loading={p.loading}
            onClick={() => void p.refresh()}
            className="bg-card/85 backdrop-blur-sm"
          >
            به‌روزرسانی
          </Button>
        </div>

        {/* نوار تخصیص رنگی ۵ دارایی بزرگ پرتفولیو */}
        {allocation.length > 1 && (
          <div className="relative mt-5 space-y-2">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2/90" dir="ltr">
              {allocation.map((seg) => (
                <div
                  key={seg.label}
                  className={`${seg.color} h-full transition-all duration-300 first:rounded-s-full last:rounded-e-full`}
                  style={{ width: `${Math.max(seg.pct, 1.5)}%` }}
                  title={`${seg.label}: ${toFaDigits(seg.pct.toFixed(1))}٪`}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-muted">
              {allocation.map((seg) => (
                <span key={seg.label} className="inline-flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${seg.color}`} aria-hidden />
                  <span className="font-semibold text-ink">{seg.label}</span>
                  <span className="tabular-nums">{toFaDigits(seg.pct.toFixed(1))}٪</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-divider/80 pt-4">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-divider/80 bg-surface-2/65 px-3 py-2 text-muted">
              <Wallet className="h-3.5 w-3.5 text-accent" aria-hidden />
              <span>کیف پول‌ها</span>
              <MoneyValue value={walletValue} className="font-extrabold text-ink" />
              {walletSharePct !== null && (
                <span className="rounded-full bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted tabular-nums">
                  {toFaDigits(Math.round(walletSharePct))}٪
                </span>
              )}
            </span>
            {perpCount > 0 && (
              <span
                className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-divider/80 bg-surface-2/65 px-3 py-2 text-muted"
                title={[...realArcus.map((a) => a.holding.label), ...perp.accounts.map((a) => a.label)].join('، ')}
              >
                <TrendingUp className="h-3.5 w-3.5 text-positive" aria-hidden />
                <span>حساب‌های پرپچوال ({toFaDigits(perpCount)})</span>
                <MoneyValue value={perpValue} className="font-extrabold text-ink" />
                {perpSharePct !== null && (
                  <span className="rounded-full bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted tabular-nums">
                    {toFaDigits(Math.round(perpSharePct))}٪
                  </span>
                )}
                {perpPartial && <span className="rounded-full bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold text-warn">ناقص</span>}
              </span>
            )}
          </div>
          <nav aria-label="دسترسی‌های پرتفولیو" className="flex flex-wrap gap-2">
            <Link to="/wallets" className={`${buttonClass('outline', 'sm')} bg-card/85 transition-colors hover:border-accent/40`}>
              <Wallet className="h-3.5 w-3.5" />
              مدیریت کیف پول‌ها
            </Link>
            <Link
              to="/assistant"
              className={`${buttonClass('outline', 'sm')} border-accent/30 bg-accent/10 text-accent transition-colors hover:bg-accent/15`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              دستیار هوشمند
            </Link>
          </nav>
        </div>
      </Surface>

      {(p.stale || p.partial || walletError) && (
        <details
          onToggle={(e) => setSyncOpen(e.currentTarget.open)}
          className="group rounded-xl border border-divider bg-card/90 px-4 py-3 text-xs transition-colors hover:border-divider-strong"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium text-muted">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-warn" aria-hidden />
              {p.total === null
                ? 'در انتظار دریافت موجودی'
                : p.partial
                  ? 'برخی موجودی‌ها هنوز دریافت نشده‌اند'
                  : 'وضعیت همگام‌سازی'}
            </span>
            <ChevronDown className="h-4 w-4 text-subtle transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="mt-3 space-y-2 border-t border-divider/70 pt-3 leading-6" role="status">
            {syncOpen && <ZerionQuotaStatus refreshKey={p.loading} />}
            {walletError && <p className="text-warn">{walletError}</p>}
            {zerionRetryAt() && <p>تلاش بعدی: {new Date(zerionRetryAt()!).toLocaleString('fa-IR')}</p>}
            {p.wallets.map((w) => (
              <p key={w.holding.id}>
                {w.holding.label} ·{' '}
                {w.state?.data
                  ? `آخرین دریافت: ${new Date(w.state.data.fetchedAt).toLocaleString('fa-IR')}`
                  : 'موجودی هنوز دریافت نشده است'}
              </p>
            ))}
            {p.partial && <p>مجموع فقط شامل موجودی‌های دریافت‌شده و قیمت‌گذاری‌شده است.</p>}
          </div>
        </details>
      )}

      {!p.wallets.length && !p.arcus.length && !perp.accounts.length && (
        <Notice>یک کیف پول یا حساب آرکوس اضافه کنید.</Notice>
      )}

      <section aria-label="پرتفولیو" id="portfolio-assets" className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-divider pb-3">
          <div role="tablist" aria-label="نمای پرتفولیو" className="flex items-center gap-1.5 rounded-xl bg-surface-2/75 p-1">
            {(
              [
                ['assets', 'دارایی‌ها', Coins, snapshot.positions.length],
                ['activity', 'تراکنش‌ها', ActivityIcon, filteredActivity.length]
              ] as const
            ).map(([id, label, Icon, count]) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`portfolio-tab-${id}`}
                  aria-selected={active}
                  aria-controls={`portfolio-panel-${id}`}
                  tabIndex={active ? 0 : -1}
                  onKeyDown={(e) => {
                    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                      e.preventDefault();
                      const next = e.key === 'Home' ? 'assets' : e.key === 'End' ? 'activity' : tab === 'assets' ? 'activity' : 'assets';
                      setTab(next);
                      document.getElementById('portfolio-tab-' + next)?.focus();
                    }
                  }}
                  onClick={() => setTab(id)}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-all duration-150 ${
                    active
                      ? 'bg-card text-accent shadow-sm ring-1 ring-divider/80'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span>{label}</span>
                  {count > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                        active ? 'bg-accent/10 text-accent' : 'bg-card/70 text-muted'
                      }`}
                    >
                      {toFaDigits(count)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="w-full sm:w-56">
            <NetworkPicker value={network} onChange={setNetwork} chains={chains} ids={networks} />
          </div>
        </div>

        <div role="tabpanel" id={`portfolio-panel-${tab}`} aria-labelledby={`portfolio-tab-${tab}`}>
          {tab === 'assets' ? (
            <div className="portfolio-dashboard-grid grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
              <Surface className="min-w-0 p-4 md:p-5">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2.5 text-base font-bold">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-accent/15 bg-accent/10 text-accent">
                      <Wallet className="h-4 w-4" aria-hidden />
                    </span>
                    دارایی‌های کیف پول
                  </h2>
                  <div className="flex rounded-xl bg-surface-2/80 p-1" role="group" aria-label="گروه‌بندی دارایی‌ها">
                    {(
                      [
                        ['token', 'بر اساس توکن'],
                        ['platform', 'بر اساس پلتفرم']
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={group === id}
                        onClick={() => setGroup(id)}
                        className={`min-h-9 rounded-lg px-3 text-[11px] font-semibold transition-all duration-150 ${
                          group === id
                            ? 'bg-card text-ink shadow-sm ring-1 ring-divider/70'
                            : 'text-muted hover:text-ink'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <WalletBalanceChart portfolio={p} network={network} />
                {group === 'token' ? (
                  <PositionsList data={snapshot} groupByToken />
                ) : platformGroups.size ? (
                  [...platformGroups].map(([id, rows]) => (
                    <section key={id} className="mb-5 last:mb-0">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2/60 px-3 py-2.5">
                        <h3 className="text-sm font-semibold">
                          {id === 'wallet' ? (
                            'کیف پول'
                          ) : rows[0].protocol ? (
                            <ProtocolBadge name={rows[0].protocol} logo={rows[0].protocolIcon} size={22} />
                          ) : (
                            'پوزیشن‌های شبکه‌ای'
                          )}
                        </h3>
                        <AssetValue
                          value={
                            rows.some((r) => r.value === null)
                              ? null
                              : rows.reduce((sum, r) => sum.plus(r.value ?? 0), new Decimal(0)).toNumber()
                          }
                          className="text-end"
                          primaryClassName="text-xs font-bold"
                        />
                      </div>
                      <PositionsList data={{ ...snapshot, positions: rows }} groupByToken />
                    </section>
                  ))
                ) : (
                  <PositionsList data={snapshot} />
                )}
              </Surface>

              <Surface as="aside" aria-labelledby="portfolio-recent-title" className="portfolio-recent min-w-0 p-4 md:p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 id="portfolio-recent-title" className="flex items-center gap-2 text-base font-bold">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10 text-accent">
                      <ActivityIcon className="h-4 w-4" aria-hidden />
                    </span>
                    فعالیت‌های اخیر
                  </h2>
                  {filteredActivity.length > 0 && (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted tabular-nums">
                      {toFaDigits(filteredActivity.length)}
                    </span>
                  )}
                </div>
                {filteredActivity.length ? (
                  <ActivityList
                    preview
                    rows={filteredActivity.slice(0, 5)}
                    links={activity.links}
                    addresses={p.wallets.map((w) => w.holding.address!)}
                    chains={chains}
                  />
                ) : (
                  <p className="py-6 text-xs leading-6 text-muted">
                    {activityError ?? (activityBusy ? 'در حال دریافت تراکنش‌ها…' : 'تراکنش قابل نمایش یافت نشد.')}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setTab('activity')}
                  className="group mt-4 flex min-h-11 w-full items-center justify-between rounded-xl border border-divider/80 bg-surface-2/70 px-3.5 text-xs font-semibold text-ink transition-all hover:border-accent/35 hover:bg-surface-2"
                >
                  <span>نمایش همهٔ تراکنش‌ها</span>
                  <ArrowLeft className="h-4 w-4 text-muted transition-transform group-hover:-translate-x-0.5 group-hover:text-accent" aria-hidden />
                </button>
              </Surface>
            </div>
          ) : (
            <>
              <ActivityExplorer
                rows={filteredActivity}
                links={activity.links}
                addresses={p.wallets.map((w) => w.holding.address!)}
                chains={chains}
              />
              {p.wallets.map((w) => (
                <div key={w.holding.id} className="mt-3 space-y-2">
                  {w.state?.historyError && <Notice tone="warn">{w.state.historyError}</Notice>}
                  {w.state?.next && (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={w.state.historyLoading}
                      onClick={() => void refreshTransactions(w.holding.address!, true)}
                    >
                      تراکنش‌های قدیمی‌تر · {w.holding.label}
                    </Button>
                  )}
                </div>
              ))}
              {p.arcus.map(
                (a) =>
                  (a.state?.history.transfers.error || a.state?.history.transfers.data?.complete === false) && (
                    <Notice key={a.holding.id} tone="warn">
                      تاریخچهٔ {a.holding.label} کامل دریافت نشده است.
                    </Notice>
                  )
              )}
              <div className="mt-5">
                <TransferReview activity={activity} chains={chains} />
              </div>
            </>
          )}
        </div>
      </section>

      {tab === 'assets' && <CostSummaryPanel portfolio={p} links={activity.links} />}
    </>
  );
}
