/** ============================================================
 * Property Market — تغییر قیمت دلاری در طول زمان
 *
 *  ۱) یک ناحیه (کل اهواز یا یک محله): ۱، ۳، ۶، ۹، ۱۲، ۱۶، ۲۴، ۳۲، ۳۶ ماه
 *     → هر متر و قیمت کل به دلار (قبل/حالا/٪) + مقایسه با کل اهواز
 *  ۲) رتبه‌بندی همه محله‌ها در یک دوره انتخابی
 *  ⚠️ فقط نمایش — محاسبه در domain/history.ts
 * ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Select } from '@/shared/components/ui/Input';
import { ChipGroup, SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Notice } from '@/shared/components/ui/StateViews';
import { fmtIntLatin, fmtPct, fmtUSD, toFaDigits } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import { useUsdtHistoryStore } from '@/shared/store/usdtStore';
import type { PropertyMarketSnapshot } from '../domain/types';
import {
  CHANGE_PERIODS_MONTHS,
  CITY_KEY,
  changeTable,
  earliestSnapshotTs,
  neighborhoodChanges,
  usdSeries,
  type ChangeRow,
  type PriceMetric
} from '../domain/history';
import { snapshotAreaRecords } from '../service/propertyMarketService';
import { PRICE_TYPES, priceTypeLabel, type PriceType } from '../domain/segments';
import { TrendChart } from './MarketCharts';

export function periodLabel(m: number): string {
  return m === 1 ? '۱ ماه پیش' : `${toFaDigits(m)} ماه پیش`;
}

function PctCell({ v, strong = false }: { v: number | null; strong?: boolean }) {
  if (v === null) return <span className="text-subtle">—</span>;
  const up = v > 0.05;
  const down = v < -0.05;
  return (
    <span
      dir="ltr"
      className={cn(
        'inline-flex items-center gap-1 tnum',
        strong && 'font-bold',
        up ? 'text-positive' : down ? 'text-negative' : 'text-muted'
      )}
    >
      {up ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : down ? <TrendingDown className="h-3.5 w-3.5" aria-hidden /> : null}
      {fmtPct(v)}
    </span>
  );
}

const usd = (v: number | null) => (v === null ? '—' : fmtUSD(v));

function statusText(r: ChangeRow): string {
  switch (r.status) {
    case 'pending':
      return r.availableFrom ? `از ${formatJalali(r.availableFrom)} قابل نمایش` : 'هنوز داده کافی نیست';
    case 'no-area':
      return 'در آن تاریخ آگهیِ این نوع/محله ثبت نشده (یا Snapshot قدیمی تفکیک نوع ندارد)';
    case 'no-rate':
      return 'نرخ تتر آن تاریخ در دسترس نیست';
    case 'no-data':
      return 'Snapshot نزدیک به این تاریخ ثبت نشده';
    default:
      return '';
  }
}

export function PriceChangePanel({ snapshots }: { snapshots: PropertyMarketSnapshot[] }) {
  const history = useUsdtHistoryStore();
  const [area, setArea] = useState<string>(CITY_KEY);
  const [period, setPeriod] = useState<string>('3');
  const [metric, setMetric] = useState<PriceMetric>('median');
  const [ptype, setPtype] = useState<PriceType>('all');
  const [rankLevel, setRankLevel] = useState<'group' | 'neighborhood'>('group');

  // نرخ روزانه تتر از قدیمی‌ترین Snapshot تا امروز
  const earliest = earliestSnapshotTs(snapshots);
  useEffect(() => {
    if (earliest !== null) void useUsdtHistoryStore.getState().ensure(earliest);
  }, [earliest]);

  const latest = snapshots.length > 0 ? [...snapshots].sort((a, b) => b.dateTs - a.dateTs)[0] : null;
  const byCount = (a: { stats: { listingCount: number } }, b: { stats: { listingCount: number } }) =>
    b.stats.listingCount - a.stats.listingCount;
  const areaOptions = useMemo(() => (latest ? [...snapshotAreaRecords(latest, 'area')].sort(byCount) : []), [latest]);
  const nbOptions = useMemo(() => (latest ? [...latest.neighborhoodStats].sort(byCount) : []), [latest]);
  const rows = useMemo(() => changeTable(snapshots, area, history.rates, metric, ptype), [snapshots, area, history.rates, metric, ptype]);
  const cityRows = useMemo(
    () => (area === CITY_KEY ? rows : changeTable(snapshots, CITY_KEY, history.rates, metric, ptype)),
    [area, rows, snapshots, history.rates, metric, ptype]
  );
  const ranking = useMemo(
    () => neighborhoodChanges(snapshots, Number(period), history.rates, { level: rankLevel, metric, type: ptype }),
    [snapshots, period, history.rates, rankLevel, metric, ptype]
  );
  const series = useMemo(() => usdSeries(snapshots, area, history.rates, metric, ptype), [snapshots, area, history.rates, metric, ptype]);
  const anyOk = rows.some((r) => r.status === 'ok');
  const first = earliest !== null ? formatJalali(earliest) : null;
  const areaName =
    area === CITY_KEY
      ? 'کل اهواز'
      : [...areaOptions, ...nbOptions].find((a) => a.neighborhoodKey === area)?.displayName ?? '';
  const metricFa = `${metric === 'median' ? 'میانه' : 'میانگین'}${ptype === 'all' ? '' : ` (${priceTypeLabel(ptype)})`}`;

  return (
    <div className="space-y-5">
      {!anyOk && (
        <Notice tone="info" title="تاریخچه از حالا ساخته می‌شود">
          هر بار «به‌روزرسانی داده» یک Snapshot با تاریخ و نرخ تتر همان روز ثبت می‌کند
          {first ? ` (اولین Snapshot: ${first})` : ''}. مقایسه‌ها به‌محض رسیدن به هر دوره خودکار فعال می‌شوند —
          برای دقت، دست‌کم ماهی یک‌بار به‌روزرسانی کنید.
        </Notice>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-64">
          <Select aria-label="منطقه یا محله" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value={CITY_KEY}>کل اهواز</option>
            <optgroup label="مناطق">
              {areaOptions.map((a) => (
                <option key={`a-${a.neighborhoodKey}`} value={a.neighborhoodKey}>
                  {a.displayName} ({toFaDigits(a.stats.listingCount)} آگهی)
                </option>
              ))}
            </optgroup>
            <optgroup label="محله‌ها (جزئی)">
              {nbOptions.map((a) => (
                <option key={`n-${a.neighborhoodKey}`} value={a.neighborhoodKey}>
                  {a.displayName} ({toFaDigits(a.stats.listingCount)} آگهی)
                </option>
              ))}
            </optgroup>
          </Select>
        </div>
        <div className="w-48">
          <Select aria-label="نوع قیمت" value={ptype} onChange={(e) => setPtype(e.target.value as PriceType)}>
            {PRICE_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.key === 'all' ? 'همه آگهی‌ها' : t.label}
              </option>
            ))}
          </Select>
        </div>
        <SegmentedControl<PriceMetric>
          size="sm"
          label="شاخص قیمت"
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'median', label: 'میانه' },
            { value: 'mean', label: 'میانگین' }
          ]}
        />
        <p className="text-xs text-muted">
          هر Snapshot با نرخ تتر همان تاریخ به دلار تبدیل می‌شود
          {history.source ? ` (تاریخچه: ${history.source === 'wallex' ? 'والکس' : 'بیت‌پین'})` : ''}.
        </p>
      </div>

      <div className="overflow-x-auto rounded-card border border-divider">
        <table className="data-table min-w-[860px]">
          <caption className="sr-only">تغییر قیمت دلاری {areaName}</caption>
          <thead>
            <tr>
              <th scope="col" className="!ps-5">نسبت به</th>
              <th scope="col" className="col-num">{metricFa} هر متر (دلار) قبل ← حالا</th>
              <th scope="col" className="col-num">تغییر هر متر</th>
              <th scope="col" className="col-num">{metricFa} قیمت کل (دلار) قبل ← حالا</th>
              <th scope="col" className="col-num">تغییر قیمت کل</th>
              <th scope="col" className="col-num">تغییر تومانی</th>
              {area !== CITY_KEY && <th scope="col" className="col-num">کل اهواز (هر متر)</th>}
              <th scope="col" className="col-num !pe-5">تتر قبل ← حالا</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const city = cityRows[i];
              return (
                <tr key={r.months}>
                  <td className="!ps-5">
                    <span className="font-semibold text-ink">{periodLabel(r.months)}</span>
                    {r.base && <span className="block text-2xs text-muted">{formatJalali(r.base.dateTs)}</span>}
                  </td>
                  {r.status === 'ok' && r.base && r.now ? (
                    <>
                      <td className="col-num">
                        <span className="text-muted">{usd(r.base.ppmUsd)}</span> ← <span className="font-semibold">{usd(r.now.ppmUsd)}</span>
                      </td>
                      <td className="col-num">
                        <PctCell v={r.ppmUsdPct} strong />
                        {r.lowSample && <span className="block text-2xs text-warn">نمونه کم</span>}
                      </td>
                      <td className="col-num">
                        <span className="text-muted">{usd(r.base.totalUsd)}</span> ← <span className="font-semibold">{usd(r.now.totalUsd)}</span>
                      </td>
                      <td className="col-num"><PctCell v={r.totalUsdPct} strong /></td>
                      <td className="col-num"><PctCell v={r.ppmTomanPct} /></td>
                      {area !== CITY_KEY && <td className="col-num"><PctCell v={city?.ppmUsdPct ?? null} /></td>}
                      <td className="col-num !pe-5 text-xs text-muted">
                        {toFaDigits(fmtIntLatin(r.base.rate))} ← {toFaDigits(fmtIntLatin(r.now.rate))}
                        {(r.base.rateSource === 'legacy' || r.now.rateSource === 'legacy') && <span className="block text-warn">نرخ دستی قدیمی</span>}
                      </td>
                    </>
                  ) : (
                    <td colSpan={area !== CITY_KEY ? 7 : 6} className="text-xs text-muted">
                      {statusText(r)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-card border border-divider p-4">
        <h3 className="mb-3 text-sm font-bold text-ink">روند {metricFa} قیمت هر متر {areaName} (دلار)</h3>
        <TrendChart points={series.map((p) => ({ ts: p.dateTs, label: formatJalali(p.dateTs), value: p.ppmUsd as number }))} format={(v) => fmtUSD(v)} />
      </div>

      <div className="rounded-card border border-divider">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-bold text-ink">رشد/کاهش دلاری همه {rankLevel === 'group' ? 'مناطق' : 'محله‌ها'}</h3>
            <SegmentedControl<'group' | 'neighborhood'>
              size="sm"
              label="سطح رتبه‌بندی"
              value={rankLevel}
              onChange={setRankLevel}
              options={[
                { value: 'group', label: 'منطقه' },
                { value: 'neighborhood', label: 'محله' }
              ]}
            />
          </div>
          <ChipGroup
            label="دوره"
            value={period}
            onChange={setPeriod}
            options={CHANGE_PERIODS_MONTHS.map((m) => ({ value: String(m), label: `${toFaDigits(m)} ماه` }))}
          />
        </div>
        {ranking.city.status !== 'ok' ? (
          <p className="px-4 py-6 text-center text-sm text-muted">
            {periodLabel(Number(period))}: {statusText(ranking.city)}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[640px]">
              <thead>
                <tr>
                  <th scope="col" className="!ps-5">{rankLevel === 'group' ? 'منطقه' : 'محله'}</th>
                  <th scope="col" className="col-num">هر متر (دلار)</th>
                  <th scope="col" className="col-num">قیمت کل (دلار)</th>
                  <th scope="col" className="col-num !pe-5">نسبت به کل اهواز</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-surface-2">
                  <td className="!ps-5 font-bold text-ink">کل اهواز</td>
                  <td className="col-num"><PctCell v={ranking.city.ppmUsdPct} strong /></td>
                  <td className="col-num"><PctCell v={ranking.city.totalUsdPct} strong /></td>
                  <td className="col-num !pe-5">—</td>
                </tr>
                {ranking.rows.map((r) => (
                  <tr key={r.key}>
                    <td className="!ps-5">
                      <span className="font-semibold text-ink">{r.displayName}</span>
                      {r.change.lowSample && <span className="ms-1 text-2xs text-warn">نمونه کم</span>}
                    </td>
                    {r.change.status === 'ok' ? (
                      <>
                        <td className="col-num"><PctCell v={r.change.ppmUsdPct} /></td>
                        <td className="col-num"><PctCell v={r.change.totalUsdPct} /></td>
                        <td className="col-num !pe-5">
                          {r.vsCityPp === null ? '—' : (
                            <span dir="ltr" className="tnum text-xs text-muted">
                              {r.vsCityPp > 0 ? '+' : ''}{r.vsCityPp.toFixed(1)} واحد درصد
                            </span>
                          )}
                        </td>
                      </>
                    ) : (
                      <td colSpan={3} className="text-xs text-muted">{statusText(r.change)}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
