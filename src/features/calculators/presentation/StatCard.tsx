/**
 * Calculator layout primitives — shared across all Darino calculators.
 *
 *   CalcShell         INPUT (start column, sticky on desktop) · RESULT (end column)
 *   ResultHero        dominant output + top subtle gradient bar + secondary metrics
 *   ResultPlaceholder inviting empty state before inputs are filled
 *   StatCard          legacy alias → renders Metric
 */
import type { ReactNode } from 'react';
import { Calculator, SlidersHorizontal } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Metric, AmountText } from '@/shared/components/ui/FinancialValue';
import { cn } from '@/shared/lib/cn';

export function CalcShell({
  inputs,
  children,
  inputTitle = 'ورودی‌ها',
  top
}: {
  inputs: ReactNode;
  children: ReactNode;
  inputTitle?: string;
  /** کارت تمام‌عرض بالای ورودی‌ها (مثلاً «وضعیت امروز») — روی موبایل اول دیده می‌شود */
  top?: ReactNode;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-12 lg:gap-7">
      {top && <div className="min-w-0 lg:col-span-12">{top}</div>}
      <section aria-label={inputTitle} className="min-w-0 lg:col-span-5">
        <Surface className="space-y-5 border-divider/90 p-4 md:p-5 lg:sticky lg:top-8">
          <div className="flex items-center gap-2 border-b border-divider/70 pb-3">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            </span>
            <h2 className="text-sm font-bold text-ink">{inputTitle}</h2>
          </div>
          {inputs}
        </Surface>
      </section>
      <section aria-label="نتیجه" aria-live="polite" className="min-w-0 space-y-5 lg:col-span-7">
        {children}
      </section>
    </div>
  );
}

export function ResultHero({
  label,
  value,
  sub,
  aside,
  children
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  aside?: ReactNode;
  /** secondary metrics (MetricGrid) */
  children?: ReactNode;
}) {
  return (
    <Surface variant="focal" className="relative overflow-hidden p-5 md:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-l from-accent via-gain/65 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -end-16 -top-16 h-40 w-40 rounded-full bg-accent/[0.06] blur-3xl"
      />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted md:text-sm">{label}</p>
          <div className="mt-1.5 text-3xl font-extrabold tracking-tight text-ink md:text-4xl">{value}</div>
          {sub && <div className="mt-1.5 text-xs leading-6 text-muted md:text-sm">{sub}</div>}
        </div>
        {aside}
      </div>
      {children && <div className="relative mt-5 border-t border-divider/80 pt-5">{children}</div>}
    </Surface>
  );
}

/** Empty result placeholder: tells the user what is missing */
export function ResultPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[13rem] flex-col items-center justify-center gap-3 rounded-card border border-dashed border-divider-strong bg-surface-2/35 px-6 py-10 text-center text-sm text-muted">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-card text-muted shadow-card ring-1 ring-divider/80">
        <Calculator className="h-5 w-5" aria-hidden />
      </span>
      <p className="max-w-sm leading-6">{children}</p>
    </div>
  );
}

/** @deprecated legacy stat tile — renders the shared Metric */
export function StatCard({
  label,
  value,
  sub,
  tone = 'neutral'
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'accent';
  delay?: number;
}) {
  return (
    <Metric
      size="md"
      label={label}
      value={
        <span className={cn('num-ltr', tone === 'positive' && 'text-positive', tone === 'negative' && 'text-negative')}>
          <AmountText text={value} />
        </span>
      }
      sub={sub}
    />
  );
}
