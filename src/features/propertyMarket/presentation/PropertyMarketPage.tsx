/** ============================================================
 * بازار املاک (Property Market) — اهواز
 *
 *  محور همه نماها «نوع قیمت» است: کلید اول و ۱ تا ۷ سال ساخت
 *  (مقایسه قیمت آپارتمان نوساز با ۲۰ ساله در یک عدد معنا ندارد).
 *  داده: دیوار + شیپور · محاسبات: فقط لایه سرویس · دلار: نرخ زنده تتر
 * ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Building2, History, List, MapPin, Maximize2, RefreshCw, Square, Table2 } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { PageSkeleton } from '@/shared/components/ui/Skeleton';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { SegmentedControl, Tabs } from '@/shared/components/ui/SegmentedControl';
import { useFxStore } from '@/shared/store/fxStore';
import { useLiveUsdt } from '@/shared/store/usdtStore';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import { usePropertyMarket, usePropertyMarketStore } from '../data/store';
import { listingsInWindow, MARKET_WINDOW_DAYS } from '../data/ingest';
import { LISTING_SOURCE_FA, type ListingSource } from '../domain/types';
import { ageFilterOfType, jalaliYearOf, type AreaBand, type PriceType } from '../domain/segments';
import {
  CITY_ROW_KEY,
  areaTypeMatrixFromSnapshot,
  buildAreaTypeMatrix,
  fxInputFromScenario,
  scenarioActive,
  toListingViews,
  type AreaLevel
} from '../service/propertyMarketService';
import { filterOutliers, newCleaningReport } from '../collector/pipeline';
import { PriceTypeMatrix } from './PriceTypeMatrix';
import { TypeOverview } from './TypeOverview';
import { SizePanel } from './SizePanel';
import { PriceChangePanel } from './PriceChangePanel';
import { ListingsExplorer, type AgeFilter, type AreaFilter } from './ListingsExplorer';
import { UsdtRateField, describeRate, resolveEffectiveRate, type EffectiveRate } from './UsdtRateField';
import { ScenarioPanel } from './ScenarioPanel';
import { SourcesPanel } from './SourcesPanel';
import { LegacyPanel } from './LegacyPanel';
import { useBridgeReceiver } from './useBridgeReceiver';

/** داده قدیمی‌تر از این → هشدار به‌روزرسانی */
const STALE_DAYS = 14;

type ViewTab = 'areas' | 'sizes' | 'changes' | 'listings';

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

export function PropertyMarketPage() {
  const st = usePropertyMarket();
  const effective = useEffectiveRate();
  const [level, setLevel] = useState<AreaLevel>('area');
  const [tab, setTab] = useState<ViewTab>('areas');
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('all');
  const [areaFilter, setAreaFilter] = useState<AreaFilter>('all');
  const [exactArea, setExactArea] = useState<number | null>(null);
  const [place, setPlace] = useState<string>('all');
  useBridgeReceiver();

  const jy = useMemo(() => jalaliYearOf(Date.now()), []);
  const fx = useMemo(() => fxInputFromScenario(st.scenario, effective.rate), [st.scenario, effective.rate]);
  const busy = st.collect.status === 'running' || st.collect.status === 'checking';
  const lastSnap = st.snapshots.length > 0 ? st.snapshots[st.snapshots.length - 1] : null;
  const hasAnyData = st.listings.length > 0 || st.snapshots.length > 0;

  const activeListings = useMemo(() => listingsInWindow(st.listings), [st.listings]);
  // آگهی‌های بازار (پنجره + بدون پرت) + سن/دسته/معادل دلاری تتر
  const listingViews = useMemo(
    () => toListingViews(filterOutliers(activeListings, newCleaningReport()), effective.rate, jy),
    [activeListings, effective.rate, jy]
  );
  // جدول مناطق — از آگهی‌ها؛ نبود آگهی محلی → آخرین Snapshot
  const areaMatrix = useMemo(() => {
    if (listingViews.length > 0) return buildAreaTypeMatrix(listingViews, level, fx, jy);
    return lastSnap ? areaTypeMatrixFromSnapshot(lastSnap, level, fx) : buildAreaTypeMatrix([], level, fx, jy);
  }, [listingViews, level, fx, jy, lastSnap]);
  const city = areaMatrix[0] ?? null;

  const sourceCounts = useMemo(() => {
    const c: Record<ListingSource, number> = { divar: 0, sheypoor: 0 };
    for (const l of activeListings) if (l.source === 'divar' || l.source === 'sheypoor') c[l.source] += 1;
    return c;
  }, [activeListings]);

  const lastUpdate = useMemo(() => {
    const scraped = st.listings.reduce((m, l) => Math.max(m, l.scrapedAt), 0);
    return Math.max(scraped, lastSnap?.dateTs ?? 0) || null;
  }, [st.listings, lastSnap]);
  const stale = lastUpdate !== null && Date.now() - lastUpdate > STALE_DAYS * 86_400_000;

  /** رفتن به آگهی‌ها با فیلترهای مشخص (بقیه فیلترها پاک می‌شوند) */
  const showListings = (f: { place?: string; age?: AgeFilter; area?: AreaFilter; exact?: number | null }) => {
    setPlace(f.place ?? 'all');
    setAgeFilter(f.age ?? 'all');
    setAreaFilter(f.area ?? 'all');
    setExactArea(f.exact ?? null);
    setTab('listings');
  };
  const canPick = listingViews.length > 0;

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
      currentRate={effective.rate}
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
        subtitle="قیمت آپارتمان‌های فروشی دیوار و شیپور — به تفکیک کلید اول و سال ساخت"
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
        </Notice>
      )}
      {(effective.kind === 'manual' || effective.kind === 'none') && (
        <Notice tone="warn" className="mb-6" title="نرخ زنده تتر در دسترس نیست">
          {effective.kind === 'manual' ? 'معادل‌های دلاری با نرخ دستی تنظیمات حساب شده‌اند.' : 'معادل‌های دلاری تا دریافت نرخ تتر نمایش داده نمی‌شوند.'}
        </Notice>
      )}
      {stale && !busy && (
        <Notice tone="stale" className="mb-6">
          داده بازار بیش از {toFaDigits(STALE_DAYS)} روز پیش به‌روز شده است.
        </Notice>
      )}

      {!hasAnyData && !st.loading ? (
        <div className="space-y-6">
          <EmptyState
            icon={<Building2 />}
            message="هنوز داده‌ای از بازار املاک اهواز ثبت نشده است"
            hint="از «منابع داده» یکی از سه روش را انتخاب کنید: خودکار، پل مرورگر یا ورود فایل."
          />
          <div id="sources" className="scroll-mt-24">
            <SourcesPanel lastSnapshot={lastSnap} />
          </div>
          {scenarioPanel}
        </div>
      ) : hasAnyData && city ? (
        <div className="space-y-6">
          <Surface variant="focal" className="p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-base font-bold text-ink">قیمت هر متر در اهواز</h2>
              <p className="text-xs text-muted">
                {describeRate(effective)} · {toFaDigits(city.count)} آگهی · {toFaDigits(MARKET_WINDOW_DAYS)} روز اخیر
              </p>
            </div>
            <TypeOverview
              cells={city.cells}
              showScenario={scenarioActive(fx)}
              onPick={canPick ? (t: PriceType) => showListings({ age: ageFilterOfType(t) }) : undefined}
            />
          </Surface>

          <div>
            <Tabs<ViewTab>
              label="نمای بازار"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'areas', label: 'مناطق', icon: <Table2 />, badge: Math.max(0, areaMatrix.length - 1) },
                { value: 'sizes', label: 'متراژ', icon: <Maximize2 /> },
                { value: 'changes', label: 'تغییرات قیمت', icon: <History /> },
                { value: 'listings', label: 'آگهی‌ها', icon: <List />, badge: listingViews.length }
              ]}
            />
            <div className="pt-5">
              {tab === 'areas' && (
                <Surface className="overflow-hidden">
                  <PriceTypeMatrix
                    rows={areaMatrix}
                    rowHeader={level === 'area' ? 'منطقه' : 'محله'}
                    caption="قیمت مناطق به تفکیک کلید اول و سال ساخت"
                    toolbar={
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
                    }
                    onPick={
                      canPick
                        ? (rowKey, t) => showListings({ place: rowKey === CITY_ROW_KEY ? 'all' : rowKey, age: ageFilterOfType(t) })
                        : undefined
                    }
                  />
                </Surface>
              )}

              {tab === 'sizes' && (
                <Surface className="overflow-hidden">
                  <SizePanel
                    views={listingViews}
                    fx={fx}
                    jalaliYear={jy}
                    onPickBand={(band, t) => showListings({ area: band as AreaBand, age: ageFilterOfType(t) })}
                    onPickExact={(a) => showListings({ exact: a })}
                  />
                </Surface>
              )}

              {tab === 'changes' && <PriceChangePanel snapshots={st.snapshots} />}

              {tab === 'listings' && (
                <Surface className="overflow-hidden">
                  <ListingsExplorer
                    listings={listingViews}
                    age={ageFilter}
                    area={areaFilter}
                    onAge={setAgeFilter}
                    onArea={setAreaFilter}
                    exactArea={exactArea}
                    onExactArea={setExactArea}
                    place={place}
                    onPlace={setPlace}
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
