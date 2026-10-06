import { SimulatedInvestmentCard } from '@/features/cryptomarkets/presentation/SimulatedInvestmentCard';
import type { PerfPeriod } from '@/features/cryptomarkets/data/useTopPerformers';
import { toFaDigits } from '@/shared/utils/formatters';
import { useMemo, useState } from 'react';
import { RefreshCw, SlidersHorizontal, Layers } from 'lucide-react';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { Tabs } from '@/shared/components/ui/SegmentedControl';
import { Section } from '@/shared/components/ui/GlassCard';
import { Notice } from '@/shared/components/ui/StateViews';
import { Button } from '@/shared/components/ui/Button';
import { TableSkeleton } from '@/shared/components/ui/Skeleton';
import { useTimeline } from '@/features/simulation/data/useTimeline';
import { SimulationTable, type SortDir } from './SimulationTable';
import { AssetDetailSheet } from './AssetDetailSheet';
import { AnalyticsCards } from './AnalyticsCards';
import { ScenarioCashCard } from './ScenarioCashCard';
import { SimContextChips } from './SimContextChips';
import { CategoryReturnChart } from './CategoryReturnChart';
import { FiltersBar, type CategoryFilter, type SortKey } from './FiltersBar';
import { startStockCycle } from '@/features/simulation/data/useStockPrices';
import { normalizeForSearch } from '@/shared/utils/formatters';
import { rowsToCsv, downloadCsv } from '@/shared/utils/csv';
import { toast } from '@/shared/store/toastStore';
import { t } from '@/shared/i18n/fa';
import { cn } from '@/shared/lib/cn';
import { COVERAGE } from '@/features/simulation/domain/constants';
import type { SimAssetRow } from '@/shared/types';

type TimelineTab = 't1' | 't2';

export function SimulationPage({ onOpenScenario }: { onOpenScenario: () => void }) {
  const [perfPeriod, setPerfPeriod] = useState<PerfPeriod>('30d');
  const [tab, setTab] = useState<TimelineTab>('t1');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [sort, setSort] = useState<SortKey>('default');
  const [dir, setDir] = useState<SortDir>(null);
  const [grouped, setGrouped] = useState(false);
  const [selectedRow, setSelectedRow] = useState<SimAssetRow | null>(null);

  const timeline: 1 | 2 = tab === 't1' ? 1 : 2;
  const result = useTimeline(timeline);

  // فیلتر
  const filteredRows = useMemo(() => {
    let rows = result.rows;
    const q = normalizeForSearch(query);
    if (q) {
      rows = rows.filter(
        (r) => normalizeForSearch(r.symbol).includes(q) || normalizeForSearch(r.nameFa).includes(q)
      );
    }
    if (category !== 'all') {
      if (category === 'tradfi') {
        rows = rows.filter((r) => r.kind === 'tradfi');
      } else if (category === 'us-stock' || category === 'etf' || category === 'index' || category === 'commodity' || category === 'bond') {
        // فیلتر زیرمجموعه‌های سنتی — فقط نمایش، بدون تغییر محاسبه
        rows = rows.filter((r) => r.kind === 'tradfi' && r.tradfiKind === category);
      } else {
        rows = rows.filter((r) => r.kind === category);
      }
    }
    return rows;
  }, [result.rows, query, category]);

  // مرتب‌سازی (هدرها)
  const visibleRows = useMemo(() => {
    const sorted = [...filteredRows];
    const cmp = (a: number | null, b: number | null) => {
      const av = a ?? -Infinity;
      const bv = b ?? -Infinity;
      return av - bv;
    };
    switch (sort) {
      case 'value':
        sorted.sort((a, b) => cmp(a.valueUsd, b.valueUsd));
        break;
      case 'profit':
        sorted.sort((a, b) => cmp(a.profitLoss, b.profitLoss));
        break;
      case 'return':
        sorted.sort((a, b) => cmp(a.changePct, b.changePct));
        break;
      case 'buy':
        sorted.sort((a, b) => cmp(a.buyPrice, b.buyPrice));
        break;
      case 'current':
        sorted.sort((a, b) => cmp(a.currentPrice, b.currentPrice));
        break;
      case 'vseth':
        sorted.sort((a, b) => cmp(a.vsEth, b.vsEth));
        break;
      case 'name':
        sorted.sort((a, b) => a.symbol.localeCompare(b.symbol));
        break;
      default:
        break;
    }
    if (dir === 'desc') sorted.reverse();
    return sorted;
  }, [filteredRows, sort, dir]);

  const handleSort = (key: SortKey) => {
    if (sort === key) {
      // چرخه: asc → desc → خنثی
      setDir((d) => (d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc'));
      if (dir === 'desc') setSort('default');
    } else {
      setSort(key);
      setDir('asc');
    }
  };

  // گروه‌بندی
  const groups = useMemo(() => {
    if (!grouped || query) return null;
    const cats = [
      { key: 'crypto' as const, label: t('categoryCrypto') },
      { key: 'tokenized' as const, label: t('categoryTokenized') },
      { key: 'tradfi' as const, label: t('categoryTradFi') }
    ];
    const tradFiSub = [
      { key: 'us-stock' as const, label: 'سهام آمریکا' },
      { key: 'etf' as const, label: 'ETF' },
      { key: 'index' as const, label: 'شاخص' },
      { key: 'commodity' as const, label: 'کامودیتی' },
      { key: 'bond' as const, label: 'اوراق' }
    ];
    const groups = cats.map((c) => ({
      label: c.label,
      rows: filteredRows.filter((r) => r.kind === c.key)
    }));
    // تجزیه TradFi به زیرگروه‌ها (فقط نمایش)
    const tradFiGroup = groups.find((g) => g.label === t('categoryTradFi'));
    if (tradFiGroup && tradFiGroup.rows.length > 0) {
      const subs = tradFiSub
        .map((c) => ({
          label: c.label,
          rows: tradFiGroup.rows.filter((r) => r.tradfiKind === c.key)
        }))
        .filter((g) => g.rows.length > 0);
      if (subs.length > 0) {
        return subs
          .map((g) => ({
            ...g,
            value: g.rows.reduce((acc, r) => acc + (r.valueUsd ?? 0), 0),
            count: g.rows.length
          }));
      }
    }
    return groups
      .filter((g) => g.rows.length > 0)
      .map((g) => ({
        ...g,
        value: g.rows.reduce((acc, r) => acc + (r.valueUsd ?? 0), 0),
        count: g.rows.length
      }));
  }, [grouped, query, filteredRows]);

  const exportCsv = () => {
    downloadCsv(`simulation-timeline-${timeline}.csv`, rowsToCsv(visibleRows, result.baseCapital));
    toast('success', t('exportedCsv'));
  };

  return (
    <Page>
      <PageHeader
        title={t('simTitle')}
        subtitle={t('simSubtitle')}
        actions={
          <Button variant="outline" size="sm" icon={<SlidersHorizontal />} onClick={onOpenScenario}>
            {t('customScenario')}
          </Button>
        }
      />

      <ScenarioCashCard />

      <div className="space-y-4">
        <Tabs<TimelineTab>
          label="بازه زمانی"
          value={tab}
          onChange={setTab}
          options={[
            { value: 't1', label: t('timeline1') },
            { value: 't2', label: t('timeline2') }
          ]}
        />
        <p className="text-sm text-muted">
          {tab === 't1' ? t('timeline1Desc') : t('timeline2DescTpl').replace('{n}', String(COVERAGE.tokenizedCount))}
        </p>
        <StockProgress result={result} onRefresh={() => startStockCycle()} />
        <TokenSyncBar result={result} />
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-5">
          <SimContextChips result={result} />
        </div>
        <div className="min-w-0 lg:col-span-7">
          <CategoryReturnChart result={result} />
        </div>
      </div>

      <SimulatedInvestmentCard period={perfPeriod} onPeriodChange={setPerfPeriod} />

      <Section id="insights" title="یافته‌های کلیدی" description="فرضی و گذشته‌نگر — پیش‌بینی آینده نیست">
        <AnalyticsCards result={result} timeline={timeline} />
      </Section>

      <Section id="assets" title="همه دارایی‌ها">
        <div className="space-y-4">
          <FiltersBar
            query={query}
            onQuery={setQuery}
            category={category}
            onCategory={setCategory}
            grouped={grouped}
            onToggleGroup={() => setGrouped((g) => !g)}
            onExport={exportCsv}
          />
          <SimulationTable
            result={result}
            visibleRows={visibleRows}
            groups={groups}
            sort={sort}
            dir={dir}
            onSort={handleSort}
            onSelectRow={setSelectedRow}
          />
        </div>
      </Section>

      <AssetDetailSheet row={selectedRow} onClose={() => setSelectedRow(null)} />
    </Page>
  );
}

/** نوار پیشرفت چرخه به‌روزرسانی سهام + سهمیه روزانه آلفا وانتج */
function StockProgress({
  result,
  onRefresh
}: {
  result: ReturnType<typeof useTimeline>;
  onRefresh: () => void;
}) {
  const { refreshing, done, total, lastCycleAt, budgetInfo } = result.stockStatus;
  const { used, total: budgetTotal, keys } = budgetInfo;
  const budgetExhausted = budgetTotal > 0 && used >= budgetTotal;

  if (!refreshing && !lastCycleAt && !budgetExhausted) return null;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Notice
      tone={budgetExhausted ? 'warn' : refreshing ? 'info' : 'neutral'}
      title={refreshing ? t('refreshingStocks') : budgetExhausted ? t('avBudgetExhausted') : t('marketRefreshDone')}
      action={
        !refreshing && !budgetExhausted ? (
          <Button variant="ghost" size="sm" icon={<RefreshCw />} onClick={onRefresh}>
            {t('refresh')}
          </Button>
        ) : undefined
      }
    >
      <span className="num-ltr">
        {t('avBudgetLabel')}: {toFaDigits(used)} از {toFaDigits(budgetTotal)}
        {keys > 1 && ` · ${toFaDigits(keys)} کلید فعال`}
        {refreshing && ` · ${toFaDigits(done)} از ${toFaDigits(total)} (${toFaDigits(pct)}٪)`}
      </span>
    </Notice>
  );
}

/** نوار همگام‌سازی توکن‌ایز */
function TokenSyncBar({ result }: { result: ReturnType<typeof useTimeline> }) {
  const { syncing, liveCount } = result.tokenizedStatus;
  if (!syncing && liveCount === 0) return null;
  return (
    <p className="flex items-center gap-2 text-xs text-muted" role="status">
      <Layers aria-hidden className={cn('h-4 w-4 shrink-0 text-subtle', syncing && 'animate-pulse-soft')} />
      {syncing ? t('tokenizedSync') : `${t('tokenizedLiveCount')}: ${liveCount}`}
    </p>
  );
}


/** حالت بارگذاری اولیه */
export function SimulationSkeleton() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-11 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-2.5">
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
      </div>
      <TableSkeleton rows={7} />
    </div>
  );
}
