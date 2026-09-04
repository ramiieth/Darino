/**
 * سهمیه‌بندی روزانه آلفا وانتج (۲۵ درخواست/روز/کلید — سیاست فعلی)
 * شمارنده مصرف هر کلید در IndexedDB ذخیره می‌شود و نیمه‌شب ریست می‌شود.
 */
import { create } from 'zustand';
import { settingGet, settingSet } from '@/shared/lib/db';
import { AV_DAILY_BUDGET_PER_KEY } from '@/app/config/apiConfig';

const USAGE_KEY = 'av:usage';

interface AvBudgetState {
  /** کلید → تعداد مصرف امروز */
  usage: Record<string, number>;
  today: string;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** آیا این کلید هنوز سهمیه دارد؟ */
  canUse: (key: string) => boolean;
  /** ثبت مصرف یک درخواست (قبل از ارسال) */
  consume: (key: string) => Promise<void>;
  /** علامت‌گذاری کلید به‌عنوان کاملاً مصرف‌شده (پاسخ Note/Information) */
  exhaust: (key: string) => Promise<void>;
  usedToday: (key: string) => number;
  remainingFor: (key: string) => number;
  /** مجموع سهمیه باقی‌مانده همه کلیدها */
  totalRemaining: (keys: string[]) => number;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export const useAvBudgetStore = create<AvBudgetState>((set, get) => ({
  usage: {},
  today: todayStr(),
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const usage = await settingGet<Record<string, number>>(USAGE_KEY, {});
      set({ usage, today: todayStr(), hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  canUse: (key) => {
    const s = get();
    const used = s.today === todayStr() ? (s.usage[key] ?? 0) : 0;
    return used < AV_DAILY_BUDGET_PER_KEY;
  },

  consume: async (key) => {
    const s = get();
    const today = todayStr();
    const usage = today === s.today ? { ...s.usage } : {};
    usage[key] = (usage[key] ?? 0) + 1;
    set({ usage, today });
    await settingSet(USAGE_KEY, usage);
  },

  exhaust: async (key) => {
    const s = get();
    const today = todayStr();
    const usage = today === s.today ? { ...s.usage } : {};
    usage[key] = AV_DAILY_BUDGET_PER_KEY; // مصرف کامل → دیگر تلاش نمی‌کند
    set({ usage, today });
    await settingSet(USAGE_KEY, usage);
  },

  usedToday: (key) =>
    get().today === todayStr() ? (get().usage[key] ?? 0) : 0,

  remainingFor: (key) => Math.max(0, AV_DAILY_BUDGET_PER_KEY - get().usedToday(key)),

  totalRemaining: (keys) =>
    [...new Set(keys)].reduce((acc, k) => acc + get().remainingFor(k), 0)
}));
