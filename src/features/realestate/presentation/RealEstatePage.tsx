/**
 * سرمایه‌گذاری ملک (Real Estate) — صفحه اصلی
 *
 *  - دارایی‌های من (Real Assets): ثبت دستی قیمت خرید/ارزش فعلی؛
 *    ساختار (نوع/شهر/محله/وضعیت/تاریخ) فقط از گزینه‌های آماده
 *  - قیمت محله‌ها: Snapshot تاریخی میانگین هر مترمربع (Immutable) + بازدهی
 *    تومانی/دلاری + نمودار + رتبه‌بندی + مقایسه با سایر دارایی‌ها
 *
 * ⚠️ قیمت محله صرفاً «شاخص مرجع منطقه‌ای» است — نه قیمت قطعی معامله.
 */
import { useEffect, useMemo, useState } from 'react';
import { Home, Building2, Plus, Info, TrendingUp, TrendingDown, MapPin } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { Sheet } from '@/shared/components/ui/Sheet';
import { PageHeader } from '@/shared/components/layout/Page';
import { ProvenanceBadge } from '@/shared/components/ui/ProvenanceBadge';
import { fmtTomanAmount, fmtUsdAmount, toFaDigits, fmtInt } from '@/shared/utils/formatters';
import { useRealEstateStore, useRealEstate, NEIGHBORHOODS, PROPERTY_TYPES, BUILDING_CONDITIONS } from '../data/useRealEstate';
import { useFxStore } from '@/shared/store/fxStore';
import {
  assetProfit,
  neighborhoodReturn,
  rankNeighborhoods,
  neighborhoodStats,
  type NeighborhoodSortKey
} from '../domain/engine';
import type { RealAsset, RealEstateSnapshot } from '../domain/types';
import { PROPERTY_TYPE_FA, BUILDING_CONDITION_FA, neighborhoodName } from '../data/catalog';
import { compareWithBenchmarks } from '../data/benchmarks';
import { NeighborhoodChart, type ChartPoint } from './NeighborhoodChart';
import { AssetFormSheet } from './AssetFormSheet';
import { PriceFormSheet } from './PriceFormSheet';
import { useVehicleStore } from '@/features/vehicle/data/useVehicles';
import { BENCHMARK_FA } from '../domain/engine';
import { cn } from '@/shared/lib/cn';

const SORT_LABEL: Record<NeighborhoodSortKey, string> = {
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

export function RealEstatePage() {
  const { assets, snapshots, loading } = useRealEstate();
  const fxHydrated = useFxStore((s) => s.hydrated);
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [showPriceForm, setShowPriceForm] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<RealAsset | null>(null);

  // انتخاب محله برای تحلیل قیمت
  const [nbId, setNbId] = useState(NEIGHBORHOODS[0]?.id ?? '');
  const [ptype, setPtype] = useState<'apartment' | 'villa'>('apartment');
  const [bcond, setBcond] = useState<'new' | 'few-years' | 'old'>('new');
  const [startIdx, setStartIdx] = useState(0);
  const [endIdx, setEndIdx] = useState(0);
  const [sortKey, setSortKey] = useState<NeighborhoodSortKey>('toman-pct');

  useEffect(() => {
    void useFxStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (snapshots.length > 0) setEndIdx(snapshots.length - 1);
  }, [snapshots.length]);

  const startSnap = snapshots[startIdx];
  const endSnap = snapshots[endIdx];
  const rangeValid = startSnap && endSnap && startSnap.dateTs < endSnap.dateTs;

  /** رکوردهای قیمت محله انتخابی در همه Snapshot‌ها (برای نمودار) */
  const nbPoints: ChartPoint[] = useMemo(
    () =>
      snapshots.map((s) => {
        const r = s.records.find(
          (x) => x.neighborhoodId === nbId && x.propertyType === ptype && x.buildingCondition === bcond
        );
        return {
          label: s.dateLabel,
          toman: r?.averagePricePerSqmToman ?? null,
          usd: r?.averagePricePerSqmUsd ?? null
        };
      }),
    [snapshots, nbId, ptype, bcond]
  );

  const nbRet = startSnap && endSnap && startSnap.dateTs < endSnap.dateTs
    ? neighborhoodReturn(startSnap, endSnap, nbId, ptype, bcond)
    : null;

  const ranked = useMemo(() => {
    if (!startSnap || !endSnap || startSnap.dateTs >= endSnap.dateTs) return [];
    return rankNeighborhoods(NEIGHBORHOODS, startSnap, endSnap, sortKey, ptype, bcond);
  }, [startSnap, endSnap, sortKey, ptype, bcond]);

  const stats = useMemo(() => {
    if (!startSnap || !endSnap || startSnap.dateTs >= endSnap.dateTs) return null;
    return neighborhoodStats(NEIGHBORHOODS, startSnap, endSnap, ptype, bcond);
  }, [startSnap, endSnap, ptype, bcond]);

  if (loading && assets.length === 0 && snapshots.length === 0) {
    return (
      <div className="space-y-3">
        <PageHeader title="سرمایه‌گذاری ملک" subtitle="دارایی واقعی — شاخص مرجع منطقه‌ای محله‌ها" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-16 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="سرمایه‌گذاری ملک"
        subtitle="ثبت قیمت میانگین هر مترمربع محله و بررسی بازدهی تومانی/دلاری"
        actions={
          <div className="flex gap-1.5">
            <button
              onClick={() => setShowPriceForm(true)}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3 text-[11px] font-bold text-white shadow-accent transition-colors hover:opacity-90"
            >
              <Building2 className="h-3.5 w-3.5" /> ثبت قیمت محله
            </button>
            <button
              onClick={() => setShowAssetForm(true)}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-line/15 bg-card px-3 text-[11px] font-bold text-ink shadow-card transition-colors hover:bg-surface-2"
            >
              <Plus className="h-3.5 w-3.5" /> ثبت دارایی
            </button>
          </div>
        }
      />

      {/* توضیح */}
      <GlassCard variant="soft" className="flex items-start gap-2 p-3">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
        <p className="text-[9px] font-medium leading-4 text-muted">
          مرجع ارزش‌گذاری: میانگین قیمت هر مترمربع ملک <span className="font-bold text-ink">نوساز / کلید اول</span> هر محله.
          این مقدار صرفاً <span className="font-bold text-ink">شاخص مرجع منطقه‌ای</span> است و قیمت دقیق یک واحد خاص یا
          قیمت قطعی معامله نیست. هر Snapshot (تاریخ + نرخ دلار همان روز + قیمت) به‌صورت غیرقابل‌تغییر ذخیره می‌شود.
        </p>
      </GlassCard>

      {/* ===== دارایی‌های من ===== */}
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-black text-ink">
          <Home className="h-4 w-4 text-accent" /> دارایی‌های ملک من ({toFaDigits(assets.length)})
        </h3>
        {assets.length === 0 ? (
          <GlassCard variant="soft" className="p-5 text-center text-[11px] font-bold text-muted">
            هنوز دارایی ملکی ثبت نشده — «ثبت دارایی» را بزنید (قیمت خرید و ارزش فعلی دستی؛ بقیه از گزینه‌ها).
          </GlassCard>
        ) : (
          <div className="space-y-2.5">
            {assets.map((a) => {
              const p = assetProfit(a);
              return (
                <button
                  key={a.id}
                  onClick={() => setSelectedAsset(a)}
                  className="block w-full text-start"
                >
                  <GlassCard className="p-3.5 transition-colors hover:border-accent/30">
                    <div className="flex items-center gap-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-extrabold text-ink">
                          {neighborhoodName(a.neighborhoodId)}
                          <span className="text-muted"> · {PROPERTY_TYPE_FA[a.propertyType]}</span>
                          <span className="text-[9px] text-muted/70"> · {BUILDING_CONDITION_FA[a.buildingCondition]}</span>
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-[8px] font-medium text-muted">
                          <MapPin className="h-3 w-3" /> اهواز · تملک: {a.ownershipDateJalali} · ارزش‌گذاری: {a.valuationDateJalali}
                        </p>
                      </div>
                      <div className="shrink-0 text-end">
                        <ReturnBadge pct={p.profitPctToman} />
                        <p className="mt-0.5 text-[8px] font-bold text-muted">
                          دلاری: <ReturnBadge pct={p.profitPctUsd} />
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-[9px] font-bold sm:grid-cols-4">
                      <div className="rounded-lg bg-line/5 px-2 py-1">
                        <p className="text-muted">قیمت خرید</p>
                        <p className="num-ltr text-ink">{fmtTomanAmount(a.purchasePriceToman)}</p>
                        <p className="num-ltr text-[8px] text-muted">{fmtUsdAmount(a.purchasePriceUsd)}</p>
                      </div>
                      <div className="rounded-lg bg-line/5 px-2 py-1">
                        <p className="text-muted">ارزش فعلی</p>
                        <p className="num-ltr text-ink">{fmtTomanAmount(a.currentValueToman)}</p>
                        <p className="num-ltr text-[8px] text-muted">{fmtUsdAmount(a.currentValueUsd)}</p>
                      </div>
                      <div className={cn('rounded-lg px-2 py-1', p.profitToman >= 0 ? 'bg-positive/8' : 'bg-negative/8')}>
                        <p className="text-muted">سود تومانی</p>
                        <p className={cn('num-ltr font-black', p.profitToman >= 0 ? 'text-positive' : 'text-negative')}>
                          {p.profitToman >= 0 ? '+' : ''}{fmtTomanAmount(p.profitToman)}
                        </p>
                      </div>
                      <div className={cn('rounded-lg px-2 py-1', p.profitUsd >= 0 ? 'bg-positive/8' : 'bg-negative/8')}>
                        <p className="text-muted">سود دلاری</p>
                        <p className={cn('num-ltr font-black', p.profitUsd >= 0 ? 'text-positive' : 'text-negative')}>
                          {p.profitUsd >= 0 ? '+' : ''}{fmtUsdAmount(p.profitUsd)}
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ===== قیمت محله‌ها ===== */}
      <section className="border-t border-line/10 pt-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-black text-ink">
          <Building2 className="h-4 w-4 text-accent" /> قیمت محله‌ها (میانگین هر مترمربع)
        </h3>

        {/* فیلترها */}
        <GlassCard className="p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-[9px] font-bold text-muted">شهر</label>
              <select className="glass-inset h-9 rounded-xl px-2 text-[10px] font-bold text-ink outline-none">
                <option>اهواز</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[9px] font-bold text-muted">محله</label>
              <select
                value={nbId}
                onChange={(e) => setNbId(e.target.value)}
                className="glass-inset h-9 rounded-xl px-2 text-[10px] font-bold text-ink outline-none"
              >
                {NEIGHBORHOODS.map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[9px] font-bold text-muted">نوع ملک</label>
              <select
                value={ptype}
                onChange={(e) => setPtype(e.target.value as 'apartment' | 'villa')}
                className="glass-inset h-9 rounded-xl px-2 text-[10px] font-bold text-ink outline-none"
              >
                {PROPERTY_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[9px] font-bold text-muted">وضعیت ساختمان</label>
              <select
                value={bcond}
                onChange={(e) => setBcond(e.target.value as 'new' | 'few-years' | 'old')}
                className="glass-inset h-9 rounded-xl px-2 text-[10px] font-bold text-ink outline-none"
              >
                {BUILDING_CONDITIONS.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[9px] font-bold text-muted">مرتب‌سازی</label>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as NeighborhoodSortKey)}
                className="glass-inset h-9 rounded-xl px-2 text-[10px] font-bold text-ink outline-none"
              >
                {(Object.keys(SORT_LABEL) as NeighborhoodSortKey[]).map((k) => (
                  <option key={k} value={k}>{SORT_LABEL[k]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* بازه */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="text-[9px] font-bold text-muted">بازه:</label>
            <select value={startIdx} onChange={(e) => setStartIdx(Number(e.target.value))} className="glass-inset h-8 rounded-xl px-2 text-[9px] font-bold text-ink outline-none">
              {snapshots.map((s, i) => (
                <option key={s.id} value={i}>{s.dateLabel}</option>
              ))}
            </select>
            <span className="text-[9px] text-muted">←</span>
            <select value={endIdx} onChange={(e) => setEndIdx(Number(e.target.value))} className="glass-inset h-8 rounded-xl px-2 text-[9px] font-bold text-ink outline-none">
              {snapshots.map((s, i) => (
                <option key={s.id} value={i}>{s.dateLabel}</option>
              ))}
            </select>
            {startSnap && endSnap && (
              <span className="text-[8px] font-medium text-muted">
                دلار شروع: <span className="num-ltr font-bold text-ink">{toFaDigits(startSnap.usdRate.toLocaleString('en-US'))}</span> ·
                پایان: <span className="num-ltr font-bold text-ink">{toFaDigits(endSnap.usdRate.toLocaleString('en-US'))}</span>
              </span>
            )}
          </div>
        </GlassCard>

        {/* آمار بازه */}
        {stats && rangeValid && (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <GlassCard variant="soft" className="p-2.5">
              <p className="text-[9px] font-bold text-muted">محله‌های قابل مقایسه</p>
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
              <p className="text-[9px] font-bold text-muted">رشد / افت</p>
              <p className="mt-0.5 text-[12px] font-black">
                <span className="text-positive">{fmtInt(stats.gainers)}</span>
                <span className="text-muted"> / </span>
                <span className="text-negative">{fmtInt(stats.losers)}</span>
              </p>
            </GlassCard>
          </div>
        )}

        {/* رتبه‌بندی محله‌ها */}
        <GlassCard className="mt-2 overflow-hidden">
          <div className="flex items-center justify-between border-b border-line/10 px-3.5 py-2.5">
            <p className="text-[12px] font-black text-ink">رتبه‌بندی محله‌ها ({ranked.length})</p>
            <span className="text-[8px] font-medium text-muted">
              {PROPERTY_TYPE_FA[ptype]} · {BUILDING_CONDITION_FA[bcond]}
            </span>
          </div>
          {ranked.length === 0 ? (
            <p className="px-4 py-8 text-center text-[10px] font-bold text-muted">
              {snapshots.length < 2
                ? 'برای مقایسه بازدهی محله‌ها حداقل دو Snapshot لازم است — «ثبت قیمت محله» را بزنید.'
                : 'در این بازه محله قابل مقایسه‌ای نیست.'}
            </p>
          ) : (
            <div>
              {ranked.map((r) => (
                <button
                  key={r.neighborhoodId}
                  onClick={() => setNbId(r.neighborhoodId)}
                  className={cn(
                    'block w-full px-3.5 py-2.5 text-start transition-colors hover:bg-surface-2/60',
                    r.rank > 1 && 'border-t border-line/8'
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="tnum w-5 shrink-0 text-center text-[12px] font-black text-muted/60">{r.rank}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-extrabold text-ink">{r.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[8px] font-medium text-muted">
                        <span className="num-ltr">{fmtTomanAmount(r.ret.startToman)}/متر</span>
                        <span className="text-muted/60">←</span>
                        <span className="num-ltr">{fmtTomanAmount(r.ret.endToman)}/متر</span>
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

        {/* جزئیات محله انتخابی — نمودار + بازدهی + مقایسه */}
        <GlassCard className="mt-2 p-3.5">
          <p className="mb-1 text-[12px] font-black text-ink">
            {neighborhoodName(nbId)} — {PROPERTY_TYPE_FA[ptype]} · {BUILDING_CONDITION_FA[bcond]}
          </p>
          <div className="mb-2 grid grid-cols-2 gap-1.5 text-[10px] font-bold sm:grid-cols-4">
            <div className="rounded-lg bg-line/5 p-2">
              <p className="text-muted">آخرین قیمت / متر</p>
              <p className="num-ltr text-ink">{nbPoints.filter((p) => p.toman !== null).length > 0 ? fmtTomanAmount(nbPoints[nbPoints.length - 1].toman!) : '—'}</p>
            </div>
            <div className="rounded-lg bg-line/5 p-2">
              <p className="text-muted">آخرین معادل دلاری</p>
              <p className="num-ltr text-ink">{nbPoints.filter((p) => p.usd !== null).length > 0 ? fmtUsdAmount(nbPoints[nbPoints.length - 1].usd!) : '—'}</p>
            </div>
            <div className="rounded-lg bg-positive/8 p-2">
              <p className="text-muted">بازدهی تومانی (بازه)</p>
              <ReturnBadge pct={nbRet?.tomanPct ?? null} />
            </div>
            <div className="rounded-lg bg-line/5 p-2">
              <p className="text-muted">بازدهی دلاری (بازه)</p>
              <ReturnBadge pct={nbRet?.usdPct ?? null} />
            </div>
          </div>
          <NeighborhoodChart points={nbPoints} />
          {nbRet && (
            <p className="mt-2 text-[8px] font-medium leading-4 text-muted">
              تغییر تومانی: <span className={cn('num-ltr font-bold', (nbRet.tomanChange ?? 0) >= 0 ? 'text-positive' : 'text-negative')}>
                {(nbRet.tomanChange ?? 0) >= 0 ? '+' : ''}{fmtTomanAmount(nbRet.tomanChange)}
              </span>
              {' · '}
              تغییر دلاری: <span className={cn('num-ltr font-bold', (nbRet.usdChange ?? 0) >= 0 ? 'text-positive' : 'text-negative')}>
                {(nbRet.usdChange ?? 0) >= 0 ? '+' : ''}{fmtUsdAmount(nbRet.usdChange)}
              </span>
            </p>
          )}
        </GlassCard>
      </section>

      {/* جزئیات دارایی */}
      <Sheet open={selectedAsset !== null} onClose={() => setSelectedAsset(null)} title="جزئیات دارایی ملک">
        {selectedAsset && <AssetDetail asset={selectedAsset} fxHydrated={fxHydrated} />}
      </Sheet>

      {/* فرم‌ها */}
      <AssetFormSheet open={showAssetForm} onClose={() => setShowAssetForm(false)} />
      <PriceFormSheet open={showPriceForm} onClose={() => setShowPriceForm(false)} />
    </div>
  );
}

/* ================= جزئیات دارایی ================= */

function AssetDetail({ asset, fxHydrated }: { asset: RealAsset; fxHydrated: boolean }) {
  const fxRate = useFxStore((s) => s.rate);
  const p = assetProfit(asset);
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-line/10 bg-surface-2/40 p-2.5">
        <p className="mb-1.5 text-[10px] font-black text-ink">اطلاعات دارایی</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[9px] font-bold">
          <p className="flex justify-between text-muted"><span>نوع دارایی</span><span className="text-ink">ملک <ProvenanceBadge kind="calculated" label="ASSET CLASS" /></span></p>
          <p className="flex justify-between text-muted"><span>شهر</span><span className="text-ink">اهواز</span></p>
          <p className="flex justify-between text-muted"><span>محله</span><span className="text-ink">{neighborhoodName(asset.neighborhoodId)}</span></p>
          <p className="flex justify-between text-muted"><span>نوع ملک</span><span className="text-ink">{PROPERTY_TYPE_FA[asset.propertyType]}</span></p>
          <p className="flex justify-between text-muted"><span>وضعیت ساختمان</span><span className="text-ink">{BUILDING_CONDITION_FA[asset.buildingCondition]}</span></p>
          <p className="flex justify-between text-muted"><span>تاریخ تملک</span><span className="text-ink">{asset.ownershipDateJalali}</span></p>
          <p className="flex justify-between text-muted"><span>تاریخ تملک (میلادی)</span><span className="num-ltr text-ink">{new Date(asset.ownershipDateGregorian).toISOString().slice(0, 10)}</span></p>
          <p className="flex justify-between text-muted"><span>تاریخ ارزش‌گذاری</span><span className="text-ink">{asset.valuationDateJalali}</span></p>
          <p className="flex justify-between text-muted"><span>تاریخ ارزش‌گذاری (میلادی)</span><span className="num-ltr text-ink">{new Date(asset.valuationDateGregorian).toISOString().slice(0, 10)}</span></p>
          <p className="flex justify-between text-muted"><span>نرخ دلار تملک</span><span className="num-ltr text-ink">{toFaDigits(asset.ownershipUsdRate.toLocaleString('en-US'))}</span></p>
          <p className="flex justify-between text-muted"><span>نرخ دلار ارزش‌گذاری</span><span className="num-ltr text-ink">{toFaDigits(asset.valuationUsdRate.toLocaleString('en-US'))}</span></p>
        </div>
      </div>

      <div className="rounded-xl border border-line/10 bg-surface-2/40 p-2.5">
        <p className="mb-1.5 text-[10px] font-black text-ink">ارزش و سود (محاسبه خودکار)</p>
        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-bold">
          <div className="rounded-lg bg-card p-2 shadow-card"><p className="text-muted">قیمت خرید (تومان)</p><p className="num-ltr text-ink">{fmtTomanAmount(asset.purchasePriceToman)}</p></div>
          <div className="rounded-lg bg-card p-2 shadow-card"><p className="text-muted">قیمت خرید (دلار)</p><p className="num-ltr text-ink">{fmtUsdAmount(asset.purchasePriceUsd)}</p></div>
          <div className="rounded-lg bg-card p-2 shadow-card"><p className="text-muted">ارزش فعلی (تومان)</p><p className="num-ltr text-ink">{fmtTomanAmount(asset.currentValueToman)}</p></div>
          <div className="rounded-lg bg-card p-2 shadow-card"><p className="text-muted">ارزش فعلی (دلار)</p><p className="num-ltr text-ink">{fmtUsdAmount(asset.currentValueUsd)}</p></div>
          <div className={cn('rounded-lg p-2', p.profitToman >= 0 ? 'bg-positive/8' : 'bg-negative/8')}>
            <p className="text-muted">سود تومانی</p>
            <p className={cn('num-ltr font-black', p.profitToman >= 0 ? 'text-positive' : 'text-negative')}>{p.profitToman >= 0 ? '+' : ''}{fmtTomanAmount(p.profitToman)}</p>
          </div>
          <div className={cn('rounded-lg p-2', p.profitUsd >= 0 ? 'bg-positive/8' : 'bg-negative/8')}>
            <p className="text-muted">سود دلاری</p>
            <p className={cn('num-ltr font-black', p.profitUsd >= 0 ? 'text-positive' : 'text-negative')}>{p.profitUsd >= 0 ? '+' : ''}{fmtUsdAmount(p.profitUsd)}</p>
          </div>
          <div className="rounded-lg bg-card p-2 shadow-card"><p className="text-muted">بازدهی تومانی</p><ReturnBadge pct={p.profitPctToman} /></div>
          <div className="rounded-lg bg-card p-2 shadow-card"><p className="text-muted">بازدهی دلاری</p><ReturnBadge pct={p.profitPctUsd} /></div>
        </div>
        <p className="mt-2 text-[8px] font-medium leading-4 text-muted">
          ⚠ ارزش فعلی بر اساس ورودی دستی شماست (قیمت روز ملک منبع خودکار ندارد). سود دلاری با نرخ‌های ثبت‌شده
          در تاریخ تملک و ارزش‌گذاری محاسبه شده — تغییر نرخ دلار بعدی این مقادیر را تغییر نمی‌دهد.
        </p>
        {fxHydrated && (
          <p className="mt-1 text-[8px] font-medium text-muted/70">
            نرخ دلار فعلی اپ: {toFaDigits(fxRate.toLocaleString('en-US'))} تومان — صرفاً برای اطلاع.
          </p>
        )}
      </div>
    </div>
  );
}
