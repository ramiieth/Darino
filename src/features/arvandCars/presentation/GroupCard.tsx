/** ============================================================
 * کارت مقایسه یک مدل/سال: میانه اروند در برابر میانه پلاک ملی
 *  با نوار نسبی، تعداد آگهی، کارکرد و هشدار نمونه کم
 * ============================================================ */
import { memo } from 'react';
import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import { CarBrandLogo } from '@/features/carMarket/presentation/CarBrandLogo';
import { fmtCarPct, fmtCarToman, fmtCarUsd } from '@/features/carMarket/presentation/format';
import { brandLabelOf, brandSlugOf } from '../domain/brandOf';
import type { ModelGroup } from '../domain/compare';

const nf = new Intl.NumberFormat('en-US');
const km = (v: number | null) => (v === null ? '—' : v === 0 ? 'صفر' : `${toFaDigits(nf.format(Math.round(v / 1000)))} هزار`);

function Bar({ label, value, max, n, tone, kmMedian, usdRate }: { label: string; value: number | null; max: number; n: number; tone: 'arvand' | 'national'; kmMedian: number | null; usdRate: number | null }) {
  const w = value && max ? Math.max(6, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-2xs">
        <span className={cn('font-semibold', tone === 'arvand' ? 'text-accent' : 'text-muted')}>{label}</span>
        <span className="text-muted">
          {toFaDigits(n)} آگهی · کارکرد {km(kmMedian)}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div className={cn('h-full rounded-full', tone === 'arvand' ? 'bg-accent' : 'bg-chart-5')} style={{ width: `${w}%` }} />
        </div>
        <span className="w-24 shrink-0 text-end text-sm font-bold text-ink">{fmtCarToman(value)}</span>
      </div>
      {value && usdRate ? <p className="mt-0.5 text-end text-2xs text-subtle">≈ {fmtCarUsd(value / usdRate)}</p> : null}
    </div>
  );
}

export const GroupCard = memo(function GroupCard({ g, usdRate, onPick }: { g: ModelGroup; usdRate: number | null; onPick: (g: ModelGroup) => void }) {
  const max = Math.max(g.arvand.median ?? 0, g.national.median ?? 0);
  return (
    <button
      type="button"
      onClick={() => onPick(g)}
      className="flex h-full w-full flex-col gap-3 rounded-card border border-divider bg-card p-4 text-start shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex items-start gap-3">
        <CarBrandLogo brand={brandSlugOf(g.model) ?? ''} label={brandLabelOf(g.model)} size={40} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-bold leading-5 text-ink">{g.model}</p>
          <p className="text-2xs text-muted">مدل {toFaDigits(g.year)}</p>
        </div>
        {g.gapPct !== null ? (
          <span
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-sm font-extrabold',
              g.gapPct < -0.5 ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'
            )}
            title="اختلاف میانه قیمت اروند با پلاک ملی"
          >
            <span className="num-ltr">{fmtCarPct(g.gapPct)}</span>
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-surface-2 px-2 py-1 text-2xs text-muted">بدون مبنای ملی</span>
        )}
      </div>
      <Bar label="پلاک اروند" value={g.arvand.median} max={max} n={g.arvand.n} tone="arvand" kmMedian={g.arvand.kmMedian} usdRate={usdRate} />
      <Bar label="پلاک ملی" value={g.national.median} max={max} n={g.national.n} tone="national" kmMedian={g.national.kmMedian} usdRate={usdRate} />
      {g.lowSample && g.gapPct !== null && <p className="text-2xs text-warn">نمونه کم — عدد تقریبی است</p>}
    </button>
  );
});
