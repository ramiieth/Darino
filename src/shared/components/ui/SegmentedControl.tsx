import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  badge?: number;
}

/**
 * Keyboard support shared by Tabs / SegmentedControl / ChipGroup:
 * arrows move focus + selection (direction-aware for RTL), Home/End jump.
 */
function useRovingKeys<T extends string>(options: SegmentOption<T>[], value: T, onChange: (v: T) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const idx = options.findIndex((o) => o.value === value);
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    let next = -1;
    if (e.key === 'ArrowRight') next = rtl ? idx - 1 : idx + 1;
    else if (e.key === 'ArrowLeft') next = rtl ? idx + 1 : idx - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    else return;
    e.preventDefault();
    next = (next + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return { refs, onKeyDown };
}

/**
 * Tabs — switches between SECTIONS of a page (underline style).
 * Scrolls horizontally on narrow screens; labels never compress.
 */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  className,
  label
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  /** Accessible name of the tab list */
  label?: string;
}) {
  const { refs, onKeyDown } = useRovingKeys(options, value, onChange);
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'no-scrollbar -mx-gutter flex items-stretch gap-1 overflow-x-auto border-b border-divider px-gutter md:mx-0 md:px-0',
        className
      )}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative -mb-px flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-semibold',
              'transition-colors duration-fast ease-standard [&_svg]:h-4 [&_svg]:w-4',
              active ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
            )}
          >
            {opt.icon && <span className={active ? 'text-accent' : 'text-subtle'}>{opt.icon}</span>}
            {opt.label}
            {typeof opt.badge === 'number' && opt.badge > 0 && (
              <span className="badge bg-surface-2 text-muted">{opt.badge.toLocaleString('fa-IR')}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * SegmentedControl — compact toggle for a VIEW PARAMETER inside content
 * (period, mode, unit). Pill track; scrolls on narrow screens.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  label,
  size = 'md',
  fill = false
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  label?: string;
  size?: 'sm' | 'md';
  /** Stretch segments to fill the width */
  fill?: boolean;
}) {
  const { refs, onKeyDown } = useRovingKeys(options, value, onChange);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'no-scrollbar inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-field bg-surface-2 p-1',
        fill && 'flex w-full',
        className
      )}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-semibold',
              'transition-colors duration-fast ease-standard [&_svg]:h-3.5 [&_svg]:w-3.5',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-xs coarse:h-9',
              fill && 'flex-1',
              active ? 'bg-card text-ink shadow-card' : 'text-muted hover:text-ink'
            )}
          >
            {opt.icon}
            {opt.label}
            {typeof opt.badge === 'number' && opt.badge > 0 && (
              <span className="badge bg-accent-soft text-accent">{opt.badge.toLocaleString('fa-IR')}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * ChipGroup — filter chips (single select). Wraps by default; `scroll`
 * keeps them on one line for narrow toolbars.
 */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  className,
  label,
  scroll = true,
  bleed = false
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  label?: string;
  scroll?: boolean;
  /** page-level only: scroll edge-to-edge on phones (negative page gutter) */
  bleed?: boolean;
}) {
  const { refs, onKeyDown } = useRovingKeys(options, value, onChange);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        'flex items-center gap-1.5',
        scroll ? cn('no-scrollbar overflow-x-auto', bleed && '-mx-gutter px-gutter md:mx-0 md:px-0') : 'flex-wrap',
        className
      )}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control border px-3 text-xs font-semibold coarse:h-9',
              'transition-colors duration-fast ease-standard [&_svg]:h-3.5 [&_svg]:w-3.5',
              active
                ? 'border-ink bg-ink text-card'
                : 'border-divider-strong bg-card text-muted hover:border-subtle hover:text-ink'
            )}
          >
            {opt.icon}
            {opt.label}
            {typeof opt.badge === 'number' && (
              <span className={cn('tnum text-2xs', active ? 'text-card/70' : 'text-subtle')}>{opt.badge.toLocaleString('fa-IR')}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
