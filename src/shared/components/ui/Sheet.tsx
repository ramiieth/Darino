import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { t } from '@/shared/i18n/fa';

const activeSheets:HTMLElement[]=[];
let originalOverflow='';

/**
 * Sheet — one overlay primitive with explicit presentation rules:
 *
 *   variant="auto"   (default) contextual content: bottom sheet on phones,
 *                    centred dialog on tablet/desktop
 *   variant="panel"  secondary workflow / detail: bottom sheet on phones,
 *                    side panel from the inline-end edge on tablet/desktop
 *   variant="dialog" short focused confirmation: centred dialog everywhere
 *
 * Accessibility: role=dialog + aria-modal, labelled by the title, ESC closes,
 * focus is trapped and restored, body scroll is locked, safe areas respected.
 * Phones: drag the handle down to dismiss.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  variant = 'auto',
  size = 'md'
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  /** Sticky action area (e.g. primary submit) */
  footer?: ReactNode;
  className?: string;
  variant?: 'auto' | 'panel' | 'dialog';
  size?: 'sm' | 'md' | 'lg';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; dy: number } | null>(null);
  const titleId = useId();
  const descId = useId();

  // ESC + focus trap + focus restore + scroll lock
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel=panelRef.current;
    if(!panel)return;
    if(!activeSheets.length)originalOverflow=document.body.style.overflow;
    activeSheets.push(panel);
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if(activeSheets[activeSheets.length-1]!==panel)return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const list = [...focusables].filter((el) => !el.hasAttribute('disabled'));
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        const active = document.activeElement;
        if (e.shiftKey) {
          if (active === first || !panelRef.current.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last || !panelRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKey);
    requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      window.removeEventListener('keydown', onKey);
      const top=activeSheets[activeSheets.length-1]===panel;
      const index=activeSheets.indexOf(panel);if(index>=0)activeSheets.splice(index,1);
      if(!activeSheets.length)document.body.style.overflow=originalOverflow;
      if(top&&previous?.isConnected)previous.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = size === 'sm' ? 'md:max-w-md' : size === 'lg' ? 'md:max-w-2xl' : 'md:max-w-lg';

  return createPortal(
    <>
      <div
        data-sheet-overlay
        className="anim-fade-in fixed inset-0 z-sheet bg-[rgb(9_13_27/0.45)] backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'dialog'}
        aria-describedby={description ? descId : undefined}
        data-variant={variant}
        className={cn(
          'sheet-anim fixed z-sheet flex flex-col bg-card shadow-pop outline-none',
          // phones: bottom sheet
          'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-panel',
          variant === 'dialog' &&
            'inset-x-4 bottom-auto top-1/2 max-h-[85dvh] -translate-y-1/2 rounded-panel',
          // tablet/desktop
          variant === 'panel'
            ? // side panel on the inline-end edge (left in RTL), full height
              'md:bottom-0 md:end-0 md:start-auto md:top-0 md:h-dvh md:max-h-none md:w-full md:rounded-none md:border-s md:border-divider md:pt-[var(--safe-top)]'
            : // centred dialog
              'md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[85dvh] md:w-[calc(100%-4rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-panel',
          width,
          className
        )}
        onPointerDown={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('[data-drag-handle]')) {
            dragRef.current = { startY: e.clientY, dy: 0 };
            target.setPointerCapture?.(e.pointerId);
          }
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return;
          const dy = e.clientY - dragRef.current.startY;
          if (dy > 0) {
            dragRef.current.dy = dy;
            e.currentTarget.style.transform = `translateY(${dy}px)`;
          }
        }}
        onPointerUp={(e) => {
          if (!dragRef.current) return;
          const dy = dragRef.current.dy;
          dragRef.current = null;
          e.currentTarget.style.transform = '';
          if (dy > 110) onClose();
        }}
      >
        {/* drag handle — phones only */}
        {variant !== 'dialog' && (
          <div data-drag-handle className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2.5 active:cursor-grabbing md:hidden" aria-hidden>
            <span className="h-1 w-10 rounded-full bg-divider-strong" />
          </div>
        )}

        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-2 md:px-6 md:pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-ink">
              {title ?? ''}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-me-2 -mt-1 shrink-0 rounded-field p-2.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label={t('close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 md:px-6',
            footer ? 'pb-4' : 'pb-[calc(1.25rem+var(--safe-bottom))] md:pb-6'
          )}
        >
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-divider bg-card px-5 pb-[calc(0.75rem+var(--safe-bottom))] pt-3 md:px-6 md:pb-5">
            {footer}
          </div>
        )}
      </div>
    </>,document.body
  );
}

/** Dialog — short focused confirmation (centred everywhere) */
export function Dialog(props: Omit<Parameters<typeof Sheet>[0], 'variant'>) {
  return <Sheet {...props} variant="dialog" size={props.size ?? 'sm'} />;
}
