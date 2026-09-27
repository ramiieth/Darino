/** ============================================================
 * بازار املاک (Property Market) — اهواز
 *
 *  هر منطقه به تفکیک «نوع قیمت»: کلید اول و ۱ تا ۷ سال ساخت (جدا از هم).
 *  داده: فقط دیوار، از مسیر سرور (دکمه «به‌روزرسانی داده») · آپارتمان ۹۰ متر به بالا
 *  دلار: نرخ زنده تتر (والکس/بیت‌پین) · همه اعداد فارسی
 * ============================================================ */
import { useMemo, useState } from 'react';
import { Building2, History, List, MapPin, Maximize2, RefreshCw, Square, Table2 } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { PageSkeleton } from '@/shared/components/ui/Skeleton';
import { Button } from '@/shared/components/ui/Button';
import { Tabs } from '@/shared/components/ui/SegmentedControl';
import { UsdtRateField, describeRate } from '@/shared/components/ui/UsdtRateField';
import { useUsdRate } from '@/shared/store/usdtStore';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import { usePropertyMarket, usePropertyMarketStore } from '../data/store';
import { listingsInWindow } from '../data/ingest';
import { ageFilterOfType, jalaliYearOf, type AreaBand } from '../domain/segments';
import { areaTypeMatrixFromSnapshot, buildAreaTypeMatrix, toListingViews } from '../service/propertyMarketService';
import { filterOutliers, newCleaningReport } from '../collector/pipeline';
import { PriceTypeMatrix } from './PriceTypeMatrix';
import { SizePanel } from './SizePanel';
import { PriceChangePanel } from './PriceChangePanel';
import { ListingsExplorer, type AgeFilter, type AreaFilter } from './ListingsExplorer';
import { LegacyPanel } from './LegacyPanel';

/** داده قدیمی‌تر از این → هشدار به‌روزرسانی */
const STALE_DAYS = 14;

type ViewTab = 'areas' | 'sizes' | 'changes' | 'listings';

export function PropertyMarketPage() {
  const st = usePropertyMarket();
  const effective = useUsdRate();
  const [tab, setTab] = useState<ViewTab>('areas');
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('all');
  const [areaFilter, setAreaFilter] = useState<AreaFilter>('all');
  const [exactArea, setExactArea] = useState<number | null>(null);
  const [place, setPlace] = useState<string>('all');

  const jy = useMemo(() => jalaliYearOf(Date.now()), []);
  const rate = effective.rate;
  const busy = st.collect.status === 'running' || st.collect.status === 'checking';
  const lastSnap = st.snapshots.length > 0 ? st.snapshots[st.snapshots.length - 1] : null;
  const hasAnyData = st.listings.length > 0 || st.snapshots.length > 0;

  // آگهی‌های بازار (پنجره + بدون پرت) + سن/دسته/معادل دلاری تتر
  const listingViews = useMemo(
    () => toListingViews(filterOutliers(listingsInWindow(st.listings), newCleaningReport()), rate, jy),
    [st.listings, rate, jy]
  );
  // جدول مناطق — از آگهی‌ها؛ نبود آگهی محلی → آخرین Snapshot
  const areaMatrix = useMemo(() => {
    if (listingViews.length > 0) return buildAreaTypeMatrix(listingViews, rate, jy);
    return lastSnap ? areaTypeMatrixFromSnapshot(lastSnap, rate) : [];
  }, [listingViews, rate, jy, lastSnap]);

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
    void usePropertyMarketStore.getState().startCollection();
  };

  const collectNotice = busy ? (
    <Notice tone="info" className="mb-6" title="در حال جمع‌آوری از دیوار">
      {toFaDigits(st.collect.sources.divar.valid)} آگهی معتبر تا این لحظه — داده‌ها همزمان ذخیره می‌شوند.
    </Notice>
  ) : st.collect.status === 'error' || st.collect.status === 'unavailable' ? (
    <Notice tone="warn" className="mb-6" title="به‌روزرسانی انجام نشد">
      {st.collect.message}
    </Notice>
  ) : st.collect.status === 'done' && st.collect.message ? (
    <Notice tone="info" className="mb-6">
      به‌روزرسانی انجام شد — {st.collect.message}
    </Notice>
  ) : null;

  return (
    <Page>
      <PageHeader
        title="بازار املاک اهواز"
        subtitle="قیمت آپارتمان‌های فروشی دیوار (۹۰ متر به بالا) — به تفکیک کلید اول و سال ساخت"
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
              <span className="text-ink">{lastUpdate ? `${formatJalali(lastUpdate)} · ${fmtRelativeAge(lastUpdate)}` : '—'}</span>
            </span>
            <span>{toFaDigits(listingViews.length)} آگهی دیوار</span>
            <span>{describeRate(effective)}</span>
          </div>
        }
      />

      {collectNotice}
      {effective.kind === 'none' && (
        <Notice tone="warn" className="mb-6" title="نرخ زنده تتر در دسترس نیست">
          معادل‌های دلاری تا دریافت نرخ تتر از والکس یا بیت‌پین نمایش داده نمی‌شوند.
        </Notice>
      )}
      {stale && !busy && (
        <Notice tone="stale" className="mb-6">
          داده بازار بیش از {toFaDigits(STALE_DAYS)} روز پیش به‌روز شده است.
        </Notice>
      )}

      {!hasAnyData && !st.loading ? (
        <EmptyState
          icon={<Building2 />}
          message="هنوز داده‌ای از بازار املاک اهواز ثبت نشده است"
          hint="«به‌روزرسانی داده» را بزنید تا آگهی‌های دیوار جمع‌آوری شوند."
        />
      ) : hasAnyData ? (
        <div className="space-y-6">
          <div>
            <Tabs<ViewTab>
              label="نمای بازار"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'areas', label: 'مناطق', icon: <Table2 />, badge: areaMatrix.length },
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
                    rowHeader="منطقه"
                    caption="قیمت مناطق به تفکیک کلید اول و سال ساخت"
                    onPick={canPick ? (rowKey, t) => showListings({ place: rowKey, age: ageFilterOfType(t) }) : undefined}
                    onPickRow={canPick ? (rowKey) => showListings({ place: rowKey }) : undefined}
                  />
                </Surface>
              )}

              {tab === 'sizes' && (
                <Surface className="overflow-hidden">
                  <SizePanel
                    views={listingViews}
                    usdRate={rate}
                    jalaliYear={jy}
                    onPickBand={(band, t) => showListings({ area: band as AreaBand, age: t ? ageFilterOfType(t) : 'all' })}
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

          <Surface className="p-4 md:p-5">
            <h2 className="mb-3 text-sm font-bold text-ink">نرخ دلار (تتر)</h2>
            <UsdtRateField effective={effective} />
          </Surface>
        </div>
      ) : (
        <PageSkeleton />
      )}

      <LegacyPanel assets={st.legacyAssets} />
    </Page>
  );
}
