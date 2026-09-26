/** ============================================================
 * بازار املاک (Property Market) — اهواز
 *
 *  داده: دیوار + شیپور (آپارتمان فروشی) — سه مسیر جمع‌آوری (سرور/پل مرورگر/فایل)
 *  محاسبات: فقط لایه سرویس (تومان→دلار، سناریو، مقایسه با میانه اهواز)
 *  نرخ دلار: فقط منبع موجود دارینو (جاری) + سناریوی آینده (فرض صریح)
 *
 * ⚠️ سناریوی آینده پیش‌بینی قیمت ملک نیست — برچسب‌گذاری صریح.
 * ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Building2, History, Layers, List, MapPin, RefreshCw, Square, Table2 } from 'lucide-react';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { PageSkeleton } from '@/shared/components/ui/Skeleton';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { SegmentedControl, Tabs } from '@/shared/components/ui/SegmentedControl';
import { KeyValueList, Metric, MetricGrid, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { useFxStore } from '@/shared/store/fxStore';
import { useLiveUsdt } from '@/shared/store/usdtStore';
import { fmtIntLatin, fmtRelativeAge, fmtUSD, toFaDigits } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import { usePropertyMarket, usePropertyMarketStore } from '../data/store';
import { listingsInWindow, MARKET_WINDOW_DAYS } from '../data/ingest';
import { LISTING_SOURCE_FA, type ListingSource } from '../domain/types';
import {
  buildMarketView,
  buildMarketViewFromSnapshot,
  fxInputFromScenario,
  mostAffordableUsd,
  mostExpensiveUsd,
  toListingViews,
  type NeighborhoodMarketRow,
  type AreaLevel,
  type PropertyMarketView,
  type SegmentDim
} from '../service/propertyMarketService';
import { jalaliYearOf } from '../domain/segments';
import { SegmentsPanel } from './SegmentsPanel';
import { PriceChangePanel } from './PriceChangePanel';
import { UsdtRateField, describeRate, resolveEffectiveRate, type EffectiveRate } from './UsdtRateField';
import type { AgeFilter, AreaFilter } from './ListingsExplorer';
import { filterOutliers, newCleaningReport } from '../collector/pipeline';
import { ScenarioPanel } from './ScenarioPanel';
import { NeighborhoodTable, fmtMillionToman } from './NeighborhoodTable';
import { SourcesPanel } from './SourcesPanel';
import { ListingsExplorer } from './ListingsExplorer';
import { LegacyPanel } from './LegacyPanel';
import { HBarChart, PairedBarChart, PositionChart, TrendChart } from './MarketCharts';
import { useBridgeReceiver } from './useBridgeReceiver';

/** محله با کمتر از این تعداد آگهی → میانه کم‌اعتبار (از نمودارها/رتبه‌بندی کنار می‌رود) */
export const MIN_RELIABLE_SAMPLE = 3;
/** داده قدیمی‌تر از این → هشدار به‌روزرسانی */
const STALE_DAYS = 14;
/** حداکثر ردیف نمودارها (خوانایی) */
const CHART_ROWS = 15;

type ViewTab = 'areas' | 'changes' | 'segments' | 'charts' | 'listings';

/** ساخت ویوی بازار — ترجیحاً آخرین Snapshot، وگرنه آگهی‌های محلی */
/** نرخ دلار مؤثر: تتر زنده (والکس/بیت‌پین) → تتر ذخیره‌شده → نرخ دستی تنظیمات */
function useEffectiveRate(): EffectiveRate {
  const usdt = useLiveUsdt();
  const manual = useFxStore((s) => s.rate);
  const fxHydrated = useFxStore((s) => s.hydrated);
  useEffect(() => {
    void useFxStore.getState().hydrate();
  }, []);
  return useMemo(
    () => resolveEffectiveRate(usdt, fxHydrated && manual > 0 ? manual : null),
    [usdt, manual, fxHydrated]
  );
}

function useMarketView(rate: number | null, level: AreaLevel): { view: PropertyMarketView | null; hasAnyData: boolean } {
  const { listings, snapshots, scenario } = usePropertyMarket();

  return useMemo(() => {
    const hasAnyData = listings.length > 0 || snapshots.length > 0;
    if (!hasAnyData) return { view: null, hasAnyData };
    const fx = fxInputFromScenario(scenario, rate);
    const lastSnap = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
    if (lastSnap) {
      return { view: buildMarketViewFromSnapshot(lastSnap, fx, level), hasAnyData };
    }
    const report = newCleaningReport();
    const market = filterOutliers(listings, report);
    const lastUpdate = market.reduce((m, l) => Math.max(m, l.scrapedAt), 0);
    return {
      view: buildMarketView({ listings: market, fx, lastPropertyUpdate: lastUpdate || null, level }),
      hasAnyData
    };
  }, [listings, snapshots, scenario, rate, level]);
}

function RankList({ rows }: { rows: NeighborhoodMarketRow[] }) {
  if (rows.length === 0) return <p className="py-4 text-sm text-muted">داده کافی نیست</p>;
  return (
    <KeyValueList
      rows={rows.map((r, i) => ({
        label: `${toFaDigits(i + 1)}. ${r.displayName}`,
        value: (
          <span className="inline-flex items-baseline gap-2">
            <MoneyValue value={r.currentUsdPerM2} />
            <span className="text-xs text-muted">{fmtMillionToman(r.medianTomanPerM2)}</span>
          </span>
        )
      }))}
    />
  );
}

/* ---------------- صفحه ---------------- */

export function PropertyMarketPage() {
  const st = usePropertyMarket();
  const effective = useEffectiveRate();
  const [level, setLevel] = useState<AreaLevel>('area');
  const { view, hasAnyData } = useMarketView(effective.rate, level);
  const [tab, setTab] = useState<ViewTab>('areas');
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('all');
  const [areaFilter, setAreaFilter] = useState<AreaFilter>('all');
  const [showSparse, setShowSparse] = useState(false);
  useBridgeReceiver();

  const fxRate = view?.currentUsdRateToman ?? null;
  const futureRate = view?.futureUsdRateToman ?? null;
  const change = view?.cityUsdChangePercent ?? null;
  const busy = st.collect.status === 'running' || st.collect.status === 'checking';

  const reliable = useMemo(() => (view ? view.rows.filter((r) => r.listingCount >= MIN_RELIABLE_SAMPLE) : []), [view]);
  const tableRows = showSparse || !view ? view?.rows ?? [] : reliable;
  const chartRows = reliable.slice(0, CHART_ROWS);
  const expensive = mostExpensiveUsd(reliable, 5);
  const affordable = mostAffordableUsd(reliable, 5);

  const activeListings = useMemo(() => listingsInWindow(st.listings), [st.listings]);
  // آگهی‌های بازار (پنجره + بدون پرت) + سن/دسته/معادل دلاری تتر
  const listingViews = useMemo(() => {
    const market = filterOutliers(activeListings, newCleaningReport());
    return toListingViews(market, effective.rate, jalaliYearOf(Date.now()));
  }, [activeListings, effective.rate]);
  const pickSegment = (dim: SegmentDim, key: string) => {
    if (dim === 'age') {
      setAgeFilter(key as AgeFilter);
      setAreaFilter('all');
    } else {
      setAreaFilter(key as AreaFilter);
      setAgeFilter('all');
    }
    setTab('listings');
  };
  const lastSnap = st.snapshots.length > 0 ? st.snapshots[st.snapshots.length - 1] : null;
  const sourceCounts = useMemo(() => {
    const c: Record<ListingSource, number> = { divar: 0, sheypoor: 0 };
    for (const l of activeListings) if (l.source === 'divar' || l.source === 'sheypoor') c[l.source] += 1;
    return c;
  }, [activeListings]);
  const trend = useMemo(
    () =>
      st.snapshots
        .filter((s) => s.cityStats.medianTomanPerM2 !== null)
        .map((s) => ({ ts: s.dateTs, label: formatJalali(s.dateTs), value: s.cityStats.medianTomanPerM2 as number })),
    [st.snapshots]
  );

  const lastUpdate = view?.lastPropertyUpdate ?? null;
  const stale = lastUpdate !== null && Date.now() - lastUpdate > STALE_DAYS * 86_400_000;

  const refresh = () => {
    if (busy) {
      usePropertyMarketStore.getState().cancelCollection();
      return;
    }
    document.getElementById('sources')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    void usePropertyMarketStore.getState().startCollection();
  };

  const scenarioPanel = (
    <ScenarioPanel
      scenario={st.scenario}
      currentRate={fxRate}
      fxHydrated
      rateField={<UsdtRateField effective={effective} />}
      onChange={(patch) => void usePropertyMarketStore.getState().setScenario(patch)}
      onReset={() => void usePropertyMarketStore.getState().resetScenario()}
    />
  );

  return (
    <Page>
      <PageHeader
        title="بازار املاک اهواز"
        subtitle="قیمت آپارتمان‌های فروشی از دیوار و شیپور — تحلیل تومانی و دلاری با سناریوی نرخ آینده"
        actions={
          <Button icon={busy ? <Square /> : <RefreshCw />} variant={busy ? 'outline' : 'primary'} onClick={refresh}>
            {busy ? 'توقف جمع‌آوری' : 'به‌روزرسانی داده'}
          </Button>
        }
        meta={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="h-3.5 w-3.5" /> اهواز · آپارتمان
            </span>
            <span>
              آخرین به‌روزرسانی:{' '}
              <span className="text-ink">
                {lastUpdate ? `${formatJalali(lastUpdate)} · ${fmtRelativeAge(lastUpdate)}` : '—'}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              {(['divar', 'sheypoor'] as ListingSource[]).map((s) => (
                <Badge key={s} tone={sourceCounts[s] > 0 ? (s === 'divar' ? 'brand' : 'info') : 'neutral'}>
                  {LISTING_SOURCE_FA[s]} {toFaDigits(sourceCounts[s])}
                </Badge>
              ))}
            </span>
          </div>
        }
      />

      {busy && (
        <Notice tone="info" className="mb-6" title="در حال جمع‌آوری">
          {(['divar', 'sheypoor'] as ListingSource[])
            .filter((s) => st.collect.sources[s].status === 'running')
            .map((s) => `${LISTING_SOURCE_FA[s]}: ${toFaDigits(st.collect.sources[s].valid)} آگهی معتبر`)
            .join(' · ') || st.collect.message}
          {' — داده‌ها همزمان ذخیره می‌شوند.'}
        </Notice>
      )}
      {(effective.kind === 'manual' || effective.kind === 'none') && (
        <Notice tone="warn" className="mb-6" title="نرخ زنده تتر در دسترس نیست">
          {effective.kind === 'manual'
            ? 'معادل‌های دلاری فعلاً با نرخ دستی تنظیمات حساب شده‌اند. اتصال اینترنت را بررسی کنید یا منبع تتر را عوض کنید (والکس/بیت‌پین).'
            : 'معادل‌های دلاری نمایش داده نمی‌شوند تا نرخ تتر دریافت شود.'}
        </Notice>
      )}
      {stale && !busy && (
        <Notice tone="stale" className="mb-6">
          داده بازار بیش از {toFaDigits(STALE_DAYS)} روز پیش به‌روز شده است — برای تحلیل دقیق «به‌روزرسانی داده» را بزنید.
        </Notice>
      )}

      {!hasAnyData && !st.loading ? (
        <div className="space-y-6">
          <EmptyState
            icon={<Building2 />}
            message="هنوز داده‌ای از بازار املاک اهواز ثبت نشده است"
            hint="از بخش «منابع داده» یکی از سه روش را انتخاب کنید: جمع‌آوری خودکار، پل مرورگر (بدون سرور) یا ورود فایل."
          />
          <div id="sources" className="scroll-mt-24">
            <SourcesPanel lastSnapshot={lastSnap} />
          </div>
          {scenarioPanel}
        </div>
      ) : view ? (
        <div className="space-y-6">
          <Surface variant="focal" className="p-5 md:p-6">
            <MetricGrid cols={4}>
              <Metric
                size="lg"
                label="میانه قیمت اهواز (هر متر)"
                value={view.cityStatsToman.medianTomanPerM2 !== null ? `${fmtMillionToman(view.cityStatsToman.medianTomanPerM2)} ت` : '—'}
                sub={
                  view.cityStatsToman.p25TomanPerM2 !== null && view.cityStatsToman.p75TomanPerM2 !== null ? (
                    <>بازه میانی {fmtMillionToman(view.cityStatsToman.p25TomanPerM2)} تا {fmtMillionToman(view.cityStatsToman.p75TomanPerM2)}</>
                  ) : undefined
                }
              />
              <Metric
                size="lg"
                label="میانه به دلار (تتر فعلی)"
                value={<MoneyValue value={view.cityCurrentUsdPerM2} />}
                sub={describeRate(effective)}
              />
              <Metric
                size="lg"
                label="میانه به دلار (سناریو)"
                value={<MoneyValue value={view.cityFutureUsdPerM2} />}
                sub={futureRate !== null ? <>تتر فرضی {toFaDigits(fmtIntLatin(futureRate))} تومان</> : undefined}
              />
              <Metric
                size="lg"
                label="تغییر دلاری (سناریو)"
                value={<PercentValue value={change !== null ? Math.round(change * 10) / 10 : null} digits={1} />}
                sub={view.scenarioBasis === 'constant-property' ? 'با قیمت تومانی ثابت' : 'با رشد تومانی سناریو'}
              />
            </MetricGrid>
            <p className="mt-4 border-t border-divider pt-3 text-xs text-muted">
              {toFaDigits(view.totalListings)} آگهی در تحلیل · {toFaDigits(view.rows.length)} محله ·{' '}
              {toFaDigits(reliable.length)} محله با نمونه کافی (≥{toFaDigits(MIN_RELIABLE_SAMPLE)} آگهی) · پنجره بازار{' '}
              {toFaDigits(MARKET_WINDOW_DAYS)} روز اخیر
            </p>
          </Surface>

          <div>
            <Tabs<ViewTab>
              label="نمای بازار"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'areas', label: 'مناطق', icon: <Table2 />, badge: view.rows.length },
                { value: 'changes', label: 'تغییرات قیمت', icon: <History /> },
                { value: 'segments', label: 'دسته‌بندی', icon: <Layers /> },
                { value: 'charts', label: 'نمودارها', icon: <BarChart3 /> },
                { value: 'listings', label: 'آگهی‌ها', icon: <List />, badge: listingViews.length }
              ]}
            />
            <div className="pt-5">
              {tab === 'areas' && (
                <div className="space-y-6">
                  <Section
                    id="areas"
                    title={level === 'area' ? 'مناطق اهواز' : 'محله‌های اهواز'}
                    description={
                      level === 'area'
                        ? 'منطقه = محله‌های هم‌نام با هم (کیانپارس شرقی و غربی، فازهای پادادشهر، زیتون کارمندی و کارگری…) + محله‌های مستقل'
                        : 'هر محله رسمی جدا — شرقی/غربی کیانپارس و کیان‌آباد از متن صریح آگهی'
                    }
                    action={
                      <div className="flex flex-wrap items-center gap-2">
                        <SegmentedControl<AreaLevel>
                          size="sm"
                          label="سطح تحلیل"
                          value={level}
                          onChange={setLevel}
                          options={[
                            { value: 'area', label: 'منطقه' },
                            { value: 'neighborhood', label: 'محله' }
                          ]}
                        />
                        {view.rows.length > reliable.length && (
                          <Button variant="ghost" size="sm" onClick={() => setShowSparse((v) => !v)}>
                            {showSparse ? 'فقط با نمونه کافی' : `نمایش همه (${toFaDigits(view.rows.length)})`}
                          </Button>
                        )}
                      </div>
                    }
                  >
                    <Surface className="overflow-hidden">
                      <NeighborhoodTable rows={tableRows} />
                    </Surface>
                  </Section>
                  <div className="grid gap-6 md:grid-cols-2">
                    <Section id="expensive" title="گران‌ترین مناطق (دلاری)">
                      <Surface className="px-4">
                        <RankList rows={expensive} />
                      </Surface>
                    </Section>
                    <Section id="affordable" title="ارزان‌ترین مناطق (دلاری)">
                      <Surface className="px-4">
                        <RankList rows={affordable} />
                      </Surface>
                    </Section>
                  </div>
                </div>
              )}

              {tab === 'changes' && <PriceChangePanel snapshots={st.snapshots} />}

              {tab === 'segments' && (
                <Surface className="overflow-hidden">
                  <SegmentsPanel views={listingViews} usdRate={effective.rate} onPick={pickSegment} />
                </Surface>
              )}

              {tab === 'charts' && (
                <div className="grid gap-6 lg:grid-cols-2">
                  <Surface className="p-4 md:p-5 lg:col-span-2">
                    <h3 className="mb-4 text-sm font-bold text-ink">روند میانه قیمت اهواز (تومان/متر)</h3>
                    <TrendChart points={trend} format={(v) => fmtMillionToman(v)} />
                  </Surface>
                  <Surface className="p-4 md:p-5">
                    <h3 className="mb-4 text-sm font-bold text-ink">قیمت مناطق (تومان/متر)</h3>
                    <HBarChart data={chartRows.map((r) => ({ label: r.displayName, value: r.medianTomanPerM2 }))} format={(v) => fmtMillionToman(v)} />
                  </Surface>
                  <Surface className="p-4 md:p-5">
                    <h3 className="mb-4 text-sm font-bold text-ink">قیمت مناطق (دلار/متر)</h3>
                    <HBarChart
                      data={chartRows.map((r) => ({ label: r.displayName, value: r.currentUsdPerM2 }))}
                      format={(v) => fmtUSD(v)}
                      color="rgb(var(--c-chart-2))"
                    />
                  </Surface>
                  <Surface className="p-4 md:p-5">
                    <h3 className="mb-4 text-sm font-bold text-ink">دلار فعلی در برابر سناریوی آینده</h3>
                    <PairedBarChart
                      data={chartRows.map((r) => ({ label: r.displayName, current: r.currentUsdPerM2, future: r.futureUsdPerM2 }))}
                      format={(v) => fmtUSD(v)}
                    />
                    <p className="mt-3 text-xs text-muted">
                      {view.scenarioBasis === 'constant-property'
                        ? 'قیمت تومانی ملک ثابت فرض شده است.'
                        : `رشد تومانی ${toFaDigits(String(view.propertyTomanGrowthPct ?? 0))}٪ اعمال شده است.`}{' '}
                      این سناریو پیش‌بینی قیمت ملک نیست.
                    </p>
                  </Surface>
                  <Surface className="p-4 md:p-5">
                    <h3 className="mb-4 text-sm font-bold text-ink">موقعیت نسبت به میانه اهواز</h3>
                    <PositionChart data={chartRows.map((r) => ({ label: r.displayName, pct: r.positionVsCityPct }))} cityLabel="اهواز" />
                  </Surface>
                  {view.rows.length > chartRows.length && (
                    <p className="text-xs text-muted lg:col-span-2">
                      نمودارها فقط {toFaDigits(chartRows.length)} محله پرنمونه (≥{toFaDigits(MIN_RELIABLE_SAMPLE)} آگهی) را نشان می‌دهند.
                    </p>
                  )}
                </div>
              )}

              {tab === 'listings' && (
                <Surface className="overflow-hidden">
                  <ListingsExplorer
                    listings={listingViews}
                    age={ageFilter}
                    area={areaFilter}
                    onAge={setAgeFilter}
                    onArea={setAreaFilter}
                  />
                </Surface>
              )}
            </div>
          </div>

          {scenarioPanel}
          <div id="sources" className="scroll-mt-24">
            <SourcesPanel lastSnapshot={lastSnap} />
          </div>
        </div>
      ) : (
        <PageSkeleton />
      )}

      <LegacyPanel assets={st.legacyAssets} />
    </Page>
  );
}
