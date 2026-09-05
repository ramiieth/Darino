import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';
import { t } from '@/shared/i18n/fa';

/**
 * شیت پایین صفحه (Bottom Sheet) — موبایل‌فرست + دسترس‌پذیری (ESC / فوکوس‌ترپ)
 * + بستن با کشیدن به پایین (drag on handle — بدون framer-motion؛ CSS + pointer)
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  className
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; dy: number } | null>(null);

  // ESC + فوکوس‌ترپ + بازگرداندن فوکوس
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
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
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="anim-fade-in fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? 'dialog'}
        className={cn(
          'anim-slide-up fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-2xl border-t border-line/10 bg-card p-5 shadow-pop outline-none',
          'pb-safe max-h-[85dvh] overflow-y-auto overscroll-contain',
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
        {/* دستگیره کشیدن — drag فقط از اینجا فعال است */}
        <div
          data-drag-handle
          className="mx-auto mb-4 h-1.5 w-12 cursor-grab touch-none rounded-full bg-muted/20 active:cursor-grabbing"
          aria-hidden
        />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-extrabold text-ink">{title ?? ''}</h2>
          <button
            onClick={onClose}
            className="rounded-xl p-2.5 text-muted transition-colors hover:bg-line/5"
            aria-label={t('close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
