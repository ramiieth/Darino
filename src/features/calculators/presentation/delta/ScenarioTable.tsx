/**
 * جدول سناریو — سود خالص در چند مقدار یک متغیر (ستون‌ها) و چند مبنا (سطرها)
 * همهٔ خانه‌ها از همان مدل و ورودی‌های کاربر محاسبه شده‌اند؛ null = دادهٔ لازم موجود نیست.
 * عددها بدون واژهٔ «دلار» (واحد در عنوان جدول) تا ۵ ستون در عرض موبایل جا شود.
 */
import type { ReactNode } from 'react';
import { UNAVAILABLE } from '@/shared/components/ui/FinancialValue';
import { toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

export interface ScenarioCell {
  value: number | null;
  /** متن کوچک زیر عدد، مثلاً «لیکویید» */
  note?: string;
  /** سناریوی فعلی کاربر */
  current?: boolean;
}

function Amount({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-subtle">{UNAVAILABLE}</span>;
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  const text = toFaDigits(Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  return (
    <bdi dir="ltr" className={cn('num-ltr font-bold', value > 0 && 'text-positive', value < 0 && 'text-negative')}>
      {sign}
      {text}
    </bdi>
  );
}

export function ScenarioTable({
  caption,
  cols,
  rows
}: {
  caption: string;
  cols: ReactNode[];
  rows: { head: ReactNode; cells: ScenarioCell[] }[];
}) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full table-fixed border-separate border-spacing-0 text-center text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-[4.5rem] py-1.5 text-start text-2xs font-semibold text-subtle">
              دلار
            </th>
            {cols.map((c, i) => (
              <th key={i} scope="col" className="py-1.5 text-2xs font-semibold text-subtle">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              <th scope="row" className="border-t border-divider py-2 text-start text-2xs font-semibold text-muted">
                {r.head}
              </th>
              {r.cells.map((c, ci) => (
                <td key={ci} className={cn('border-t border-divider px-0.5 py-2', c.current && 'rounded-field bg-accent-soft')}>
                  <Amount value={c.value} />
                  {c.note && <span className="block text-2xs text-negative">{c.note}</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
