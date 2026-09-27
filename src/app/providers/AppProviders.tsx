import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TopBar, OfflineBanner } from '@/shared/components/layout/TopBar';
import { BottomNav, MoreSheet, NavRail } from '@/shared/components/layout/BottomNav';
import { Sidebar } from '@/shared/components/layout/Sidebar';
import { InstallPromptSheet, useInstallPrompt } from '@/shared/components/layout/InstallPrompt';
import { ToastViewport } from '@/shared/components/ui/ToastViewport';
// overlays closed at startup load on first open (keeps the startup bundle small)
const SettingsSheet = lazy(() => import('@/features/simulation/presentation/SettingsSheet').then((m) => ({ default: m.SettingsSheet })));
const CommandPalette = lazy(() => import('@/shared/components/layout/CommandPalette').then((m) => ({ default: m.CommandPalette })));
import { useSidebarStore } from '@/shared/store/sidebarStore';
import { useShellStore } from '@/shared/store/shellStore';
import { useSettingsStore } from '@/shared/store/settingsStore';
import { useUsdtPolling } from '@/shared/store/usdtStore';
import { useWatchlistStore } from '@/shared/store/watchlistStore';
import { cn } from '@/shared/lib/cn';

/**
 * AppShell — adaptive navigation architecture
 *
 *   < 768   top bar (compact title) + bottom bar + «More» sheet
 *   768+    navigation rail (icons + labels)
 *   1024+   full sidebar (collapsible), no top bar
 *
 * Content column: 20px gutter (reference) → 24 → 32; max 1280, 1440 on ≥1728.
 */
export function AppShell({
  children,
  settingsOpen,
  onOpenSettings,
  onCloseSettings
}: {
  children: React.ReactNode;
  settingsOpen: boolean;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
}) {
  const sidebarCollapsed = useSidebarStore((s) => s.collapsed);
  const paletteOpen = useShellStore((s) => s.paletteOpen);
  const setPaletteOpen = useShellStore((s) => s.setPaletteOpen);
  const hydrate = useSettingsStore((s) => s.hydrate);
  const watchHydrate = useWatchlistStore((s) => s.hydrate);
  const { pathname } = useLocation();
  const firstRoute = useRef(true);
  const closePalette = useCallback(() => setPaletteOpen(false), [setPaletteOpen]);

  useInstallPrompt();

  // نرخ زنده تتر (والکس/بیت‌پین) — تنها مبنای دلار در کل اپ، هر دقیقه
  useUsdtPolling();

  // hydrate settings / watchlist from IndexedDB
  useEffect(() => {
    void hydrate();
    void watchHydrate();
  }, [hydrate, watchHydrate]);

  // Command palette: Ctrl/⌘K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen(!useShellStore.getState().paletteOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPaletteOpen]);

  // Route change: start at the top and move focus to the content (screen readers)
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="min-h-dvh">
      <a href="#main" className="skip-link">
        پرش به محتوای اصلی
      </a>

      <Sidebar onOpenSettings={onOpenSettings} />
      <NavRail onOpenSettings={onOpenSettings} />

      <div className={cn('md:ps-rail', sidebarCollapsed ? 'lg:ps-sidebar-collapsed' : 'lg:ps-sidebar')}>
        <TopBar onOpenSettings={onOpenSettings} />
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-content px-gutter pb-safe-nav pt-4 outline-none md:px-6 md:pb-16 md:pt-6 lg:px-8 lg:pt-10 3xl:max-w-content-wide"
        >
          <OfflineBanner />
          {children}
        </main>
      </div>

      <BottomNav />
      <MoreSheet onOpenSettings={onOpenSettings} />
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsSheet open={settingsOpen} onClose={onCloseSettings} />
        </Suspense>
      )}
      <InstallPromptSheet />
      <ToastViewport />
      {paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette open={paletteOpen} onClose={closePalette} />
        </Suspense>
      )}
    </div>
  );
}

let queryClient: QueryClient | null = null;
export function getQueryClient(): QueryClient {
  if (!queryClient) {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60_000,
          refetchOnWindowFocus: false,
          retry: 1
        }
      }
    });
  }
  return queryClient;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
