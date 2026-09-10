/** ============================================================
 * بازار املاک (Property Market) — اهواز
 *
 *  داده: کلکشنر دیوار (آپارتمان فروشی) + داده مهاجرت‌یافته ماژول قبلی
 *  محاسبات: فقط لایه سرویس (تومان→دلار، سناریو، مقایسه با میانه اهواز)
 *  نرخ دلار: فقط منبع موجود دارینو (جاری) + سناریوی آینده (فرض صریح)
 *
 * ⚠️ سناریوی آینده پیش‌بینی قیمت ملک نیست — برچسب‌گذاری صریح (§۲۳/§۲۴).
 * ============================================================ */
import { useEffect, useMemo } from 'react';
import { Building2, MapPin, TrendingDown, TrendingUp } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { PageHeader } from '@/shared/components/layout/Page';
import { ProvenanceBadge } from '@/shared/components/ui/ProvenanceBadge';
import { useFxStore } from '@/shared/store/fxStore';
import {
  fmtIntLatin,
  fmtPct,
  fmtRelativeAge,
  fmtUSD,
  toFaDigits
} from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import { cn } from '@/shared/lib/cn';
import { usePropertyMarket, usePropertyMarketStore } from '../data/store';
import {
  buildMarketView,
  buildMarketViewFromSnapshot,
  fxInputFromScenario,
  mostAffordableUsd,
  mostExpensiveUsd,
  type PropertyMarketView
} from '../service/propertyMarketService';
import { filterOutliers, newCleaningReport } from '../collector/pipeline';
import { ScenarioPanel } from './ScenarioPanel';
import { NeighborhoodTable, fmtMillionToman } from './NeighborhoodTable';
import { CollectorPanel } from './CollectorPanel';
import { LegacyPanel } from './LegacyPanel';
import { HBarChart, PairedBarChart, PositionChart } from './MarketCharts';

/* ---------------- کارت‌های بالای صفحه ---------------- */

function HeroCard({
  title,
  value,
  sub,
  accent
}: {
  title: string;
  value: string;
  sub?: React.ReactNode;
  accent?: 'up' | 'down' | 'neutral';
}) {
  return (
    <GlassCard className="p-3.5">
      <p className="mb-1 text-[9px] font-extrabold text-muted">{title}</p>
      <p
        className={cn(
          'num-ltr text-xl font-black leading-7',
          accent === 'up' ? 'text-positive' : accent === 'down' ? 'text-negative' : 'text-ink'
        )}
      >
        {value}
      </p>
      {sub && <div className="mt-1 text-[9px] font-bold text-muted">{sub}</div>}
    </GlassCard>
  );
}

/** ساخت ویوی بازار — ترجیحاً آخرین Snapshot، وگرنه آگهی‌های محلی */
function useMarketView(): { view: PropertyMarketView | null; hasAnyData: boolean } {
  const { listings, snapshots, scenario } = usePropertyMarket();
  const fxRate = useFxStore((s) => s.rate);
  const fxHydrated = useFxStore((s) => s.hydrated);

  useEffect(() => {
    void useFxStore.getState().hydrate();
  }, []);

  return useMemo(() => {
    const hasAnyData = listings.length > 0 || snapshots.length > 0;
    if (!fxHydrated || !hasAnyData) return { view: null, hasAnyData };
    const fx = fxInputFromScenario(scenario, fxRate > 0 ? fxRate : null);
    const lastSnap = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
    if (lastSnap) {
      return { view: buildMarketViewFromSnapshot(lastSnap, fx), hasAnyData };
    }
    const report = newCleaningReport();
    const market = filterOutliers(listings, report);
    const lastUpdate = market.reduce((m, l) => Math.max(m, l.scrapedAt), 0);
    return {
      view: buildMarketView({ listings: market, fx, lastPropertyUpdate: lastUpdate || null }),
      hasAnyData
    };
  }, [listings, snapshots, scenario, fxRate, fxHydrated]);
}

/* ---------------- صفحه ---------------- */

export function PropertyMarketPage() {
  const st = usePropertyMarket();
  const { view, hasAnyData } = useMarketView();
  const fxHydrated = useFxStore((s) => s.hydrated);

  const fxRate = view?.currentUsdRateToman ?? null;
  const futureRate = view?.futureUsdRateToman ?? null;

  const expensive = view ? mostExpensiveUsd(view.rows, 3) : [];
  const affordable = view ? mostAffordableUsd(view.rows, 3) : [];

  return (
    <div className="mx-auto w-full max-w-5xl px-3 pb-24 pt-4 md:px-6">
      <PageHeader
        title="بازار املاک — اهواز"
        subtitle="قیمت آپارتمان‌های فروشی از دیوار + تحلیل دلاری با سناریوی نرخ آینده"
        actions={<ProvenanceBadge kind="live" label="DIVAR" />}
      />

      {/* نوار وضعیت شهر + نرخ‌ها */}
      <GlassCard className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 p-3.5">
        <span className="flex items-center gap-1.5 text-[11px] font-extrabold text-ink">
          <MapPin className="h-3.5 w-3.5 text-accent" />
          اهواز
        </span>
        <span className="text-[9px] font-bold text-muted">
          دلار فعلی:{' '}
          <span className="num-ltr text-ink">{fxRate !== null ? `${fmtIntLatin(fxRate)} تومان` : '—'}</span>
        </span>
        <span className="text-[9px] font-bold text-muted">
          دلار آینده (سناریو):{' '}
          <span className="num-ltr text-ink">{futureRate !== null ? `${fmtIntLatin(futureRate)} تومان` : '—'}</span>
        </span>
        <span className="text-[9px] font-bold text-muted">
          آخرین به‌روزرسانی ملک:{' '}
          <span className="text-ink">
            {view?.lastPropertyUpdate ? `${formatJalali(view.lastPropertyUpdate)} · ${fmtRelativeAge(view.lastPropertyUpdate)}` : '—'}
          </span>
        </span>
        <span className="text-[9px] font-bold text-muted">
          آگهی معتبر: <span className="num-ltr text-ink">{view ? fmtIntLatin(view.totalListings) : '۰'}</span>
        </span>
      </GlassCard>

      {/* سناریو */}
      <div className="mb-3">
        <ScenarioPanel
          scenario={st.scenario}
          currentRate={fxRate}
          fxHydrated={fxHydrated}
          onChange={(patch) => void usePropertyMarketStore.getState().setScenario(patch)}
          onReset={() => void usePropertyMarketStore.getState().resetScenario()}
        />
      </div>

      {!hasAnyData && !st.loading ? (
        <GlassCard className="p-6 text-center">
          <Building2 className="mx-auto mb-2 h-8 w-8 text-muted" />
          <p className="text-[12px] font-extrabold text-ink">هنوز داده‌ای از بازار املاک اهواز ثبت نشده است</p>
          <p className="mx-auto mt-1.5 max-w-md text-[10px] font-medium leading-5 text-muted">
            با اجرای «جمع‌آوری از دیوار» آگهی‌های آپارتمان فروشی اهواز استخراج، پاک‌سازی و به
            Snapshot بازار تبدیل می‌شوند. داده‌های ماژول قدیمی (در صورت وجود) به‌صورت خودکار
            مهاجرت می‌شوند.
          </p>
        </GlassCard>
      ) : view ? (
        <>
          {/* کارت‌های اصلی §۸ */}
          <div className="mb-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <HeroCard
              title="میانه قیمت اهواز (تومان/متر)"
              value={view.cityStatsToman.medianTomanPerM2 !== null ? fmtMillionToman(view.cityStatsToman.medianTomanPerM2) : '—'}
              sub={
                <span>
                  میانگین: <span className="num-ltr">{fmtMillionToman(view.cityStatsToman.meanTomanPerM2)}</span>
                </span>
              }
            />
            <HeroCard
              title="میانه اهواز به دلار (فعلی)"
              value={view.cityCurrentUsdPerM2 !== null ? fmtUSD(view.cityCurrentUsdPerM2) : '—'}
              sub={<span>با دلار {fmtIntLatin(view.currentUsdRateToman ?? 0)} تومانی</span>}
            />
            <HeroCard
              title="دلار آینده — میانه اهواز (سناریو)"
              value={view.cityFutureUsdPerM2 !== null ? fmtUSD(view.cityFutureUsdPerM2) : '—'}
              sub={<span>فرض: قیمت تومانی {view.scenarioBasis === 'constant-property' ? 'ثابت' : 'سناریوشده'}</span>}
            />
            <HeroCard
              title="تغییر دلاری (سناریو)"
              value={view.cityUsdChangePercent !== null ? fmtPct(Math.round(view.cityUsdChangePercent * 10) / 10) : '—'}
              accent={view.cityUsdChangePercent !== null && view.cityUsdChangePercent < 0 ? 'down' : view.cityUsdChangePercent !== null && view.cityUsdChangePercent > 0 ? 'up' : 'neutral'}
              sub={
                view.cityUsdChangePercent !== null && view.cityUsdChangePercent < 0 ? (
                  <span className="flex items-center gap-1">
                    <TrendingDown className="h-3 w-3" /> افت ارزش دلاری با دلار گران‌تر
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> بدون افت دلاری در این سناریو
                  </span>
                )
              }
            />
          </div>

          {/* جدول مناطق */}
          <GlassCard className="mb-3 p-3.5">
            <h3 className="mb-2 text-[11px] font-extrabold text-ink">مناطق اهواز — میانه قیمت هر مترمربع</h3>
            <NeighborhoodTable rows={view.rows} />
          </GlassCard>

          {/* رتبه‌های دلاری §۱۰/§۱۱ */}
          <div className="mb-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
            <GlassCard className="p-3.5">
              <h3 className="mb-2 text-[10px] font-extrabold text-ink">گران‌ترین مناطق دلاری</h3>
              <div className="space-y-1.5">
                {expensive.length === 0 && <p className="text-[9px] text-muted">داده کافی نیست</p>}
                {expensive.map((r, i) => (
                  <div key={r.neighborhoodKey} className="flex items-center justify-between text-[10px] font-bold">
                    <span className="text-ink">
                      {toFaDigits(i + 1)}. {r.displayName}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="num-ltr text-ink">{fmtUSD(r.currentUsdPerM2)}</span>
                      {r.position === 'above' && (
                        <span className="rounded-full bg-negative/10 px-1.5 py-0.5 text-[7px] font-extrabold text-negative">بالاتر از بازار</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </GlassCard>
            <GlassCard className="p-3.5">
              <h3 className="mb-2 text-[10px] font-extrabold text-ink">ارزان‌ترین مناطق دلاری</h3>
              <div className="space-y-1.5">
                {affordable.length === 0 && <p className="text-[9px] text-muted">داده کافی نیست</p>}
                {affordable.map((r, i) => (
                  <div key={r.neighborhoodKey} className="flex items-center justify-between text-[10px] font-bold">
                    <span className="text-ink">
                      {toFaDigits(i + 1)}. {r.displayName}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="num-ltr text-ink">{fmtUSD(r.currentUsdPerM2)}</span>
                      {r.position === 'below' && (
                        <span className="rounded-full bg-positive/10 px-1.5 py-0.5 text-[7px] font-extrabold text-positive">پایین‌تر از بازار</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          {/* نمودارها §۲۲ */}
          <div className="mb-3 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            <GlassCard className="p-3.5">
              <h3 className="mb-2 text-[10px] font-extrabold text-ink">
                نمودار ۱ — قیمت فعلی مناطق (تومان/متر)
              </h3>
              <HBarChart
                data={view.rows.map((r) => ({ label: r.displayName, value: r.medianTomanPerM2 }))}
                format={(v) => fmtMillionToman(v)}
              />
            </GlassCard>
            <GlassCard className="p-3.5">
              <h3 className="mb-2 text-[10px] font-extrabold text-ink">
                نمودار ۲ — قیمت فعلی مناطق (دلار/متر)
              </h3>
              <HBarChart
                data={view.rows.map((r) => ({ label: r.displayName, value: r.currentUsdPerM2 }))}
                format={(v) => fmtUSD(v)}
                color="rgb(129 140 248)"
              />
            </GlassCard>
            <GlassCard className="p-3.5">
              <h3 className="mb-2 text-[10px] font-extrabold text-ink">
                نمودار ۳ — سناریوی نرخ دلار: فعلی در مقابل آینده
              </h3>
              <PairedBarChart
                data={view.rows.map((r) => ({ label: r.displayName, current: r.currentUsdPerM2, future: r.futureUsdPerM2 }))}
                format={(v) => fmtUSD(v)}
              />
              <p className="mt-2 text-[7px] font-medium leading-3 text-muted">
                سناریوی آینده: {view.scenarioBasis === 'constant-property'
                  ? 'قیمت تومانی ملک ثابت فرض شده است.'
                  : `فرض رشد تومانی ${toFaDigits(String(view.propertyTomanGrowthPct ?? 0))}٪ اعمال شده است.`}{' '}
                این سناریو پیش‌بینی قیمت ملک نیست.
              </p>
            </GlassCard>
            <GlassCard className="p-3.5">
              <h3 className="mb-2 text-[10px] font-extrabold text-ink">
                نمودار ۴ — موقعیت نسبی مناطق نسبت به میانه اهواز
              </h3>
              <PositionChart
                data={view.rows.map((r) => ({ label: r.displayName, pct: r.positionVsCityPct }))}
                cityLabel="اهواز"
              />
            </GlassCard>
          </div>
        </>
      ) : (
        <GlassCard className="p-6 text-center text-[10px] font-bold text-muted">در حال بارگذاری…</GlassCard>
      )}

      {/* کلکشنر + داده قدیمی */}
      <div className="space-y-3">
        <CollectorPanel
          collect={st.collect}
          lastSnapshot={st.snapshots.length > 0 ? st.snapshots[st.snapshots.length - 1] : null}
          onCollect={() => void usePropertyMarketStore.getState().startCollection()}
        />
        <LegacyPanel assets={st.legacyAssets} />
      </div>
    </div>
  );
}
