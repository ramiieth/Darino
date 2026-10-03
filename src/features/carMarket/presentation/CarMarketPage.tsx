/** ============================================================
 * بازار خودرو — قیمت روز همه خودروهای داخلی، مونتاژی و وارداتی
 *
 *  منبع: car.ir (قیمت بازار + کارخانه) · به‌روزرسانی خودکار روزانه
 *  هر روز یک Snapshot با نرخ تتر همان روز → رشد/کاهش تومانی و دلاری
 *  روزانه، هفتگی، ماهانه، … (مثل بازار املاک)
 *  تب «سرمایه‌گذاری» = Snapshotهای دستی قبلی (بدون تغییر)
 * ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Car, Factory, History, LayoutGrid, List, RefreshCw } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { Button } from '@/shared/components/ui/Button';
import { SearchField } from '@/shared/components/ui/Input';
import { ChipGroup, Tabs } from '@/shared/components/ui/SegmentedControl';
import { Sheet } from '@/shared/components/ui/Sheet';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { PageSkeleton } from '@/shared/components/ui/Skeleton';
import { describeRate } from '@/shared/components/ui/UsdtRateField';
import { useUsdRate, useUsdtHistoryStore } from '@/shared/store/usdtStore';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import { cn } from '@/shared/lib/cn';
import { VehiclePage } from '@/features/vehicle/presentation/VehiclePage';
import { useCarMarket, useCarMarketStore } from '../data/store';
import { brandInfo } from '../domain/brands';
import { CHANGE_PERIODS, buildCarViews, periodAvailableFrom, periodDays, type CarView, type PeriodKey } from '../domain/changes';
import type { CarCategory } from '../domain/types';
import { CarBrandLogo } from './CarBrandLogo';
import { PriceList } from './PriceList';
import { ChangesPanel } from './ChangesPanel';
import { BrandsPanel } from './BrandsPanel';
import { CarDetail } from './CarDetail';
import { CATEGORY_FA, normalizeQuery } from './format';

type ViewTab = 'prices' | 'changes' | 'brands' | 'manual';
type CatFilter = 'all' | CarCategory;

export function CarMarketPage() {
  const st = useCarMarket();
  const effective = useUsdRate();
  const history = useUsdtHistoryStore();
  const [tab, setTab] = useState<ViewTab>('prices');
  const [period, setPeriod] = useState<PeriodKey>('1d');
  const [cat, setCat] = useState<CatFilter>('all');
  const [brand, setBrand] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CarView | null>(null);

  const snaps = st.snapshots;
  const earliest = snaps.length > 0 ? snaps[0].dateTs : null;
  useEffect(() => {
    void useUsdtHistoryStore.getState().ensure(earliest ?? Date.now());
  }, [earliest]);

  const days = periodDays(period);
  const periodLabel = CHANGE_PERIODS.find((p) => p.key === period)?.label ?? '';
  const market = useMemo(() => buildCarViews(snaps, days, history.rates), [snaps, days, history.rates]);
  const latest = market.latest;

  // فیلتر دسته + جستجو (برند فیلتر جدا تا نوار برندها همه برندهای دسته را نشان دهد)
  const catViews = useMemo(() => {
    const q = normalizeQuery(query);
    return market.views.filter((v) => {
      if (cat !== 'all' && v.category !== cat) return false;
      if (!q) return true;
      const hay = normalizeQuery(`${v.brandFa} ${brandInfo(v.row.brand).en} ${v.row.model} ${v.row.year} ${v.row.option ?? ''}`);
      return hay.includes(q);
    });
  }, [market.views, cat, query]);
  const views = useMemo(() => (brand ? catViews.filter((v) => v.row.brand === brand) : catViews), [catViews, brand]);

  const brandStrip = useMemo(() => {
    const seen = new Map<string, { brand: string; fa: string; n: number }>();
    for (const v of catViews) {
      const b = seen.get(v.row.brand);
      if (b) b.n += 1;
      else seen.set(v.row.brand, { brand: v.row.brand, fa: v.brandFa, n: 1 });
    }
    return [...seen.values()].sort((a, b) => b.n - a.n);
  }, [catViews]);

  const counts = useMemo(() => {
    const c: Record<CatFilter, number> = { all: market.views.length, domestic: 0, assembled: 0, imported: 0 };
    for (const v of market.views) c[v.category] += 1;
    return c;
  }, [market.views]);
  const brandCount = useMemo(() => new Set(market.views.map((v) => v.row.brand)).size, [market.views]);

  const busy = st.status === 'running';
  const lastUpdate = latest?.dateTs ?? null;
  const pickBrand = (b: string) => {
    setBrand(b);
    setTab('prices');
  };

  const header = (
    <PageHeader
      title="بازار خودرو"
      actions={
        <Button icon={<RefreshCw className={cn(busy && 'animate-spin')} />} onClick={() => void useCarMarketStore.getState().refresh()} disabled={busy}>
          {busy ? 'در حال دریافت…' : 'به‌روزرسانی قیمت‌ها'}
        </Button>
      }
      meta={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Car aria-hidden className="h-3.5 w-3.5" /> {toFaDigits(brandCount)} برند · {toFaDigits(counts.all)} خودرو
          </span>
          <span>
            آخرین به‌روزرسانی: <span className="text-ink">{lastUpdate ? `${formatJalali(lastUpdate)} · ${fmtRelativeAge(lastUpdate)}` : '—'}</span>
          </span>
          <span>{toFaDigits(snaps.length)} روز ثبت‌شده</span>
          <span>{describeRate(effective)}</span>
        </div>
      }
    />
  );

  const tabs = (
    <Tabs<ViewTab>
      label="نمای بازار خودرو"
      value={tab}
      onChange={setTab}
      options={[
        { value: 'prices', label: 'قیمت روز', icon: <List /> },
        { value: 'changes', label: 'رشد و کاهش', icon: <History /> },
        { value: 'brands', label: 'برندها', icon: <LayoutGrid />, badge: brandCount },
        { value: 'manual', label: 'سرمایه‌گذاری (دستی)', icon: <Factory /> }
      ]}
    />
  );

  if (tab === 'manual') {
    return (
      <Page>
        {header}
        <div className="mb-5">{tabs}</div>
        <VehiclePage embedded />
      </Page>
    );
  }

  return (
    <Page>
      {header}

      {st.status === 'error' && st.message && (
        <Notice tone="warn" className="mb-6" title="به‌روزرسانی انجام نشد">
          {st.message}
        </Notice>
      )}
      {effective.kind === 'none' && (
        <Notice tone="warn" className="mb-6" title="نرخ زنده تتر در دسترس نیست">
          معادل‌های دلاری تا دریافت نرخ تتر از والکس یا بیت‌پین نمایش داده نمی‌شوند.
        </Notice>
      )}

      <div className="mb-5">{tabs}</div>

      {!latest && (st.loading || busy || !st.hydrated) ? (
        <PageSkeleton label="بازار خودرو" />
      ) : !latest ? (
        <EmptyState
          icon={<Car />}
          message="هنوز قیمتی دریافت نشده است"
          hint="«به‌روزرسانی قیمت‌ها» را بزنید تا قیمت روز همه خودروها از car.ir دریافت شود."
        />
      ) : (
        <div className="space-y-5">
          <Surface className="space-y-4 p-4 md:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <SearchField value={query} onChange={setQuery} placeholder="جستجوی برند یا مدل (مثلاً تارا، کیا، ۱۴۰۵)" className="lg:w-80" />
              <ChipGroup<CatFilter>
                label="دسته خودرو"
                value={cat}
                onChange={(c) => {
                  setCat(c);
                  setBrand(null);
                }}
                options={(['all', 'domestic', 'assembled', 'imported'] as CatFilter[]).map((c) => ({
                  value: c,
                  label: c === 'all' ? 'همه' : CATEGORY_FA[c],
                  badge: counts[c]
                }))}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">دوره تغییر:</span>
              <ChipGroup<PeriodKey> label="دوره تغییر قیمت" value={period} onChange={setPeriod} options={CHANGE_PERIODS.map((p) => ({ value: p.key, label: p.label }))} />
            </div>

            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:-mx-5 md:px-5" role="group" aria-label="فیلتر برند">
              <button
                type="button"
                onClick={() => setBrand(null)}
                aria-pressed={brand === null}
                className={cn(
                  'flex w-16 shrink-0 flex-col items-center gap-1 rounded-field py-1.5 text-2xs',
                  brand === null ? 'bg-accent-soft font-semibold text-accent' : 'text-muted hover:bg-surface-2'
                )}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-xs font-bold">همه</span>
                همه برندها
              </button>
              {brandStrip.map((b) => (
                <button
                  key={b.brand}
                  type="button"
                  onClick={() => setBrand(brand === b.brand ? null : b.brand)}
                  aria-pressed={brand === b.brand}
                  title={`${b.fa} (${toFaDigits(b.n)})`}
                  className={cn(
                    'flex w-16 shrink-0 flex-col items-center gap-1 rounded-field py-1.5 text-2xs',
                    brand === b.brand ? 'bg-accent-soft font-semibold text-accent' : 'text-muted hover:bg-surface-2'
                  )}
                >
                  <CarBrandLogo brand={b.brand} label={b.fa} size={40} className={cn(brand === b.brand && 'ring-2 ring-accent')} />
                  <span className="w-full truncate text-center">{b.fa}</span>
                </button>
              ))}
            </div>
          </Surface>

          {tab === 'prices' && (
            <Surface className="overflow-hidden">
              <PriceList views={views} periodLabel={periodLabel} onPick={setSelected} />
            </Surface>
          )}
          {tab === 'changes' && (
            <ChangesPanel views={views} periodLabel={periodLabel} availableFrom={periodAvailableFrom(snaps, days)} onPick={setSelected} />
          )}
          {tab === 'brands' && <BrandsPanel views={catViews} periodLabel={periodLabel} onPick={pickBrand} />}

          <p className="text-2xs leading-5 text-muted">
            منبع: car.ir — قیمت بازار و کارخانه (تومان)، هر روز خودکار ذخیره می‌شود. معادل دلاری با نرخ تتر همان روز. سال مدل شمسی = تولید داخل
            (داخلی یا مونتاژی)، میلادی = وارداتی. قیمت‌ها پیشنهادی بازارند و لزوماً قیمت معامله نیستند.
          </p>
        </div>
      )}

      <Sheet open={selected !== null} onClose={() => setSelected(null)} title={selected ? `${selected.brandFa} · ${selected.row.model}` : ''} variant="panel" size="lg">
        {selected && <CarDetail view={selected} snapshots={snaps} daily={history.rates} />}
      </Sheet>
    </Page>
  );
}
