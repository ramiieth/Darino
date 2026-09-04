import { cn } from '@/shared/lib/cn';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
}

/** کنترل بخش‌بندی — ریل ظریف با شاخص حرکت (بدون پیل شیشه‌ای) */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex w-full items-center gap-1 border-b border-line/10',
        className
      )}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative flex h-10 flex-1 items-center justify-center gap-1.5 text-xs font-bold transition-colors',
              active ? 'text-accent' : 'text-muted hover:text-ink'
            )}
          >
            <span className="relative z-10 flex items-center gap-1.5">
              {opt.icon}
              {opt.label}
              {typeof opt.badge === 'number' && opt.badge > 0 && (
                <span className="badge bg-accent-soft text-accent dark:bg-accent/15">
                  {opt.badge}
                </span>
              )}
            </span>
            {/* شاخص فعال */}
            {active && (
              <span
                aria-hidden
                className="absolute inset-x-3 bottom-0 h-[2.5px] rounded-full bg-accent"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
