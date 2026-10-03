/** ============================================================
 * خودروهای وارداتی پلاک اروند — اهواز، آبادان، خرمشهر
 *
 *  سرصفحه طلایی (هویت جدا از بازار کشور) + شاخص اختلاف با پلاک ملی
 *  تب‌ها: مقایسه قیمت · آگهی‌ها · روند
 *  داده: آگهی‌های تأییدشده دیوار، خودکار هر ۶ ساعت (با باز شدن صفحه)
 * ============================================================ */
import { useMemo, useState } from 'react';
import { BarChart3, LayoutGrid, LineChart, RefreshCw, Square } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/components/ui/Button';
import { SearchField, Select } from '@/shared/components/ui/Input';
import { ChipGroup, Tabs } from '@/shared/components/ui/SegmentedControl';
import { Sheet } from '@/shared/components/ui/Sheet';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { useUsdRate } from '@/shared/store/usdtStore';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import { TrendChart } from '@/features/propertyMarket/presentation/MarketCharts';
import { fmtCarPct, fmtCarToman, normalizeQuery } from '@/features/carMarket/presentation/format';
import { useArvand, useArvandStore, type RunState } from '../data/store';
import { ARVAND_KINDS } from '../domain/ads';
import { buildGroups, marketIndex, median, type ModelGroup } from '../domain/compare';
import type { ArvandCity, CarAd, PlateKind } from '../domain/types';
import { AdCard } from './AdCard';
import { GroupCard } from './GroupCard';
import { PLATE_FA } from './PlateBadge';

type Tab = 'compare' | 'ads' | 'trend';
type CityFilter = 'all' | Exclude<ArvandCity, 'tehran'>;
type PlateFilter = 'all' | 'arvand' | 'arvand-convertible' | 'customs';
type AdSort = 'new' | 'cheap' | 'expensive';
type GroupSort = 'gap' | 'count' | 'price';

const CITY_FA: Record<Exclude<ArvandCity, 'tehran'>, string> = { ahvaz: 'اهواز', abadan: 'آبادان', khorramshahr: 'خرمشهر' };
const PHASE_FA: Record<NonNullable<RunState['phase']>, string> = {
  search: 'جستجوی آگهی‌ها',
  details: 'بررسی متن آگهی‌ها',
  baseline: 'قیمت پلاک ملی',
  saving: 'ذخیره'
};

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-field bg-white/10 px-3 py-2.5 backdrop-blur-sm">
      <p className="text-2xs text-white/75">{label}</p>
      <p className="mt-0.5 text-xl font-extrabold text-white">{value}</p>
      {sub && <p className="text-2xs text-white/70">{sub}</p>}
    </div>
  );
}

function Progress({ run }: { run: RunState }) {
  const pct = run.total > 0 ? Math.min(100, (run.done / run.total) * 100) : 100;
  return (
    <div className="mt-4" role="status" aria-live="polite">
      <div className="flex justify-between text-2xs text-white/85">
        <span>{run.phase ? PHASE_FA[run.phase] : 'در حال آماده‌سازی'}…</span>
        {run.total > 0 && (
          <span>
            {toFaDigits(run.done)} از {toFaDigits(run.total)}
          </span>
        )}
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/20">
        <div className={cn('h-full rounded-full bg-white transition-all', run.total === 0 && 'animate-pulse')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ArvandSection() {
  const st = useArvand(true);
  const rate = useUsdRate().rate;
  const [tab, setTab] = useState<Tab>('compare');
  const [city, setCity] = useState<CityFilter>('all');
  const [plate, setPlate] = useState<PlateFilter>('all');
  const [query, setQuery] = useState('');
  const [adSort, setAdSort] = useState<AdSort>('new');
  const [groupSort, setGroupSort] = useState<GroupSort>('gap');
  const [picked, setPicked] = useState<ModelGroup | null>(null);

  const running = st.run.status === 'running';
  const khuz = useMemo(() => st.ads.filter((a) => a.region === 'khuz'), [st.ads]);
  const groups = useMemo(() => buildGroups(st.ads), [st.ads]);
  const index = useMemo(() => marketIndex(groups), [groups]);

  const filteredAds = useMemo(() => {
    const q = normalizeQuery(query);
    const list = khuz.filter((a) => {
      if (city !== 'all' && a.city !== city) return false;
      if (plate !== 'all' && a.plate !== plate) return false;
      if (!q) return true;
      return normalizeQuery(`${a.title} ${a.model ?? ''} ${a.year ?? ''} ${a.where ?? ''}`).includes(q);
    });
    const ts = (a: CarAd) => a.updatedAt ?? a.listedAt ?? a.firstSeenAt;
    return list.sort((a, b) =>
      adSort === 'new' ? ts(b) - ts(a) : adSort === 'cheap' ? (a.price ?? Infinity) - (b.price ?? Infinity) : (b.price ?? 0) - (a.price ?? 0)
    );
  }, [khuz, city, plate, query, adSort]);

  const shownGroups = useMemo(() => {
    const q = normalizeQuery(query);
    const list = groups.filter((g) => !q || normalizeQuery(`${g.model} ${g.year}`).includes(q));
    return list.sort((a, b) => {
      if (groupSort === 'count') return b.arvand.n - a.arvand.n;
      if (groupSort === 'price') return (b.arvand.median ?? 0) - (a.arvand.median ?? 0);
      // نمونه کافی اول، سپس نمونه کم؛ در هر دسته بیشترین تخفیف اول
      return Number(a.lowSample) - Number(b.lowSample) || (a.gapPct ?? Infinity) - (b.gapPct ?? Infinity) || b.arvand.n - a.arvand.n;
    });
  }, [groups, query, groupSort]);

  const withBase = useMemo(() => shownGroups.filter((g) => g.gapPct !== null), [shownGroups]);
  const noBase = useMemo(() => shownGroups.filter((g) => g.gapPct === null), [shownGroups]);

  const counts = useMemo(() => {
    const c: Record<PlateFilter, number> = { all: 0, arvand: 0, 'arvand-convertible': 0, customs: 0 };
    const cities: Record<CityFilter, number> = { all: 0, ahvaz: 0, abadan: 0, khorramshahr: 0 };
    for (const a of khuz) {
      c.all += 1;
      if (a.plate in c) c[a.plate as PlateFilter] += 1;
      cities.all += 1;
      if (a.city !== 'tehran') cities[a.city] += 1;
    }
    return { plate: c, city: cities };
  }, [khuz]);

  const trend = useMemo(
    () =>
      st.snapshots
        .map((s) => {
          const gaps = s.groups.filter((g) => g.arvMedian && g.natMedian && g.arvN >= 2 && g.natN >= 2).map((g) => (g.arvMedian! / g.natMedian! - 1) * 100);
          return { ts: s.dateTs, gap: median(gaps), ads: s.activeAds };
        })
        .filter((p) => p.gap !== null),
    [st.snapshots]
  );

  const arvandCount = khuz.filter((a) => ARVAND_KINDS.includes(a.plate)).length;
  const hasData = khuz.length > 0;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-panel bg-gradient-to-br from-[#2E5BFF] via-[#1837B0] to-[#0B1B5C] p-5 text-white shadow-pop md:p-6">
        <div aria-hidden className="pointer-events-none absolute -end-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 start-10 h-56 w-56 rounded-full bg-black/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-2xs font-semibold">
              <span aria-hidden className="h-2 w-2 rounded-full bg-white" /> منطقه آزاد اروند · خوزستان
            </p>
            <h2 className="mt-2 text-2xl font-extrabold md:text-3xl">خودروهای وارداتی پلاک اروند</h2>
            <p className="mt-1 text-sm text-white/85">اهواز · آبادان · خرمشهر — آگهی‌های تأییدشده دیوار، مقایسه با پلاک ملی</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {running ? (
              <Button variant="outline" icon={<Square />} onClick={() => useArvandStore.getState().cancel()} className="!border-white/40 !bg-white/10 !text-white">
                توقف
              </Button>
            ) : (
              <Button icon={<RefreshCw />} onClick={() => void useArvandStore.getState().collect()} className="!bg-white !text-[#1837B0]">
                به‌روزرسانی آگهی‌ها
              </Button>
            )}
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
          <Kpi
            label="اختلاف با پلاک ملی"
            value={index.gapPct !== null ? <span className="num-ltr">{fmtCarPct(index.gapPct)}</span> : '—'}
            sub={index.comparable ? `میانه ${toFaDigits(index.comparable)} مدل/سال` : 'در انتظار داده'}
          />
          <Kpi label="آگهی پلاک اروند" value={toFaDigits(arvandCount)} sub={`${toFaDigits(counts.plate.customs)} کف گمرک`} />
          <Kpi label="مدل/سال" value={toFaDigits(groups.length)} sub={`${toFaDigits(index.comparable)} با مبنای ملی`} />
          <Kpi label="به‌روزرسانی" value={st.lastRunAt ? fmtRelativeAge(st.lastRunAt) : '—'} sub={st.lastRunAt ? formatJalali(st.lastRunAt) : 'هنوز جمع‌آوری نشده'} />
        </div>
        {running && <Progress run={st.run} />}
      </section>

      {st.run.message && st.run.status !== 'running' && (
        <Notice tone={st.run.status === 'error' ? 'warn' : 'info'}>{st.run.message}</Notice>
      )}

      {!hasData ? (
        running || st.loading ? (
          <p className="rounded-card border border-dashed border-divider py-12 text-center text-sm text-muted">
            اولین جمع‌آوری چند دقیقه طول می‌کشد — آگهی‌ها یکی‌یکی بررسی می‌شوند تا فقط پلاک اروند واقعی نمایش داده شود.
          </p>
        ) : (
          <EmptyState message="هنوز آگهی پلاک اروندی ثبت نشده" hint="«به‌روزرسانی آگهی‌ها» را بزنید." />
        )
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <Tabs<Tab>
              label="نمای خودروهای اروند"
              value={tab}
              onChange={setTab}
              className="min-w-0 sm:flex-1"
              options={[
                { value: 'compare', label: 'مقایسه قیمت', icon: <BarChart3 />, badge: groups.length },
                { value: 'ads', label: 'آگهی‌ها', icon: <LayoutGrid />, badge: khuz.length },
                { value: 'trend', label: 'روند', icon: <LineChart /> }
              ]}
            />
            <SearchField value={query} onChange={setQuery} placeholder="جستجو: سانتافه، لندکروزر، ۲۰۱۷…" className="sm:w-72" />
          </div>

          {tab === 'compare' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted">میانه قیمت آگهی‌های پلاک اروند در برابر همان مدل و سال با پلاک ملی</p>
                <div className="w-full sm:w-52">
                  <Select aria-label="مرتب‌سازی مدل‌ها" value={groupSort} onChange={(e) => setGroupSort(e.target.value as GroupSort)}>
                    <option value="gap">بیشترین اختلاف</option>
                    <option value="count">بیشترین آگهی</option>
                    <option value="price">گران‌ترین</option>
                  </Select>
                </div>
              </div>
              {withBase.length === 0 && noBase.length === 0 ? (
                <p className="rounded-card border border-dashed border-divider py-10 text-center text-sm text-muted">مدلی پیدا نشد</p>
              ) : (
                <>
                  {withBase.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {withBase.map((g) => (
                        <GroupCard key={g.key} g={g} usdRate={rate} onPick={setPicked} />
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-card border border-dashed border-divider py-8 text-center text-sm text-muted">
                      هنوز مدلی با مبنای پلاک ملی کافی نیست — با به‌روزرسانی بعدی کامل می‌شود.
                    </p>
                  )}
                  {noBase.length > 0 && (
                    <Disclosure summary={`مدل‌های بدون مبنای پلاک ملی (${toFaDigits(noBase.length)}) — فقط قیمت اروند`}>
                      <div className="grid gap-3 pb-2 pt-1 sm:grid-cols-2 xl:grid-cols-3">
                        {noBase.map((g) => (
                          <GroupCard key={g.key} g={g} usdRate={rate} onPick={setPicked} />
                        ))}
                      </div>
                    </Disclosure>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'ads' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <ChipGroup<CityFilter>
                  label="شهر"
                  value={city}
                  onChange={setCity}
                  options={(['all', 'ahvaz', 'abadan', 'khorramshahr'] as CityFilter[]).map((c) => ({
                    value: c,
                    label: c === 'all' ? 'همه شهرها' : CITY_FA[c],
                    badge: counts.city[c]
                  }))}
                />
                <ChipGroup<PlateFilter>
                  label="نوع پلاک"
                  value={plate}
                  onChange={setPlate}
                  options={(['all', 'arvand', 'arvand-convertible', 'customs'] as PlateFilter[]).map((p) => ({
                    value: p,
                    label: p === 'all' ? 'همه' : PLATE_FA[p as PlateKind],
                    badge: counts.plate[p]
                  }))}
                />
                <div className="ms-auto w-full sm:w-44">
                  <Select aria-label="مرتب‌سازی آگهی‌ها" value={adSort} onChange={(e) => setAdSort(e.target.value as AdSort)}>
                    <option value="new">تازه‌ترین</option>
                    <option value="cheap">ارزان‌ترین</option>
                    <option value="expensive">گران‌ترین</option>
                  </Select>
                </div>
              </div>
              {filteredAds.length === 0 ? (
                <p className="rounded-card border border-dashed border-divider py-10 text-center text-sm text-muted">آگهی‌ای با این فیلترها نیست</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredAds.map((a) => (
                    <AdCard key={a.token} ad={a} usdRate={rate} />
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'trend' && (
            <div className="space-y-4 rounded-card border border-divider bg-card p-4 shadow-card md:p-5">
              <h3 className="text-sm font-bold text-ink">اختلاف قیمت پلاک اروند با پلاک ملی در طول زمان</h3>
              <TrendChart points={trend.map((p) => ({ ts: p.ts, label: formatJalali(p.ts), value: p.gap as number }))} format={(v) => fmtCarPct(v)} />
              <p className="text-2xs text-muted">هر روز با به‌روزرسانی آگهی‌ها یک نقطه ثبت می‌شود (میانه اختلاف همه مدل/سال‌های قابل مقایسه).</p>
            </div>
          )}
        </>
      )}

      <p className="text-2xs leading-5 text-muted">
        منبع: آگهی‌های دیوار. هر آگهی با خواندن متن کامل آن بررسی می‌شود و فقط آگهی‌هایی که پلاک اروند یا منطقه آزاد را ذکر کرده‌اند نمایش داده
        می‌شوند. مبنای مقایسه: آگهی‌های همان مدل و سال با پلاک ملی. قیمت‌ها پیشنهادی فروشندگان است؛ آگهی‌های نمایشگاهی چندخودرویی، شرایطی و قیمت‌های
        پرت در میانه‌ها حساب نمی‌شوند. آگهی‌های حذف‌شده یا بیش از ۳۰ روز به‌روزنشده کنار گذاشته می‌شوند.
      </p>

      <Sheet open={picked !== null} onClose={() => setPicked(null)} title={picked ? `${picked.model} · ${toFaDigits(picked.year)}` : ''} variant="panel" size="lg">
        {picked && <GroupDetail g={picked} usdRate={rate} />}
      </Sheet>
    </div>
  );
}

function GroupDetail({ g, usdRate }: { g: ModelGroup; usdRate: number | null }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-field bg-accent-soft p-3">
          <p className="text-2xs text-accent">میانه پلاک اروند</p>
          <p className="text-xl font-extrabold text-ink">{fmtCarToman(g.arvand.median)}</p>
          <p className="text-2xs text-muted">
            {toFaDigits(g.arvand.n)} آگهی · {fmtCarToman(g.arvand.min)} تا {fmtCarToman(g.arvand.max)}
          </p>
        </div>
        <div className="rounded-field bg-surface-2 p-3">
          <p className="text-2xs text-muted">میانه پلاک ملی</p>
          <p className="text-xl font-extrabold text-ink">{fmtCarToman(g.national.median)}</p>
          <p className="text-2xs text-muted">
            {toFaDigits(g.national.n)} آگهی{g.national.n ? ` · ${fmtCarToman(g.national.min)} تا ${fmtCarToman(g.national.max)}` : ''}
          </p>
        </div>
      </div>
      {g.gapPct !== null && (
        <p className="text-sm text-ink">
          قیمت پلاک اروند <span className="num-ltr font-extrabold text-accent">{fmtCarPct(g.gapPct)}</span> نسبت به پلاک ملی
          {g.lowSample && <span className="ms-1 text-2xs text-warn">(نمونه کم)</span>}
        </p>
      )}
      <div>
        <h3 className="mb-2 text-sm font-bold text-ink">آگهی‌های پلاک اروند</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {g.arvand.ads.map((a) => (
            <AdCard key={a.token} ad={a} usdRate={usdRate} />
          ))}
        </div>
      </div>
      {g.national.ads.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-bold text-ink">آگهی‌های پلاک ملی</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.national.ads.map((a) => (
              <AdCard key={a.token} ad={a} usdRate={usdRate} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
