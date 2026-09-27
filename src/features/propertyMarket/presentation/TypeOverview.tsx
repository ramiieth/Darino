/** ============================================================
 * Property Market — خلاصه کل اهواز به تفکیک نوع قیمت
 *
 *  یک کارت برای هر نوع: کلید اول، ۱ تا ۷ سال ساخت
 *  میانگین تومان/متر · معادل دلاری تتر · (سناریو، اگر فعال است) · تعداد
 *  ⚠️ فقط نمایش — اعداد از سرویس (typeCellsOf)
 * ============================================================ */
import { cn } from '@/shared/lib/cn';
import { fmtUSD, toFaDigits } from '@/shared/utils/formatters';
import { PRICE_TYPES, type PriceType } from '../domain/segments';
import { MIN_SAMPLE_FOR_CHANGE } from '../domain/history';
import type { TypeCells } from '../service/propertyMarketService';
import { fmtMillionToman } from './format';

export function TypeOverview({
  cells,
  showScenario,
  onPick
}: {
  cells: TypeCells;
  /** نمایش دلار سناریوی آینده (فقط وقتی سناریو با وضع فعلی فرق دارد) */
  showScenario: boolean;
  onPick?: (type: PriceType) => void;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {PRICE_TYPES.map((t) => {
        const c = cells[t.key];
        const low = c !== undefined && c.count < MIN_SAMPLE_FOR_CHANGE;
        const firstKey = t.key === 'first-key';
        return (
          <li key={t.key}>
            <button
              type="button"
              disabled={!c || !onPick}
              onClick={() => onPick?.(t.key)}
              className={cn(
                'flex h-full w-full flex-col items-start gap-1 rounded-card border p-3 text-start transition-colors',
                firstKey ? 'border-accent/40 bg-accent-soft' : 'border-divider bg-card',
                c && onPick && 'hover:border-divider-strong',
                !c && 'cursor-default'
              )}
              aria-label={`${t.label}: آگهی‌ها`}
            >
              <span className={cn('text-xs font-semibold', firstKey ? 'text-accent' : 'text-muted')}>
                {firstKey ? t.label : `${t.label} ساخت`}
              </span>
              {c ? (
                <>
                  <span className={cn('text-lg font-bold leading-tight text-ink', low && 'opacity-60')}>
                    {fmtMillionToman(c.ppmToman)}
                    <span className="text-2xs font-normal text-muted"> /متر</span>
                  </span>
                  <span className="num-ltr text-sm font-semibold text-ink">{c.ppmUsd !== null ? fmtUSD(c.ppmUsd) : '—'}</span>
                  {showScenario && c.futurePpmUsd !== null && (
                    <span className="text-2xs text-muted">
                      سناریو <span className="num-ltr">{fmtUSD(c.futurePpmUsd)}</span>
                    </span>
                  )}
                  <span className={cn('text-2xs', low ? 'text-warn' : 'text-subtle')}>{toFaDigits(c.count)} آگهی</span>
                </>
              ) : (
                <span className="py-2 text-sm text-subtle">آگهی ندارد</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
