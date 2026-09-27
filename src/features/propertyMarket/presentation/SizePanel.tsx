/** ============================================================
 * Property Market — قیمت بر اساس متراژ
 *
 *  بازه متراژ × نوع قیمت (کلید اول، ۱ تا ۷ سال) · یا فهرست متراژ دقیق
 *  ⚠️ فقط نمایش — اعداد از سرویس
 * ============================================================ */
import { useMemo, useState } from 'react';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { toFaDigits } from '@/shared/utils/formatters';
import type { PriceType } from '../domain/segments';
import {
  EXACT_AREA_RANGES,
  buildExactAreaRows,
  buildSizeTypeMatrix,
  type ListingView
} from '../service/propertyMarketService';
import { PriceTypeMatrix } from './PriceTypeMatrix';
import { fmtMillionToman, fmtTotalToman, fmtUsdFa } from './format';

type SizeMode = 'bands' | 'exact';

export function SizePanel({
  views,
  usdRate,
  jalaliYear,
  onPickBand,
  onPickExact
}: {
  views: ListingView[];
  /** نرخ زنده تتر (تومان) */
  usdRate: number | null;
  jalaliYear: number;
  onPickBand: (band: string, type: PriceType | null) => void;
  onPickExact: (areaSqm: number) => void;
}) {
  const [mode, setMode] = useState<SizeMode>('bands');
  const matrix = useMemo(() => buildSizeTypeMatrix(views, usdRate, jalaliYear), [views, usdRate, jalaliYear]);
  const exactRows = useMemo(() => (mode === 'exact' ? buildExactAreaRows(views, usdRate) : []), [views, usdRate, mode]);

  const modeControl = (
    <SegmentedControl<SizeMode>
      size="sm"
      label="نمای متراژ"
      value={mode}
      onChange={setMode}
      options={[
        { value: 'bands', label: 'بازه متراژ' },
        { value: 'exact', label: 'متراژ دقیق' }
      ]}
    />
  );

  if (mode === 'bands') {
    return (
      <PriceTypeMatrix
        rows={matrix}
        rowHeader="متراژ"
        caption="قیمت بر اساس متراژ و نوع"
        toolbar={modeControl}
        onPick={onPickBand}
        onPickRow={(band) => onPickBand(band, null)}
      />
    );
  }

  return (
    <div>
      <div className="border-b border-divider px-4 py-3">{modeControl}</div>
      {exactRows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">آگهی با متراژ ثبت‌شده نیست</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[640px]">
            <caption className="sr-only">قیمت به تفکیک متراژ دقیق آگهی</caption>
            <thead>
              <tr>
                <th scope="col" className="!ps-5">متراژ</th>
                <th scope="col" className="col-num">تعداد</th>
                <th scope="col" className="col-num">هر متر</th>
                <th scope="col" className="col-num">هر متر (دلار)</th>
                <th scope="col" className="col-num">قیمت کل</th>
                <th scope="col" className="col-num !pe-5">قیمت کل (دلار)</th>
              </tr>
            </thead>
            {EXACT_AREA_RANGES.map((rg) => {
              const group = exactRows.filter((r) => r.range === rg.key);
              if (group.length === 0) return null;
              return (
                <tbody key={rg.key}>
                  <tr className="bg-surface-2">
                    <th scope="rowgroup" colSpan={6} className="!ps-5 text-start text-xs font-bold text-ink">
                      {rg.label} · {toFaDigits(group.reduce((a, r) => a + r.count, 0))} آگهی
                    </th>
                  </tr>
                  {group.map((r) => (
                    <tr key={r.areaSqm} className="cursor-pointer hover:bg-surface-2" onClick={() => onPickExact(r.areaSqm)}>
                      <td className="!ps-5 font-semibold text-ink">{toFaDigits(r.areaSqm)} متر</td>
                      <td className="col-num">{toFaDigits(r.count)}</td>
                      <td className="col-num">{fmtMillionToman(r.ppmToman)}</td>
                      <td className="col-num">{fmtUsdFa(r.ppmUsd)}</td>
                      <td className="col-num">{fmtTotalToman(r.totalToman)}</td>
                      <td className="col-num !pe-5">{fmtUsdFa(r.totalUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
      <p className="border-t border-divider px-4 py-2.5 text-2xs text-muted">
        میانگین آگهی‌های هر متراژ (گرد به متر) · برای دیدن آگهی‌ها روی هر ردیف بزنید
      </p>
    </div>
  );
}
