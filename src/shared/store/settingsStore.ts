/**
 * تنظیمات سناریو + کلیدهای API — ذخیره در IndexedDB
 * کلیدها به‌صورت لیست (چند کلید با کاما) برای افزایش سهمیه روزانه آلفا وانتج.
 */
import { create } from 'zustand';
import { settingGet, settingSet } from '@/shared/lib/db';
import type { ScenarioConfig } from '@/shared/types';
import { ETH_POSITION } from '@/features/simulation/domain/constants';
import { ALPHA_VANTAGE_KEY, DEFAULT_AV_EXTRA_KEYS } from '@/app/config/apiConfig';

export const DEFAULT_SCENARIO: ScenarioConfig = {
  ethAmount: ETH_POSITION.AMOUNT,
  ethBuyPrice: ETH_POSITION.BUY_PRICE,
  ethInitialInvestment: ETH_POSITION.INITIAL_INVESTMENT,
  usdcAllocation2026: ETH_POSITION.USDC_ALLOCATION_2026,
  baseCapital2025: 32_516.6,
  baseCapital2026: 23_126.0,
  ethRefJuly2026: ETH_POSITION.ETH_REF_JULY_2026
};

interface SettingsState {
  scenario: ScenarioConfig;
  hydrated: boolean;
  /** کلیدهای اضافی کاربر (بدون کلید پیش‌فرض) */
  apiKeys: string[];
  hydrate: () => Promise<void>;
  saveScenario: (s: ScenarioConfig) => Promise<void>;
  saveApiKeys: (keys: string[]) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  scenario: DEFAULT_SCENARIO,
  hydrated: false,
  apiKeys: [],
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const [scenario, apiKeys, legacyKey] = await Promise.all([
        settingGet<ScenarioConfig>('app:scenario', DEFAULT_SCENARIO),
        settingGet<string[]>('app:avKeys', []),
        settingGet<string>('app:avKey', '')
      ]);
      // مهاجرت از کلید تکی قدیمی به لیست
      const merged = legacyKey && !apiKeys.includes(legacyKey) ? [legacyKey, ...apiKeys] : apiKeys;
      set({ scenario, apiKeys: merged.filter(Boolean), hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  saveScenario: async (s) => {
    set({ scenario: s });
    await settingSet('app:scenario', s);
  },
  saveApiKeys: async (keys) => {
    set({ apiKeys: keys });
    await settingSet('app:avKeys', keys);
  }
}));

/** کلیدهای مؤثر: ۵ کلید پیش‌فرض + کلیدهای کاربر (یکتا) */
export function effectiveApiKeys(userKeys: string[]): string[] {
  const list = [ALPHA_VANTAGE_KEY, ...DEFAULT_AV_EXTRA_KEYS, ...userKeys]
    .map((k) => k.trim())
    .filter(Boolean);
  return [...new Set(list)];
}
