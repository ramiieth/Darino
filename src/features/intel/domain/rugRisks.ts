/**
 * نام ریسک‌های RugCheck به فارسی — گزارش خام انگلیسی است و چند ریسکش یک چیز را تکرار می‌کنند
 * (تمرکز هولدرها با سه نام). نام ناشناخته همان‌طور می‌ماند. Pure.
 */

const FA: Record<string, string> = {
  'top 10 holders high ownership': 'تمرکز بالای ۱۰ هولدر بزرگ',
  'single holder ownership': 'یک کیف پول سهم بزرگی دارد',
  'high ownership': 'تمرکز مالکیت بالا',
  'high holder correlation': 'هولدرهای به‌هم‌مرتبط (احتمال یک گروه)',
  'low liquidity': 'نقدینگی کم',
  'low amount of lp providers': 'تأمین‌کنندهٔ نقدینگی کم',
  'large amount of lp unlocked': 'بیشتر نقدینگی قفل نیست',
  'lp unlocked': 'نقدینگی قفل نیست',
  'mutable metadata': 'مشخصات توکن قابل تغییر است',
  'freeze authority still enabled': 'فریز باز است',
  'mint authority still enabled': 'مینت باز است',
  'copycat token': 'توکن تقلبی (کپی نام دیگری)',
  'creator history of rugged tokens': 'سازنده سابقهٔ rug دارد',
  'rugged': 'rug شده',
  'transfer fee': 'کارمزد انتقال دارد',
  'permanent delegate': 'دسترسی دائمی انتقال برای سازنده',
  'unknown platform': 'پلتفرم ناشناخته'
};

/** ریسک‌هایی که با «۱۰ هولدر بزرگ X٪» تکراری‌اند */
export const HOLDER_CONCENTRATION = new Set(['top 10 holders high ownership', 'high ownership', 'single holder ownership']);

export const rugKey = (name: string) => name.trim().toLowerCase();
export const rugRiskFa = (name: string) => FA[rugKey(name)] ?? name;
