/** ============================================================
 * Car Market — کارت برندها: لوگو، نام فارسی/انگلیسی، دسته، میانگین تغییر
 * ============================================================ */
import { useMemo } from 'react';
import { Badge } from '@/shared/components/ui/Badge';
import { toFaDigits } from '@/shared/utils/formatters';
import { brandInfo } from '../domain/brands';
import { brandSummaries, type CarView } from '../domain/changes';
import { CarBrandLogo } from './CarBrandLogo';
import { ChangeCell } from './ChangeCell';
import { CATEGORY_FA } from './format';

export function BrandsPanel({ views, periodLabel, onPick }: { views: CarView[]; periodLabel: string; onPick: (brand: string) => void }) {
  const brands = useMemo(
    () => brandSummaries(views).sort((a, b) => b.count - a.count || a.brandFa.localeCompare(b.brandFa, 'fa')),
    [views]
  );
  if (brands.length === 0) return <p className="py-10 text-center text-sm text-muted">برندی با این فیلترها پیدا نشد</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {brands.map((b) => (
        <li key={b.brand}>
          <button
            type="button"
            onClick={() => onPick(b.brand)}
            className="flex w-full items-center gap-3 rounded-card border border-divider p-3 text-start transition-colors hover:bg-surface-2"
          >
            <CarBrandLogo brand={b.brand} label={b.brandFa} size={48} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-bold text-ink">{b.brandFa}</span>
                <span dir="ltr" className="truncate text-2xs text-subtle">{brandInfo(b.brand).en}</span>
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-1">
                {b.categories.map((c) => (
                  <Badge key={c} tone={c === 'imported' ? 'info' : c === 'domestic' ? 'brand' : 'neutral'}>
                    {CATEGORY_FA[c]}
                  </Badge>
                ))}
                <span className="text-2xs text-muted">{toFaDigits(b.count)} خودرو</span>
              </span>
            </span>
            <span className="shrink-0 text-end text-xs">
              <span className="block text-2xs text-subtle">{periodLabel}</span>
              <ChangeCell pct={b.tomanPct} sub={b.usdPct !== null ? `دلاری ${b.usdPct > 0 ? '+' : ''}${toFaDigits(b.usdPct.toFixed(1))}٪` : undefined} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
