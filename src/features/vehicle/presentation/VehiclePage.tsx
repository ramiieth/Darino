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
import { Car, History, Plus, TrendingUp, TrendingDown, Info, Search } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { Sheet } from '@/shared/components/ui/Sheet';
import { PageHeader } from '@/shared/components/layout/Page';
import { ProvenanceBadge } from '@/shared/components/ui/ProvenanceBadge';
import { fmtTomanAmount, fmtUsdAmount, fmtPct, toFaDigits, fmtInt } from '@/shared/utils/formatters';
import { useVehicleStore, useVehicles } from '../data/useVehicles';
import { useFxStore } from '@/shared/store/fxStore';
import {
  vehicleReturn,
  vehicleReturnRange,
  rankVehicles,
  dealerMarketGap,
  vehicleStats,
  type VehicleSortKey,
  type PriceKind,
  type RankedVehicle
} from '../domain/engine';
import { BENCHMARK_FA } from '../domain/engine';
import type { Vehicle, VehicleSnapshot } from '../domain/types';
import { compareWithBenchmarks } from '../data/benchmarks';
import { VehicleChart, type ChartPoint } from './VehicleChart';
import { NewSnapshotSheet } from './NewSnapshotSheet';
import { cn } from '@/shared/lib/cn';

const SORT_LABEL: Record<VehicleSortKey, string> = {
  'toman-pct': 'بیشترین رشد تومانی (٪)',
  'usd-pct': 'بیشترین رشد دلاری (٪)',
  'toman-abs': 'بیشترین رشد تومانی (مبلغ)',
  'usd-abs': 'بیشترین رشد دلاری (مبلغ)',
  worst: 'بیشترین کاهش'
};

function ReturnBadge({ pct, prefix = '' }: { pct: number | null; prefix?: string }) {
  if (pct === null) return <span className="num-ltr text-muted">—</span>;
  return (
    <span className={cn('num-ltr font-black', pct >= 0 ? 'text-positive' : 'text-negative')}>
      {pct >= 0 ? '▲' : '▼'} {prefix}{pct >= 0 ? '+' : ''}{pct.toFixed(1)}٪
    </span>
  );
}

export function VehiclePage() {
  const { vehicles, snapshots, loading } = useVehicles();
  const fxRate = useFxStore((s) => s.rate);
  const fxHydrated = useFxStore((s) => s.hydrated);
  const [startIdx, setStartIdx] = useState(0);
  const [endIdx, setEndIdx] = useState(0);
  const [sortKey, setSortKey] = useState<VehicleSortKey>('toman-pct');
  const [priceKind, setPriceKind] = useState<PriceKind>('market');
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [showNewSnapshot, setShowNewSnapshot] = useState(false);

  useEffect(() => {
    void useFxStore.getState().hydrate();
  }, []);

  // پیش‌فرض: بازه = ابتدایی‌ترین تا آخرین Snapshot (All Time)
  useEffect(() => {
    if (snapshots.length > 0) {
      setEndIdx(snapshots.length - 1);
    }
  }, [snapshots.length]);

  const startSnap = snapshots[startIdx];
  const endSnap = snapshots[endIdx];
  const rangeValid = startSnap && endSnap && startSnap.dateTs < endSnap.dateTs;

  /** خودروها گروه‌بندی‌شده بر اساس برند (برای dropdown انتخاب) */
  const groupedByBrand = useMemo(() => {
    const map = new Map<string, Vehicle[]>();
    for (const v of vehicles) {
      if (!map.has(v.brand)) map.set(v.brand, []);
      map.get(v.brand)!.push(v);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fa'));
  }, [vehicles]);

  const ranked = useMemo<RankedVehicle[]>(() => {
    if (!startSnap || !endSnap || startSnap.dateTs >= endSnap.dateTs) return [];
    return rankVehicles(vehicles, startSnap, endSnap, sortKey);
  }, [vehicles, startSnap, endSnap, sortKey]);

  const stats = useMemo(() => {
    if (!startSnap || !endSnap || startSnap.dateTs >= endSnap.dateTs) return null;
    return vehicleStats(vehicles, startSnap, endSnap);
  }, [vehicles, startSnap, endSnap]);

  // سید — اگر داده خالی است (اولین بار)، صبر کن
  if (loading && snapshots.length === 0) {
    return (
      <div className="space-y-3">
        <PageHeader title="سرمایه‌گذاری خودرو" subtitle="خودرو به‌عنوان یک Asset Class" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-16 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="سرمایه‌گذاری خودرو"
        subtitle="ثبت قیمت تاریخی، بازدهی تومانی/دلاری و مقایسه با سایر دارایی‌ها"
        actions={
          <button
            onClick={() => setShowNewSnapshot(true)}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3 text-[11px] font-bold text-white shadow-accent transition-colors hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> ثبت قیمت جدید
          </button>
        }
      />

      {/* توضیح منبع */}
      <GlassCard variant="soft" className="flex items-start gap-2 p-3">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
        <p className="text-[9px] font-medium leading-4 text-muted">
          این قیمت‌ها بر اساس میانگین قیمت پیشنهادی فروشندگان و نمایشگاه‌داران جمع‌آوری شده و لزوماً به معنای
          قیمت معامله‌شده نیست. هر Snapshot (تاریخ + نرخ دلار همان روز + قیمت‌ها) به‌صورت غیرقابل‌تغییر ذخیره
          می‌شود؛ تغییر نرخ دلار در روزهای بعد هرگز Snapshotهای گذشته را تغییر نمی‌دهد.
        </p>
      </GlassCard>

      {/* انتخاب خودرو — میانبر سریع (بدون تایپ دستی) */}
      <GlassCard className="p-3">
        <label className="mb-1 flex items-center gap-1 text-[9px] font-bold text-muted">
          <Search className="h-3 w-3" /> انتخاب خودرو (مشاهده مستقیم جزئیات)
        </label>
        <select
          value=""
          onChange={(e) => {
            const v = vehicles.find((x) => x.id === e.target.value);
            if (v) setSelected(v);
            e.target.value = '';
          }}
          className="h-10 w-full rounded-xl border border-line/15 bg-card px-2 text-[10px] font-bold text-ink shadow-card outline-none hover:border-line/25"
        >
          <option value="" disabled>— انتخاب از بین {toFaDigits(vehicles.length)} خودرو —</option>
          {groupedByBrand.map(([brand, list]) => (
            <optgroup key={brand} label={brand}>
              {list.map((v) => (
                <option key={v.id} value={v.id}>{v.name}{v.modelYear ? ` (${v.modelYear})` : ''}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="mt-1 text-[8px] font-medium text-muted">
          با انتخاب، جزئیات (تاریخچه + نمودار + مقایسه با سایر دارایی‌ها) باز می‌شود.
        </p>
      </GlassCard>

      {/* انتخاب بازه */}
      <GlassCard className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-[9px] font-bold text-muted">از تاریخ (Snapshot شروع)</label>
            <select
              value={startIdx}
              onChange={(e) => setStartIdx(Number(e.target.value))}
              className="glass-inset h-9 rounded-xl px-2 text-[10px] font-bold text-ink outline-none"
            >
              {snapshots.map((s, i) => (
                <option key={s.id} value={i}>{s.dateLabel}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold text-muted">تا تاریخ (Snapshot پایان)</label>
            <select
              value={endIdx}
              onChange={(e) => setEndIdx(Number(e.target.value))}
              className="glass-inset h-9 rounded-xl px-2 text-[10px] font-bold text-ink outline-none"
            >
              {snapshots.map((s, i) => (
                <option key={s.id} value={i}>{s.dateLabel}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold text-muted">مرتب‌سازی</label>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as VehicleSortKey)}
              className="glass-inset h-9 rounded-xl px-2 text-[10px] font-bold text-ink outline-none"
            >
              {(Object.keys(SORT_LABEL) as VehicleSortKey[]).map((k) => (
                <option key={k} value={k}>{SORT_LABEL[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold text-muted">نوع قیمت</label>
            <div className="flex gap-1 rounded-xl bg-surface-2/70 p-0.5">
              {(['market', 'dealer'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setPriceKind(k)}
                  className={cn(
                    'rounded-lg px-2.5 py-1.5 text-[9px] font-black transition-colors',
                    priceKind === k ? 'bg-card text-accent shadow-card' : 'text-muted hover:text-ink'
                  )}
                >
                  {k === 'market' ? 'بازار' : 'نمایندگی'}
                </button>
              ))}
            </div>
          </div>
        </div>
        {startSnap && endSnap && (
          <p className="mt-2 text-[9px] font-medium text-muted">
            بازه: <span className="font-bold text-ink">{startSnap.dateLabel}</span> ←{' '}
            <span className="font-bold text-ink">{endSnap.dateLabel}</span> · نرخ دلار شروع:{' '}
            <span className="num-ltr font-bold text-ink">{toFaDigits(startSnap.usdRate.toLocaleString('en-US'))}</span> تومان ·
            نرخ دلار پایان: <span className="num-ltr font-bold text-ink">{toFaDigits(endSnap.usdRate.toLocaleString('en-US'))}</span> تومان
          </p>
        )}
      </GlassCard>

      {/* آمار بازه */}
      {stats && rangeValid && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <GlassCard variant="soft" className="p-2.5">
            <p className="text-[9px] font-bold text-muted">خودروهای قابل مقایسه</p>
            <p className="num-ltr mt-0.5 text-[15px] font-black text-ink">{fmtInt(stats.comparableCount)}</p>
          </GlassCard>
          <GlassCard variant="soft" className="p-2.5">
            <p className="text-[9px] font-bold text-muted">میانگین بازدهی تومانی</p>
            <ReturnBadge pct={stats.avgTomanPct} />
          </GlassCard>
          <GlassCard variant="soft" className="p-2.5">
            <p className="text-[9px] font-bold text-muted">میانگین بازدهی دلاری</p>
            <ReturnBadge pct={stats.avgUsdPct} />
          </GlassCard>
          <GlassCard variant="soft" className="p-2.5">
            <p className="text-[9px] font-bold text-muted">رشد / افت (تومانی)</p>
            <p className="mt-0.5 text-[12px] font-black">
              <span className="text-positive">{fmtInt(stats.gainersToman)}</span>
              <span className="text-muted"> / </span>
              <span className="text-negative">{fmtInt(stats.losersToman)}</span>
            </p>
          </GlassCard>
        </div>
      )}

      {/* رتبه‌بندی */}
      <GlassCard className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line/10 px-3.5 py-2.5">
          <p className="flex items-center gap-1.5 text-[12px] font-black text-ink">
            <Car className="h-4 w-4 text-accent" /> رتبه‌بندی خودروها ({ranked.length})
          </p>
          <span className="text-[8px] font-medium text-muted">
            {priceKind === 'market' ? 'قیمت بازار' : 'قیمت نمایندگی'}
          </span>
        </div>
        {ranked.length === 0 ? (
          <p className="px-4 py-8 text-center text-[10px] font-bold text-muted">
            {snapshots.length < 2
              ? 'برای مقایسه بازدهی، حداقل دو Snapshot لازم است — «ثبت قیمت جدید» را بزنید.'
              : 'در این بازه خودروی قابل مقایسه‌ای نیست.'}
          </p>
        ) : (
          <div>
            {ranked.map((r) => (
              <button
                key={r.vehicle.id}
                onClick={() => setSelected(r.vehicle)}
                className={cn(
                  'block w-full px-3.5 py-2.5 text-start transition-colors hover:bg-surface-2/60',
                  r.rank > 1 && 'border-t border-line/8'
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span className="tnum w-5 shrink-0 text-center text-[12px] font-black text-muted/60">
                    {r.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-extrabold text-ink">
                      {r.vehicle.brand} <span className="text-muted">· {r.vehicle.name}</span>
                      {r.vehicle.modelYear && <span className="num-ltr text-[9px] text-muted/70"> ({r.vehicle.modelYear})</span>}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[8px] font-medium text-muted">
                      <span className="num-ltr">{fmtTomanAmount(r.ret.startToman)}</span>
                      <span className="text-muted/60">←</span>
                      <span className="num-ltr">{fmtTomanAmount(r.ret.endToman)}</span>
                      {r.gap?.gapPct !== null && r.gap !== null && (
                        <span className="text-muted/70">
                          · اختلاف بازار/نمایندگی: <span className={cn('num-ltr font-bold', r.gap.gapPct! >= 0 ? 'text-warn' : 'text-positive')}>{r.gap.gapPct! >= 0 ? '+' : ''}{r.gap.gapPct!.toFixed(0)}٪</span>
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-end">
                    <ReturnBadge pct={r.ret.tomanPct} />
                    <p className="mt-0.5 text-[8px] font-bold text-muted">
                      دلاری: <ReturnBadge pct={r.ret.usdPct} />
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </GlassCard>

      {/* جزئیات خودرو */}
      <Sheet open={selected !== null} onClose={() => setSelected(null)} title={selected ? `${selected.brand} · ${selected.name}` : ''}>
        {selected && startSnap && endSnap && (
          <VehicleDetail vehicle={selected} snapshots={snapshots} fxRate={fxRate} fxHydrated={fxHydrated} />
        )}
      </Sheet>

      {/* ثبت Snapshot جدید */}
      <NewSnapshotSheet open={showNewSnapshot} onClose={() => setShowNewSnapshot(false)} />

      <p className="text-center text-[8px] font-medium text-muted/70">
        {toFaDigits(vehicles.length)} خودرو · {toFaDigits(snapshots.length)} Snapshot تاریخی ·
        قیمت دلاری هر Snapshot در لحظه ثبت ذخیره شده و با تغییر نرخ دلار تغییر نمی‌کند.
      </p>
    </div>
  );
}

/* ================= جزئیات خودرو ================= */

function VehicleDetail({
  vehicle,
  snapshots,
  fxRate,
  fxHydrated
}: {
  vehicle: Vehicle;
  snapshots: VehicleSnapshot[];
  fxRate: number;
  fxHydrated: boolean;
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

  return (
    <div className="space-y-3">
      {/* خلاصه */}
      <div className="grid grid-cols-2 gap-1.5 text-[10px] font-bold sm:grid-cols-3">
        <div className="rounded-lg bg-line/5 p-2">
          <p className="text-muted">قیمت بازار (پایان بازه)</p>
          <p className="num-ltr text-ink">{fmtTomanAmount(end?.records.find((x) => x.vehicleId === vehicle.id)?.marketPriceToman ?? null)}</p>
        </div>
        <div className="rounded-lg bg-line/5 p-2">
          <p className="text-muted">قیمت نمایندگی</p>
          <p className="num-ltr text-ink">{gap ? fmtTomanAmount(gap.dealerToman) : '—'}</p>
        </div>
        <div className="rounded-lg bg-line/5 p-2">
          <p className="text-muted">معادل دلاری (ثبت‌شده)</p>
          <p className="num-ltr text-ink">{fmtUsdAmount(end?.records.find((x) => x.vehicleId === vehicle.id)?.marketPriceUsd ?? null)}</p>
        </div>
        <div className="rounded-lg bg-line/5 p-2">
          <p className="text-muted">نرخ دلار زمان ثبت</p>
          <p className="num-ltr text-ink">{end ? toFaDigits(end.usdRate.toLocaleString('en-US')) : '—'} تومان</p>
        </div>
        <div className="rounded-lg bg-positive/8 p-2">
          <p className="text-muted">بازدهی تومانی</p>
          <ReturnBadge pct={ret?.tomanPct ?? null} />
        </div>
        <div className="rounded-lg bg-line/5 p-2">
          <p className="text-muted">بازدهی دلاری</p>
          <ReturnBadge pct={ret?.usdPct ?? null} />
        </div>
      </div>

      {/* اختلاف نمایندگی/بازار */}
      {gap && gap.dealerToman !== null && gap.marketToman !== null && (
        <div className="rounded-lg border border-warn/20 bg-warn/5 px-2.5 py-2 text-[9px] font-bold">
          <p className="flex items-center justify-between">
            <span className="text-muted">اختلاف نمایندگی و بازار (پایان بازه)</span>
            <span className={cn('num-ltr', gap.gapPct! >= 0 ? 'text-warn' : 'text-positive')}>
              {fmtTomanAmount(gap.gapToman)} ({gap.gapPct! >= 0 ? '+' : ''}{gap.gapPct!.toFixed(1)}٪)
            </span>
          </p>
        </div>
      )}

      {/* تاریخچه Snapshot‌ها */}
      <div className="rounded-xl border border-line/10 bg-surface-2/40 p-2.5">
        <p className="mb-1.5 flex items-center gap-1 text-[10px] font-black text-ink">
          <History className="h-3 w-3 text-accent" /> تاریخچه Snapshot‌ها
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-[9px]">
            <thead>
              <tr className="text-muted">
                <th className="px-1.5 py-1 text-start font-black">تاریخ</th>
                <th className="px-1.5 py-1 text-end font-black">بازار (تومان)</th>
                <th className="px-1.5 py-1 text-end font-black">نمایندگی (تومان)</th>
                <th className="px-1.5 py-1 text-end font-black">دلار همان روز</th>
                <th className="px-1.5 py-1 text-end font-black">بازار (دلار)</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => {
                const r = s.records.find((x) => x.vehicleId === vehicle.id);
                return (
                  <tr key={s.id} className="border-t border-line/5">
                    <td className="px-1.5 py-1.5 font-bold text-ink">{s.dateLabel}</td>
                    <td className="num-ltr px-1.5 py-1.5 text-end">{r?.marketPriceToman !== null ? toFaDigits(r!.marketPriceToman.toLocaleString('en-US')) : '—'}</td>
                    <td className="num-ltr px-1.5 py-1.5 text-end">{r?.dealerPriceToman !== null ? toFaDigits(r!.dealerPriceToman.toLocaleString('en-US')) : '—'}</td>
                    <td className="num-ltr px-1.5 py-1.5 text-end text-muted">{toFaDigits(s.usdRate.toLocaleString('en-US'))}</td>
                    <td className="num-ltr px-1.5 py-1.5 text-end">{r?.marketPriceUsd !== null ? fmtUsdAmount(r!.marketPriceUsd) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* نمودار */}
      <VehicleChart points={points} />

      {/* مقایسه با سایر دارایی‌ها */}
      <div className="rounded-xl border border-line/10 bg-surface-2/40 p-2.5">
        <p className="mb-1.5 text-[10px] font-black text-ink">
          مقایسه با سایر دارایی‌ها — «اگر به‌جای این خودرو…»
        </p>
        <p className="mb-2 text-[8px] font-medium leading-4 text-muted">
          سرمایه اولیه = قیمت بازار خودرو در {start?.dateLabel} ({ret?.startToman ? fmtTomanAmount(ret.startToman) : '—'})
          · قیمت‌های تاریخی از coins.llama.fi (نزدیک‌ترین روز به تاریخ) — در دسترس نبود → N/A.
        </p>
        {benchLoading && !benchmarks ? (
          <p className="py-3 text-center text-[9px] font-bold text-muted">در حال دریافت قیمت‌های تاریخی…</p>
        ) : benchmarks ? (
          <div className="space-y-1">
            {benchmarks.map((b) => (
              <div key={b.asset} className="flex items-center justify-between gap-2 rounded-lg bg-card px-2 py-1.5 shadow-card">
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-ink">{BENCHMARK_FA[b.asset]}</p>
                  <p className="num-ltr text-[7px] font-medium text-muted">
                    {b.startPriceUsd !== null ? fmtUsdAmount(b.startPriceUsd) : 'N/A'} ← {b.endPriceUsd !== null ? fmtUsdAmount(b.endPriceUsd) : 'N/A'}
                  </p>
                </div>
                <div className="shrink-0 text-end">
                  <p className="text-[9px] font-bold text-muted">دلاری: <ReturnBadge pct={b.usdPct} /></p>
                  <p className="text-[9px] font-bold text-muted">تومانی: <ReturnBadge pct={b.tomanPct} /></p>
                </div>
              </div>
            ))}
            <p className="pt-1 text-[7px] font-medium leading-3.5 text-muted/70">
              بازدهی دلاری = تغییر قیمت دارایی به دلار · بازدهی تومانی = ترکیب تغییر قیمت دارایی و تغییر نرخ دلار
              (نرخ دلار پایان از Snapshot خودرو). داده تاریخی ممکن است تا ۴ روز با تاریخ Snapshot فاصله داشته باشد.
            </p>
          </div>
        ) : (
          <p className="py-2 text-center text-[8px] font-bold text-muted">قیمت تاریخی در دسترس نیست (N/A)</p>
        )}
      </div>

      <p className="text-[8px] font-medium leading-4 text-muted/70">
        {fxHydrated ? `نرخ دلار فعلی اپ: ${toFaDigits(fxRate.toLocaleString('en-US'))} تومان — صرفاً برای اطلاع؛ Snapshotها با نرخ ثبت‌شده خودشان محاسبه می‌شوند.` : ''}
      </p>
    </div>
  );
}
