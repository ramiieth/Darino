import { useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useShellStore } from '@/shared/store/shellStore';

/**
 * PageHeader — the single <h1> of a screen.
 *
 *   [‹ back]                                   (detail screens, standalone PWA)
 *   eyebrow
 *   Title                                        [actions]
 *   description
 *   meta (freshness / status line)
 *
 * When the title scrolls out of view the mobile top bar shows it (compact title).
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
  eyebrow,
  meta,
  back
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  eyebrow?: ReactNode;
  /** Status line under the description (e.g. FreshnessBar) */
  meta?: ReactNode;
  /** Back affordance: a label (navigates -1), {label, to} or {label, onClick} (in-page drill-in) */
  back?: Back;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const setCompact = useShellStore((s) => s.setCompactTitle);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting), {
      rootMargin: '-64px 0px 0px 0px'
    });
    io.observe(el);
    return () => {
      io.disconnect();
      setCompact(false);
    };
  }, [setCompact]);

  return (
    <header className={cn('mb-6 md:mb-8', className)}>
      {back && <BackButton back={back} />}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          {eyebrow && <p className="mb-1 text-xs font-semibold text-muted">{eyebrow}</p>}
          <h1 ref={ref} className="text-2xl font-extrabold tracking-tight text-ink md:text-3xl">
            {title}
          </h1>
          {subtitle && <p className="mt-1.5 max-w-prose text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {meta && <div className="mt-3">{meta}</div>}
    </header>
  );
}

type Back = string | { label: string; to?: string; onClick?: () => void };

/** Back affordance — separate component so pages without it need no router context */
function BackButton({ back }: { back: Back }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() =>
        typeof back === 'string' ? navigate(-1) : back.onClick ? back.onClick() : back.to ? navigate(back.to) : navigate(-1)
      }
      className="-ms-1.5 mb-3 inline-flex h-8 items-center gap-1 rounded-control pe-2 ps-1 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-ink"
    >
      <ChevronRight aria-hidden className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
      {typeof back === 'string' ? back : back.label}
    </button>
  );
}

/** Page — standard vertical rhythm between sections (24 mobile / 32 desktop) */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('space-y-6 md:space-y-8', className)}>{children}</div>;
}
