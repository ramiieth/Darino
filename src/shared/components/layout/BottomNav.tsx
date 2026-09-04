import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CandlestickChart,
  Boxes,
  BookOpen,
  MoreHorizontal,
  LineChart,
  Calculator,
  Percent,
  Radar,
  Repeat,
  Car,
  Home,
  X
} from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { t } from '@/shared/i18n/fa';
import { Sheet } from '@/shared/components/ui/Sheet';

/** ۵ مقصد اصلی — بقیه در «بیشتر» (همه ۹ مقصد موجود، بدون حذف) */
const PRIMARY = [
  { to: '/', label: t('navMarket'), icon: CandlestickChart, end: true },
  { to: '/dashboard', label: t('navDashboard'), icon: LayoutDashboard, end: false },
  { to: '/defi', label: t('navDeFi'), icon: Boxes, end: false },
  { to: '/accounting', label: t('navAccounting'), icon: BookOpen, end: false }
] as const;

/** مقصدهای منوی «بیشتر» */
const MORE = [
  { to: '/simulation', label: t('navSimulation'), icon: LineChart },
  { to: '/calculators', label: 'ماشین‌حساب', icon: Calculator },
  { to: '/pendle', label: 'Pendle', icon: Percent },
  { to: '/boros', label: 'Boros', icon: Radar },
  { to: '/defi-loop', label: 'Yield Loop', icon: Repeat },
  { to: '/vehicle', label: 'خودرو', icon: Car },
  { to: '/realestate', label: 'ملک', icon: Home }
] as const;

/** نوار ناوبری پایین — موبایل (در دسکتاپ سایدبار جایگزین آن است) */
export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav
        aria-label="ناوبری پایین"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line/10 bg-card/95 pb-safe backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 pt-1.5">
          {PRIMARY.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className="relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5"
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute inset-x-2 inset-y-0 rounded-xl bg-accent-soft transition-colors dark:bg-accent/15" />
                  )}
                  <Icon
                    className={cn(
                      'relative z-10 h-5 w-5 transition-colors',
                      isActive ? 'text-accent' : 'text-muted'
                    )}
                  />
                  <span
                    className={cn(
                      'relative z-10 text-[10px] font-bold transition-colors',
                      isActive ? 'text-accent' : 'text-muted'
                    )}
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          ))}

          {/* بیشتر */}
          <button
            onClick={() => setMoreOpen(true)}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            className="relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5"
          >
            <MoreHorizontal
              className={cn('h-5 w-5 transition-colors', moreOpen ? 'text-accent' : 'text-muted')}
            />
            <span
              className={cn('text-[10px] font-bold transition-colors', moreOpen ? 'text-accent' : 'text-muted')}
            >
              بیشتر
            </span>
          </button>
        </div>
      </nav>

      {/* شیت «بیشتر» — همه مقصدهای باقی‌مانده */}
      <Sheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="بیشتر"
      >
        <div className="space-y-1">
          {MORE.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMoreOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-bold transition-colors',
                  isActive ? 'bg-accent-soft text-accent dark:bg-accent/15' : 'text-ink hover:bg-surface-2'
                )
              }
            >
              <Icon className="h-[18px] w-[18px] text-muted" />
              {label}
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen(false)}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-line/10 px-3 py-2.5 text-[12px] font-bold text-muted transition-colors hover:bg-surface-2"
          >
            <X className="h-3.5 w-3.5" />
            بستن
          </button>
        </div>
      </Sheet>
    </>
  );
}
