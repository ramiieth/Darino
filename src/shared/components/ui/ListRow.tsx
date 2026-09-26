import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

/**
 * ListRow — the standard row for lists that replace tables on mobile
 * (assets, markets, positions, entries).
 *
 *   [leading]  title            trailing
 *              subtitle         trailingSub    [›]
 *
 * Interactive rows render as a real <button>/<Link> (keyboard reachable).
 * The chevron points to the inline-end (left in RTL) = "drill in".
 */
export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  trailingSub,
  onClick,
  to,
  chevron,
  className,
  children,
  ariaLabel
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  trailingSub?: ReactNode;
  onClick?: () => void;
  to?: string;
  /** Show drill-in chevron (defaults to true for interactive rows) */
  chevron?: boolean;
  className?: string;
  /** Extra content under the main line (e.g. metric strip) */
  children?: ReactNode;
  ariaLabel?: string;
}) {
  const interactive = !!onClick || !!to;
  const showChevron = chevron ?? interactive;
  const body = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        {leading && <div className="shrink-0">{leading}</div>}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">{title}</div>
          {subtitle && <div className="mt-0.5 truncate text-xs text-muted">{subtitle}</div>}
        </div>
        {(trailing || trailingSub) && (
          <div className="shrink-0 text-end">
            {trailing && <div className="text-sm font-semibold text-ink">{trailing}</div>}
            {trailingSub && <div className="mt-0.5 text-xs text-muted">{trailingSub}</div>}
          </div>
        )}
        {showChevron && <ChevronLeft aria-hidden className="h-4 w-4 shrink-0 text-subtle rtl:rotate-0 ltr:rotate-180" />}
      </div>
      {children}
    </>
  );
  const cls = cn(
    'block w-full py-3 text-start',
    interactive && '-mx-2 w-[calc(100%+1rem)] rounded-field px-2 transition-colors duration-fast hover:bg-surface-2 focus-visible:bg-surface-2',
    className
  );
  if (to) {
    return (
      <Link to={to} className={cls} aria-label={ariaLabel}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} aria-label={ariaLabel}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}
