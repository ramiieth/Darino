/**
 * وضعیت همگام‌سازی قیمت‌های توکن‌ایز (دسته Tokenized Products کوین‌گکو)
 * — پیشرفت برای نوار UI در اولین اجرا (جستجوی چند نماد باقی‌مانده)
 */
import { create } from 'zustand';

export type TokenSyncPhase = 'idle' | 'loading' | 'done' | 'error';

interface TokenSyncState {
  phase: TokenSyncPhase;
  done: number;
  total: number;
  lastSyncAt: number | null;
  liveCount: number;
  start: (total: number) => void;
  progress: (done: number) => void;
  finish: (liveCount: number) => void;
  fail: () => void;
}

export const useTokenSyncStore = create<TokenSyncState>((set) => ({
  phase: 'idle',
  done: 0,
  total: 0,
  lastSyncAt: null,
  liveCount: 0,
  start: (total) => set({ phase: 'loading', done: 0, total, liveCount: 0 }),
  progress: (done) => set({ done }),
  finish: (liveCount) =>
    set({ phase: 'done', done: 0, total: 0, liveCount, lastSyncAt: Date.now() }),
  fail: () => set({ phase: 'error', done: 0, total: 0 })
}));
