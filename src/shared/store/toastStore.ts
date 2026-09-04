/** سیستم اعلان‌های داخلی (Toast) — ممیزی §۲ Error States */
import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  type: ToastType;
  msg: string;
  action?: { label: string; fn: () => void };
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    const ms = t.action ? 7000 : 4200;
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    }, ms);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
}));

/** ارسال توست از هرجای اپ (خارج از کامپوننت هم قابل استفاده) */
export function toast(
  type: ToastType,
  msg: string,
  action?: { label: string; fn: () => void }
): void {
  useToastStore.getState().push({ type, msg, action });
}
