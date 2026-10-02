/**
 * سرمایه‌گذاری خودرو — صفحه اصلی
 *
 *  - Snapshotهای تاریخی (Immutable) · نرخ دلار ثبت‌شده در هر تاریخ
 *  - بازدهی تومانی/دلاری بین دو تاریخ · رتبه‌بندی
 *  - جزئیات خودرو: تاریخچه + نمودار + مقایسه با سایر دارایی‌ها + اختلاف نمایندگی/بازار
 *  - ثبت Snapshot جدید (بدون تغییر Snapshotهای قبلی)
 *
 * ⚠️ این قیمت‌ها بر اساس میانگین قیمت پیشنهادی فروشندگان و نمایشگاه‌داران
 *    جمع‌آوری شده و لزوماً به معنای قیمت معامله‌شده نیست.
 */
import { useEffect, useMemo, useState } from 'react';
import { History, Plus } from 'lucide-react';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { Sheet } from '@/shared/components/ui/Sheet';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { Button } from '@/shared/components/ui/Button';
import { Field, Select } from '@/shared/components/ui/Input';
import { PageSkeleton } from '@/shared/components/ui/Skeleton';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { KeyValueList, Metric, MetricGrid, PercentValue } from '@/shared/components/ui/FinancialValue';
import { fmtTomanAmount, fmtUsdAmount, toFaDigits } from '@/shared/utils/formatters';
import { useVehicleStore, useVehicles } from '../data/useVehicles';
import { useUsdRate } from '@/shared/store/usdtStore';
import {
  vehicleReturn,
  rankVehicles,
  dealerMarketGap,
  vehicleStats,
  type VehicleSortKey,
  type RankedVehicle
} from '../domain/engine';
import { BENCHMARK_FA } from '../domain/engine';
import type { Vehicle, VehicleSnapshot } from '../domain/types';
import { compareWithBenchmarks } from '../data/benchmarks';
import { VehicleChart, type ChartPoint } from './VehicleChart';
import { NewSnapshotSheet } from './NewSnapshotSheet';

const SORT_LABEL: Record<VehicleSortKey, string> = {
  'toman-pct': 'بیشترین رشد تومانی (٪)',
  'usd-pct': 'بیشترین رشد دلاری (٪)',
  'toman-abs': 'بیشترین رشد تومانی (مبلغ)',
  'usd-abs': 'بیشترین رشد دلاری (مبلغ)',
  worst: 'بیشترین کاهش'
};

function ReturnBadge({ pct }: { pct: number | null }) {
  return <PercentValue value={pct} digits={1} className="font-semibold" />;
}

export function VehiclePage() {
  const { vehicles, snapshots, loading } = useVehicles();
  const fxRate = useUsdRate().rate;
  const [startIdx, setStartIdx] = useState(0);
  const [endIdx, setEndIdx] = useState(0);
  const [sortKey, setSortKey] = useState<VehicleSortKey>('toman-pct');
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [showNewSnapshot, setShowNewSnapshot] = useState(false);

  // default range: first → latest snapshot (all time)
  useEffect(() => {
    if (snapshots.length > 0) setEndIdx(snapshots.length - 1);
  }, [snapshots.length]);

  const startSnap = snapshots[startIdx];
  const endSnap = snapshots[endIdx];
  const rangeValid = !!startSnap && !!endSnap && startSnap.dateTs < endSnap.dateTs;

  const groupedByBrand = useMemo(() => {
    const map = new Map<string, Vehicle[]>();
    for (const v of vehicles) {
      if (!map.has(v.brand)) map.set(v.brand, []);
      map.get(v.brand)!.push(v);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fa'));
  }, [vehicles]);

  const ranked = useMemo<RankedVehicle[]>(
    () => (rangeValid ? rankVehicles(vehicles, startSnap, endSnap, sortKey) : []),
    [vehicles, startSnap, endSnap, sortKey, rangeValid]
  );
  const stats = useMemo(() => (rangeValid ? vehicleStats(vehicles, startSnap, endSnap) : null), [vehicles, startSnap, endSnap, rangeValid]);

  const header = (
    <PageHeader
      title="سرمایه‌گذاری خودرو"
      subtitle="قیمت و بازده خودروها"
      actions={
        <Button size="sm" icon={<Plus />} onClick={() => setShowNewSnapshot(true)}>
          ثبت قیمت جدید
        </Button>
      }
    />
  );

  if (loading && snapshots.length === 0) {
    return (
      <Page>
        {header}
        <PageSkeleton />
      </Page>
    );
  }

  return (
    <Page>
      {header}

      <Notice tone="neutral">
        قیمت‌ها پیشنهادی‌اند؛ بازده دلاری با نرخ ثبت‌شدهٔ همان تاریخ محاسبه می‌شود.
      </Notice>

      <Surface className="p-4 md:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="از تاریخ">
            <Select value={startIdx} onChange={(e) => setStartIdx(Number(e.target.value))}>
              {snapshots.map((s, i) => (
                <option key={s.id} value={i}>
                  {s.dateLabel}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="تا تاریخ">
            <Select value={endIdx} onChange={(e) => setEndIdx(Number(e.target.value))}>
              {snapshots.map((s, i) => (
                <option key={s.id} value={i}>
                  {s.dateLabel}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="مرتب‌سازی">
            <Select value={sortKey} onChange={(e) => setSortKey(e.target.value as VehicleSortKey)}>
              {(Object.keys(SORT_LABEL) as VehicleSortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="مشاهده مستقیم یک خودرو">
            <Select
              value=""
              onChange={(e) => {
                const v = vehicles.find((x) => x.id === e.target.value);
                if (v) setSelected(v);
              }}
            >
              <option value="" disabled>
                انتخاب از {toFaDigits(vehicles.length)} خودرو…
              </option>
              {groupedByBrand.map(([brand, list]) => (
                <optgroup key={brand} label={brand}>
                  {list.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.modelYear ? ` (${v.modelYear})` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
        </div>
        {startSnap && endSnap && (
          <p className="mt-4 border-t border-divider pt-3 text-xs text-muted">
            نرخ دلار: <span className="num-ltr font-semibold text-ink">{toFaDigits(startSnap.usdRate.toLocaleString('en-US'))}</span> ←{' '}
            <span className="num-ltr font-semibold text-ink">{toFaDigits(endSnap.usdRate.toLocaleString('en-US'))}</span> تومان
            {!rangeValid && <span className="text-warn"> · تاریخ پایان باید بعد از تاریخ شروع باشد</span>}
          </p>
        )}
      </Surface>

      {stats && rangeValid && (
        <Surface className="p-4 md:p-5">
          <MetricGrid cols={4}>
            <Metric size="lg" label="میانگین بازدهی تومانی" value={<ReturnBadge pct={stats.avgTomanPct} />} />
            <Metric size="lg" label="میانگین بازدهی دلاری" value={<ReturnBadge pct={stats.avgUsdPct} />} />
            <Metric label="خودروهای قابل مقایسه" value={<span>{toFaDigits(stats.comparableCount)}</span>} />
            <Metric
              label="رشد / افت (تومانی)"
              value={
                <span>
                  <span className="text-positive">{toFaDigits(stats.gainersToman)}</span>
                  <span className="text-subtle"> / </span>
                  <span className="text-negative">{toFaDigits(stats.losersToman)}</span>
                </span>
              }
            />
          </MetricGrid>
        </Surface>
      )}

      <Section id="ranking" title="رتبه‌بندی خودروها" description={`${toFaDigits(ranked.length)} خودرو · بر اساس قیمت بازار`}>
        {ranked.length === 0 ? (
          <EmptyState
            message={snapshots.length < 2 ? 'برای مقایسه بازدهی حداقل دو اسنپ‌شات لازم است' : 'در این بازه خودروی قابل مقایسه‌ای نیست'}
            action={
              snapshots.length < 2 ? (
                <Button size="sm" icon={<Plus />} onClick={() => setShowNewSnapshot(true)}>
                  ثبت قیمت جدید
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Surface className="overflow-hidden">
            <div className="hidden md:block">
              <table className="data-table">
                <caption className="sr-only">رتبه‌بندی خودروها</caption>
                <thead>
                  <tr>
                    <th scope="col" className="w-10 !ps-5">#</th>
                    <th scope="col">خودرو</th>
                    <th scope="col" className="col-num">قیمت شروع</th>
                    <th scope="col" className="col-num">قیمت پایان</th>
                    <th scope="col" className="col-num">بازدهی تومانی</th>
                    <th scope="col" className="col-num">بازدهی دلاری</th>
                    <th scope="col" className="col-num !pe-5">اختلاف نمایندگی</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((r) => (
                    <tr key={r.vehicle.id} className="cursor-pointer" onClick={() => setSelected(r.vehicle)}>
                      <td className="num-ltr !ps-5 text-xs text-subtle">{r.rank}</td>
                      <td>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(r.vehicle);
                          }}
                          className="text-start font-semibold text-ink hover:text-accent"
                        >
                          {r.vehicle.brand} · {r.vehicle.name}
                          {r.vehicle.modelYear && <span className="num-ltr text-xs font-normal text-muted"> ({r.vehicle.modelYear})</span>}
                        </button>
                      </td>
                      <td className="col-num text-muted"><Toman v={r.ret.startToman} /></td>
                      <td className="col-num"><Toman v={r.ret.endToman} /></td>
                      <td className="col-num"><ReturnBadge pct={r.ret.tomanPct} /></td>
                      <td className="col-num"><ReturnBadge pct={r.ret.usdPct} /></td>
                      <td className="col-num !pe-5 text-muted">
                        {r.gap?.gapPct !== null && r.gap ? <PercentValue value={r.gap.gapPct} digits={0} tone="none" /> : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-divider px-4 md:hidden">
              {ranked.map((r) => (
                <li key={r.vehicle.id}>
                  <button type="button" onClick={() => setSelected(r.vehicle)} className="flex w-full items-center gap-3 py-3 text-start">
                    <span className="num-ltr w-6 shrink-0 text-center text-xs text-subtle">{r.rank}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {r.vehicle.brand} · {r.vehicle.name}
                      </span>
                      <span className="block text-xs text-muted">
                        <Toman v={r.ret.endToman} />
                      </span>
                    </span>
                    <span className="shrink-0 text-end text-sm">
                      <ReturnBadge pct={r.ret.tomanPct} />
                      <span className="block text-2xs text-muted">
                        دلاری <ReturnBadge pct={r.ret.usdPct} />
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Surface>
        )}
      </Section>

      <Sheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.brand} · ${selected.name}` : ''}
        variant="panel"
        size="lg"
      >
        {selected && startSnap && endSnap && (
          <VehicleDetail vehicle={selected} snapshots={snapshots} fxRate={fxRate} />
        )}
      </Sheet>

      <NewSnapshotSheet open={showNewSnapshot} onClose={() => setShowNewSnapshot(false)} />

      <p className="text-xs text-muted">
        {toFaDigits(vehicles.length)} خودرو · {toFaDigits(snapshots.length)} ثبت تاریخی
      </p>
    </Page>
  );
}

/** Toman amount: Persian digits (Toman policy) with separators */
function Toman({ v }: { v: number | null | undefined }) {
  return <span>{fmtTomanAmount(v ?? null)}</span>;
}

/* ================= جزئیات خودرو ================= */

function VehicleDetail({
  vehicle,
  snapshots,
  fxRate
}: {
  vehicle: Vehicle;
  snapshots: VehicleSnapshot[];
  /** نرخ زنده تتر (تومان) */
  fxRate: number | null;
}) {
  const [endIdx, setEndIdx] = useState(snapshots.length - 1);
  const [benchmarks, setBenchmarks] = useState<Awaited<ReturnType<typeof compareWithBenchmarks>> | null>(null);
  const [benchLoading, setBenchLoading] = useState(false);

  const points: ChartPoint[] = useMemo(
    () =>
      snapshots.map((s) => {
        const r = s.records.find((x) => x.vehicleId === vehicle.id);
        return {
          label: s.dateLabel,
          toman: r?.marketPriceToman ?? null,
          usd: r?.marketPriceUsd ?? null
        };
      }),
    [snapshots, vehicle.id]
  );

  const start = snapshots[0];
  const end = snapshots[endIdx];
  const ret = start && end && start.dateTs < end.dateTs ? vehicleReturn(start, end, vehicle.id, 'market') : null;
  const gap = end ? dealerMarketGap(end, vehicle.id) : null;

  // مقایسه با سایر دارایی‌ها — lazy
  useEffect(() => {
    if (!start || !end || start.dateTs >= end.dateTs) return;
    let cancelled = false;
    setBenchLoading(true);
    const startPriceToman = start.records.find((x) => x.vehicleId === vehicle.id)?.marketPriceToman ?? null;
    void compareWithBenchmarks({
      startTs: start.dateTs,
      endTs: end.dateTs,
      startRate: start.usdRate,
      endRate: end.usdRate,
      capitalToman: startPriceToman ?? 0,
      endIsNow: false
    }).then((rows) => {
      if (!cancelled) {
        setBenchmarks(rows);
        setBenchLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle.id, start?.dateTs, end?.dateTs]);

  const endRec = end?.records.find((x) => x.vehicleId === vehicle.id);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">قیمت بازار (آخرین اسنپ‌شات)</p>
        <p className="mt-1 text-3xl font-extrabold tracking-tight text-ink">{fmtTomanAmount(endRec?.marketPriceToman ?? null)}</p>
        <p className="mt-1 text-sm text-muted">
          بازدهی تومانی <ReturnBadge pct={ret?.tomanPct ?? null} /> · دلاری <ReturnBadge pct={ret?.usdPct ?? null} />
        </p>
      </div>

      <KeyValueList
        rows={[
          { label: 'قیمت نمایندگی', value: gap ? fmtTomanAmount(gap.dealerToman) : '—' },
          ...(gap && gap.dealerToman !== null && gap.marketToman !== null
            ? [
                {
                  label: 'اختلاف بازار و نمایندگی',
                  value: (
                    <span>
                      {fmtTomanAmount(gap.gapToman)} <PercentValue value={gap.gapPct} digits={1} tone="none" className="text-muted" />
                    </span>
                  )
                }
              ]
            : []),
          { label: 'معادل دلاری (ثبت‌شده)', value: <span className="num-ltr">{fmtUsdAmount(endRec?.marketPriceUsd ?? null)}</span> },
          { label: 'نرخ دلار زمان ثبت', value: end ? <span><span className="num-ltr">{toFaDigits(end.usdRate.toLocaleString('en-US'))}</span> تومان</span> : '—' }
        ]}
      />

      <div>
        <h3 className="mb-2 text-sm font-bold text-ink">روند قیمت</h3>
        <VehicleChart points={points} />
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink">
          <History aria-hidden className="h-4 w-4 text-muted" /> تاریخچه Snapshotها
        </h3>
        <div className="overflow-x-auto rounded-field border border-divider">
          <table className="data-table is-compact min-w-[480px]">
            <caption className="sr-only">تاریخچه قیمت</caption>
            <thead>
              <tr>
                <th scope="col" className="!ps-4">تاریخ</th>
                <th scope="col" className="col-num">بازار (تومان)</th>
                <th scope="col" className="col-num">نمایندگی (تومان)</th>
                <th scope="col" className="col-num">دلار همان روز</th>
                <th scope="col" className="col-num !pe-4">بازار (دلار)</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => {
                const r = s.records.find((x) => x.vehicleId === vehicle.id);
                return (
                  <tr key={s.id}>
                    <td className="!ps-4 font-semibold text-ink">{s.dateLabel}</td>
                    <td className="col-num num-ltr">{r?.marketPriceToman != null ? toFaDigits(r.marketPriceToman.toLocaleString('en-US')) : '—'}</td>
                    <td className="col-num num-ltr">{r?.dealerPriceToman != null ? toFaDigits(r.dealerPriceToman.toLocaleString('en-US')) : '—'}</td>
                    <td className="col-num num-ltr text-muted">{toFaDigits(s.usdRate.toLocaleString('en-US'))}</td>
                    <td className="col-num num-ltr !pe-4">{r?.marketPriceUsd != null ? fmtUsdAmount(r.marketPriceUsd) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-ink">اگر به‌جای این خودرو…</h3>
        <p className="mb-2 text-xs leading-5 text-muted">
          سرمایهٔ پایه: قیمت خودرو در {start?.dateLabel} ({ret?.startToman ? fmtTomanAmount(ret.startToman) : '—'}). قیمت تاریخیِ ناموجود با «—» نمایش داده می‌شود.
        </p>
        {benchLoading && !benchmarks ? (
          <p className="rounded-field bg-surface-2 py-4 text-center text-sm text-muted">در حال دریافت قیمت‌های تاریخی…</p>
        ) : benchmarks ? (
          <div className="overflow-x-auto rounded-field border border-divider">
            <table className="data-table is-compact">
              <caption className="sr-only">مقایسه با سایر دارایی‌ها</caption>
              <thead>
                <tr>
                  <th scope="col" className="!ps-4">دارایی</th>
                  <th scope="col" className="col-num">قیمت دلاری</th>
                  <th scope="col" className="col-num">دلاری</th>
                  <th scope="col" className="col-num !pe-4">تومانی</th>
                </tr>
              </thead>
              <tbody>
                {benchmarks.map((b) => (
                  <tr key={b.asset}>
                    <td className="!ps-4 font-semibold text-ink">{BENCHMARK_FA[b.asset]}</td>
                    <td className="col-num num-ltr text-xs text-muted">
                      {b.startPriceUsd !== null ? fmtUsdAmount(b.startPriceUsd) : '—'} → {b.endPriceUsd !== null ? fmtUsdAmount(b.endPriceUsd) : '—'}
                    </td>
                    <td className="col-num"><ReturnBadge pct={b.usdPct} /></td>
                    <td className="col-num !pe-4"><ReturnBadge pct={b.tomanPct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-field bg-surface-2 py-4 text-center text-sm text-muted">قیمت تاریخی در دسترس نیست (N/A)</p>
        )}
        <p className="mt-2 text-xs leading-5 text-muted">
          بازدهی تومانی ترکیب تغییر قیمت دارایی و تغییر نرخ دلار است (نرخ پایان از Snapshot خودرو). داده تاریخی ممکن است تا ۴ روز با
          تاریخ Snapshot فاصله داشته باشد.
        </p>
      </div>

      {fxRate !== null && (
        <p className="text-xs text-subtle">
          نرخ زنده تتر: <span className="num-ltr">{toFaDigits(fxRate.toLocaleString('en-US'))}</span> تومان — صرفاً برای اطلاع؛ Snapshotها با
          نرخ خودشان محاسبه می‌شوند.
        </p>
      )}
    </div>
  );
}
