/** ============================================================
 * نمایش نرخ زنده تتر (تنها مبنای دلار در اپ) + انتخاب منبع والکس/بیت‌پین
 * ============================================================ */
import { RefreshCw } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { StatusDot } from '@/shared/components/ui/Badge';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';

/** «۲۵۰٬۰۰۰» — ارقام و جداکننده فارسی */
const faInt = (v: number) => toFaDigits(new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v));
import { USDT_SOURCE_FA, type UsdtSource } from '@/shared/fx/usdtRate';
import { useUsdtStore, type EffectiveRate } from '@/shared/store/usdtStore';

export function describeRate(r: EffectiveRate): string {
  if (r.kind === 'none' || r.rate === null) return 'نرخ تتر در دسترس نیست';
  const price = `${faInt(r.rate)} تومان`;
  const src = r.source ? USDT_SOURCE_FA[r.source] : '';
  return `تتر ${price} · ${src}${r.fetchedAt ? ` · ${fmtRelativeAge(r.fetchedAt)}` : ''}${r.kind === 'stale' ? ' (قدیمی)' : ''}`;
}

export function UsdtRateField({ effective }: { effective: EffectiveRate }) {
  const st = useUsdtStore();
  const loading = st.status === 'loading';
  const tone = effective.kind === 'live' ? 'gain' : effective.kind === 'none' ? 'loss' : 'warn';
  const statusLabel = effective.kind === 'live' ? 'زنده' : effective.kind === 'stale' ? 'قدیمی' : 'نامشخص';

  return (
    <div className="rounded-field bg-surface-2 px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">
          {effective.rate !== null ? (
            <>
              <span>{faInt(effective.rate)}</span> تومان
            </>
          ) : (
            '—'
          )}
        </span>
        <span className="flex items-center gap-2">
          <StatusDot tone={tone} label={statusLabel} pulse={effective.kind === 'live'} />
          <button
            type="button"
            onClick={() => void st.refresh()}
            disabled={loading}
            aria-label="به‌روزرسانی نرخ تتر"
            className="flex h-7 w-7 items-center justify-center rounded-control text-muted hover:bg-card hover:text-ink disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden />
          </button>
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-2xs text-muted">
        <span>منبع:</span>
        {(['wallex', 'bitpin'] as UsdtSource[]).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={st.preferred === s}
            onClick={() => void st.setPreferred(s)}
            className={cn(
              'rounded-control border px-2 py-0.5 font-semibold',
              st.preferred === s ? 'border-accent bg-accent-soft text-accent' : 'border-divider-strong bg-card text-muted'
            )}
          >
            {USDT_SOURCE_FA[s]}
          </button>
        ))}
        {effective.fetchedAt && (
          <span>
            · از {effective.source ? USDT_SOURCE_FA[effective.source] : ''} {fmtRelativeAge(effective.fetchedAt)}
          </span>
        )}
      </div>
    </div>
  );
}
