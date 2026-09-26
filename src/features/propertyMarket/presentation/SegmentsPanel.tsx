/** ============================================================
 * Property Market — دسته‌بندی بازار: سن بنا / متراژ
 *
 *  برای هر دسته: تعداد، میانه قیمت هر متر و قیمت کل (تومان + معادل دلاری تتر)
 *  ⚠️ همه اعداد از سرویس (buildSegmentRows) — اینجا فقط نمایش.
 * ============================================================ */
import { useMemo, useState } from 'react';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { toFaDigits } from '@/shared/utils/formatters';
import { buildSegmentRows, type ListingView, type SegmentDim, type SegmentRow } from '../service/propertyMarketService';
import { fmtMillionToman } from './NeighborhoodTable';
import { fmtTotalToman } from './ListingsExplorer';

export function SegmentsPanel({
  views,
  usdRate,
  onPick
}: {
  views: ListingView[];
  usdRate: number | null;
  /** کلیک روی یک دسته → نمایش آگهی‌های همان دسته */
  onPick?: (dim: SegmentDim, key: string) => void;
}) {
  const [dim, setDim] = useState<SegmentDim>('age');
  const rows = useMemo(() => buildSegmentRows(views, dim, usdRate), [views, dim, usdRate]);
  const maxPpm = Math.max(1, ...rows.map((r) => r.medianPpmToman ?? 0));
  const unknown = rows.find((r) => r.key === 'unknown');

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider px-4 py-3">
        <SegmentedControl<SegmentDim>
          label="مبنای دسته‌بندی"
          value={dim}
          onChange={setDim}
          options={[
            { value: 'age', label: 'سن بنا' },
            { value: 'area', label: 'متراژ' }
          ]}
        />
        <p className="text-xs text-muted">میانه هر دسته · دلار = معادل با نرخ تتر</p>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">داده‌ای برای دسته‌بندی نیست</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[720px]">
            <caption className="sr-only">دسته‌بندی بر اساس {dim === 'age' ? 'سن بنا' : 'متراژ'}</caption>
            <thead>
              <tr>
                <th scope="col" className="!ps-5">{dim === 'age' ? 'سن بنا' : 'متراژ'}</th>
                <th scope="col" className="col-num">تعداد</th>
                <th scope="col" className="col-num">هر متر (تومان)</th>
                <th scope="col" className="col-num">هر متر (دلار)</th>
                <th scope="col" className="col-num">قیمت کل (تومان)</th>
                <th scope="col" className="col-num">قیمت کل (دلار)</th>
                <th scope="col" className="col-num !pe-5">{dim === 'age' ? 'متراژ میانه' : ''}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: SegmentRow) => (
                <tr
                  key={r.key}
                  className={onPick ? 'cursor-pointer hover:bg-surface-2' : undefined}
                  onClick={onPick ? () => onPick(dim, r.key) : undefined}
                >
                  <td className="!ps-5">
                    <span className={r.key === 'unknown' ? 'text-muted' : 'font-semibold text-ink'}>{r.label}</span>
                    <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-sm bg-surface-2" aria-hidden>
                      <div className="h-full rounded-sm" style={{ width: `${((r.medianPpmToman ?? 0) / maxPpm) * 100}%`, background: 'rgb(var(--c-chart-1))' }} />
                    </div>
                  </td>
                  <td className="col-num">
                    {toFaDigits(r.count)} <span className="text-2xs text-muted">({toFaDigits(Math.round(r.sharePct))}٪)</span>
                  </td>
                  <td className="col-num">{fmtMillionToman(r.medianPpmToman)}</td>
                  <td className="col-num"><MoneyValue value={r.medianPpmUsd} /></td>
                  <td className="col-num">{fmtTotalToman(r.medianTotalToman)}</td>
                  <td className="col-num"><MoneyValue value={r.medianTotalUsd} /></td>
                  <td className="col-num !pe-5 text-muted">
                    {dim === 'age' && r.medianArea !== null ? `${toFaDigits(Math.round(r.medianArea))} متر` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-divider px-4 py-3 text-xs leading-5 text-muted">
        سن بنا = سال جاری − سال ساخت (دیوار: «ساخت»؛ شیپور: از «سن بنا» در زمان ثبت آگهی).
        {unknown && ` ${toFaDigits(unknown.count)} آگهی ${dim === 'age' ? 'سال ساخت' : 'متراژ'} ندارند و در «نامشخص» آمده‌اند.`}
        {onPick && ' روی هر ردیف بزنید تا آگهی‌های همان دسته را ببینید.'}
      </p>
    </div>
  );
}
