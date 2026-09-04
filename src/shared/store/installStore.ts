/**
 * حالت نصب PWA — پنجره نصب سفارشی (قبل از beforeinstallprompt)
 * و راهنمای نصب iOS (Standalone).
 */
import { create } from 'zustand';

interface InstallState {
  deferredPrompt: Event | null;
  canInstall: boolean;
  /** نصب‌شده به‌صورت standalone (یا iOS) */
  installed: boolean;
  promptVisible: boolean;
  setDeferredPrompt: (e: Event | null) => void;
  setCanInstall: (v: boolean) => void;
  setInstalled: (v: boolean) => void;
  openPrompt: () => void;
  closePrompt: () => void;
}

function detectInstalled(): boolean {
  try {
    const mq = window.matchMedia('(display-mode: standalone)');
    if (mq.matches) return true;
    // iOS Safari
    const nav = navigator as Navigator & { standalone?: boolean };
    if (typeof nav.standalone === 'boolean' && nav.standalone) return true;
  } catch {
    /* خاموش */
  }
  return false;
}

export const useInstallStore = create<InstallState>((set) => ({
  deferredPrompt: null,
  canInstall: false,
  installed: detectInstalled(),
  promptVisible: false,
  setDeferredPrompt: (e) => set({ deferredPrompt: e, canInstall: e !== null }),
  setCanInstall: (v) => set({ canInstall: v }),
  setInstalled: (v) => set({ installed: v }),
  openPrompt: () => set({ promptVisible: true }),
  closePrompt: () => set({ promptVisible: false })
}));
