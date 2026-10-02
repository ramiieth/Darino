/** ============================================================
 * Property Market — تغییر قیمت دلاری در طول زمان (هم‌نوع، هر منطقه)
 *
 *  سال ساخت + منطقه → تغییر در دوره‌های ۱ تا ۶۰ ماه
 *  و رتبه‌بندی همه مناطق در یک دوره
 *  ⚠️ فقط نمایش — محاسبه در domain/history.ts
 * ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Select } from '@/shared/components/ui/Input';
import { ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { toFaDigits } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import { useUsdtHistoryStore } from '@/shared/store/usdtStore';
import type { PropertyMarketSnapshot } from '../domain/types';
import {
  CHANGE_PERIODS_MONTHS,
  areaChanges,
  changeTable,
  earliestSnapshotTs,
  usdSeries,
  type ChangeRow
} from '../domain/history';
import { snapshotAreaRecords } from '../service/propertyMarketService';
import { PRICE_TYPES, jalaliYearOf, priceTypeLabel, priceTypeYear, type PriceType } from '../domain/segments';
import { TrendChart } from './MarketCharts';
import { fmtPctFa, fmtUsdFa } from './format';

export function periodLabel(m: number): string {
  return `${toFaDigits(m)} ماه پیش`;
}

function PctCell({ v, strong = false }: { v: number | null; strong?: boolean }) {
  if (v === null) return <span className="text-subtle">—</span>;
  const up = v > 0.05;
  const down = v < -0.05;
  return (
    <span className={cn('inline-flex items-center gap-1', strong && 'font-bold', up ? 'text-positive' : down ? 'text-negative' : 'text-muted')}>
      {up ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : down ? <TrendingDown className="h-3.5 w-3.5" aria-hidden /> : null}
      {fmtPctFa(v)}
    </span>
  );
}

function statusText(r: ChangeRow): string {
  switch (r.status) {
    case 'pending':
      return r.availableFrom ? `از ${formatJalali(r.availableFrom)}` : 'هنوز داده کافی نیست';
    case 'no-area':
      return 'در آن تاریخ آگهی‌ای از این منطقه ثبت نشده';
    case 'no-type':
      return 'در آن تاریخ آگهی‌ای از این نوع ثبت نشده';
    case 'no-rate':
      return 'نرخ تتر آن تاریخ در دسترس نیست';
    case 'no-data':
      return 'اسنپ‌شات نزدیک به این تاریخ نیست';
    default:
      return '';
  }
}

export function PriceChangePanel({ snapshots }: { snapshots: PropertyMarketSnapshot[] }) {
  const history = useUsdtHistoryStore();
  const [picked, setArea] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>('3');
  const [ptype, setPtype] = useState<PriceType>('b0');
  const jy = useMemo(() => jalaliYearOf(Date.now()), []);

  // نرخ روزانه تتر از قدیمی‌ترین Snapshot تا امروز
  const earliest = earliestSnapshotTs(snapshots);
  useEffect(() => {
    if (earliest !== null) void useUsdtHistoryStore.getState().ensure(earliest);
  }, [earliest]);

  const latest = snapshots.length > 0 ? [...snapshots].sort((a, b) => b.dateTs - a.dateTs)[0] : null;
  const areaOptions = useMemo(
    () => (latest ? [...snapshotAreaRecords(latest)].sort((a, b) => b.stats.listingCount - a.stats.listingCount) : []),
    [latest]
  );
  const area = picked ?? areaOptions[0]?.neighborhoodKey ?? '';
  const rows = useMemo(() => changeTable(snapshots, area, history.rates, ptype), [snapshots, area, history.rates, ptype]);
  const ranking = useMemo(
    () => areaChanges(snapshots, Number(period), history.rates, ptype).filter((r) => r.change.status === 'ok'),
    [snapshots, period, history.rates, ptype]
  );
  const series = useMemo(() => usdSeries(snapshots, area, history.rates, ptype), [snapshots, area, history.rates, ptype]);

  const shown = rows.filter((r) => r.status !== 'pending');
  const pending = rows.filter((r) => r.status === 'pending');
  const nextPending = pending[0] ?? null;
  const areaName = areaOptions.find((a) => a.neighborhoodKey === area)?.displayName ?? '';
  const typeName = priceTypeLabel(ptype, jy);

  if (areaOptions.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">تاریخچه با هر «به‌روزرسانی داده» ساخته می‌شود</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <ChipGroup<PriceType>
          label="سال ساخت"
          value={ptype}
          onChange={setPtype}
          options={PRICE_TYPES.map((t) => ({ value: t.key, label: priceTypeYear(t.key, jy) }))}
        />
        <div className="w-56">
          <Select aria-label="منطقه" value={area} onChange={(e) => setArea(e.target.value)}>
            {areaOptions.map((a) => (
              <option key={a.neighborhoodKey} value={a.neighborhoodKey}>
                {a.displayName} ({toFaDigits(a.stats.listingCount)})
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-card border border-divider">
        <table className="data-table min-w-[640px]">
          <caption className="sr-only">تغییر قیمت دلاری {typeName} · {areaName}</caption>
          <thead>
            <tr>
              <th scope="col" className="!ps-5">نسبت به</th>
              <th scope="col" className="col-num">هر متر (دلار) قبل ← حالا</th>
              <th scope="col" className="col-num">تغییر دلاری</th>
              <th scope="col" className="col-num">تغییر تومانی</th>
              <th scope="col" className="col-num !pe-5">تغییر قیمت کل (دلار)</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.months}>
                <td className="!ps-5">
                  <span className="font-semibold text-ink">{periodLabel(r.months)}</span>
                  {r.base && <span className="block text-2xs text-muted">{formatJalali(r.base.dateTs)}</span>}
                </td>
                {r.status === 'ok' && r.base && r.now ? (
                  <>
                    <td className="col-num">
                      <span className="text-muted">{fmtUsdFa(r.base.ppmUsd)}</span> ← <span className="font-semibold">{fmtUsdFa(r.now.ppmUsd)}</span>
                    </td>
                    <td className="col-num">
                      <PctCell v={r.ppmUsdPct} strong />
                      {r.lowSample && <span className="block text-2xs text-warn">نمونه کم</span>}
                    </td>
                    <td className="col-num"><PctCell v={r.ppmTomanPct} /></td>
                    <td className="col-num !pe-5"><PctCell v={r.totalUsdPct} /></td>
                  </>
                ) : (
                  <td colSpan={4} className="text-xs text-muted">{statusText(r)}</td>
                )}
              </tr>
            ))}
            {nextPending && (
              <tr>
                <td colSpan={5} className="!ps-5 text-xs text-muted">
                  {shown.length === 0 ? 'تاریخچه با هر «به‌روزرسانی داده» ساخته می‌شود · ' : ''}
                  دوره‌های {pending.map((r) => toFaDigits(r.months)).join('، ')} ماه هنوز داده ندارند
                  {nextPending.availableFrom && ` — اولی از ${formatJalali(nextPending.availableFrom)} قابل نمایش است`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-card border border-divider p-4">
        <h3 className="mb-3 text-sm font-bold text-ink">روند قیمت هر متر · {typeName} · {areaName}</h3>
        <TrendChart points={series.map((p) => ({ ts: p.dateTs, label: formatJalali(p.dateTs), value: p.ppmUsd as number }))} format={fmtUsdFa} />
      </div>

      <div className="rounded-card border border-divider">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider px-4 py-3">
          <h3 className="text-sm font-bold text-ink">رشد دلاری مناطق · {typeName}</h3>
          <ChipGroup
            label="دوره"
            value={period}
            onChange={setPeriod}
            options={CHANGE_PERIODS_MONTHS.map((m) => ({ value: String(m), label: `${toFaDigits(m)} ماه` }))}
          />
        </div>
        {ranking.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">برای دوره {toFaDigits(period)} ماه هنوز داده کافی نیست</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[480px]">
              <thead>
                <tr>
                  <th scope="col" className="!ps-5">منطقه</th>
                  <th scope="col" className="col-num">هر متر (دلار)</th>
                  <th scope="col" className="col-num !pe-5">قیمت کل (دلار)</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => (
                  <tr key={r.key}>
                    <td className="!ps-5">
                      <span className="font-semibold text-ink">{r.displayName}</span>
                      {r.change.lowSample && <span className="ms-1 text-2xs text-warn">نمونه کم</span>}
                    </td>
                    <td className="col-num"><PctCell v={r.change.ppmUsdPct} /></td>
                    <td className="col-num !pe-5"><PctCell v={r.change.totalUsdPct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-2xs text-muted">مقایسه فقط بین آگهی‌های هم‌سال ساخت (میانگین) · هر اسنپ‌شات با نرخ تتر همان تاریخ به دلار تبدیل می‌شود</p>
    </div>
  );
}
