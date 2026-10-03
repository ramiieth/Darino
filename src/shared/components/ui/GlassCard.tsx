import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * Surface — the only container primitive.
 *
 *   raised  white surface + hairline border — a primary content block (default)
 *   focal   raised + level-1 elevation — the single focal element of a view (hero, main result)
 *   subtle  tinted, borderless — secondary grouping inside a flat section
 *   flat    no surface — layout only (use with Section for whitespace hierarchy)
 *
 * Rule: never nest a raised surface inside another raised surface. Inside a
 * surface, group with dividers (`divide-y divide-divider`) or `subtle`.
 */
export type SurfaceVariant = 'raised' | 'focal' | 'subtle' | 'flat';

const VARIANT: Record<SurfaceVariant, string> = {
  raised: 'rounded-card border border-divider bg-card',
  focal: 'rounded-card border border-divider bg-card shadow-card',
  subtle: 'rounded-card bg-surface-2/70',
  flat: ''
};

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant;
  /** Short entrance for content that arrives after a load */
  animated?: boolean;
  as?: 'div' | 'section' | 'article' | 'aside';
}

export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(
  ({ className, variant = 'raised', animated = false, as = 'div', ...props }, ref) => {
    // semantic element choice only — all share HTMLElement behaviour
    const Tag = as as 'div';
    return <Tag ref={ref} className={cn('darino-surface min-w-0', VARIANT[variant], animated && 'anim-fade-in', className)} {...props} />;
  }
);
Surface.displayName = 'Surface';

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  /** @deprecated legacy names — default→raised, strong→focal, soft→subtle */
  variant?: 'default' | 'strong' | 'soft';
  animated?: boolean;
  delay?: number;
}

const LEGACY: Record<NonNullable<GlassCardProps['variant']>, SurfaceVariant> = {
  default: 'raised',
  strong: 'focal',
  soft: 'subtle'
};

/** Legacy alias kept so every module inherits the Surface system. Prefer `Surface`. */
export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ variant = 'default', delay: _delay, ...props }, ref) => (
    <Surface ref={ref} variant={LEGACY[variant]} {...props} />
  )
);
GlassCard.displayName = 'GlassCard';

/* ============================================================
   Section — whitespace-first grouping with a heading row
   ============================================================ */
export function Section({
  title,
  description,
  action,
  children,
  className,
  headingLevel = 2,
  id
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
  id?: string;
}) {
  return (
    <section aria-labelledby={title && id ? `${id}-title` : undefined} className={cn('min-w-0', className)}>
      {(title || action) && (
        <SectionHeader
          title={title}
          description={description}
          action={action}
          level={headingLevel}
          id={id ? `${id}-title` : undefined}
        />
      )}
      {children}
    </section>
  );
}

export function SectionHeader({
  title,
  action,
  level = 2,
  id,
  className
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  level?: 2 | 3;
  id?: string;
  className?: string;
}) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        {title && (
          <H id={id} className={cn('font-bold text-ink', level === 2 ? 'text-base md:text-lg' : 'text-sm')}>
            {title}
          </H>
        )}

      </div>
      {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
    </div>
  );
}
