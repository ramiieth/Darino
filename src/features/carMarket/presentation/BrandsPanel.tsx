/** ============================================================
 * Car Market — کارت برندها: لوگو، نام فارسی/انگلیسی، دسته، بازه قیمت،
 * میانگین تغییر دوره و تعداد توقف تولید
 * ============================================================ */
import { useMemo } from 'react';
import { toFaDigits } from '@/shared/utils/formatters';
import { brandInfo } from '../domain/brands';
import { brandSummaries, type CarModelView } from '../domain/models';
import { CarBrandLogo } from './CarBrandLogo';
import { ChangePill } from './ChangeCell';
import { CategoryBadge } from './StatusBadge';
import { fmtCarToman } from './format';

export function BrandsPanel({ models, periodLabel, onPick }: { models: CarModelView[]; periodLabel: string; onPick: (brand: string) => void }) {
  const brands = useMemo(
    () => brandSummaries(models).sort((a, b) => b.models - b.stopped - (a.models - a.stopped) || a.brandFa.localeCompare(b.brandFa, 'fa')),
    [models]
  );
  if (brands.length === 0) return <p className="rounded-card border border-dashed border-divider py-12 text-center text-sm text-muted">برندی با این فیلترها پیدا نشد</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {brands.map((b) => (
        <li key={b.brand}>
          <button
            type="button"
            onClick={() => onPick(b.brand)}
            className="flex h-full w-full flex-col gap-3 rounded-card border border-divider bg-card p-4 text-start shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover"
          >
            <span className="flex items-center gap-3">
              <CarBrandLogo brand={b.brand} label={b.brandFa} size={52} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold text-ink">{b.brandFa}</span>
                <span dir="ltr" className="block truncate text-start text-2xs text-subtle">{brandInfo(b.brand).en}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {b.categories.map((c) => (
                    <CategoryBadge key={c} category={c} />
                  ))}
                </span>
              </span>
            </span>
            <span className="flex items-center justify-between gap-2 text-xs text-muted">
              <span>
                {toFaDigits(b.models)} مدل
                {b.stopped > 0 && <span className="text-negative"> · {toFaDigits(b.stopped)} توقف تولید</span>}
              </span>
              <span className="truncate">
                {b.minToman !== null ? (b.minToman === b.maxToman ? fmtCarToman(b.minToman) : `${fmtCarToman(b.minToman)} تا ${fmtCarToman(b.maxToman)}`) : '—'}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-1.5 border-t border-divider pt-3">
              <span className="text-2xs text-subtle">{periodLabel}</span>
              <ChangePill pct={b.tomanPct} label="تومانی" />
              <ChangePill pct={b.usdPct} label="دلاری" />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
