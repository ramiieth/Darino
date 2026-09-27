/** ============================================================
 * Property Market — جدول «ردیف × نوع قیمت»
 *
 *  ستون‌ها: کلید اول | ۱ تا ۷ سال ساخت
 *  ردیف‌ها: مناطق/محله‌ها یا بازه‌های متراژ (از سرویس)
 *  هر خانه: میانگین تومان + معادل دلاری تتر + تعداد آگهی
 *  ⚠️ فقط نمایش — اعداد از سرویس
 * ============================================================ */
import { useMemo, useState, type ReactNode } from 'react';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Button } from '@/shared/components/ui/Button';
import { cn } from '@/shared/lib/cn';
import { fmtUSD, toFaDigits } from '@/shared/utils/formatters';
import { PRICE_TYPES, type PriceType } from '../domain/segments';
import { MIN_SAMPLE_FOR_CHANGE } from '../domain/history';
import { CITY_ROW_KEY, type TypeMatrixRow } from '../service/propertyMarketService';
import { fmtMillionToman, fmtTotalToman } from './format';

type Measure = 'ppm' | 'total';

export function PriceTypeMatrix({
  rows,
  rowHeader,
  caption,
  toolbar,
  onPick
}: {
  rows: TypeMatrixRow[];
  /** عنوان ستون ردیف‌ها — «منطقه» / «متراژ» */
  rowHeader: string;
  caption: string;
  /** کنترل‌های اضافه در نوار بالا (مثلاً سطح منطقه/محله) */
  toolbar?: ReactNode;
  /** کلیک روی یک خانه → آگهی‌های همان ردیف و نوع */
  onPick?: (rowKey: string, type: PriceType) => void;
}) {
  const [measure, setMeasure] = useState<Measure>('ppm');
  const [showAll, setShowAll] = useState(false);

  const visible = useMemo(
    () => (showAll ? rows : rows.filter((r) => r.key === CITY_ROW_KEY || r.count >= MIN_SAMPLE_FOR_CHANGE)),
    [rows, showAll]
  );
  const hidden = rows.length - visible.length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-divider px-4 py-3">
        <SegmentedControl<Measure>
          size="sm"
          label="نوع مقدار"
          value={measure}
          onChange={setMeasure}
          options={[
            { value: 'ppm', label: 'هر متر' },
            { value: 'total', label: 'قیمت کل' }
          ]}
        />
        {toolbar}
        {(hidden > 0 || showAll) && (
          <Button variant="ghost" size="sm" className="ms-auto" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'فقط با نمونه کافی' : `نمایش همه (${toFaDigits(hidden)} ردیف کم‌نمونه)`}
          </Button>
        )}
      </div>

      {rows.every((r) => Object.keys(r.cells).length === 0) ? (
        <p className="py-8 text-center text-sm text-muted">هیچ آگهی‌ای «کلید اول» یا سال ساخت ۱ تا ۷ ندارد</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[920px]">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky start-0 z-10 bg-card !ps-5">{rowHeader}</th>
                {PRICE_TYPES.map((t) => (
                  <th key={t.key} scope="col" className={cn('col-num whitespace-nowrap', t.key === 'first-key' && 'text-accent')}>
                    {t.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const city = r.key === CITY_ROW_KEY;
                return (
                  <tr key={r.key} className={cn(city && 'bg-surface-2')}>
                    <th
                      scope="row"
                      className={cn('sticky start-0 z-10 !ps-5 text-start text-ink', city ? 'bg-surface-2 font-bold' : 'bg-card font-semibold')}
                    >
                      {r.displayName}
                      <span className="ms-1 text-2xs font-normal text-muted">{toFaDigits(r.count)}</span>
                    </th>
                    {PRICE_TYPES.map((t) => {
                      const c = r.cells[t.key];
                      if (!c) return <td key={t.key} className="col-num text-subtle">—</td>;
                      const toman = measure === 'ppm' ? c.ppmToman : c.totalToman;
                      const usd = measure === 'ppm' ? c.ppmUsd : c.totalUsd;
                      const low = c.count < MIN_SAMPLE_FOR_CHANGE;
                      const body = (
                        <>
                          <span className="block font-semibold text-ink">
                            {measure === 'ppm' ? fmtMillionToman(toman) : fmtTotalToman(toman)}
                          </span>
                          <span className="block text-2xs text-muted">
                            {usd !== null ? fmtUSD(usd) : '—'} · {toFaDigits(c.count)}
                          </span>
                        </>
                      );
                      return (
                        <td
                          key={t.key}
                          className={cn('col-num', low && 'opacity-50')}
                          title={low ? 'کمتر از ۳ آگهی — کم‌اعتبار' : undefined}
                        >
                          {onPick ? (
                            <button
                              type="button"
                              onClick={() => onPick(r.key, t.key)}
                              className="-m-1 rounded-control p-1 text-end hover:bg-surface-2"
                              aria-label={`آگهی‌های ${r.displayName} · ${t.label}`}
                            >
                              {body}
                            </button>
                          ) : (
                            body
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-divider px-4 py-2.5 text-2xs text-muted">
        میانگین آگهی‌های هر نوع · زیر هر قیمت: معادل دلاری تتر و تعداد آگهی · کم‌رنگ = کمتر از ۳ آگهی
        {onPick && ' · برای دیدن آگهی‌ها روی هر خانه بزنید'}
      </p>
    </div>
  );
}
