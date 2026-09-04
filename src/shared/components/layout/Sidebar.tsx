/**
 * Sidebar — ناوبری دسکتاپ (lg+): جمع‌شونده، کیبوردپذیر، گروه‌بندی‌شده
 * همه ۹ مقصد موجود اپلیکیشن — بدون مقصد جدید
 */
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CandlestickChart,
  LineChart,
  Boxes,
  Calculator,
  Percent,
  BookOpenText,
  Radar,
  Repeat,
  Car,
  Home,
  PanelRightClose,
  PanelRightOpen
} from 'lucide-react';
import { DarinoMark, DarinoWordmark } from '@/shared/components/brand/DarinoLogo';
import { cn } from '@/shared/lib/cn';
import { t } from '@/shared/i18n/fa';
import { useSidebarStore } from '@/shared/store/sidebarStore';

const GROUPS: {
  label: string;
  items: { to: string; label: string; icon: React.ComponentType<{ className?: string }>; end?: boolean }[];
}[] = [
  {
    label: 'نمای کلی',
    items: [
      { to: '/', label: t('navMarket'), icon: CandlestickChart, end: true },
      { to: '/dashboard', label: t('navDashboard'), icon: LayoutDashboard }
    ]
  },
  {
    label: 'تحلیل بازار',
    items: [
      { to: '/defi', label: t('navDeFi'), icon: Boxes },
      { to: '/pendle', label: 'Pendle', icon: Percent },
      { to: '/boros', label: 'Boros', icon: Radar },
      { to: '/defi-loop', label: 'Yield Loop', icon: Repeat }
    ]
  },
  {
    label: 'شبیه‌سازی و ابزار',
    items: [
      { to: '/simulation', label: t('navSimulation'), icon: LineChart },
      { to: '/calculators', label: 'ماشین‌حساب', icon: Calculator },
      { to: '/vehicle', label: 'خودرو', icon: Car },
      { to: '/realestate', label: 'ملک', icon: Home }
    ]
  },
  {
    label: 'دفاتر',
    items: [{ to: '/accounting', label: t('navAccounting'), icon: BookOpenText }]
  }
];

export function Sidebar() {
  const collapsed = useSidebarStore((s) => s.collapsed);
  const toggle = useSidebarStore((s) => s.toggle);
  return (
    <aside
      aria-label="ناوبری اصلی"
      className={cn(
        'fixed inset-y-0 start-0 z-40 hidden flex-col border-e border-line/10 bg-card lg:flex',
        'transition-[width] duration-200 ease-out',
        collapsed ? 'w-[76px]' : 'w-[248px]'
      )}
    >
      {/* برند */}
      <div
        className={cn(
          'flex h-16 shrink-0 items-center gap-2.5 border-b border-line/10 px-4',
          collapsed && 'justify-center px-0'
        )}
      >
        <div className="shrink-0">
          <DarinoMark size={36} />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1 truncate">
            <DarinoWordmark className="h-5" />
          </div>
        )}
      </div>

      {/* ناوبری */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-5">
          {GROUPS.map((g) => (
            <div key={g.label}>
              {!collapsed && (
                <p className="mb-1.5 px-2 text-[10px] font-bold text-muted/70">{g.label}</p>
              )}
              {collapsed && <div className="mx-2 mb-2 border-t border-line/8" />}
              <ul className="space-y-0.5">
                {g.items.map(({ to, label, icon: Icon, end }) => (
                  <li key={to}>
                    <NavLink
                      to={to}
                      end={end}
                      title={collapsed ? label : undefined}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center gap-2.5 rounded-xl text-[12px] font-bold transition-colors',
                          collapsed ? 'justify-center px-0 py-2.5' : 'px-2.5 py-2',
                          isActive
                            ? 'bg-accent-soft text-accent dark:bg-accent/15'
                            : 'text-muted hover:bg-surface-2 hover:text-ink'
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span
                              aria-hidden
                              className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-accent"
                            />
                          )}
                          <Icon
                            className={cn(
                              'h-[18px] w-[18px] shrink-0 transition-colors',
                              isActive ? 'text-accent' : 'text-muted group-hover:text-ink'
                            )}
                          />
                          {!collapsed && (
                            <span className={cn('truncate', isActive && 'text-accent')}>{label}</span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* جمع‌کردن */}
      <div className="shrink-0 border-t border-line/10 p-3">
        <button
          onClick={toggle}
          aria-label={collapsed ? 'باز کردن نوار کناری' : 'جمع کردن نوار کناری'}
          aria-expanded={!collapsed}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12px] font-bold text-muted transition-colors hover:bg-surface-2 hover:text-ink',
            collapsed && 'justify-center px-0'
          )}
        >
          {collapsed ? (
            <PanelRightOpen className="h-[18px] w-[18px]" />
          ) : (
            <>
              <PanelRightClose className="h-[18px] w-[18px]" />
              <span>جمع کردن</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
