/** ============================================================
 * Property Market — جدول «منطقه × نوع قیمت»
 *
 *  ستون‌ها: میانه همه | کلید اول | ۱ تا ۷ سال ساخت
 *  هر خانه: تومان + معادل دلاری (تتر) + تعداد آگهی
 *  کنترل‌ها: هر متر / قیمت کل · میانه / میانگین
 *  ⚠️ فقط نمایش — اعداد از buildTypeMatrix (سرویس)
 * ============================================================ */
import { useMemo, useState } from 'react';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Button } from '@/shared/components/ui/Button';
import { cn } from '@/shared/lib/cn';
import { fmtUSD, toFaDigits } from '@/shared/utils/formatters';
import { PRICE_TYPES } from '../domain/segments';
import { MIN_SAMPLE_FOR_CHANGE } from '../domain/history';
import type { TypeCell, TypeMatrixRow } from '../service/propertyMarketService';
import { fmtMillionToman } from './NeighborhoodTable';
import { fmtTotalToman } from './ListingsExplorer';

type Measure = 'ppm' | 'total';
type Metric = 'median' | 'mean';

function pick(c: TypeCell, measure: Measure, metric: Metric): { toman: number | null; usd: number | null } {
  if (measure === 'ppm') {
    return metric === 'median'
      ? { toman: c.medianPpmToman, usd: c.medianPpmUsd }
      : { toman: c.meanPpmToman, usd: c.meanPpmUsd };
  }
  return metric === 'median'
    ? { toman: c.medianTotalToman, usd: c.medianTotalUsd }
    : { toman: c.meanTotalToman, usd: c.meanTotalUsd };
}

export function PriceTypeMatrix({ rows }: { rows: TypeMatrixRow[] }) {
  const [measure, setMeasure] = useState<Measure>('ppm');
  const [metric, setMetric] = useState<Metric>('median');
  const [showAll, setShowAll] = useState(false);

  const visible = useMemo(
    () => (showAll ? rows : rows.filter((r, i) => i === 0 || r.count >= MIN_SAMPLE_FOR_CHANGE)),
    [rows, showAll]
  );
  const hidden = rows.length - visible.length;

  if (rows.length <= 1 && (rows[0]?.count ?? 0) === 0) {
    return <p className="py-6 text-center text-sm text-muted">داده‌ای برای جدول نیست</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-divider px-4 py-3">
        <SegmentedControl<Measure>
          size="sm"
          label="نوع مقدار"
          value={measure}
          onChange={setMeasure}
          options={[
            { value: 'ppm', label: 'قیمت هر متر' },
            { value: 'total', label: 'قیمت کل' }
          ]}
        />
        <SegmentedControl<Metric>
          size="sm"
          label="شاخص"
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'median', label: 'میانه' },
            { value: 'mean', label: 'میانگین' }
          ]}
        />
        {hidden > 0 || showAll ? (
          <Button variant="ghost" size="sm" className="ms-auto" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'فقط با نمونه کافی' : `نمایش همه (${toFaDigits(rows.length - 1)})`}
          </Button>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="data-table min-w-[1080px]">
          <caption className="sr-only">قیمت به تفکیک کلید اول و سال ساخت</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky start-0 z-10 bg-card !ps-5">منطقه</th>
              {PRICE_TYPES.map((t) => (
                <th key={t.key} scope="col" className="col-num whitespace-nowrap">
                  {t.key === 'all' ? (metric === 'median' ? 'میانه همه' : 'میانگین همه') : t.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.key} className={cn(i === 0 && 'bg-surface-2')}>
                <td className={cn('sticky start-0 z-10 !ps-5', i === 0 ? 'bg-surface-2 font-bold' : 'bg-card font-semibold', 'text-ink')}>
                  {r.displayName}
                  <span className="ms-1 text-2xs font-normal text-muted">({toFaDigits(r.count)})</span>
                </td>
                {PRICE_TYPES.map((t) => {
                  const c = r.cells[t.key];
                  if (!c) return <td key={t.key} className="col-num text-subtle">—</td>;
                  const v = pick(c, measure, metric);
                  return (
                    <td key={t.key} className="col-num">
                      <span className="block text-ink">
                        {measure === 'ppm' ? fmtMillionToman(v.toman) : fmtTotalToman(v.toman)}
                      </span>
                      <span className="block text-2xs text-muted">
                        {v.usd !== null ? fmtUSD(v.usd) : '—'} · {toFaDigits(c.count)} آگهی
                        {c.count < MIN_SAMPLE_FOR_CHANGE && <span className="text-warn"> · کم</span>}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-divider px-4 py-3 text-xs leading-5 text-muted">
        «کلید اول» فقط وقتی عنوان یا توضیحات آگهی صریحاً آن را بگوید. سال ساخت از «ساخت» دیوار و «سن بنا» شیپور؛
        «۱ سال» = نوساز تا ۱ سال. دسته‌ها هم‌پوشان‌اند (آگهی کلید اولِ نوساز در هر دو ستون می‌آید). فقط آگهی‌هایی که در
        ۴۵ روز اخیر در منبع به‌روز شده‌اند حساب می‌شوند.
      </p>
    </div>
  );
}
