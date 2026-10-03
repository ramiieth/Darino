/** ============================================================
 * خلاصه بازار خودرو در دوره انتخابی: شاخص میانگین تومانی/دلاری،
 * گران/ارزان‌شده‌ها، و سه مدل با بیشترین رشد و کاهش
 * ============================================================ */
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import type { CarModelView, MarketSummary } from '../domain/models';
import { CarBrandLogo } from './CarBrandLogo';
import { ChangePill, trendOf } from './ChangeCell';
import { fmtCarPct } from './format';

function Mover({ m, onPick }: { m: CarModelView; onPick: (m: CarModelView) => void }) {
  return (
    <button type="button" onClick={() => onPick(m)} className="flex w-full items-center gap-2 rounded-field px-2 py-1.5 text-start hover:bg-surface-2">
      <CarBrandLogo brand={m.brand} label={m.brandFa} size={24} />
      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">{m.model}</span>
      <ChangePill pct={m.change?.tomanPct} />
    </button>
  );
}

export function MarketOverview({
  summary,
  periodLabel,
  baseTs,
  availableFrom,
  models,
  onPick
}: {
  summary: MarketSummary;
  periodLabel: string;
  baseTs: number | null;
  availableFrom: number | null;
  models: CarModelView[];
  onPick: (m: CarModelView) => void;
}) {
  const ranked = models.filter((m) => m.status !== 'stopped' && m.change).sort((a, b) => b.change!.tomanPct - a.change!.tomanPct);
  const gainers = ranked.filter((m) => m.change!.tomanPct > 0.05).slice(0, 3);
  const losers = ranked.filter((m) => m.change!.tomanPct < -0.05).reverse().slice(0, 3);
  const t = trendOf(summary.tomanPct);
  const hasData = summary.withChange > 0;

  return (
    <section
      aria-label="خلاصه بازار"
      className="relative overflow-hidden rounded-panel border border-divider bg-card p-5 shadow-card md:p-6"
    >
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-24 end-0 h-56 w-56 rounded-full blur-3xl',
          t === 'up' ? 'bg-gain/15' : t === 'down' ? 'bg-negative/15' : 'bg-accent/10'
        )}
      />
      <div className="relative grid gap-6 lg:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <p className="text-xs text-muted">شاخص بازار خودرو · {periodLabel}</p>
          {hasData ? (
            <>
              <p className={cn('mt-2 flex items-center gap-2 text-4xl font-extrabold tracking-tight', t === 'up' ? 'text-positive' : t === 'down' ? 'text-negative' : 'text-ink')}>
                {t === 'up' ? <TrendingUp aria-hidden className="h-8 w-8" /> : t === 'down' ? <TrendingDown aria-hidden className="h-8 w-8" /> : null}
                <span className="num-ltr">{fmtCarPct(summary.tomanPct)}</span>
                <span className="text-base font-semibold text-muted">تومانی</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <ChangePill pct={summary.usdPct} label="دلاری" size="md" />
                <span className="text-xs text-muted">
                  <span className="font-semibold text-positive">{toFaDigits(summary.up)}</span> گران‌شده ·{' '}
                  <span className="font-semibold text-negative">{toFaDigits(summary.down)}</span> ارزان‌شده ·{' '}
                  {toFaDigits(summary.flat)} بدون تغییر
                </span>
              </div>
              <p className="mt-2 text-2xs text-subtle">
                میانگین ساده {toFaDigits(summary.withChange)} مدل در حال عرضه{baseTs ? ` · از ${formatJalali(baseTs)}` : ''}
              </p>
            </>
          ) : (
            <div className="mt-3 rounded-field bg-surface-2 p-4 text-sm text-muted">
              تاریخچه دوره {periodLabel} هنوز کامل نشده
              {availableFrom && availableFrom > Date.now() ? ` — از ${formatJalali(availableFrom)} نمایش داده می‌شود` : ''}.
              <span className="mt-1 block text-xs text-subtle">قیمت‌ها هر روز خودکار ذخیره می‌شوند.</span>
            </div>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-bold text-positive">بیشترین رشد</p>
          {gainers.length ? gainers.map((m) => <Mover key={m.key} m={m} onPick={onPick} />) : <p className="px-2 text-xs text-subtle">—</p>}
        </div>
        <div>
          <p className="mb-1.5 text-xs font-bold text-negative">بیشترین کاهش</p>
          {losers.length ? losers.map((m) => <Mover key={m.key} m={m} onPick={onPick} />) : <p className="px-2 text-xs text-subtle">—</p>}
        </div>
      </div>
    </section>
  );
}
