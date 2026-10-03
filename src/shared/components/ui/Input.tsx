import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes
} from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

/* ============================================================
   Control system — Field · Input · Select · SearchField
   Shared: 40px height (44 on touch) · 12px radius · divider-strong border
   · brand focus ring · 16px text on touch (prevents iOS focus zoom)
   ============================================================ */

export const controlBase = cn(
  'h-10 w-full rounded-field border border-divider-strong bg-card px-3.5 text-sm text-ink',
  'placeholder:text-subtle transition-colors duration-fast ease-standard',
  'hover:border-subtle/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20',
  'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted',
  'aria-[invalid=true]:border-negative aria-[invalid=true]:ring-negative/15',
  'coarse:h-11 coarse:text-base'
);

interface FieldCtx {
  id: string;
  describedBy?: string;
  invalid: boolean;
}
const FieldContext = createContext<FieldCtx | null>(null);

/**
 * Field — label + control + hint/error, wired for screen readers.
 * The control inside picks up id / aria-describedby / aria-invalid automatically.
 */
export function Field({
  label,
  error,
  children,
  className,
  labelAside
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Content aligned to the end of the label row (e.g. "live price" action) */
  labelAside?: ReactNode;
}) {
  const id = useId();

  const errId = error ? `${id}-err` : undefined;
  const describedBy = [errId].filter(Boolean).join(' ') || undefined;
  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: !!error }}>
      <div className={cn('min-w-0', className)}>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor={id} className="text-xs font-semibold text-muted">
            {label}
          </label>
          {labelAside}
        </div>
        {children}
        {error ? (
          <p id={errId} className="mt-1.5 text-xs text-negative">
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

function useFieldProps(id?: string, invalid?: boolean) {
  const ctx = useContext(FieldContext);
  return {
    id: id ?? ctx?.id,
    'aria-describedby': ctx?.describedBy,
    'aria-invalid': invalid ?? ctx?.invalid ?? undefined
  };
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  withSearchIcon?: boolean;
  invalid?: boolean;
  /** Unit shown at the inline end (e.g. "$", "٪", "ETH") */
  suffix?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, withSearchIcon = false, invalid, suffix, id, ...props }, ref) => {
    const field = useFieldProps(id, invalid);
    return (
      <div className="relative">
        {withSearchIcon && (
          <Search
            aria-hidden
            className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
          />
        )}
        <input
          ref={ref}
          {...field}
          className={cn(
            controlBase,
            // numeric/technical LTR values sit on the right (RTL form convention);
            // the unit suffix sits on the inline end (left) — they never collide
            props.dir === 'ltr' && 'text-right',
            withSearchIcon && 'ps-10',
            suffix != null && (props.dir === 'ltr' ? 'pl-12' : 'pe-12'),
            className
          )}
          {...props}
        />
        {suffix != null && (
          <span className="pointer-events-none absolute end-3.5 top-1/2 max-w-[2.75rem] -translate-y-1/2 truncate text-xs font-semibold text-muted">
            {suffix}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

/** Native select with the shared control styling (best mobile ergonomics) */
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
>(({ className, invalid, id, children, ...props }, ref) => {
  const field = useFieldProps(id, invalid);
  return (
    <div className="relative min-w-0">
      <select
        ref={ref}
        {...field}
        className={cn(controlBase, 'cursor-pointer appearance-none truncate pe-9', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
      />
    </div>
  );
});
Select.displayName = 'Select';

/** Search input with clear action */
export function SearchField({
  value,
  onChange,
  placeholder,
  className,
  label,
  autoFocus
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  /** Accessible name (defaults to placeholder) */
  label?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <Input
        type="search"
        withSearchIcon
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        autoFocus={autoFocus}
        className="pe-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="پاک کردن جستجو"
          className="absolute end-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-control text-muted hover:bg-surface-2 hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
