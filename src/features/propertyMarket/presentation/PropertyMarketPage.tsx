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
import { Building2, MapPin } from 'lucide-react';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { EmptyState } from '@/shared/components/ui/StateViews';
import { PageSkeleton } from '@/shared/components/ui/Skeleton';
import { KeyValueList, Metric, MetricGrid, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { ProvenanceBadge } from '@/shared/components/ui/ProvenanceBadge';
import { useFxStore } from '@/shared/store/fxStore';
import { fmtIntLatin, fmtRelativeAge, fmtUSD, toFaDigits } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
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
  const change = view?.cityUsdChangePercent ?? null;

  return (
    <Page>
      <PageHeader
        title="بازار املاک — اهواز"
        subtitle="قیمت آپارتمان‌های فروشی از دیوار و تحلیل دلاری با سناریوی نرخ آینده"
        meta={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="h-3.5 w-3.5" /> اهواز
            </span>
            <span>
              آخرین به‌روزرسانی:{' '}
              <span className="text-ink">
                {view?.lastPropertyUpdate ? `${formatJalali(view.lastPropertyUpdate)} · ${fmtRelativeAge(view.lastPropertyUpdate)}` : '—'}
              </span>
            </span>
            <span>
              آگهی معتبر: <span className="text-ink">{view ? toFaDigits(view.totalListings) : '۰'}</span>
            </span>
            <ProvenanceBadge kind="live" label="DIVAR" />
          </div>
        }
      />

      {!hasAnyData && !st.loading ? (
        <EmptyState
          icon={<Building2 />}
          message="هنوز داده‌ای از بازار املاک اهواز ثبت نشده است"
          hint="با «جمع‌آوری از دیوار»، آگهی‌های آپارتمان فروشی اهواز استخراج، پاک‌سازی و به Snapshot بازار تبدیل می‌شوند. داده‌های ماژول قدیمی به‌صورت خودکار مهاجرت می‌شوند."
        />
      ) : view ? (
        <>
          <Surface variant="focal" className="p-5 md:p-6">
            <MetricGrid cols={4}>
              <Metric
                size="lg"
                label="میانه قیمت اهواز (تومان/متر)"
                value={view.cityStatsToman.medianTomanPerM2 !== null ? fmtMillionToman(view.cityStatsToman.medianTomanPerM2) : '—'}
                sub={<>میانگین {fmtMillionToman(view.cityStatsToman.meanTomanPerM2)}</>}
              />
              <Metric
                size="lg"
                label="میانه به دلار (فعلی)"
                value={<MoneyValue value={view.cityCurrentUsdPerM2} />}
                sub={fxRate !== null ? <>دلار {toFaDigits(fmtIntLatin(fxRate))} تومان</> : undefined}
              />
              <Metric
                size="lg"
                label="میانه به دلار (سناریو)"
                value={<MoneyValue value={view.cityFutureUsdPerM2} />}
                sub={futureRate !== null ? <>دلار {toFaDigits(fmtIntLatin(futureRate))} تومان</> : undefined}
              />
              <Metric
                size="lg"
                label="تغییر دلاری (سناریو)"
                value={<PercentValue value={change !== null ? Math.round(change * 10) / 10 : null} digits={1} />}
                sub={view.scenarioBasis === 'constant-property' ? 'با قیمت تومانی ثابت' : 'با رشد تومانی سناریو'}
              />
            </MetricGrid>
          </Surface>

          <ScenarioPanel
            scenario={st.scenario}
            currentRate={fxRate}
            fxHydrated={fxHydrated}
            onChange={(patch) => void usePropertyMarketStore.getState().setScenario(patch)}
            onReset={() => void usePropertyMarketStore.getState().resetScenario()}
          />

          <Section id="areas" title="مناطق اهواز" description="میانه قیمت هر مترمربع — روی سرستون‌ها بزنید تا مرتب شود">
            <Surface className="overflow-hidden">
              <NeighborhoodTable rows={view.rows} />
            </Surface>
          </Section>

          <div className="grid gap-6 md:grid-cols-2">
            <Section id="expensive" title="گران‌ترین مناطق (دلاری)">
              <Surface className="px-4">
                {expensive.length === 0 ? (
                  <p className="py-4 text-sm text-muted">داده کافی نیست</p>
                ) : (
                  <KeyValueList
                    rows={expensive.map((r, i) => ({
                      label: `${toFaDigits(i + 1)}. ${r.displayName}`,
                      value: <MoneyValue value={r.currentUsdPerM2} />
                    }))}
                  />
                )}
              </Surface>
            </Section>
            <Section id="affordable" title="ارزان‌ترین مناطق (دلاری)">
              <Surface className="px-4">
                {affordable.length === 0 ? (
                  <p className="py-4 text-sm text-muted">داده کافی نیست</p>
                ) : (
                  <KeyValueList
                    rows={affordable.map((r, i) => ({
                      label: `${toFaDigits(i + 1)}. ${r.displayName}`,
                      value: <MoneyValue value={r.currentUsdPerM2} />
                    }))}
                  />
                )}
              </Surface>
            </Section>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Surface className="p-4 md:p-5">
              <h3 className="mb-4 text-sm font-bold text-ink">نمودار ۱ — قیمت فعلی مناطق (تومان/متر)</h3>
              <HBarChart data={view.rows.map((r) => ({ label: r.displayName, value: r.medianTomanPerM2 }))} format={(v) => fmtMillionToman(v)} />
            </Surface>
            <Surface className="p-4 md:p-5">
              <h3 className="mb-4 text-sm font-bold text-ink">نمودار ۲ — قیمت فعلی مناطق (دلار/متر)</h3>
              <HBarChart
                data={view.rows.map((r) => ({ label: r.displayName, value: r.currentUsdPerM2 }))}
                format={(v) => fmtUSD(v)}
                color="rgb(var(--c-chart-2))"
              />
            </Surface>
            <Surface className="p-4 md:p-5">
              <h3 className="mb-4 text-sm font-bold text-ink">نمودار ۳ — نرخ دلار فعلی در برابر آینده</h3>
              <PairedBarChart
                data={view.rows.map((r) => ({ label: r.displayName, current: r.currentUsdPerM2, future: r.futureUsdPerM2 }))}
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
              <h3 className="mb-4 text-sm font-bold text-ink">نمودار ۴ — موقعیت نسبی نسبت به میانه اهواز</h3>
              <PositionChart data={view.rows.map((r) => ({ label: r.displayName, pct: r.positionVsCityPct }))} cityLabel="اهواز" />
            </Surface>
          </div>
        </>
      ) : (
        <PageSkeleton />
      )}

      <CollectorPanel
        collect={st.collect}
        lastSnapshot={st.snapshots.length > 0 ? st.snapshots[st.snapshots.length - 1] : null}
        onCollect={() => void usePropertyMarketStore.getState().startCollection()}
      />
      {!hasAnyData && !st.loading && (
        <ScenarioPanel
          scenario={st.scenario}
          currentRate={fxRate}
          fxHydrated={fxHydrated}
          onChange={(patch) => void usePropertyMarketStore.getState().setScenario(patch)}
          onReset={() => void usePropertyMarketStore.getState().resetScenario()}
        />
      )}
      <LegacyPanel assets={st.legacyAssets} />
    </Page>
  );
}
