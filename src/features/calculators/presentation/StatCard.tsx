/**
 * Calculator layout primitives
 *
 *   CalcShell   INPUT (start column, sticky on desktop) · RESULT (end column)
 *   ResultHero  the dominant output + its supporting line
 *   StatCard    legacy name kept for compatibility → renders a Metric
 */
import type { ReactNode } from 'react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Metric } from '@/shared/components/ui/FinancialValue';
import { cn } from '@/shared/lib/cn';

export function CalcShell({
  inputs,
  children,
  inputTitle = 'ورودی‌ها'
}: {
  inputs: ReactNode;
  children: ReactNode;
  inputTitle?: string;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
      <section aria-label={inputTitle} className="min-w-0 lg:col-span-5">
        <Surface className="space-y-5 p-4 md:p-5 lg:sticky lg:top-8">
          <h2 className="text-sm font-bold text-ink">{inputTitle}</h2>
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
    <Surface variant="focal" className="p-5 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted">{label}</p>
          <div className="mt-1 text-4xl font-extrabold tracking-tight text-ink">{value}</div>
          {sub && <div className="mt-1.5 text-sm text-muted">{sub}</div>}
        </div>
        {aside}
      </div>
      {children && <div className="mt-6 border-t border-divider pt-5">{children}</div>}
    </Surface>
  );
}

/** Empty result placeholder: tells the user what is missing */
export function ResultPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[12rem] items-center justify-center rounded-card border border-dashed border-divider-strong px-6 py-10 text-center text-sm text-muted">
      {children}
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
          {value}
        </span>
      }
      sub={sub}
    />
  );
}
