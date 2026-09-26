/**
 * Sidebar — desktop navigation (≥ lg). Collapsible to an 80px rail.
 * Groups by user goal; utilities (search, theme, settings) live in the footer.
 */
import { Link, useLocation } from 'react-router-dom';
import { Download, Moon, PanelRightClose, PanelRightOpen, Search, Settings, Sun } from 'lucide-react';
import { useInstallStore } from '@/shared/store/installStore';
import { DarinoMark, DarinoWordmark } from '@/shared/components/brand/DarinoLogo';
import { cn } from '@/shared/lib/cn';
import { useSidebarStore } from '@/shared/store/sidebarStore';
import { useThemeStore } from '@/shared/store/themeStore';
import { useShellStore } from '@/shared/store/shellStore';
import { DESIGN_SYSTEM_ITEM, NAV_GROUPS, isItemActive, type NavItem } from './navigation';

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { pathname } = useLocation();
  const active = isItemActive(item, pathname);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        'group flex h-10 items-center gap-3 rounded-field text-sm font-semibold transition-colors duration-fast',
        collapsed ? 'justify-center px-0' : 'px-3',
        active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-ink'
      )}
    >
      <Icon aria-hidden className={cn('h-5 w-5 shrink-0', active ? 'text-accent' : 'text-subtle group-hover:text-ink')} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {collapsed && <span className="sr-only">{item.label}</span>}
    </Link>
  );
}

function FooterButton({
  onClick,
  icon,
  label,
  collapsed,
  expanded
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      title={collapsed ? label : undefined}
      className={cn(
        'flex h-10 w-full items-center gap-3 rounded-field text-sm font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-ink [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-subtle',
        collapsed ? 'justify-center' : 'px-3'
      )}
    >
      {icon}
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}

export function Sidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const collapsed = useSidebarStore((s) => s.collapsed);
  const toggle = useSidebarStore((s) => s.toggle);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const openPalette = useShellStore((s) => s.setPaletteOpen);
  const { installed, deferredPrompt, openPrompt } = useInstallStore();

  return (
    <aside
      aria-label="ناوبری اصلی"
      className={cn(
        'fixed inset-y-0 start-0 z-nav hidden flex-col border-e border-divider bg-card lg:flex',
        'transition-[width] duration-base ease-standard',
        collapsed ? 'w-sidebar-collapsed' : 'w-sidebar'
      )}
    >
      {/* Brand */}
      <div className={cn('flex h-16 shrink-0 items-center gap-2.5', collapsed ? 'justify-center' : 'px-5')}>
        <Link to="/" aria-label="دارینو — صفحه اصلی" className="flex items-center gap-2.5 rounded-field">
          <DarinoMark size={32} />
          {!collapsed && <DarinoWordmark className="text-lg" />}
        </Link>
      </div>

      {/* Search */}
      <div className={cn('shrink-0 pb-2', collapsed ? 'px-3' : 'px-4')}>
        <button
          type="button"
          onClick={() => openPalette(true)}
          aria-label="جستجو و فرمان‌ها (Ctrl+K)"
          className={cn(
            'flex h-10 w-full items-center gap-2 rounded-field border border-divider bg-canvas text-sm text-subtle transition-colors hover:border-divider-strong hover:text-muted',
            collapsed ? 'justify-center' : 'px-3'
          )}
        >
          <Search aria-hidden className="h-4 w-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-start">جستجو…</span>
              <kbd dir="ltr" className="rounded-control border border-divider bg-card px-1.5 text-2xs font-semibold text-muted">
                Ctrl K
              </kbd>
            </>
          )}
        </button>
      </div>

      {/* Destinations */}
      <nav aria-label="بخش‌ها" className={cn('min-h-0 flex-1 overflow-y-auto pb-4', collapsed ? 'px-3' : 'px-4')}>
        {NAV_GROUPS.map((g) => (
          <div key={g.id} className="mt-4 first:mt-2">
            {collapsed ? (
              <div className="mx-2 mb-2 border-t border-divider" aria-hidden />
            ) : (
              <p className="mb-1 px-3 text-xs font-semibold text-subtle">{g.label}</p>
            )}
            <ul className="space-y-0.5">
              {g.items.map((item) => (
                <li key={item.id}>
                  <SidebarLink item={item} collapsed={collapsed} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Utilities */}
      <div className={cn('shrink-0 space-y-0.5 border-t border-divider py-3', collapsed ? 'px-3' : 'px-4')}>
        {!installed && deferredPrompt && (
          <FooterButton onClick={openPrompt} icon={<Download />} label="نصب برنامه" collapsed={collapsed} />
        )}
        <SidebarLink item={DESIGN_SYSTEM_ITEM} collapsed={collapsed} />
        <FooterButton
          onClick={toggleTheme}
          icon={theme === 'dark' ? <Sun /> : <Moon />}
          label={theme === 'dark' ? 'تم روشن' : 'تم تیره'}
          collapsed={collapsed}
        />
        <FooterButton onClick={onOpenSettings} icon={<Settings />} label="تنظیمات" collapsed={collapsed} />
        <FooterButton
          onClick={toggle}
          icon={collapsed ? <PanelRightOpen /> : <PanelRightClose />}
          label={collapsed ? 'باز کردن نوار کناری' : 'جمع کردن نوار کناری'}
          collapsed={collapsed}
          expanded={!collapsed}
        />
      </div>
    </aside>
  );
}
