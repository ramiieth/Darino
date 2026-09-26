/** In-app notifications — polite live region above the mobile nav */
import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import { useToastStore } from '@/shared/store/toastStore';
import { cn } from '@/shared/lib/cn';

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info
};

const COLORS = {
  success: 'text-gain',
  error: 'text-negative',
  info: 'text-brand-500'
};

export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--bottomnav-h)+0.75rem)] z-toast flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-start md:ps-[calc(theme(spacing.rail)+1.5rem)] lg:ps-[calc(theme(spacing.sidebar)+1.5rem)]"
    >
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type];
        return (
          <div
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : 'status'}
            className="anim-toast-in pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-field bg-ink px-4 py-3 text-card shadow-pop"
          >
            <Icon aria-hidden className={cn('h-4 w-4 shrink-0', COLORS[toast.type])} />
            <p className="min-w-0 flex-1 text-sm">{toast.msg}</p>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action?.fn();
                  dismiss(toast.id);
                }}
                className="shrink-0 rounded-control px-2 py-1 text-sm font-semibold text-brand-100 hover:bg-white/10"
              >
                {toast.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(toast.id)}
              className="-me-1.5 shrink-0 rounded-control p-1.5 text-card/70 hover:bg-white/10 hover:text-card"
              aria-label="بستن"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
