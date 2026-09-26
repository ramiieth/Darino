import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

/**
 * Disclosure — progressive disclosure for secondary detail (native <details>:
 * keyboard + screen-reader support without JS; state survives re-renders).
 */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  className
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details className={cn('group', className)} open={defaultOpen || undefined}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-control py-2 text-sm font-semibold text-accent hover:underline [&::-webkit-details-marker]:hidden">
        {summary}
        <ChevronDown aria-hidden className="h-4 w-4 shrink-0 transition-transform duration-fast group-open:rotate-180" />
      </summary>
      <div className="pb-1 pt-1">{children}</div>
    </details>
  );
}
