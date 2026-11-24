/**
 * ژورنال معاملاتی بازار سرمایه ایران + تحلیلگر خودکار الگوهای اشتباه ماهانه
 */
import type { IranJournalEntry, MonthlyJournalReview } from './types';

export const JOURNAL_BEHAVIOR_TAGS = [
  'ورود عجولانه',
  'عدم رعایت حد ضرر',
  'نقدشوندگی ضعیف',
  'تمرکز بیش از حد',
  'ورود هیجانی / کانال',
  'طبق برنامه و داده'
] as const;

export function analyzeMonthlyJournal(entries: readonly IranJournalEntry[], monthPrefix?: string): MonthlyJournalReview {
  const target = monthPrefix ? entries.filter((e) => e.date.startsWith(monthPrefix)) : [...entries];
  const closed = target.filter((e) => e.outcome !== 'open');
  const wins = closed.filter((e) => e.outcome === 'win');
  const totalPnlRial = closed.reduce((s, e) => s + (e.pnlRial ?? 0), 0);
  const winRatePct = closed.length > 0 ? Number(((wins.length / closed.length) * 100).toFixed(1)) : null;

  const detectedPatterns: MonthlyJournalReview['detectedPatterns'] = [];

  const ignoredRisk = target.filter((e) => e.riskManagerStatus === 'rejected');
  if (ignoredRisk.length > 0) {
    detectedPatterns.push({
      code: 'ignored_risk_manager',
      severity: 'loss',
      titleFa: 'نادیده گرفتن حکم رد مدیر ریسک',
      detailFa: `${ignoredRisk.length} معامله با وجود رد شدن توسط مدیر ریسک ثبت شده است.`
    });
  }

  const incompleteChecklist = target.filter((e) => !e.checklistPassed);
  if (incompleteChecklist.length > 0) {
    detectedPatterns.push({
      code: 'incomplete_checklist',
      severity: 'warn',
      titleFa: 'ورود بدون تکمیل چک‌لیست ۱۱ موردی',
      detailFa: `در ${incompleteChecklist.length} مورد، پیش از تصمیم تمام شرایط چک‌لیست تأیید نشده بود.`
    });
  }

  const tagCount = (t: string) => target.filter((e) => e.tags.includes(t)).length;
  const stopViolations = tagCount('عدم رعایت حد ضرر');
  if (stopViolations > 0) {
    detectedPatterns.push({
      code: 'stop_violation',
      severity: 'loss',
      titleFa: 'عدم رعایت حد ضرر',
      detailFa: `در ${stopViolations} معامله حد ضرر رعایت نشده است؛ این مهم‌ترین عامل افت سرمایه است.`
    });
  }

  const emotional = tagCount('ورود هیجانی / کانال') + tagCount('ورود عجولانه');
  if (emotional > 0) {
    detectedPatterns.push({
      code: 'emotional_entry',
      severity: 'warn',
      titleFa: 'ورودهای عجولانه یا هیجانی',
      detailFa: `${emotional} معامله با برچسب ورود عجولانه یا هیجانی ثبت شده است.`
    });
  }

  const weakLiq = tagCount('نقدشوندگی ضعیف');
  if (weakLiq > 0) {
    detectedPatterns.push({
      code: 'weak_liquidity',
      severity: 'warn',
      titleFa: 'معامله در شرایط نقدشوندگی ضعیف',
      detailFa: `${weakLiq} معامله در نمادهای با نقدشوندگی ضعیف ثبت شده است.`
    });
  }

  const overConc = tagCount('تمرکز بیش از حد');
  if (overConc > 0) {
    detectedPatterns.push({
      code: 'over_concentration',
      severity: 'warn',
      titleFa: 'تمرکز بیش از اندازه در یک نماد یا صنعت',
      detailFa: `${overConc} مورد تمرکز بیش از سقف ۲۰٪ ثبت شده است.`
    });
  }

  const disciplined = tagCount('طبق برنامه و داده');
  if (disciplined > 0 && ignoredRisk.length === 0) {
    detectedPatterns.push({
      code: 'disciplined_execution',
      severity: 'gain',
      titleFa: 'انضباط معاملاتی مبتنی بر داده',
      detailFa: `${disciplined} معامله به‌طور کامل مطابق برنامه و بر اساس داده ثبت شده است.`
    });
  }

  return {
    monthLabel: monthPrefix ?? 'کل سوابق ثبت‌شده',
    totalEntries: target.length,
    closedEntries: closed.length,
    winRatePct,
    totalPnlRial: Math.round(totalPnlRial),
    detectedPatterns
  };
}
