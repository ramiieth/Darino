/**
 * پیش‌فرض‌های قابل‌ویرایش ژورنال — هیچ‌کدام از فایل‌های مرجع حذف نشده، فقط عمومی و قابل‌تنظیم شده‌اند:
 *   چک‌لیست چشم‌انداز بازار (زمینه، نگاشت، TPO) از «Trade Plan & Market Outlook»
 *   تگ اشتباه و نقطهٔ قوت و سؤال‌های مرور از «Weekly Review»
 *   تگ «چرا» برای کسی که هنوز ستاپ مشخص ندارد (کشف ستاپ از داده)
 */
import type { JournalSettings } from './types';

export const DEFAULT_WHY_TAGS = [
  'هم‌جهت با روند',
  'خلاف روند',
  'برگشت از کف رنج',
  'برگشت از سقف رنج',
  'شکست سقف',
  'شکست کف',
  'پولبک به ناحیهٔ تقاضا',
  'پولبک به ناحیهٔ عرضه',
  'سوئیپ نقدینگی (SFP)',
  'برگشت به میانگین',
  'فاندینگ افراطی',
  'بعد از خبر',
  'دنبال‌کردن تریدر',
  'از روی حس'
];

export const DEFAULT_MISTAKE_TAGS = [
  'خلاف روند',
  'خارج از برنامه',
  'جابه‌جاکردن استاپ',
  'حجم زیاد',
  'معاملهٔ انتقامی',
  'رد کردن چک‌لیست',
  'ورود زودهنگام',
  'خروج زودهنگام',
  'دنبال‌کردن قیمت (Chase)',
  'بدون بررسی EMA هفتگی ۱۲/۲۵',
  'اهرم بالا',
  'معامله در خستگی'
];

export const DEFAULT_GOOD_TAGS = [
  'فقط ستاپ‌های برنامه',
  'رعایت استاپ',
  'اندازهٔ درست',
  'صبر برای تأیید',
  'رها کردن سودده تا هدف',
  'رد کردن ستاپ بد',
  'پر کردن چک‌لیست',
  'ثبت همهٔ معاملات'
];

export const DEFAULT_CHECKLIST: JournalSettings['checklist'] = [
  { id: 'supply', label: 'نواحی عرضهٔ کلیدی نگاشت شد', group: 'mapping' },
  { id: 'demand', label: 'نواحی تقاضای کلیدی نگاشت شد', group: 'mapping' },
  { id: 'swingHighs', label: 'سقف‌های سوینگ کلیدی', group: 'mapping' },
  { id: 'swingLows', label: 'کف‌های سوینگ کلیدی', group: 'mapping' },
  { id: 'monthlyOpen', label: 'قیمت باز شدن ماه (Monthly Open)', group: 'mapping' },
  { id: 'emaDaily', label: 'EMA روزانهٔ ۱۲/۲۵', group: 'mapping' },
  { id: 'emaWeekly', label: 'EMA هفتگی ۱۲/۲۵', group: 'mapping' },
  { id: 'vah', label: 'VAH کامپوزیت', group: 'tpo' },
  { id: 'val', label: 'VAL کامپوزیت', group: 'tpo' },
  { id: 'poorHighs', label: 'سقف‌های ضعیف (Poor Highs)', group: 'tpo' },
  { id: 'poorLows', label: 'کف‌های ضعیف (Poor Lows)', group: 'tpo' },
  { id: 'singlePrints', label: 'تک‌چاپ‌ها (Single Prints)', group: 'tpo' },
  { id: 'npoc', label: 'NPOCها', group: 'tpo' }
];

export const DEFAULT_QUESTIONS: JournalSettings['questions'] = [
  { id: 'q_lesson', title: 'گران‌ترین اشتباه این هفته چه بود و چقدر هزینه داشت؟', sub: 'یک اشتباه، با عدد.' },
  { id: 'q_skip', title: 'کدام ستاپ را درست رد کردم؟', sub: 'معاملهٔ نگرفته هم تصمیم است.' }
];

export const DEFAULT_SETTINGS: JournalSettings = {
  roles: {},
  accountSize: null,
  maxRiskPct: 1,
  dailyLossPct: 4,
  whyTags: DEFAULT_WHY_TAGS,
  mistakeTags: DEFAULT_MISTAKE_TAGS,
  goodTags: DEFAULT_GOOD_TAGS,
  checklist: DEFAULT_CHECKLIST,
  questions: DEFAULT_QUESTIONS,
  hedge: { minOverlap: 0.6, maxSizeRatio: 1.6 },
  // حساب فارم لایتر روزانه هزاران معامله دارد؛ اجراها فقط برای جفت‌کردن پوشش‌های اخیر لازم‌اند و آمار بلندمدت از سری روزانهٔ لایتر می‌آید
  neutralFillDays: 3
};

/** ادغام تنظیمات ذخیره‌شده با پیش‌فرض‌ها (فیلد تازه در نسخهٔ بعدی گم نمی‌شود) */
export function withDefaults(s: Partial<JournalSettings> | null | undefined): JournalSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...(s ?? {}),
    roles: { ...(s?.roles ?? {}) },
    hedge: { ...DEFAULT_SETTINGS.hedge, ...(s?.hedge ?? {}) }
  };
}
