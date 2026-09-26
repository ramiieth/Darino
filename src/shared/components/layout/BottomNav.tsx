/**
 * Compact navigation surfaces
 *
 *   BottomNav  phones (< md): 4 primary destinations + «بیشتر», thumb zone,
 *              safe-area aware
 *   NavRail    tablets (md – lg): every destination as icon + label, vertical
 *   MoreSheet  the rest of the product, grouped by goal, plus utilities
 */
import { Link, useLocation } from 'react-router-dom';
import { Download, MoreHorizontal, Moon, Search, Settings, Sun } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { Sheet } from '@/shared/components/ui/Sheet';
import { DarinoMark } from '@/shared/components/brand/DarinoLogo';
import { useShellStore } from '@/shared/store/shellStore';
import { useThemeStore } from '@/shared/store/themeStore';
import { useInstallStore } from '@/shared/store/installStore';
import {
  DESIGN_SYSTEM_ITEM,
  NAV_GROUPS,
  PRIMARY_MOBILE,
  isItemActive,
  navItemForPath,
  type NavItem
} from './navigation';

/* ================= Bottom bar (phones) ================= */

function BarItem({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 pt-2"
    >
      <span
        className={cn(
          'flex h-7 w-14 items-center justify-center rounded-full transition-colors duration-fast',
          active ? 'bg-accent-soft text-accent' : 'text-muted'
        )}
      >
        <Icon aria-hidden className="h-5 w-5" />
      </span>
      <span className={cn('truncate text-2xs font-semibold', active ? 'text-ink' : 'text-muted')}>{item.label}</span>
    </Link>
  );
}

export function BottomNav() {
  const { pathname } = useLocation();
  const moreOpen = useShellStore((s) => s.moreOpen);
  const setMoreOpen = useShellStore((s) => s.setMoreOpen);
  const current = navItemForPath(pathname);
  const inMore = !!current && !PRIMARY_MOBILE.some((i) => i.id === current.id);

  return (
    <nav
      aria-label="ناوبری اصلی"
      className="fixed inset-x-0 bottom-0 z-nav h-safe-nav border-t border-divider bg-card/95 pb-safe backdrop-blur-md md:hidden"
    >
      <div className="mx-auto flex h-16 max-w-lg items-stretch px-1">
        {PRIMARY_MOBILE.map((item) => (
          <BarItem key={item.id} item={item} active={isItemActive(item, pathname)} />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 pt-2"
        >
          <span
            className={cn(
              'flex h-7 w-14 items-center justify-center rounded-full transition-colors',
              inMore || moreOpen ? 'bg-accent-soft text-accent' : 'text-muted'
            )}
          >
            <MoreHorizontal aria-hidden className="h-5 w-5" />
          </span>
          <span className={cn('text-2xs font-semibold', inMore ? 'text-ink' : 'text-muted')}>
            {inMore && current ? current.label : 'بیشتر'}
          </span>
        </button>
      </div>
    </nav>
  );
}

/* ================= Navigation rail (tablets) ================= */

export function NavRail({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { pathname } = useLocation();
  const openPalette = useShellStore((s) => s.setPaletteOpen);
  const items = NAV_GROUPS.flatMap((g) => g.items);

  return (
    <aside
      aria-label="ناوبری اصلی"
      className="fixed inset-y-0 start-0 z-nav hidden w-rail flex-col items-center border-e border-divider bg-card pt-safe md:flex lg:hidden"
    >
      <Link to="/" aria-label="دارینو — صفحه اصلی" className="mt-3 flex h-12 w-12 items-center justify-center rounded-field">
        <DarinoMark size={30} />
      </Link>
      <button
        type="button"
        onClick={() => openPalette(true)}
        aria-label="جستجو و فرمان‌ها"
        className="mt-2 flex h-10 w-10 items-center justify-center rounded-field text-muted hover:bg-surface-2 hover:text-ink"
      >
        <Search className="h-5 w-5" />
      </button>
      <nav aria-label="بخش‌ها" className="no-scrollbar mt-2 w-full min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <ul className="space-y-1">
          {items.map((item) => {
            const active = isItemActive(item, pathname);
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <Link
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className="group flex flex-col items-center gap-1 rounded-field py-1.5"
                >
                  <span
                    className={cn(
                      'flex h-8 w-12 items-center justify-center rounded-full transition-colors',
                      active ? 'bg-accent-soft text-accent' : 'text-muted group-hover:bg-surface-2 group-hover:text-ink'
                    )}
                  >
                    <Icon aria-hidden className="h-5 w-5" />
                  </span>
                  <span
                    className={cn(
                      'w-full truncate text-center text-2xs font-semibold',
                      active ? 'text-ink' : 'text-muted'
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="w-full shrink-0 border-t border-divider px-2 py-2 pb-[calc(0.5rem+var(--safe-bottom))]">
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="تنظیمات"
          className="mx-auto flex h-10 w-10 items-center justify-center rounded-field text-muted hover:bg-surface-2 hover:text-ink"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>
    </aside>
  );
}

/* ================= «More» sheet (phones) ================= */

export function MoreSheet({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { pathname } = useLocation();
  const open = useShellStore((s) => s.moreOpen);
  const setOpen = useShellStore((s) => s.setMoreOpen);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const installed = useInstallStore((s) => s.installed);
  const openInstall = useInstallStore((s) => s.openPrompt);
  const close = () => setOpen(false);

  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !PRIMARY_MOBILE.some((p) => p.id === i.id))
  })).filter((g) => g.items.length > 0);

  const utility = 'flex h-11 flex-1 items-center justify-center gap-2 rounded-field bg-surface-2 text-sm font-semibold text-ink [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-muted';

  return (
    <Sheet open={open} onClose={close} title="همه بخش‌ها">
      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g.id} aria-label={g.label}>
            <p className="mb-1 text-xs font-semibold text-subtle">{g.label}</p>
            <ul className="divide-y divide-divider">
              {g.items.map((item) => {
                const active = isItemActive(item, pathname);
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <Link
                      to={item.to}
                      onClick={close}
                      aria-current={active ? 'page' : undefined}
                      className="flex items-center gap-3 py-3"
                    >
                      <span
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-field',
                          active ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'
                        )}
                      >
                        <Icon aria-hidden className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-sm font-semibold', active ? 'text-accent' : 'text-ink')}>
                          {item.label}
                        </span>
                        <span className="block truncate text-xs text-muted">{item.description}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <div className="flex gap-2">
          <button type="button" onClick={toggleTheme} className={utility}>
            {theme === 'dark' ? <Sun /> : <Moon />}
            {theme === 'dark' ? 'تم روشن' : 'تم تیره'}
          </button>
          <button
            type="button"
            onClick={() => {
              close();
              onOpenSettings();
            }}
            className={utility}
          >
            <Settings />
            تنظیمات
          </button>
        </div>
        {!installed && (
          <button
            type="button"
            onClick={() => {
              close();
              openInstall();
            }}
            className={cn(utility, 'w-full')}
          >
            <Download />
            نصب دارینو روی دستگاه
          </button>
        )}
        <Link to={DESIGN_SYSTEM_ITEM.to} onClick={close} className="block text-center text-xs font-semibold text-muted underline-offset-4 hover:underline">
          {DESIGN_SYSTEM_ITEM.label}
        </Link>
      </div>
    </Sheet>
  );
}
