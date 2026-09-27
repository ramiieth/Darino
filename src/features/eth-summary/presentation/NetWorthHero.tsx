/**
 * Portfolio hero — the first answer on the Dashboard:
 *   how much is it worth · what changed in 24h · how it is allocated
 * Only real holdings from accounting; no placeholder numbers.
 */
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { Surface } from '@/shared/components/ui/GlassCard';
import { DeltaValue, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { StatusDot } from '@/shared/components/ui/Badge';
import { useUsdRate } from '@/shared/store/usdtStore';
import { useNow } from '@/shared/hooks/useNow';
import { fmtRelativeAge, fmtToman } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import type { PortfolioOverview } from './usePortfolioOverview';

const SLICE_COLORS = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4', 'bg-chart-5'];

function sliceColor(key: string, i: number): string {
  return key === 'cash' ? 'bg-chart-6' : SLICE_COLORS[i % SLICE_COLORS.length];
}

export function NetWorthHero({ o }: { o: PortfolioOverview }) {
  const fxRate = useUsdRate().rate;
  const now = useNow(30_000);
  const loading = o.state === 'loading';
  const partial = o.unpriced.length > 0;

  return (
    <Surface variant="focal" className="p-5 md:p-7" aria-labelledby="networth-label">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id="networth-label" className="text-sm font-semibold text-muted">
          ارزش خالص دارایی
        </p>
        {!loading && (
          <StatusDot
            tone={o.stale ? 'warn' : 'gain'}
            label={
              o.stale
                ? 'قیمت ذخیره‌شده'
                : o.fetchedAt
                  ? `قیمت زنده · ${fmtRelativeAge(o.fetchedAt, now)}`
                  : 'قیمت زنده'
            }
            className="font-normal"
          />
        )}
      </div>

      {/* primary figure */}
      <div className="mt-2">
        {loading ? (
          <Skeleton className="h-11 w-56 md:h-12" />
        ) : (
          <p className="text-4xl font-extrabold leading-tight tracking-tight text-ink md:text-5xl">
            <MoneyValue value={o.netWorth} />
          </p>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
        {loading ? (
          <Skeleton className="h-5 w-40" />
        ) : (
          <>
            <DeltaValue pct={o.change24hPct} usd={o.change24hUsd} period="۲۴ ساعت" compact={false} />
            <span className="text-muted">{fmtToman(o.netWorth, fxRate)}</span>
          </>
        )}
      </div>

      {partial && (
        <p className="mt-2 text-xs text-warn">
          قیمت {o.unpriced.join('، ')} در دسترس نیست — ارزش کل بدون این دارایی‌ها محاسبه شده است.
        </p>
      )}

      {/* allocation */}
      <div className="mt-6 border-t border-divider pt-5">
        <p className="mb-3 text-xs font-semibold text-muted">ترکیب دارایی</p>
        {loading ? (
          <Skeleton className="h-2.5 w-full" />
        ) : o.allocation.length === 0 ? (
          <p className="text-sm text-muted">هنوز دارایی‌ای ثبت نشده است.</p>
        ) : (
          <>
            <div
              className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
              role="img"
              aria-label={o.allocation.map((s) => `${s.label} ${Math.round(s.share)}٪`).join('، ')}
            >
              {o.allocation.map((s, i) => (
                <div
                  key={s.key}
                  className={cn('h-full first:rounded-s-full last:rounded-e-full', sliceColor(s.key, i))}
                  style={{ width: `${Math.max(s.share, 1.5)}%` }}
                />
              ))}
            </div>
            <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
              {o.allocation.map((s, i) => (
                <li key={s.key} className="flex items-center gap-2.5 text-sm">
                  <span aria-hidden className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', sliceColor(s.key, i))} />
                  <span className="min-w-0 flex-1 truncate text-ink">{s.label}</span>
                  <PercentValue value={s.share} signed={false} tone="none" digits={1} className="shrink-0 text-muted" />
                  <span className="num-ltr w-28 shrink-0 text-end font-semibold text-ink">
                    <MoneyValue value={s.value} />
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Surface>
  );
}
