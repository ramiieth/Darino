/** نمایش اعلان‌های داخلی (Toast) */
import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import { useToastStore } from '@/shared/store/toastStore';
import { cn } from '@/shared/lib/cn';

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info
};

const COLORS = {
  success: 'text-positive',
  error: 'text-negative',
  info: 'text-accent'
};

export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[90] flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.type];
          return (
            <div
              key={toast.id}
              className="anim-toast-in pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-xl border border-line/10 bg-card px-3.5 py-3 shadow-pop"
              role="status"
            >
              <Icon className={cn('h-4 w-4 shrink-0', COLORS[toast.type])} />
              <p className="min-w-0 flex-1 text-[11px] font-bold leading-5 text-ink">{toast.msg}</p>
              {toast.action && (
                <button
                  onClick={() => {
                    toast.action?.fn();
                    dismiss(toast.id);
                  }}
                  className="shrink-0 rounded-xl bg-accent px-2.5 py-1 text-[11px] font-bold text-white"
                >
                  {toast.action.label}
                </button>
              )}
              <button
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded-lg p-1 text-muted hover:bg-line/5"
                aria-label="بستن"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
    </div>
  );
}
