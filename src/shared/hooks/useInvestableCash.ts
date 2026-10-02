/**
 * موجودی نقد قابل سرمایه‌گذاری (سرمایهٔ سناریوها) — Single Source of Truth
 *
 * همه شبیه‌سازی‌های نمایشی (Performance) و ماژول Simulation سرمایه اولیه را از اینجا می‌خوانند.
 *
 *  • حالت «خودکار» (پیش‌فرض): همان «موجودی نقد» حسابداری (تتر و دلارهای دیجیتال) که پس از هر
 *    واریز، برداشت، خرید، فروش — و حالا سواپ/بریجِ ثبت‌شده در دارایی چندشبکه‌ای — به‌روز می‌شود.
 *  • حالت «دستی»: مبلغی که کاربر خودش تعیین می‌کند؛ با تغییر آن همهٔ سناریوها فوراً بازمحاسبه می‌شوند.
 *  • انتخاب حالت و مبلغ دستی در «تنظیمات همگام» ذخیره و بین وب و اپ آیفون یکی می‌شود.
 *  • وقتی حسابداری هنوز بارگذاری نشده: فالبک ثابت.
 */
import { useAccounting } from '@/features/accounting/data/useAccounting';
import { ETH_POSITION } from '@/features/simulation/domain/constants';
import { getPref, savePref, useCustodyStore } from '@/features/custody/data/repository';

/** فالبک هنگام بارگذاری/خطای حسابداری */
export const INVESTABLE_CASH_FALLBACK = ETH_POSITION.USDC_ALLOCATION_2026;

export const SCENARIO_CASH_PREF = 'scenario-cash';

export interface ScenarioCashPref {
  mode: 'auto' | 'manual';
  manualUsd: number | null;
}

export interface InvestableCash {
  /** سرمایهٔ مؤثر سناریو (null تا وقتی داده آماده نیست) */
  cash: number | null;
  loading: boolean;
  mode: 'auto' | 'manual';
  /** موجودی نقد حسابداری (مرجع حالت خودکار) */
  accountingCash: number | null;
  manualUsd: number | null;
}

export function readScenarioCash(): ScenarioCashPref {
  return getPref<ScenarioCashPref>(SCENARIO_CASH_PREF)?.value ?? { mode: 'auto', manualUsd: null };
}

export async function saveScenarioCash(pref: ScenarioCashPref): Promise<void> {
  await savePref(SCENARIO_CASH_PREF, pref);
}

export function useInvestableCash(): InvestableCash {
  const { cashBalance, loading } = useAccounting();
  // بازخوانی با هر تغییر/همگام‌سازی تنظیمات
  useCustodyStore();
  const pref = readScenarioCash();
  const accountingCash = loading ? null : cashBalance;
  const manualOk = pref.mode === 'manual' && pref.manualUsd !== null && pref.manualUsd > 0;
  return {
    cash: manualOk ? pref.manualUsd : accountingCash,
    loading: manualOk ? false : loading,
    mode: manualOk ? 'manual' : 'auto',
    accountingCash,
    manualUsd: pref.manualUsd
  };
}

/** مقدار قطعی برای مصرف در محاسبات (فالبک در صورت نداشتن داده زنده) */
export function investableCashOr(cash: number | null): number {
  return cash !== null && Number.isFinite(cash) && cash > 0 ? cash : INVESTABLE_CASH_FALLBACK;
}
