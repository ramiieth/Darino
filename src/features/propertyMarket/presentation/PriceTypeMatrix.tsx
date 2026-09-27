/** ============================================================
 * Property Market — جدول «ردیف × نوع قیمت»
 *
 *  ستون‌ها: سال ساخت — ۱۴۰۵ (نوساز) | ۱۴۰۴ (۱ سال) … ۱۳۹۸ (۷ سال) | قبل‌تر
 *  ردیف‌ها: همه مناطق یا بازه‌های متراژ (هیچ ردیفی پنهان نمی‌شود)
 *  هر خانه: میانگین تومان + معادل دلاری تتر + تعداد آگهی (ارقام فارسی)
 *  ⚠️ فقط نمایش — اعداد از سرویس
 * ============================================================ */
import { useState, type ReactNode } from 'react';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import { PRICE_TYPES, priceTypeSub, priceTypeYear, type PriceType } from '../domain/segments';
import { MIN_SAMPLE_FOR_CHANGE } from '../domain/history';
import type { TypeMatrixRow } from '../service/propertyMarketService';
import { fmtMillionToman, fmtTotalToman, fmtUsdFa } from './format';

type Measure = 'ppm' | 'total';

export function PriceTypeMatrix({
  rows,
  jalaliYear,
  rowHeader,
  caption,
  toolbar,
  onPick,
  onPickRow
}: {
  rows: TypeMatrixRow[];
  /** سال شمسی جاری — سرستون‌ها از آن ساخته می‌شوند */
  jalaliYear: number;
  /** عنوان ستون ردیف‌ها — «منطقه» / «متراژ» */
  rowHeader: string;
  caption: string;
  /** کنترل‌های اضافه در نوار بالا */
  toolbar?: ReactNode;
  /** کلیک روی یک خانه → آگهی‌های همان ردیف و نوع */
  onPick?: (rowKey: string, type: PriceType) => void;
  /** کلیک روی نام ردیف → همه آگهی‌های آن ردیف */
  onPickRow?: (rowKey: string) => void;
}) {
  const [measure, setMeasure] = useState<Measure>('ppm');

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
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">آگهی‌ای نیست</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[960px]">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky start-0 z-10 bg-card !ps-5">{rowHeader}</th>
                {PRICE_TYPES.map((t) => (
                  <th key={t.key} scope="col" className="col-num whitespace-nowrap">
                    {priceTypeYear(t.key, jalaliYear)}
                    <span className="block text-2xs font-normal text-muted">{priceTypeSub(t.key)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row" className="sticky start-0 z-10 bg-card !ps-5 text-start font-semibold text-ink">
                    {onPickRow ? (
                      <button type="button" onClick={() => onPickRow(r.key)} className="hover:text-accent">
                        {r.displayName}
                      </button>
                    ) : (
                      r.displayName
                    )}
                    <span className="block text-2xs font-normal text-muted">
                      {toFaDigits(r.total)} آگهی
                      {r.total > r.count && ` · ${toFaDigits(r.total - r.count)} بدون سال ساخت`}
                    </span>
                  </th>
                  {PRICE_TYPES.map((t) => {
                    const c = r.cells[t.key];
                    if (!c) return <td key={t.key} className="col-num text-subtle">—</td>;
                    const toman = measure === 'ppm' ? c.ppmToman : c.totalToman;
                    const usd = measure === 'ppm' ? c.ppmUsd : c.totalUsd;
                    const low = c.count < MIN_SAMPLE_FOR_CHANGE;
                    const body = (
                      <>
                        <span className="block whitespace-nowrap font-semibold text-ink">
                          {measure === 'ppm' ? fmtMillionToman(toman) : fmtTotalToman(toman)}
                        </span>
                        <span className="block whitespace-nowrap text-2xs text-muted">
                          {fmtUsdFa(usd)} · {toFaDigits(c.count)}
                        </span>
                      </>
                    );
                    return (
                      <td key={t.key} className={cn('col-num', low && 'opacity-50')} title={low ? 'کمتر از ۳ آگهی — کم‌اعتبار' : undefined}>
                        {onPick ? (
                          <button
                            type="button"
                            onClick={() => onPick(r.key, t.key)}
                            className="-m-1 rounded-control p-1 text-end hover:bg-surface-2"
                            aria-label={`آگهی‌های ${r.displayName} · ساخت ${priceTypeYear(t.key, jalaliYear)}`}
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
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-divider px-4 py-2.5 text-2xs text-muted">
        ستون‌ها بر اساس «سال ساخت» آگهی · میانگین قیمت · زیر هر قیمت: معادل دلاری تتر و تعداد آگهی · کم‌رنگ = کمتر
        از ۳ آگهی
      </p>
    </div>
  );
}
