/**
 * چک‌لیست تعاملی ۱۱ موردی ریسک قبل از معامله (مطابق صفحه ۹ PDF و بخش ۱۴ درخواست)
 *
 * نکته: تأیید مدیر ریسک و تأیید چک‌لیست دو موضوع مستقل هستند؛
 * اگر حتی یک مورد تیک نخورده باشد، سیستم هشدار می‌دهد که معامله تمام شرایط لازم را ندارد.
 */
import type { PreTradeChecklistState } from './types';

export interface ChecklistItemDef {
  id: string;
  order: number;
  labelFa: string;
  critical: boolean;
}

export const PRE_TRADE_CHECKLIST_ITEMS: readonly ChecklistItemDef[] = [
  { id: 'c1_risk_approved', order: 1, labelFa: 'مدیر ریسک معامله را تأیید کرده است.', critical: true },
  { id: 'c2_risk_1_2_pct', order: 2, labelFa: 'ریسک معامله حداکثر ۱ تا ۲ درصد کل سرمایه است.', critical: true },
  { id: 'c3_stop_written', order: 3, labelFa: 'حد ضرر قبل از ورود مشخص شده است و به رعایت آن متعهد هستم.', critical: true },
  { id: 'c4_rr_min_2', order: 4, labelFa: 'نسبت ریسک به ریوارد حداقل ۱ به ۲ است.', critical: true },
  { id: 'c5_liquidity_5pct', order: 5, labelFa: 'حجم معامله کمتر از ۵ درصد میانگین ارزش معاملات روزانه نماد است (ریسک صف فروش).', critical: true },
  { id: 'c6_bear_answered', order: 6, labelFa: 'دلایل بدبینانه بررسی شده‌اند و پاسخ منطقی برای آن‌ها وجود دارد.', critical: true },
  { id: 'c7_max_20pct_portfolio', order: 7, labelFa: 'معامله بیشتر از ۲۰ درصد کل سبد سرمایه‌گذاری نیست.', critical: true },
  { id: 'c8_backtest_30_trades', order: 8, labelFa: 'استراتژی حداقل ۳۰ معامله بکتست شده است.', critical: true },
  { id: 'c9_data_not_emotion', order: 9, labelFa: 'دلیل ورود مبتنی بر داده و تحلیل است، نه هیجان یا سیگنال کانال‌ها.', critical: true },
  { id: 'c10_non_living_money', order: 10, labelFa: 'سرمایه اختصاص‌یافته پولی نیست که از دست رفتن آن زندگی را مختل کند.', critical: true },
  { id: 'c11_logged_in_journal', order: 11, labelFa: 'معامله در ژورنال ثبت شده است.', critical: true }
];

export function evaluateChecklist(state: PreTradeChecklistState | undefined): {
  checkedCount: number;
  totalCount: number;
  allPassed: boolean;
  missingItems: ChecklistItemDef[];
  warningFa: string | null;
} {
  const checks = state?.checks ?? {};
  const missingItems = PRE_TRADE_CHECKLIST_ITEMS.filter((it) => !checks[it.id]);
  const checkedCount = PRE_TRADE_CHECKLIST_ITEMS.length - missingItems.length;
  const allPassed = missingItems.length === 0;
  return {
    checkedCount,
    totalCount: PRE_TRADE_CHECKLIST_ITEMS.length,
    allPassed,
    missingItems,
    warningFa: allPassed
      ? null
      : `هنوز ${missingItems.length} شرط از ۱۱ شرط ضروری چک‌لیست ریسک تأیید نشده است؛ تا تکمیل تمام موارد وارد معامله نشوید.`
  };
}
