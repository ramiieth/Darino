/** ============================================================
 * بازار خودرو — قیمت روز همه خودروهای داخلی، مونتاژی و وارداتی
 *
 *  منبع: car.ir (قیمت بازار + کارخانه) · به‌روزرسانی خودکار روزانه
 *  هر مدل یک کارت؛ مبنای قیمت = آخرین سال ساخت · وضعیت تولید/توقف تولید
 *  رشد/کاهش تومانی و دلاری: روزانه، هفتگی، ۱ تا ۷۲ ماهه
 * ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { Car, History, LayoutGrid, RefreshCw, Tags } from 'lucide-react';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { Button } from '@/shared/components/ui/Button';
import { SearchField, Select } from '@/shared/components/ui/Input';
import { ChipGroup, Tabs } from '@/shared/components/ui/SegmentedControl';
import { Sheet } from '@/shared/components/ui/Sheet';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { PageSkeleton } from '@/shared/components/ui/Skeleton';
import { describeRate } from '@/shared/components/ui/UsdtRateField';
import { useUsdRate, useUsdtHistoryStore } from '@/shared/store/usdtStore';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import { cn } from '@/shared/lib/cn';
import { useCarMarket, useCarMarketStore } from '../data/store';
import { brandInfo } from '../domain/brands';
import { periodAvailableFrom, periodOf, seriesIndex, type PeriodKey } from '../domain/changes';
import { buildModelMarket, marketSummary, type CarModelView, type ProductionStatus } from '../domain/models';
import type { CarCategory } from '../domain/types';
import { CarBrandLogo } from './CarBrandLogo';
import { MarketOverview } from './MarketOverview';
import { ModelGrid, SORT_FA, type SortKey } from './ModelGrid';
import { ChangesPanel } from './ChangesPanel';
import { BrandsPanel } from './BrandsPanel';
import { CarDetail } from './CarDetail';
import { PeriodPicker } from './PeriodPicker';
import { CATEGORY_FA, normalizeQuery } from './format';

type ViewTab = 'models' | 'changes' | 'brands';
type CatFilter = 'all' | CarCategory;
type StatusFilter = 'active' | 'all' | ProductionStatus;

const STATUS_FILTER_FA: Record<StatusFilter, string> = {
  active: 'در بازار',
  all: 'همه',
  current: 'در حال عرضه',
  'no-new': 'بدون مدل جدید',
  stopped: 'توقف تولید'
};

export function CarMarketPage() {
  const st = useCarMarket();
  const effective = useUsdRate();
  const history = useUsdtHistoryStore();
  const [tab, setTab] = useState<ViewTab>('models');
  const [periodKey, setPeriodKey] = useState<PeriodKey>('1d');
  const [cat, setCat] = useState<CatFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [brand, setBrand] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('brand');
  const [selected, setSelected] = useState<CarModelView | null>(null);

  const snaps = st.snapshots;
  const earliest = snaps.length > 0 ? snaps[0].dateTs : null;
  useEffect(() => {
    void useUsdtHistoryStore.getState().ensure(earliest ?? Date.now());
  }, [earliest]);

  const period = periodOf(periodKey);
  const market = useMemo(() => buildModelMarket(snaps, period, history.rates), [snaps, period, history.rates]);
  const series = useMemo(() => seriesIndex(snaps, history.rates), [snaps, history.rates]);
  const latest = market.latest;

  // فیلتر دسته + وضعیت + جستجو (برند جدا تا نوار لوگوها همه برندهای فیلتر را نشان دهد)
  const filtered = useMemo(() => {
    const q = normalizeQuery(query);
    return market.models.filter((m) => {
      if (cat !== 'all' && m.category !== cat) return false;
      if (status === 'active' && m.status === 'stopped') return false;
      if (status !== 'active' && status !== 'all' && m.status !== status) return false;
      if (!q) return true;
      const years = m.trims.map((t) => t.row.year).join(' ');
      return normalizeQuery(`${m.brandFa} ${brandInfo(m.brand).en} ${m.model} ${years}`).includes(q);
    });
  }, [market.models, cat, status, query]);
  const models = useMemo(() => (brand ? filtered.filter((m) => m.brand === brand) : filtered), [filtered, brand]);

  const brandStrip = useMemo(() => {
    const seen = new Map<string, { brand: string; fa: string; n: number }>();
    for (const m of filtered) {
      const b = seen.get(m.brand);
      if (b) b.n += 1;
      else seen.set(m.brand, { brand: m.brand, fa: m.brandFa, n: 1 });
    }
    return [...seen.values()].sort((a, b) => b.n - a.n);
  }, [filtered]);

  const counts = useMemo(() => {
    const c = { cat: { all: 0, domestic: 0, assembled: 0, imported: 0 } as Record<CatFilter, number>, status: { active: 0, all: 0, current: 0, 'no-new': 0, stopped: 0 } as Record<StatusFilter, number> };
    for (const m of market.models) {
      c.cat.all += 1;
      c.cat[m.category] += 1;
      c.status.all += 1;
      c.status[m.status] += 1;
      if (m.status !== 'stopped') c.status.active += 1;
    }
    return c;
  }, [market.models]);
  const summary = useMemo(() => marketSummary(models), [models]);
  const brandCount = useMemo(() => new Set(market.models.map((m) => m.brand)).size, [market.models]);
  const availableFrom = periodAvailableFrom(snaps, period);

  const busy = st.status === 'running';
  const lastUpdate = latest?.dateTs ?? null;
  const pickBrand = (b: string) => {
    setBrand(b);
    setTab('models');
    setSort('brand');
  };

  return (
    <Page>
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
              <Car aria-hidden className="h-3.5 w-3.5" /> {toFaDigits(brandCount)} برند · {toFaDigits(counts.cat.all)} مدل
            </span>
            <span>
              به‌روزرسانی: <span className="text-ink">{lastUpdate ? `${formatJalali(lastUpdate)} · ${fmtRelativeAge(lastUpdate)}` : '—'}</span>
            </span>
            <span>{toFaDigits(snaps.length)} روز تاریخچه</span>
            <span>{describeRate(effective)}</span>
          </div>
        }
      />

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

      {!latest && (st.loading || busy || !st.hydrated) ? (
        <PageSkeleton label="بازار خودرو" />
      ) : !latest ? (
        <EmptyState
          icon={<Car />}
          message="هنوز قیمتی دریافت نشده است"
          hint="«به‌روزرسانی قیمت‌ها» را بزنید تا قیمت روز همه خودروها از car.ir دریافت شود."
        />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <PeriodPicker value={periodKey} onChange={setPeriodKey} />
            <SearchField value={query} onChange={setQuery} placeholder="جستجو: تارا، کیا، ۱۴۰۵…" className="md:w-72" />
          </div>

          <MarketOverview
            summary={summary}
            periodLabel={period.label}
            baseTs={market.base?.dateTs ?? null}
            availableFrom={availableFrom}
            models={models}
            onPick={setSelected}
          />

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <ChipGroup<CatFilter>
                label="دسته خودرو"
                value={cat}
                onChange={(c) => {
                  setCat(c);
                  setBrand(null);
                }}
                options={(['all', 'domestic', 'assembled', 'imported'] as CatFilter[]).map((c) => ({
                  value: c,
                  label: c === 'all' ? 'همه دسته‌ها' : CATEGORY_FA[c],
                  badge: counts.cat[c]
                }))}
              />
              <ChipGroup<StatusFilter>
                label="وضعیت تولید"
                value={status}
                onChange={(s) => {
                  setStatus(s);
                  setBrand(null);
                }}
                options={(['active', 'current', 'no-new', 'stopped', 'all'] as StatusFilter[]).map((s) => ({
                  value: s,
                  label: STATUS_FILTER_FA[s],
                  badge: counts.status[s]
                }))}
              />
            </div>

            <div className="no-scrollbar -mx-gutter flex gap-1 overflow-x-auto px-gutter pb-1 md:mx-0 md:px-0" role="group" aria-label="فیلتر برند">
              <button
                type="button"
                onClick={() => setBrand(null)}
                aria-pressed={brand === null}
                className={cn(
                  'flex w-[4.5rem] shrink-0 flex-col items-center gap-1.5 rounded-card py-2 text-2xs transition-colors',
                  brand === null ? 'bg-accent-soft font-semibold text-accent' : 'text-muted hover:bg-surface-2'
                )}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-xs font-bold shadow-card ring-1 ring-black/5">همه</span>
                همه برندها
              </button>
              {brandStrip.map((b) => (
                <button
                  key={b.brand}
                  type="button"
                  onClick={() => setBrand(brand === b.brand ? null : b.brand)}
                  aria-pressed={brand === b.brand}
                  title={`${b.fa} (${toFaDigits(b.n)} مدل)`}
                  className={cn(
                    'relative flex w-[4.5rem] shrink-0 flex-col items-center gap-1.5 rounded-card py-2 text-2xs transition-colors',
                    brand === b.brand ? 'bg-accent-soft font-semibold text-accent' : 'text-muted hover:bg-surface-2'
                  )}
                >
                  <CarBrandLogo brand={b.brand} label={b.fa} size={44} className={cn('shadow-card', brand === b.brand && 'ring-2 ring-accent')} />
                  <span className="w-full truncate px-1 text-center">{b.fa}</span>
                  <span className="absolute end-2 top-1 rounded-full bg-card px-1 text-[0.6rem] leading-4 text-subtle shadow-card">{toFaDigits(b.n)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <Tabs<ViewTab>
              label="نمای بازار خودرو"
              value={tab}
              onChange={setTab}
              className="min-w-0 sm:flex-1"
              options={[
                { value: 'models', label: 'خودروها', icon: <LayoutGrid />, badge: models.length },
                { value: 'changes', label: 'رشد و کاهش', icon: <History /> },
                { value: 'brands', label: 'برندها', icon: <Tags />, badge: brandStrip.length }
              ]}
            />
            {tab === 'models' && (
              <div className="w-full sm:w-48">
                <Select aria-label="مرتب‌سازی" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  {(Object.keys(SORT_FA) as SortKey[]).map((k) => (
                    <option key={k} value={k}>
                      {SORT_FA[k]}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          {tab === 'models' && <ModelGrid models={models} sort={sort} series={series} onPick={setSelected} />}
          {tab === 'changes' && <ChangesPanel models={models} periodLabel={period.label} availableFrom={availableFrom} onPick={setSelected} />}
          {tab === 'brands' && <BrandsPanel models={filtered} periodLabel={period.label} onPick={pickBrand} />}

          <p className="text-2xs leading-5 text-muted">
            منبع: car.ir — قیمت بازار و کارخانه (تومان)، هر روز خودکار ذخیره می‌شود؛ معادل دلاری با نرخ تتر همان روز. مبنای قیمت هر خودرو آخرین سال
            ساخت آن است. سال مدل شمسی = تولید داخل (داخلی یا مونتاژی)، میلادی = وارداتی. «توقف تولید»: آخرین مدل دو سال یا قدیمی‌تر، قیمت بیش از
            ۹۰ روز به‌روز نشده، یا حذف از فهرست car.ir (با آخرین قیمت ثبت‌شده). قیمت‌ها پیشنهادی بازارند و لزوماً قیمت معامله نیستند.
          </p>
        </div>
      )}

      <Sheet open={selected !== null} onClose={() => setSelected(null)} title={selected ? `${selected.brandFa} · ${selected.model}` : ''} variant="panel" size="lg">
        {selected && <CarDetail model={selected} snapshots={snaps} daily={history.rates} />}
      </Sheet>
    </Page>
  );
}
