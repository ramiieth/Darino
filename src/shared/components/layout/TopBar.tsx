/**
 * TopBar — contextual header.
 *
 *  phones/tablets: sticky, safe-area aware. Shows the brand mark; once the page
 *                  H1 scrolls away the page title slides in (large-title pattern).
 *  desktop (lg+):  slim utility bar (status · install) — navigation and search
 *                  live in the sidebar, the page owns its single H1.
 *
 * The title is presentation only (not a heading) — each page renders one <h1>.
 */
import { Link, useLocation } from 'react-router-dom';
import { Download, Search, Settings, WifiOff } from 'lucide-react';
import { DarinoMark } from '@/shared/components/brand/DarinoLogo';
import { IconButton } from '@/shared/components/ui/Button';
import { useInstallStore } from '@/shared/store/installStore';
import { useShellStore } from '@/shared/store/shellStore';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { cn } from '@/shared/lib/cn';
import { navItemForPath } from './navigation';

export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { pathname } = useLocation();
  const item = navItemForPath(pathname);
  const title = item?.title ?? item?.label ?? 'دارینو';
  const compact = useShellStore((s) => s.compactTitle);
  const openPalette = useShellStore((s) => s.setPaletteOpen);
  const { installed, deferredPrompt, openPrompt } = useInstallStore();
  const online = useOnlineStatus();

  return (
    <header
      className={cn(
        'pt-safe sticky top-0 z-nav border-b bg-canvas/90 backdrop-blur-md transition-colors duration-base lg:hidden',
        compact ? 'border-divider' : 'border-transparent'
      )}
    >
      <div className="flex h-topbar items-center gap-2 px-gutter md:px-6">
        <Link to="/" aria-label="دارینو — صفحه اصلی" className="shrink-0 rounded-field md:hidden">
          <DarinoMark size={28} />
        </Link>
        <p
          aria-hidden={!compact}
          className={cn(
            'min-w-0 flex-1 truncate text-base font-bold text-ink transition-[opacity,transform] duration-base ease-standard',
            compact ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
          )}
        >
          {title}
        </p>

        {!online && (
          <span className="flex shrink-0 items-center gap-1 rounded-control bg-warn/10 px-2 py-1 text-2xs font-semibold text-warn">
            <WifiOff aria-hidden className="h-3.5 w-3.5" />
            آفلاین
          </span>
        )}
        {!installed && deferredPrompt && (
          <IconButton aria-label="نصب برنامه" onClick={openPrompt} className="text-accent">
            <Download className="h-5 w-5" />
          </IconButton>
        )}
        <IconButton aria-label="جستجو" onClick={() => openPalette(true)} className="md:hidden">
          <Search className="h-5 w-5" />
        </IconButton>
        <IconButton aria-label="تنظیمات" onClick={onOpenSettings} className="md:hidden">
          <Settings className="h-5 w-5" />
        </IconButton>
      </div>
    </header>
  );
}

/** Global connectivity notice — sits under the header on every screen */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      className="mx-auto mb-4 flex max-w-content items-center gap-2 rounded-field bg-warn/8 px-3.5 py-2.5 text-xs text-ink"
    >
      <WifiOff aria-hidden className="h-4 w-4 shrink-0 text-warn" />
      <span>
        <span className="font-semibold">آفلاین هستید.</span>{' '}
        <span className="text-muted">آخرین داده‌های ذخیره‌شده نمایش داده می‌شوند و پس از اتصال به‌روز می‌شوند.</span>
      </span>
    </div>
  );
}
