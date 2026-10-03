/** ============================================================
 * انتخاب دوره تغییر: دوره‌های پرکاربرد به‌صورت چیپ + همه دوره‌ها در فهرست
 * ============================================================ */
import { CalendarRange } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { CHANGE_PERIODS, periodOf, type PeriodKey } from '../domain/changes';

const QUICK: PeriodKey[] = ['1d', '7d', '1m', '3m', '6m', '12m'];

export function PeriodPicker({ value, onChange, className }: { value: PeriodKey; onChange: (k: PeriodKey) => void; className?: string }) {
  const inQuick = QUICK.includes(value);
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <div role="radiogroup" aria-label="دوره تغییر قیمت" className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto rounded-full bg-surface-2 p-1">
        {QUICK.map((k) => {
          const active = k === value;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(k)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                active ? 'bg-card text-ink shadow-card' : 'text-muted hover:text-ink'
              )}
            >
              {periodOf(k).label}
            </button>
          );
        })}
      </div>
      <label
        className={cn(
          'relative inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold',
          inQuick ? 'border-divider text-muted' : 'border-accent bg-accent-soft text-accent'
        )}
      >
        <CalendarRange aria-hidden className="h-3.5 w-3.5" />
        {inQuick ? 'بلندمدت' : periodOf(value).label}
        <select
          aria-label="همه دوره‌ها"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {CHANGE_PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
