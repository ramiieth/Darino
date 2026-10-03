/** ============================================================
 * کارت مدل خودرو: لوگو، نام، وضعیت تولید، قیمت مبنا (آخرین سال ساخت)،
 * معادل دلاری، تغییر تومانی/دلاری دوره و نمودارک روند
 * ============================================================ */
import { memo } from 'react';
import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import type { SeriesPoint } from '../domain/changes';
import type { CarModelView } from '../domain/models';
import { CarBrandLogo } from './CarBrandLogo';
import { ChangePill } from './ChangeCell';
import { Sparkline } from './Sparkline';
import { CategoryBadge, StatusBadge } from './StatusBadge';
import { fmtCarPct, fmtCarToman, fmtCarUsd } from './format';

export const ModelCard = memo(function ModelCard({
  model: m,
  series,
  onPick
}: {
  model: CarModelView;
  series: SeriesPoint[] | undefined;
  onPick: (m: CarModelView) => void;
}) {
  const r = m.basis.row;
  const price = r.market ?? r.dealer;
  const years = [...new Set(m.trims.map((t) => t.row.year))].length;
  return (
    <button
      type="button"
      onClick={() => onPick(m)}
      className={cn(
        'group flex h-full w-full flex-col rounded-card border border-divider bg-card p-4 text-start shadow-card transition',
        'hover:-translate-y-0.5 hover:border-divider-strong hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        m.status === 'stopped' && 'bg-surface-2/40'
      )}
    >
      <div className="flex items-start gap-3">
        <CarBrandLogo brand={m.brand} label={m.brandFa} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-2xs text-muted">{m.brandFa}</p>
          <p className="truncate text-sm font-bold text-ink group-hover:text-accent">{m.model}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <StatusBadge model={m} />
            <CategoryBadge category={m.category} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-2xs text-subtle">
            مدل {toFaDigits(r.year)}
            {r.option ? ` · ${r.option}` : ''}
            {years > 1 ? ` · ${toFaDigits(years)} سال` : ''}
          </p>
          <p className="mt-0.5 text-xl font-extrabold tracking-tight text-ink">
            {fmtCarToman(price)}
            <span className="ms-1 text-xs font-medium text-muted">تومان</span>
          </p>
          <p className="text-xs text-muted">≈ {fmtCarUsd(m.basis.marketUsd)}</p>
        </div>
        <Sparkline values={(series ?? []).map((p) => p.toman)} className="shrink-0" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-divider pt-3">
        {m.delisted ? (
          <span className="text-2xs text-muted">آخرین قیمت ثبت‌شده: {m.lastSeenTs ? formatJalali(m.lastSeenTs) : '—'}</span>
        ) : (
          <>
            <ChangePill pct={m.change?.tomanPct} label="تومانی" estimated={m.change?.basis === 'source'} />
            <ChangePill pct={m.change?.usdPct} label="دلاری" />
            {m.basis.gapPct !== null && (
              <span className="ms-auto text-2xs text-subtle" title="اختلاف قیمت بازار با کارخانه">
                حباب {fmtCarPct(m.basis.gapPct)}
              </span>
            )}
            {m.basis.stale && <span className="ms-auto text-2xs text-warn">قیمت {r.marketUpdatedAt ? formatJalali(r.marketUpdatedAt) : 'قدیمی'}</span>}
          </>
        )}
      </div>
    </button>
  );
});
