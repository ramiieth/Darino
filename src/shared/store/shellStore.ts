/**
 * Shell UI state (presentation only):
 *  - compactTitle: page H1 scrolled out of view → show the title in the top bar
 *  - paletteOpen / moreOpen / settingsOpen: global overlays
 */
import { create } from 'zustand';

interface ShellState {
  compactTitle: boolean;
  setCompactTitle: (v: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  moreOpen: boolean;
  setMoreOpen: (v: boolean) => void;
}

export const useShellStore = create<ShellState>((set) => ({
  compactTitle: false,
  setCompactTitle: (v) => set({ compactTitle: v }),
  paletteOpen: false,
  setPaletteOpen: (v) => set({ paletteOpen: v }),
  moreOpen: false,
  setMoreOpen: (v) => set({ moreOpen: v })
}));
