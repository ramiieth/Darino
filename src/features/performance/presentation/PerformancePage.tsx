/**
 * عملکرد و مقایسه سرمایه — سیستم مستقل گزارش‌گیری و تحلیل
 *
 *   نمای کلی · سوابق ارزش دارایی · مقایسه با بازارها · تورم و قدرت خرید · تحلیل هوشمند Gemini
 *
 *  • سوابق ارزش ≠ تراکنش: این بخش هیچ تراکنش یا موجودی‌ای را نمی‌سازد یا تغییر نمی‌دهد.
 *  • همهٔ سوابق را خود کاربر ثبت می‌کند؛ صفحه در اولین اجرا خالی است.
 *  • حالت‌ها در URL (?tab= ، ?from= ، ?to=) تا لینک و برگشت PWA درست کار کند.
 */
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { Tabs } from '@/shared/components/ui/SegmentedControl';
import { Button } from '@/shared/components/ui/Button';
import { ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { useCustodyStore } from '@/features/custody/data/repository';
import { useCustody } from '@/features/custody/data/useCustody';
import { useCustodySync } from '@/features/custody/data/sync';
import { usePublishInsight } from '@/shared/assistant/insights';
import { formatJalali, jalaaliToTimestamp, tsToJalaali } from '@/shared/utils/jalali';
import { activeRecords, overview } from '../domain/engine';
import { activeMarkets, analyzePeriod, geminiPayload, yearlyTables } from '../domain/analysis';
import type { ValueBreakdown, ValueRecord } from '../domain/types';
import { usePerformanceData } from '../data/store';
import { useMarketSeries } from '../data/useMarketSeries';
import { useLiveValue } from '../data/useLiveValue';
import { RecordSheet } from './RecordSheet';
import { OverviewTab } from './OverviewTab';
import { RecordsTab } from './RecordsTab';
import { CompareTab } from './CompareTab';
import { InflationTab } from './InflationTab';
import { ReportTab } from './ReportTab';

type Tab = 'overview' | 'records' | 'compare' | 'inflation' | 'report';
const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'نمای کلی' },
  { value: 'records', label: 'سوابق ارزش دارایی' },
  { value: 'compare', label: 'مقایسه با بازارها' },
  { value: 'inflation', label: 'تورم و قدرت خرید' },
  { value: 'report', label: 'تحلیل هوشمند Gemini' }
];
const FIRST_YEAR = 1402;

export default function PerformancePage() {
  useCustodySync();
  useCustody();
  const data = usePerformanceData();
  const ops = useCustodyStore().operations;
  const live = useLiveValue();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'overview') as Tab;
  const update = useCallback(
    (patch: Record<string, string | null>) =>
      setParams((p) => {
        const next = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) (v === null ? next.delete(k) : next.set(k, v));
        return next;
      }, { replace: true }),
    [setParams]
  );

  const records = useMemo(() => activeRecords(data.records), [data.records]);
  // بازه پیش‌فرض: اولین تا آخرین سابقه
  const start = records.find((r) => r.id === params.get('from')) ?? records[0] ?? null;
  const endCand = records.find((r) => r.id === params.get('to'));
  const end = endCand && start && endCand.dateTs > start.dateTs ? endCand : records.length > 1 ? records[records.length - 1] : null;
  const setPeriod = (s: string, e: string) => update({ from: s, to: e });

  const market = useMarketSeries(records[0]?.dateTs ?? null, data.settings);

  const names = useMemo(
    () => ({
      neighborhoods: Object.fromEntries(market.neighborhoodOptions.map((n) => [n.key, n.name])),
      cars: Object.fromEntries(market.carOptions.map((c) => [c.modelId, c.name.trim()]))
    }),
    [market.neighborhoodOptions, market.carOptions]
  );
  const markets = useMemo(() => activeMarkets(data.settings, names), [data.settings, names]);

  const analysis = useMemo(
    () => (start && end && end.dateTs > start.dateTs ? analyzePeriod(start, end, records, data.flows, data.settings, markets, market.series) : null),
    [start, end, records, data.flows, data.settings, markets, market.series]
  );

  const yearly = useMemo(() => {
    const now = Date.now();
    const cy = tsToJalaali(now).year;
    const years = Array.from({ length: Math.max(0, cy - FIRST_YEAR + 1) }, (_, i) => FIRST_YEAR + i);
    const ids = [
      { id: 'ir_gold18', name: 'طلای ۱۸ عیار', unit: 'تومان / گرم' },
      { id: 'ir_sekee', name: 'سکه امامی', unit: 'تومان' },
      { id: 'ir_usd', name: 'دلار آزاد (تتر)', unit: 'تومان' },
      ...(data.settings.enabledMarkets.includes('property') ? data.settings.neighborhoods.map((k) => ({ id: `prop:${k}`, name: `مسکن ${names.neighborhoods[k] ?? k}`, unit: 'تومان / مترمربع (چارک بالا)' })) : []),
      ...(data.settings.enabledMarkets.includes('car') ? data.settings.carModelIds.map((id) => ({ id: `car:${id}`, name: names.cars[id] ?? `خودرو ${id}`, unit: 'تومان (قیمت بازار)' })) : [])
    ];
    return yearlyTables(market.series, ids, years, (y) => jalaaliToTimestamp(y, 1, 1), now);
  }, [market.series, data.settings.enabledMarkets, data.settings.neighborhoods, data.settings.carModelIds, names]);

  const sources = useMemo(() => {
    const out = new Set<string>(['سوابق ارزش دارایی ثبت‌شده توسط شما در دارینو']);
    for (const r of analysis?.rows ?? []) if (r.status === 'ok' && r.source) out.add(`${r.source}${r.updatedAt ? ` (به‌روزرسانی ${formatJalali(r.updatedAt)})` : ''}`);
    if (analysis?.inflation.iran) out.add(analysis.inflation.iran.source);
    if (analysis?.inflation.us) out.add(analysis.inflation.us.source);
    for (const p of analysis?.inflation.proxies ?? []) out.add(p.source);
    return [...out];
  }, [analysis]);

  const buildPayload = useCallback(() => (analysis ? geminiPayload(analysis, records, yearly, formatJalali, Date.now()) : null), [analysis, records, yearly]);

  // فقط معیارهای مشتق‌شده به دستیار پرتفولیو
  const ov = useMemo(() => overview(records), [records]);
  usePublishInsight(
    'capitalPerformance',
    'عملکرد و مقایسه سرمایه',
    ov
      ? {
          latestUsd: ov.latest.usd,
          changeFromPreviousPct: ov.changePctUsd === null ? null : ov.changePctUsd * 100,
          oneYearChangePct: ov.yearChangePctUsd === null ? null : ov.yearChangePctUsd * 100,
          realReturnTomanPct: analysis?.inflation.realToman == null ? null : analysis.inflation.realToman * 100,
          realReturnUsdPct: analysis?.inflation.realUsd == null ? null : analysis.inflation.realUsd * 100
        }
      : null,
    'api',
    'ready'
  );

  const [sheet, setSheet] = useState<{ open: boolean; editing: ValueRecord | null; preset: { usd: number; breakdown: ValueBreakdown | null } | null }>({ open: false, editing: null, preset: null });
  const openAdd = () => setSheet({ open: true, editing: null, preset: null });

  return (
    <Page>
      <PageHeader
        title="عملکرد و مقایسه سرمایه"
        subtitle="تاریخچهٔ ارزش کل دارایی، مقایسه با تورم و بازارهای موازی، و گزارش تحلیلی"
        actions={<Button icon={<Plus />} onClick={openAdd}>ثبت ارزش</Button>}
      />
      <Tabs label="بخش‌های عملکرد سرمایه" options={TABS} value={tab} onChange={(t) => update({ tab: t === 'overview' ? null : t })} className="mb-5" />

      {!data.loaded ? (
        <ListSkeleton rows={4} />
      ) : (
        <>
          {!data.persistent && <Notice tone="warn" className="mb-4">ذخیره‌سازی دائمی روی این دستگاه در دسترس نیست؛ سوابق پس از بستن مرورگر ممکن است از بین بروند مگر با حساب وارد شده همگام شوند.</Notice>}
          {tab === 'overview' && (
            <OverviewTab
              records={records}
              live={live}
              onAdd={openAdd}
              onSnapshot={() => live.total !== null && setSheet({ open: true, editing: null, preset: { usd: live.total, breakdown: live.breakdown } })}
            />
          )}
          {tab === 'records' && <RecordsTab records={records} flows={data.flows} settings={data.settings} ops={ops} onAdd={openAdd} onEdit={(r) => setSheet({ open: true, editing: r, preset: null })} />}
          {tab === 'compare' && start && end && (
            <CompareTab records={records} startId={start.id} endId={end.id} onPeriod={setPeriod} analysis={analysis} yearly={yearly} market={market} settings={data.settings} />
          )}
          {tab === 'inflation' && start && end && (
            <InflationTab records={records} startId={start.id} endId={end.id} onPeriod={setPeriod} analysis={analysis} series={market.series} settings={data.settings} />
          )}
          {tab === 'report' && start && end && (
            <ReportTab records={records} startId={start.id} endId={end.id} onPeriod={setPeriod} reports={data.reports} buildPayload={buildPayload} sources={sources} ready={!market.loading} />
          )}
          {(tab === 'compare' || tab === 'inflation' || tab === 'report') && !(start && end) && (
            <Notice tone="info">برای این بخش حداقل دو سابقهٔ ارزش در تاریخ‌های مختلف لازم است.</Notice>
          )}
        </>
      )}

      <RecordSheet
        open={sheet.open}
        onClose={() => setSheet({ open: false, editing: null, preset: null })}
        editing={sheet.editing}
        preset={sheet.preset}
        existing={records}
        rateOn={market.rateOn}
        live={live}
      />
    </Page>
  );
}
