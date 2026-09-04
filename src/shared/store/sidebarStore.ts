/**
 * استور وضعیت سایدبار دسکتاپ (جمع‌شده/باز) — با ماندگاری در localStorage
 */
import { create } from 'zustand';

const STORE_KEY = 'darino:sidebar:collapsed';

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
}

function readInitial(): boolean {
  try {
    return localStorage.getItem(STORE_KEY) === '1';
  } catch {
    return false;
  }
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: readInitial(),
  toggle: () =>
    set((s) => {
      try {
        localStorage.setItem(STORE_KEY, s.collapsed ? '0' : '1');
      } catch {
        /* خاموش */
      }
      return { collapsed: !s.collapsed };
    }),
  setCollapsed: (v) => set({ collapsed: v })
}));
