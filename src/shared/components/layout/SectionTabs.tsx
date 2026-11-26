/**
 * SectionTabs — نوار بخش‌های یک «بخش اصلی» که چند صفحه دارد (درآمد فاندینگ، حساب‌های صرافی، بازار، شبیه‌سازی)
 *
 *   هر گزینه یک لینک واقعی است (نه state)، پس نشانی‌های قدیمی، دکمهٔ برگشت PWA و لینک اعلان‌ها کار می‌کنند
 *   و صفحه‌ها کد خودشان را نگه می‌دارند. گزینهٔ فعال با مسیر و (در صورت تعریف) پارامتر tab سنجیده می‌شود.
 */
import { Link, useLocation } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';
import { Coins, FlaskConical, History, Lock, Radar, Scale, Zap } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

export interface SectionTab {
  /** مسیر، با پارامتر tab اختیاری: /funding?tab=run */
  to: string;
  label: string;
  icon?: ReactNode;
  /** پارامترهای tab قدیمی که همچنان باید این تب را فعال نشان دهند */
  matchTabs?: readonly string[];
}

export function isSectionTabActive(tab: SectionTab, pathname: string, search: string, all: readonly SectionTab[]): boolean {
  const [path, query] = tab.to.split('?');
  if (pathname !== path) return false;
  const want = new URLSearchParams(query ?? '').get('tab');
  const have = new URLSearchParams(search).get('tab');
  if (have && tab.matchTabs?.includes(have)) return true;
  if (want) return have === want;
  // گزینهٔ بدون tab فعال است مگر گزینهٔ دیگری روی همین مسیر با tab فعلی جور باشد
  return !all.some((t) => {
    if (t === tab) return false;
    const [tPath, tQuery] = t.to.split('?');
    if (tPath !== path) return false;
    if (have && t.matchTabs?.includes(have)) return true;
    const tWant = new URLSearchParams(tQuery ?? '').get('tab');
    return !!tWant && tWant === have;
  });
}

export function SectionTabs({ tabs, label, className }: { tabs: readonly SectionTab[]; label: string; className?: string }) {
  const { pathname, search } = useLocation();
  return (
    <nav
      aria-label={label}
      className={cn(
        'no-scrollbar flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-divider/80 bg-surface-2/60 p-1.5',
        className
      )}
    >
      {tabs.map((t) => {
        const active = isSectionTabActive(t, pathname, search, tabs);
        return (
          <Link
            key={t.to}
            to={t.to}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-xs font-semibold transition-all duration-150 [&_svg]:h-3.5 [&_svg]:w-3.5',
              active
                ? 'bg-card text-accent shadow-sm ring-1 ring-divider/80'
                : 'text-muted hover:bg-card/60 hover:text-ink'
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
  { to: '/funding', label: 'فرصت و سود', icon: <Radar aria-hidden />, matchTabs: ['decide'] },
  { to: '/funding?tab=run', label: 'اجرا و دفتر', icon: <Zap aria-hidden />, matchTabs: ['ledger'] },
  { to: '/boros', label: 'نرخ ثابت (بوروس)', icon: <Lock aria-hidden /> },
  { to: '/carry-lab', label: 'بک‌تست و بات', icon: <FlaskConical aria-hidden /> }
];

export const VENUE_TABS: readonly SectionTab[] = [
  { to: '/lighter', label: 'لایتر', icon: <img src="/logos/platform-lighter.png" alt="" className="h-4 w-4 rounded-full object-cover" /> },
  { to: '/lighter-robinhood', label: 'لایتر رابین‌هود', icon: <img src="/logos/platform-lighter.png" alt="" className="h-4 w-4 rounded-full object-cover" /> },
  { to: '/arcus', label: 'آرکوس', icon: <img src="/logos/platform-arcus.png" alt="" className="h-4 w-4 rounded-full object-cover" /> },
  { to: '/txflow', label: 'تی‌اکس‌فلو', icon: <img src="/logos/platform-txflow.png" alt="" className="h-4 w-4 rounded-full object-cover" /> },
  { to: '/variational', label: 'وریشنال', icon: <img src="/logos/platform-variational.png" alt="" className="h-4 w-4 rounded-full object-cover" /> },
  { to: '/ondo-perps', label: 'اوندو پرپس', icon: <img src="/logos/platform-ondo.png" alt="" className="h-4 w-4 rounded-full object-cover" /> }
];

export const MARKET_TABS: readonly SectionTab[] = [
  { to: '/', label: 'قیمت‌ها' },
  { to: '/market-performance', label: 'بازده ۱ تا ۹۰ روز' }
];

export const SIMULATION_TABS: readonly SectionTab[] = [
  { to: '/simulation', label: 'تاریخچهٔ بازار', icon: <History aria-hidden /> },
  { to: '/simulation/compare', label: 'مقایسه چند دارایی', icon: <Scale aria-hidden /> },
  { to: '/simulation/stable', label: 'دلار بازده‌دار به‌جای تتر', icon: <Coins aria-hidden /> }
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
