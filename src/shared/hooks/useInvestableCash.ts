/**
 * موجودی نقد قابل سرمایه‌گذاری — Single Source of Truth
 *
 * همه شبیه‌سازی‌های نمایشی (Performance) و ماژول Simulation سرمایه اولیه را
 * از اینجا می‌خوانند: همان «Cash Balance» حسابداری که پس از هر برداشت/فروش
 * برای مخارج (Expense Fund / Bank Account) به‌روز می‌شود.
 *
 *  - وقتی حسابداری هنوز بارگذاری نشده: فالبک ثابت (سرمایه اولیه شناخته‌شده)
 *  - پس از بارگذاری: موجودی نقد واقعی و زنده (۲۳٬۱۲۶ ← ۱۸٬۱۲۶ پس از برداشت ۵٬۰۰۰)
 */
import { useAccounting } from '@/features/accounting/data/useAccounting';
import { ETH_POSITION } from '@/features/simulation/domain/constants';

/** فالبک هنگام بارگذاری/خطای حسابداری */
export const INVESTABLE_CASH_FALLBACK = ETH_POSITION.USDC_ALLOCATION_2026;

export interface InvestableCash {
  /** موجودی نقد زنده (null تا وقتی حسابداری آماده نیست) */
  cash: number | null;
  loading: boolean;
}

export function useInvestableCash(): InvestableCash {
  const { cashBalance, loading } = useAccounting();
  return { cash: loading ? null : cashBalance, loading };
}

/** مقدار قطعی برای مصرف در محاسبات (فالبک در صورت نداشتن داده زنده) */
export function investableCashOr(cash: number | null): number {
  return cash !== null && Number.isFinite(cash) && cash > 0 ? cash : INVESTABLE_CASH_FALLBACK;
}
