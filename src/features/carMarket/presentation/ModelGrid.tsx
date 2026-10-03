/** ============================================================
 * شبکه کارت‌های مدل — گروه‌بندی برندی (پیش‌فرض) یا مرتب‌سازی تخت
 *  توقف تولیدها در انتهای هر گروه
 * ============================================================ */
import { useMemo } from 'react';
import { toFaDigits } from '@/shared/utils/formatters';
import type { SeriesPoint } from '../domain/changes';
import type { CarModelView, ProductionStatus } from '../domain/models';
import { CarBrandLogo } from './CarBrandLogo';
import { ModelCard } from './ModelCard';

export type SortKey = 'brand' | 'price-desc' | 'price-asc' | 'gain' | 'loss' | 'usd-gain';

export const SORT_FA: Record<SortKey, string> = {
  brand: 'به تفکیک برند',
  'price-desc': 'گران‌ترین',
  'price-asc': 'ارزان‌ترین',
  gain: 'بیشترین رشد تومانی',
  loss: 'بیشترین کاهش تومانی',
  'usd-gain': 'بیشترین رشد دلاری'
};

const STATUS_ORDER: Record<ProductionStatus, number> = { current: 0, 'no-new': 1, stopped: 2 };
const priceOf = (m: CarModelView) => m.basis.row.market ?? m.basis.row.dealer ?? 0;

function sortModels(list: CarModelView[], sort: SortKey): CarModelView[] {
  const out = [...list];
  const withNull = (v: number | null | undefined, dir: 1 | -1) => (v === null || v === undefined ? -Infinity : dir * v);
  switch (sort) {
    case 'price-desc':
      return out.sort((a, b) => priceOf(b) - priceOf(a));
    case 'price-asc':
      return out.sort((a, b) => priceOf(a) - priceOf(b));
    case 'gain':
      return out.sort((a, b) => withNull(b.change?.tomanPct, 1) - withNull(a.change?.tomanPct, 1));
    case 'loss':
      return out.sort((a, b) => withNull(b.change?.tomanPct, -1) - withNull(a.change?.tomanPct, -1));
    case 'usd-gain':
      return out.sort((a, b) => withNull(b.change?.usdPct, 1) - withNull(a.change?.usdPct, 1));
    default:
      return out.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.model.localeCompare(b.model, 'fa'));
  }
}

const GRID = 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3';

export function ModelGrid({
  models,
  sort,
  series,
  onPick
}: {
  models: CarModelView[];
  sort: SortKey;
  series: Map<string, SeriesPoint[]>;
  onPick: (m: CarModelView) => void;
}) {
  const groups = useMemo(() => {
    if (sort !== 'brand') return null;
    const map = new Map<string, CarModelView[]>();
    for (const m of models) {
      const g = map.get(m.brand);
      if (g) g.push(m);
      else map.set(m.brand, [m]);
    }
    return [...map.values()]
      .map((list) => sortModels(list, 'brand'))
      .sort((a, b) => b.filter((m) => m.status !== 'stopped').length - a.filter((m) => m.status !== 'stopped').length || a[0].brandFa.localeCompare(b[0].brandFa, 'fa'));
  }, [models, sort]);
  const flat = useMemo(() => (sort === 'brand' ? [] : sortModels(models, sort)), [models, sort]);

  if (models.length === 0) return <p className="rounded-card border border-dashed border-divider py-12 text-center text-sm text-muted">خودرویی با این فیلترها پیدا نشد</p>;

  if (!groups) {
    return (
      <div className={GRID}>
        {flat.map((m) => (
          <ModelCard key={m.key} model={m} series={series.get(m.basis.row.id)} onPick={onPick} />
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-8">
      {groups.map((list) => (
        <section key={list[0].brand} aria-label={list[0].brandFa}>
          <h2 className="mb-3 flex items-center gap-2.5">
            <CarBrandLogo brand={list[0].brand} label={list[0].brandFa} size={32} />
            <span className="text-base font-bold text-ink">{list[0].brandFa}</span>
            <span className="text-xs text-muted">{toFaDigits(list.length)} مدل</span>
          </h2>
          <div className={GRID}>
            {list.map((m) => (
              <ModelCard key={m.key} model={m} series={series.get(m.basis.row.id)} onPick={onPick} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
