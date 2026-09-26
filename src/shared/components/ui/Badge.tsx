import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export type Tone = 'neutral' | 'brand' | 'gain' | 'loss' | 'warn' | 'gold' | 'info';

export const TONE_SOFT: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  brand: 'bg-accent-soft text-accent',
  gain: 'bg-gain/10 text-positive',
  loss: 'bg-negative/10 text-negative',
  warn: 'bg-warn/10 text-warn',
  gold: 'bg-gold/12 text-gold-text',
  info: 'bg-info/10 text-info'
};

export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-muted',
  brand: 'text-accent',
  gain: 'text-positive',
  loss: 'text-negative',
  warn: 'text-warn',
  gold: 'text-gold-text',
  info: 'text-info'
};

export const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-subtle',
  brand: 'bg-accent',
  gain: 'bg-gain',
  loss: 'bg-negative',
  warn: 'bg-warn',
  gold: 'bg-gold',
  info: 'bg-info'
};

/** Badge — short status/category label. Never the only carrier of meaning. */
export function Badge({
  tone = 'neutral',
  children,
  className,
  icon,
  ltr = false
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
  /** Isolate Latin/technical content (tickers, chain names) */
  ltr?: boolean;
}) {
  return (
    <span className={cn('badge [&_svg]:h-3 [&_svg]:w-3', TONE_SOFT[tone], className)}>
      {icon}
      {ltr ? <bdi dir="ltr">{children}</bdi> : children}
    </span>
  );
}

/** Status dot + text (colour is paired with a label, never alone) */
export function StatusDot({
  tone = 'neutral',
  label,
  pulse = false,
  className
}: {
  tone?: Tone;
  label: ReactNode;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold', TONE_TEXT[tone], className)}>
      <span
        aria-hidden
        className={cn('h-2 w-2 shrink-0 rounded-full', TONE_DOT[tone], pulse && 'animate-pulse-soft')}
      />
      {label}
    </span>
  );
}
