/** ============================================================
 * Property Market — نمایش نرخ زنده تتر (مبنای معادل دلاری)
 * ============================================================ */
import { RefreshCw } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { StatusDot } from '@/shared/components/ui/Badge';
import { fmtIntLatin, fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { USDT_SOURCE_FA, type UsdtSource } from '@/shared/fx/usdtRate';
import { usdtIsStale, useUsdtStore } from '@/shared/store/usdtStore';

/** منبع مؤثر نرخ دلار در صفحه */
export interface EffectiveRate {
  rate: number | null;
  kind: 'live' | 'stale' | 'manual' | 'none';
  source: UsdtSource | null;
  fetchedAt: number | null;
}

export function describeRate(r: EffectiveRate): string {
  if (r.kind === 'none' || r.rate === null) return 'نرخ تتر در دسترس نیست';
  const price = `${toFaDigits(fmtIntLatin(r.rate))} تومان`;
  if (r.kind === 'manual') return `${price} · نرخ دستی تنظیمات (تتر در دسترس نبود)`;
  const src = r.source ? USDT_SOURCE_FA[r.source] : '';
  return `تتر ${price} · ${src}${r.fetchedAt ? ` · ${fmtRelativeAge(r.fetchedAt)}` : ''}${r.kind === 'stale' ? ' (قدیمی)' : ''}`;
}

export function UsdtRateField({ effective }: { effective: EffectiveRate }) {
  const st = useUsdtStore();
  const loading = st.status === 'loading';
  const tone = effective.kind === 'live' ? 'gain' : effective.kind === 'none' ? 'loss' : 'warn';
  const statusLabel = effective.kind === 'live' ? 'زنده' : effective.kind === 'stale' ? 'قدیمی' : effective.kind === 'manual' ? 'دستی' : 'نامشخص';

  return (
    <div className="rounded-field bg-surface-2 px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">
          {effective.rate !== null ? (
            <>
              <span className="num-ltr">{toFaDigits(fmtIntLatin(effective.rate))}</span> تومان
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
        {effective.fetchedAt && effective.kind !== 'manual' && (
          <span>
            · از {effective.source ? USDT_SOURCE_FA[effective.source] : ''} {fmtRelativeAge(effective.fetchedAt)}
          </span>
        )}
      </div>
    </div>
  );
}

/** نرخ مؤثر: تتر زنده → تتر ذخیره‌شده (قدیمی) → نرخ دستی تنظیمات */
export function resolveEffectiveRate(
  usdt: { quote: { priceToman: number; source: UsdtSource; fetchedAt: number } | null; status: string },
  manualRate: number | null,
  now = Date.now()
): EffectiveRate {
  const q = usdt.quote;
  if (q) {
    const stale = usdt.status !== 'live' || usdtIsStale(q as never, now);
    return { rate: q.priceToman, kind: stale ? 'stale' : 'live', source: q.source, fetchedAt: q.fetchedAt };
  }
  if (manualRate !== null && manualRate > 0) return { rate: manualRate, kind: 'manual', source: null, fetchedAt: null };
  return { rate: null, kind: 'none', source: null, fetchedAt: null };
}
