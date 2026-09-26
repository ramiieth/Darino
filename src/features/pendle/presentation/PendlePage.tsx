/**
 * Pendle — fixed-yield markets (view & analysis only; actions happen on Pendle)
 *   بازارها   all markets, filter by type / chain / search
 *   فرصت‌ها   ranked by a chosen metric with thresholds
 *   تحلیل     PT / YT / LP / after-cost / break-even / compare calculators
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, RefreshCw, Star, Trophy } from 'lucide-react';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Tabs, ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { Field, Input, SearchField, Select } from '@/shared/components/ui/Input';
import { Button, buttonClass } from '@/shared/components/ui/Button';
import { Badge, StatusDot } from '@/shared/components/ui/Badge';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { EmptyState, ErrorState, ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { AnalyticsTab } from './AnalyticsTab';
import { usePendleMarkets, usePendleRateStatus } from '@/features/pendle/data/usePendleMarkets';
import {
  PENDLE_SORT_LABELS,
  chainName,
  fmtExpiry,
  sortValue,
  type PendleMarketView,
  type PendleSortKey,
  type PendleMarketType
} from '@/features/pendle/domain/pendle';
import { useWatchlistStore } from '@/shared/store/watchlistStore';
import { useNow } from '@/shared/hooks/useNow';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

type PendleTab = 'markets' | 'opportunities' | 'analytics';

export function PendlePage() {
  const [tab, setTab] = useState<PendleTab>('markets');
  return (
    <Page>
      <PageHeader
        title="Pendle"
        subtitle="بازارهای بازده ثابت — PT، YT و LP. فقط مشاهده و تحلیل؛ اقدام‌ها در سایت رسمی Pendle انجام می‌شود."
        meta={<PendleStatus />}
        actions={
          <a
            href="https://docs.pendle.finance/pendle-v2-dev/Backend/ApiOverview"
            target="_blank"
            rel="noreferrer"
            className={buttonClass('ghost', 'sm')}
          >
            مستندات API
            <ExternalLink />
          </a>
        }
      />
      <div className="space-y-6">
        <Tabs<PendleTab>
          label="بخش‌های Pendle"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'markets', label: 'بازارها' },
            { value: 'opportunities', label: 'فرصت‌ها' },
            { value: 'analytics', label: 'تحلیل و ماشین‌حساب' }
          ]}
        />
        {tab === 'markets' ? <MarketsExplorer /> : tab === 'opportunities' ? <OpportunitiesExplorer /> : <AnalyticsTab />}
      </div>
    </Page>
  );
}

/** API quota — quiet unless it matters */
function PendleStatus() {
  const s = usePendleRateStatus();
  const pct = s.limit > 0 ? (s.remaining / s.limit) * 100 : 100;
  if (s.errors.length > 0)
    return <StatusDot tone="warn" label={`${toFaDigits(s.errors.length)} خطای اخیر API`} className="font-normal" />;
  if (pct < 20)
    return (
      <StatusDot
        tone="warn"
        label={`سهمیه API رو به اتمام (${toFaDigits(s.remaining)}/${toFaDigits(s.limit)})`}
        className="font-normal"
      />
    );
  return <StatusDot tone="gain" label="Pendle API متصل" className="font-normal" />;
}

/* ================= shared list ================= */

function MarketIcon({ m, size = 32 }: { m: PendleMarketView; size?: number }) {
  return m.icon ? (
    <img
      src={m.icon}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full bg-card object-contain ring-1 ring-divider"
      style={{ width: size, height: size }}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')}
    />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-2xs font-bold text-muted"
      style={{ width: size, height: size }}
    >
      {m.name.slice(0, 2)}
    </span>
  );
}

function Maturity({ m }: { m: PendleMarketView }) {
  return (
    <span>
      {fmtExpiry(m.expiry)}
      {m.daysToExpiry !== null && <span className="text-subtle"> · {toFaDigits(m.daysToExpiry)} روز</span>}
    </span>
  );
}

function PendleMarketList({ markets, highlight }: { markets: PendleMarketView[]; highlight?: PendleSortKey }) {
  const navigate = useNavigate();
  const watch = useWatchlistStore((s) => s.items);
  const toggle = useWatchlistStore((s) => s.toggle);
  const [limit, setLimit] = useState(40);
  const open = (m: PendleMarketView) => navigate(`/pendle/${m.chainId}/${m.address}`);
  const hl = (k: PendleSortKey) => highlight === k && 'bg-accent-soft/50';

  if (markets.length === 0) return <EmptyState message="بازاری با این فیلترها یافت نشد" />;

  return (
    <Surface className="overflow-hidden">
      {/* desktop */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="data-table">
          <caption className="sr-only">بازارهای Pendle</caption>
          <thead>
            <tr>
              <th scope="col" className="!ps-5">بازار</th>
              <th scope="col">سررسید</th>
              <th scope="col" className={cn('col-num', hl('fixedApy'))}>APY ثابت</th>
              <th scope="col" className={cn('col-num', hl('lpApy'))}>LP</th>
              <th scope="col" className={cn('col-num', hl('ytApy'))}>YT</th>
              <th scope="col" className="col-num">پایه</th>
              <th scope="col" className={cn('col-num', hl('tvl'))}>TVL</th>
              <th scope="col" className={cn('col-num', hl('volume'))}>حجم</th>
              <th scope="col" className="w-12 !pe-4"><span className="sr-only">پیگیری</span></th>
            </tr>
          </thead>
          <tbody>
            {markets.slice(0, limit).map((m) => {
              const fav = watch[`pendle:${m.address}`] !== undefined;
              return (
                <tr key={m.address} className="cursor-pointer" onClick={() => open(m)}>
                  <td className="!ps-5">
                    <div className="flex items-center gap-3">
                      <MarketIcon m={m} />
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            open(m);
                          }}
                          className="block max-w-[14rem] truncate text-start font-semibold text-ink hover:text-accent"
                        >
                          <bdi dir="ltr">{m.name}</bdi>
                        </button>
                        <p className="text-xs text-muted">
                          {m.protocol} · {chainName(m.chainId)} · <Badge tone="neutral" ltr>{m.marketType}</Badge>
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="text-sm text-muted"><Maturity m={m} /></td>
                  <td className={cn('col-num font-bold text-ink', hl('fixedApy'))}>
                    <PercentValue value={m.fixedApyPct} signed={false} tone="none" />
                  </td>
                  <td className={cn('col-num', hl('lpApy'))}><PercentValue value={m.lpApyPct} signed={false} tone="none" /></td>
                  <td className={cn('col-num', hl('ytApy'))}><PercentValue value={m.ytApyPct} signed={false} tone="none" /></td>
                  <td className="col-num text-muted"><PercentValue value={m.underlyingApyPct} signed={false} tone="none" /></td>
                  <td className={cn('col-num', hl('tvl'))}><MoneyValue value={m.details.totalTvl} compact /></td>
                  <td className={cn('col-num text-muted', hl('volume'))}><MoneyValue value={m.details.tradingVolume} compact /></td>
                  <td className="!pe-4">
                    <button
                      type="button"
                      aria-pressed={fav}
                      aria-label={fav ? 'حذف از لیست پیگیری' : 'افزودن به لیست پیگیری'}
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggle(`pendle:${m.address}`);
                      }}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-control hover:bg-surface-2',
                        fav ? 'text-gold' : 'text-subtle'
                      )}
                    >
                      <Star className={cn('h-4 w-4', fav && 'fill-current')} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* phones & tablets */}
      <ul className="divide-y divide-divider px-4 lg:hidden">
        {markets.slice(0, limit).map((m) => (
          <li key={m.address}>
            <button type="button" onClick={() => open(m)} className="flex w-full items-center gap-3 py-3 text-start">
              <MarketIcon m={m} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink"><bdi dir="ltr">{m.name}</bdi></p>
                <p className="truncate text-xs text-muted">
                  {chainName(m.chainId)} · <Maturity m={m} />
                </p>
                <p className="mt-1 flex flex-wrap gap-x-3 text-2xs text-muted">
                  <span>LP <PercentValue value={m.lpApyPct} signed={false} tone="none" /></span>
                  <span>YT <PercentValue value={m.ytApyPct} signed={false} tone="none" /></span>
                  <span>پایه <PercentValue value={m.underlyingApyPct} signed={false} tone="none" /></span>
                </p>
              </div>
              <div className="shrink-0 text-end">
                <p className="text-base font-bold text-ink"><PercentValue value={m.fixedApyPct} signed={false} tone="none" /></p>
                <p className="text-2xs text-muted">APY ثابت</p>
                <p className="mt-0.5 text-xs text-muted">TVL <MoneyValue value={m.details.totalTvl} compact /></p>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {markets.length > limit && (
        <div className="border-t border-divider p-2">
          <Button variant="ghost" size="sm" className="w-full text-accent" onClick={() => setLimit((l) => l + 40)}>
            نمایش بیشتر ({toFaDigits(markets.length - limit)} باقی‌مانده)
          </Button>
        </div>
      )}
    </Surface>
  );
}

/** loading / error / stale handling shared by the tabs (data is never hidden when it exists) */
function DataState({
  loading,
  error,
  count,
  lastSync,
  refresh
}: {
  loading: boolean;
  error: boolean;
  count: number;
  lastSync: number | null;
  refresh: () => void;
}) {
  const now = useNow(15_000);
  if (loading) return <ListSkeleton rows={8} />;
  if (error && count === 0) return <ErrorState message="اتصال به Pendle API برقرار نشد" onRetry={refresh} />;
  if (error)
    return (
      <Notice
        tone="stale"
        title="به‌روزرسانی ناموفق بود"
        action={
          <Button variant="outline" size="sm" icon={<RefreshCw />} onClick={refresh}>
            تلاش دوباره
          </Button>
        }
      >
        آخرین داده ذخیره‌شده نمایش داده می‌شود{lastSync ? ` (${fmtRelativeAge(lastSync, now)})` : ''}.
      </Notice>
    );
  return null;
}

/* ================= markets ================= */

type MarketSubTab = 'all' | 'PT' | 'YT' | 'SY' | 'underlying';

export function MarketsExplorer() {
  const { markets, loading, error, refresh, lastSync } = usePendleMarkets();
  const [sub, setSub] = useState<MarketSubTab>('all');
  const [query, setQuery] = useState('');
  const [chain, setChain] = useState<number | 'all'>('all');
  const now = useNow(15_000);

  useEffect(() => {
    void useWatchlistStore.getState().hydrate();
  }, []);

  const chains = useMemo(() => [...new Set(markets.map((m) => m.chainId))], [markets]);

  const visible = useMemo(() => {
    const q = query.toLowerCase();
    return markets.filter((m) => {
      if (chain !== 'all' && m.chainId !== chain) return false;
      if (sub === 'PT' && m.marketType !== 'PT') return false;
      if (sub === 'YT' && m.marketType !== 'YT') return false;
      if (sub === 'SY' && m.marketType !== 'SY') return false;
      if (sub === 'underlying' && (m.underlyingApyPct ?? 0) === 0 && !m.underlyingAsset) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.protocol.toLowerCase().includes(q);
    });
  }, [markets, query, chain, sub]);

  const state = <DataState loading={loading} error={error} count={markets.length} lastSync={lastSync} refresh={refresh} />;
  if (loading || (error && markets.length === 0)) return state;

  return (
    <div className="space-y-4">
      {state}
      <div className="flex flex-wrap items-center gap-2">
        <SearchField value={query} onChange={setQuery} placeholder="جستجوی بازار یا پروتکل…" className="min-w-0 flex-1 md:max-w-sm" />
        <div className="w-40">
          <Select aria-label="زنجیره" value={chain} onChange={(e) => setChain(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">همه زنجیره‌ها</option>
            {chains.map((c) => (
              <option key={c} value={c}>
                {chainName(c)}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="ghost" size="sm" icon={<RefreshCw />} onClick={refresh} className="ms-auto" aria-label="همگام‌سازی">
          <span className="hidden sm:inline">همگام‌سازی</span>
        </Button>
      </div>
      <ChipGroup<MarketSubTab>
        bleed
        label="نوع بازار"
        value={sub}
        onChange={setSub}
        options={[
          { value: 'all', label: 'همه' },
          { value: 'PT', label: 'PT' },
          { value: 'YT', label: 'YT' },
          { value: 'SY', label: 'SY' },
          { value: 'underlying', label: 'دارای بازده پایه' }
        ]}
      />
      <p className="text-xs text-muted">
        {toFaDigits(visible.length)} از {toFaDigits(markets.length)} بازار · {toFaDigits(chains.length)} زنجیره
        {lastSync && ` · به‌روز ${fmtRelativeAge(lastSync, now)}`} · فقط بازارهای فعال با TVL بالای ۵۰۰ هزار دلار
      </p>
      <PendleMarketList markets={visible} />
    </div>
  );
}

/* ================= opportunities ================= */

const SORT_KEYS: PendleSortKey[] = ['fixedApy', 'lpApy', 'ytApy', 'totalYield', 'rewardApr', 'tvl', 'volume', 'maturity', 'ptDiscount'];

export function OpportunitiesExplorer() {
  const navigate = useNavigate();
  const { markets, loading, error, refresh, lastSync } = usePendleMarkets();
  const [sort, setSort] = useState<PendleSortKey>('fixedApy');
  const [minApy, setMinApy] = useState('');
  const [minTvl, setMinTvl] = useState('');
  const [chain, setChain] = useState<number | 'all'>('all');
  const [type, setType] = useState<PendleMarketType | 'all'>('all');

  const chains = useMemo(() => [...new Set(markets.map((m) => m.chainId))], [markets]);

  const ranked = useMemo(() => {
    const minA = Number(minApy) || 0;
    // the field is labelled in millions of dollars
    const minT = (Number(minTvl) || 0) * 1_000_000;
    const asc = sort === 'maturity'; // nearest maturity first
    return markets
      .filter((m) => {
        if (chain !== 'all' && m.chainId !== chain) return false;
        if (type !== 'all' && m.marketType !== type) return false;
        if (minA > 0 && (m.totalApyPct ?? 0) < minA) return false;
        if (minT > 0 && m.details.totalTvl < minT) return false;
        return true;
      })
      .sort((a, b) => {
        const va = sortValue(a, sort);
        const vb = sortValue(b, sort);
        return asc ? va - vb : vb - va;
      })
      .slice(0, 50);
  }, [markets, sort, minApy, minTvl, chain, type]);

  const state = <DataState loading={loading} error={error} count={markets.length} lastSync={lastSync} refresh={refresh} />;
  if (loading || (error && markets.length === 0)) return state;
  const top = ranked[0];
  const topValue = top ? sortValue(top, sort) : null;

  return (
    <div className="space-y-5">
      {state}
      <Surface className="p-4 md:p-5">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Field label="مرتب‌سازی" className="col-span-2 md:col-span-1">
            <Select value={sort} onChange={(e) => setSort(e.target.value as PendleSortKey)}>
              {SORT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {PENDLE_SORT_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="حداقل APY کل">
            <Input dir="ltr" inputMode="decimal" value={minApy} onChange={(e) => setMinApy(e.target.value)} placeholder="0" suffix="%" />
          </Field>
          <Field label="حداقل TVL (میلیون دلار)">
            <Input dir="ltr" inputMode="decimal" value={minTvl} onChange={(e) => setMinTvl(e.target.value)} placeholder="0" suffix="M$" />
          </Field>
          <Field label="زنجیره">
            <Select value={chain} onChange={(e) => setChain(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
              <option value="all">همه</option>
              {chains.map((c) => (
                <option key={c} value={c}>
                  {chainName(c)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="نوع">
            <Select value={type} onChange={(e) => setType(e.target.value as PendleMarketType | 'all')}>
              <option value="all">همه</option>
              {(['LP', 'PT', 'YT', 'SY'] as PendleMarketType[]).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Surface>

      {top && (
        <Surface variant="focal" className="p-4 md:p-5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Trophy aria-hidden className="h-4 w-4 text-gold" />
            رتبه اول بر اساس «{PENDLE_SORT_LABELS[sort]}»
          </p>
          <button
            type="button"
            onClick={() => navigate(`/pendle/${top.chainId}/${top.address}`)}
            className="mt-2 flex w-full items-center gap-3 text-start"
          >
            <MarketIcon m={top} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold text-ink"><bdi dir="ltr">{top.name}</bdi></p>
              <p className="text-xs text-muted">
                {top.protocol} · {chainName(top.chainId)} · <Maturity m={top} />
              </p>
            </div>
            <div className="shrink-0 text-end text-2xl font-extrabold text-ink">
              {sort === 'tvl' ? (
                <MoneyValue value={top.details.totalTvl} compact />
              ) : sort === 'volume' ? (
                <MoneyValue value={top.details.tradingVolume} compact />
              ) : sort === 'maturity' ? (
                <span className="text-base">{fmtExpiry(top.expiry)}</span>
              ) : (
                <PercentValue
                  value={topValue !== null && Number.isFinite(topValue) ? topValue : null}
                  signed={false}
                  tone="none"
                />
              )}
            </div>
          </button>
        </Surface>
      )}

      <PendleMarketList markets={ranked} highlight={sort} />
      <p className="text-xs text-subtle">رتبه‌بندی صرفاً بر اساس داده بازار است و توصیه سرمایه‌گذاری نیست.</p>
    </div>
  );
}
