/** ============================================================
 * Property Market — جدول «ردیف × نوع قیمت»
 *
 *  ستون‌ها: سال ساخت — ۱۴۰۵ (نوساز) | ۱۴۰۴ (۱ سال) … ۱۳۹۸ (۷ سال) | قبل‌تر
 *  ردیف‌ها: همه مناطق یا بازه‌های متراژ (هیچ ردیفی پنهان نمی‌شود)
 *  هر خانه: میانگین تومان + بازهٔ رایج (۲۵٪ تا ۷۵٪) + معادل دلاری تتر + تعداد آگهی
 *  زیر نام هر ردیف: از چه قیمتی ۲۵٪ و ۱۰٪ گران‌تر بازار شروع می‌شود (پراکندگی، نه فقط بالاترین قیمت)
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
  onPickRow,
  onPickTop
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
  /** کلیک روی «بالاترین» → آگهی‌های ردیف، گران‌ترین اول */
  onPickTop?: (rowKey: string) => void;
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
        /* ستون نام‌ها بیرون از اسکرولر افقی (نه sticky) — در iOS/PWA سلول‌های sticky
           داخل overflow هنگام اسکرول رنگ نمی‌شوند و تا لمس بعدی ناپدید می‌مانند */
        <div className="flex">
          <table className="data-table !w-auto shrink-0 border-e border-divider">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr className="h-14">
                <th scope="col" className="!ps-5">{rowHeader}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="h-24">
                  <th scope="row" className="!ps-5 text-start font-semibold text-ink">
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
                    {r.spread && (
                      <span className="block whitespace-nowrap text-2xs font-normal text-muted">
                        ۲۵٪ گران‌تر از {toFaDigits(Math.round(r.spread.p75 / 1e6))} · ۱۰٪ از {toFaDigits(Math.round(r.spread.p90 / 1e6))} م
                      </span>
                    )}
                    {r.top && (
                      <span className="block whitespace-nowrap text-2xs font-normal text-muted">
                        {onPickTop ? (
                          <button type="button" onClick={() => onPickTop(r.key)} className="underline decoration-dotted hover:text-accent">
                            بالاترین {fmtMillionToman(r.top.ppm)}
                          </button>
                        ) : (
                          <>بالاترین {fmtMillionToman(r.top.ppm)}</>
                        )}
                        {r.top.exceptions > 0 && <span className="text-warn"> · {toFaDigits(r.top.exceptions)} استثنا</span>}
                      </span>
                    )}
                  </th>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="min-w-0 flex-1 overflow-x-auto">
            <table className="data-table !w-max min-w-full">
              <thead>
                <tr className="h-14">
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
                  <tr key={r.key} className="h-24">
                    {PRICE_TYPES.map((t) => {
                      const c = r.cells[t.key];
                      if (!c) return <td key={t.key} className="col-num text-subtle">—</td>;
                      const toman = measure === 'ppm' ? c.ppmToman : c.totalToman;
                      const usd = measure === 'ppm' ? c.ppmUsd : c.totalUsd;
                      const range = measure === 'ppm' ? c.ppmRange : c.totalRange;
                      const fmt = measure === 'ppm' ? fmtMillionToman : fmtTotalToman;
                      const ex = c.exceptions;
                      const exMax = ex ? (measure === 'ppm' ? ex.maxPpm : ex.maxTotal) : null;
                      const low = c.count < MIN_SAMPLE_FOR_CHANGE && !c.exceptions;
                      const body = (
                        <>
                          <span className="block whitespace-nowrap font-semibold text-ink">
                            {c.count > 0 ? fmt(toman) : '—'}
                          </span>
                          {range && (
                            <span className="block whitespace-nowrap text-2xs text-muted">
                              {fmt(range[0])} تا {fmt(range[1])}
                            </span>
                          )}
                          {c.count > 0 && (
                            <span className="block whitespace-nowrap text-2xs text-muted">
                              {fmtUsdFa(usd)} · {toFaDigits(c.count)}
                            </span>
                          )}
                          {ex && (
                            <span className="block whitespace-nowrap text-2xs text-warn">
                              +{toFaDigits(ex.count)} استثنا تا {fmt(exMax)}
                            </span>
                          )}
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
        </div>
      )}
      <p className="border-t border-divider px-4 py-2.5 text-2xs text-muted">
        ستون‌ها بر اساس «سال ساخت» آگهی · عدد اصلی: میانگین قیمت · زیر آن: بازهٔ رایج (نیمهٔ میانی آگهی‌ها، از ۲۵٪
        ارزان‌تر تا ۲۵٪ گران‌تر کنار گذاشته شده)، معادل دلاری تتر و تعداد آگهی · زیر نام منطقه: از چه قیمتی هر متر (میلیون
        تومان) ۲۵٪ و ۱۰٪ گران‌ترین آگهی‌ها شروع می‌شوند · «بالاترین» گران‌ترین آگهی منطقه است (با کلیک، آگهی‌ها
        گران‌ترین اول) · «استثنا» = آگهی واقعی با قیمت خیلی دور از بقیهٔ منطقه؛ نمایش داده می‌شود ولی در میانگین و بازه حساب نمی‌شود · کم‌رنگ = کمتر از ۳ آگهی
      </p>
    </div>
  );
}
