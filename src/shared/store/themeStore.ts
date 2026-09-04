import { create } from 'zustand';
import { jsonGet, jsonSet } from '@/shared/lib/storage';

export type ThemeMode = 'dark' | 'light';

interface ThemeState {
  theme: ThemeMode;
  hydrated: boolean;
  toggle: () => void;
  setTheme: (t: ThemeMode) => void;
}

function systemTheme(): ThemeMode {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'dark';
  }
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: systemTheme(),
  hydrated: false,
  toggle: () => {
    const next: ThemeMode = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(next);
  },
  setTheme: (t) => {
    jsonSet('app:theme', t);
    applyTheme(t);
    set({ theme: t });
  }
}));

export function applyTheme(t: ThemeMode): void {
  const root = document.documentElement;
  root.classList.toggle('dark', t === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', t === 'dark' ? '#0a0f1e' : '#f4f6fa');
}

/** صدا زدن قبل از render — جلوگیری از فلش */
export function initTheme(): void {
  const saved = jsonGet<ThemeMode | null>('app:theme', null);
  applyTheme(saved ?? systemTheme());
  useThemeStore.setState({ theme: saved ?? systemTheme(), hydrated: true });
}
