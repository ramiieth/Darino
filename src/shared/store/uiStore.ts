/** وضعیت UI سراسری: جستجوی بازار (از Command Palette) */
import { create } from 'zustand';

interface UiState {
  /** جستجوی از پیش‌تنظیم بازار (مثلاً انتخاب از پالت) */
  marketSearch: string;
  setMarketSearch: (v: string) => void;
  /** پرش از داشبورد به تب بازدهی دیفای + باز کردن شیت یک استخر */
  pendingDefi: { tab: 'yields' | 'overview' | 'perps' | 'stablecoins'; pool: unknown } | null;
  openDefiYield: (pool: unknown) => void;
  clearDefi: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  marketSearch: '',
  setMarketSearch: (v) => set({ marketSearch: v }),
  pendingDefi: null,
  openDefiYield: (pool) => set({ pendingDefi: { tab: 'yields', pool } }),
  clearDefi: () => set({ pendingDefi: null })
}));
