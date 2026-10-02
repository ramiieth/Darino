/**
 * Financial value components — presentation rules for every number in Darino.
 *
 *  • ارقام فارسی با «,» و «.» · بدون «$»: عدد + واژهٔ «دلار» با قلم کوچک (درخواست کارفرما).
 *  • عدد LTR-ایزوله و tabular؛ واژهٔ «دلار» بیرون از جعبهٔ LTR تا در RTL سمت درست بنشیند.
 *  • A value is never faked: null/undefined/NaN renders "—" with an accessible
 *    "unavailable" name — never $0.00.
 *  • Explicit states: loading (skeleton), stale (muted + clock), unavailable.
 *  • Gain/loss colour is always paired with a sign and (for deltas) an arrow.
 *
 * These components format; they never compute business values.
 */
import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Clock3, Minus } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { fmtCompactFa, fmtNumLatin, fmtPct, fmtPctEn, fmtUsdNumber, toFaDigits } from '@/shared/utils/formatters';

export type ValueState = 'ready' | 'loading' | 'stale' | 'unavailable';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const UNAVAILABLE = '—';

function StateShell({
  state,
  children,
  className,
  skeletonClass = 'h-[1em] w-16'
}: {
  state: ValueState;
  children: ReactNode;
  className?: string;
  skeletonClass?: string;
}) {
  if (state === 'loading') {
    return (
      <span className={cn('inline-block align-middle', className)} aria-busy="true">
        <span className={cn('skeleton inline-block rounded-md', skeletonClass)} />
        <span className="sr-only">در حال بارگذاری</span>
      </span>
    );
  }
  if (state === 'stale') {
    return (
      <span className={cn('inline-flex items-center gap-1', className)} title="داده قدیمی (کش)">
        {children}
        <Clock3 aria-label="داده قدیمی" className="h-[0.8em] w-[0.8em] shrink-0 text-warn" />
      </span>
    );
  }
  return <span className={className}>{children}</span>;
}

function Unavailable({ className, label = 'نامشخص' }: { className?: string; label?: string }) {
  return (
    <span className={cn('num-ltr text-subtle', className)} aria-label={label} title={label}>
      {UNAVAILABLE}
    </span>
  );
}

type Tone = 'auto' | 'none' | 'gain' | 'loss';

function signTone(v: number, tone: Tone): string {
  if (tone === 'none') return '';
  if (tone === 'gain') return 'text-positive';
  if (tone === 'loss') return 'text-negative';
  return v > 0 ? 'text-positive' : v < 0 ? 'text-negative' : '';
}

/* ---------------- واحد دلار (کوچک) ---------------- */

/** «۱,۲۳۴.۲۳ دلار» — عدد LTR و واژهٔ «دلار» کوچک (در RTL پس از عدد خوانده می‌شود) */
export function UsdText({ value, compact = false, signed = false, className }: { value: number; compact?: boolean; signed?: boolean; className?: string }) {
  const abs = Math.abs(value);
  const sign = value > 0 ? (signed ? '+' : '') : value < 0 ? '-' : '';
  const body = signed ? (compact ? fmtCompactFa(abs) : toFaDigits(abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))) : fmtUsdNumber(abs, compact);
  return (
    <span className={cn('inline-flex items-baseline gap-1', className)}>
      <bdi dir="ltr" className="num-ltr">
        {sign}
        {body}
      </bdi>
      <span className="text-[0.62em] font-medium opacity-70">دلار</span>
    </span>
  );
}

/* ---------------- CurrencyValue ---------------- */
export function MoneyValue({
  value,
  compact = false,
  signed = false,
  tone = 'none',
  state = 'ready',
  className,
  unavailableLabel
}: {
  value: number | null | undefined;
  compact?: boolean;
  /** Show explicit + for positives (P/L, deltas) */
  signed?: boolean;
  tone?: Tone;
  state?: ValueState;
  className?: string;
  unavailableLabel?: string;
}) {
  if (state === 'unavailable' || (state !== 'loading' && !isNum(value))) {
    return <Unavailable className={className} label={unavailableLabel} />;
  }
  const v = value as number;
  return (
    <StateShell state={state} className={cn(state !== 'loading' && signTone(v, tone), className)}>
      <UsdText value={v} compact={compact} signed={signed} />
    </StateShell>
  );
}

/* ---------------- PercentageValue ---------------- */
export function PercentValue({
  value,
  signed = true,
  tone = 'auto',
  state = 'ready',
  className,
  digits
}: {
  /** Percentage points (2.5 = 2.5%) */
  value: number | null | undefined;
  signed?: boolean;
  tone?: Tone;
  state?: ValueState;
  className?: string;
  /** Override fraction digits (default 2) */
  digits?: number;
}) {
  if (state === 'unavailable' || (state !== 'loading' && !isNum(value))) {
    return <Unavailable className={className} />;
  }
  const v = value as number;
  const text =
    digits !== undefined
      ? `${signed && v > 0 ? '+' : ''}${toFaDigits(v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }))}٪`
      : signed
        ? fmtPct(v)
        : fmtPctEn(v);
  return (
    <StateShell state={state} className={cn('num-ltr', state !== 'loading' && signTone(v, tone), className)}>
      {text}
    </StateShell>
  );
}

/* ---------------- ChangeIndicator (arrow + % [+ amount]) ---------------- */
export function DeltaValue({
  pct,
  usd,
  period,
  state = 'ready',
  className,
  variant = 'text',
  compact = true
}: {
  pct: number | null | undefined;
  usd?: number | null;
  /** Short period label, e.g. "۲۴ساعته" */
  period?: string;
  state?: ValueState;
  className?: string;
  /** text: inline coloured · pill: soft tinted chip */
  variant?: 'text' | 'pill';
  compact?: boolean;
}) {
  if (state === 'loading') return <StateShell state="loading" className={className}>{null}</StateShell>;
  if (!isNum(pct)) return <Unavailable className={className} />;
  const up = pct > 0;
  const down = pct < 0;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  const toneCls = up ? 'text-positive' : down ? 'text-negative' : 'text-muted';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-semibold',
        variant === 'pill' && cn('rounded-control px-1.5 py-0.5', up ? 'bg-gain/10' : down ? 'bg-negative/10' : 'bg-surface-2'),
        toneCls,
        className
      )}
    >
      <Icon aria-hidden className="h-[1.05em] w-[1.05em] shrink-0" />
      <span className="num-ltr">{fmtPct(pct)}</span>
      {isNum(usd) && (
        <span className="opacity-80">
          (<UsdText value={usd} compact={compact} signed />)
        </span>
      )}
      {period && <span className="text-muted">{period}</span>}
      {state === 'stale' && <Clock3 aria-label="داده قدیمی" className="h-[0.9em] w-[0.9em] text-warn" />}
    </span>
  );
}

/* ---------------- Quantity (units) ---------------- */
export function QuantityValue({
  value,
  unit,
  digits = 6,
  className
}: {
  value: number | null | undefined;
  unit?: string;
  digits?: number;
  className?: string;
}) {
  if (!isNum(value)) return <Unavailable className={className} />;
  const text =
    digits === 2
      ? fmtNumLatin(value)
      : toFaDigits(value.toLocaleString('en-US', { maximumFractionDigits: digits }));
  return (
    <span className={cn('num-ltr', className)}>
      {text}
      {unit && <span className="ms-1 text-muted">{unit}</span>}
    </span>
  );
}

/* ============================================================
   Metric — label + value (+ supporting line)
   ============================================================ */
export function Metric({
  label,
  value,
  sub,
  size = 'md',
  className,
  align = 'start',
  icon
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  /** hero 36–48 · lg 24 · md 18 · sm 14 */
  size?: 'hero' | 'lg' | 'md' | 'sm';
  className?: string;
  align?: 'start' | 'end' | 'center';
  icon?: ReactNode;
}) {
  const valueCls =
    size === 'hero'
      ? 'text-3xl font-extrabold tracking-tight md:text-4xl'
      : size === 'lg'
        ? 'text-2xl font-extrabold tracking-tight'
        : size === 'md'
          ? 'text-lg font-bold'
          : 'text-sm font-semibold';
  return (
    <div
      className={cn(
        'min-w-0',
        align === 'end' && 'text-end',
        align === 'center' && 'text-center',
        className
      )}
    >
      <p className={cn('flex items-center gap-1.5 text-xs font-semibold text-muted', align === 'center' && 'justify-center', align === 'end' && 'justify-end')}>
        {icon && <span className="text-subtle [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>}
        {label}
      </p>
      <div className={cn('mt-1 text-ink', valueCls)}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/**
 * MetricGrid — metrics separated by hairlines, not boxes.
 * `cols` = columns at ≥ sm (always 2 on phones).
 */
export function MetricGrid({
  children,
  cols = 4,
  className
}: {
  children: ReactNode;
  cols?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-x-6 gap-y-5',
        cols === 3 && 'sm:grid-cols-3',
        cols === 4 && 'sm:grid-cols-4',
        className
      )}
    >
      {children}
    </div>
  );
}

/** KeyValueList — label/value rows for details and breakdowns */
export function KeyValueList({
  rows,
  className,
  dense = false
}: {
  rows: { label: ReactNode; value: ReactNode; emphasis?: boolean; hint?: ReactNode }[];
  className?: string;
  dense?: boolean;
}) {
  return (
    <dl className={cn('divide-y divide-divider', className)}>
      {rows.map((r, i) => (
        <div
          key={i}
          className={cn(
            'flex items-baseline justify-between gap-4',
            dense ? 'py-2' : 'py-2.5',
            r.emphasis && 'font-semibold'
          )}
        >
          <dt className={cn('min-w-0 text-sm', r.emphasis ? 'text-ink' : 'text-muted')}>
            {r.label}
            {r.hint && <span className="block text-xs text-subtle">{r.hint}</span>}
          </dt>
          <dd className={cn('min-w-0 max-w-[65%] text-end text-sm [overflow-wrap:anywhere]', r.emphasis ? 'text-base font-bold text-ink' : 'font-semibold text-ink')}>
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
