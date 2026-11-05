/**
 * SectionTabs — نوار بخش‌های یک «بخش اصلی» که چند صفحه دارد (درآمد فاندینگ، حساب‌های صرافی، بازار، شبیه‌سازی)
 *
 *   هر گزینه یک لینک واقعی است (نه state)، پس نشانی‌های قدیمی، دکمهٔ برگشت PWA و لینک اعلان‌ها کار می‌کنند
 *   و صفحه‌ها کد خودشان را نگه می‌دارند. گزینهٔ فعال با مسیر و (در صورت تعریف) پارامتر tab سنجیده می‌شود.
 */
import { Link, useLocation } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface SectionTab {
  /** مسیر، با پارامتر tab اختیاری: /funding?tab=run */
  to: string;
  label: string;
  icon?: ReactNode;
}

export function isSectionTabActive(tab: SectionTab, pathname: string, search: string, all: readonly SectionTab[]): boolean {
  const [path, query] = tab.to.split('?');
  if (pathname !== path) return false;
  const want = new URLSearchParams(query ?? '').get('tab');
  const have = new URLSearchParams(search).get('tab');
  if (want) return have === want;
  // گزینهٔ بدون tab فعال است مگر گزینهٔ دیگری روی همین مسیر با tab فعلی جور باشد
  return !all.some((t) => t !== tab && t.to.startsWith(`${path}?`) && new URLSearchParams(t.to.split('?')[1]).get('tab') === have);
}

export function SectionTabs({ tabs, label, className }: { tabs: readonly SectionTab[]; label: string; className?: string }) {
  const { pathname, search } = useLocation();
  return (
    <nav aria-label={label} className={cn('no-scrollbar -mx-1 flex items-center gap-1 overflow-x-auto px-1', className)}>
      {tabs.map((t) => {
        const active = isSectionTabActive(t, pathname, search, tabs);
        return (
          <Link
            key={t.to}
            to={t.to}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-xs font-semibold transition-colors duration-fast [&_svg]:h-3.5 [&_svg]:w-3.5',
              active ? 'border-accent bg-accent-soft text-accent' : 'border-divider bg-card text-muted hover:border-divider-strong hover:text-ink'
            )}
          >
            {t.icon}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/* ---------------- بخش‌های چندصفحه‌ای ---------------- */

export const FUNDING_TABS: readonly SectionTab[] = [
  { to: '/funding', label: 'فرصت‌ها' },
  { to: '/funding?tab=decide', label: 'سود خالص و تصمیم' },
  { to: '/funding?tab=run', label: 'اجرا و پایش' },
  { to: '/funding?tab=ledger', label: 'دفتر جفت‌ها' },
  { to: '/boros', label: 'نرخ ثابت (بوروس)' },
  { to: '/carry-lab', label: 'بک‌تست و بات' }
];

export const VENUE_TABS: readonly SectionTab[] = [
  { to: '/lighter', label: 'لایتر' },
  { to: '/lighter-robinhood', label: 'لایتر رابین‌هود' },
  { to: '/arcus', label: 'آرکوس' },
  { to: '/txflow', label: 'تی‌اکس‌فلو' },
  { to: '/ondo-perps', label: 'اوندو پرپس' }
];

export const MARKET_TABS: readonly SectionTab[] = [
  { to: '/', label: 'قیمت‌ها' },
  { to: '/market-performance', label: 'بازده ۱ تا ۹۰ روز' }
];

export const SIMULATION_TABS: readonly SectionTab[] = [
  { to: '/simulation', label: 'با تاریخچهٔ بازار' },
  { to: '/simulation/compare', label: 'سرمایهٔ یکسان در چند دارایی' }
];

const LAST_VENUE_KEY = 'darino:last-venue';

/** آخرین صرافی بازشده (فقط راحتی همین دستگاه) */
export function rememberVenue(path: string): void {
  try {
    if (VENUE_TABS.some((t) => t.to === path)) localStorage.setItem(LAST_VENUE_KEY, path);
  } catch {
    /* حالت خصوصی */
  }
}

export function lastVenue(): string {
  try {
    const v = localStorage.getItem(LAST_VENUE_KEY);
    if (v && VENUE_TABS.some((t) => t.to === v)) return v;
  } catch {
    /* حالت خصوصی */
  }
  return VENUE_TABS[0].to;
}

/** نوار صرافی‌ها در بالای هر صفحهٔ حساب صرافی؛ صرافی بازشده برای «حساب‌های صرافی» به خاطر سپرده می‌شود */
export function VenueTabs() {
  const { pathname } = useLocation();
  useEffect(() => rememberVenue(pathname), [pathname]);
  return <SectionTabs tabs={VENUE_TABS} label="صرافی‌ها" />;
}
