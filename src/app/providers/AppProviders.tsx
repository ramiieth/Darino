import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TopBar } from '@/shared/components/layout/TopBar';
import { BottomNav } from '@/shared/components/layout/BottomNav';
import { Sidebar } from '@/shared/components/layout/Sidebar';
import { AmbientBackground } from '@/shared/components/layout/Page';
import { InstallPromptSheet, useInstallPrompt } from '@/shared/components/layout/InstallPrompt';
import { CommandPalette } from '@/shared/components/layout/CommandPalette';
import { ToastViewport } from '@/shared/components/ui/ToastViewport';
import { SettingsSheet } from '@/features/simulation/presentation/SettingsSheet';
import { useSidebarStore } from '@/shared/store/sidebarStore';
import { t } from '@/shared/i18n/fa';
import { useSettingsStore } from '@/shared/store/settingsStore';
import { useFxStore } from '@/shared/store/fxStore';
import { useWatchlistStore } from '@/shared/store/watchlistStore';

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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const sidebarCollapsed = useSidebarStore((s) => s.collapsed);
  const hydrate = useSettingsStore((s) => s.hydrate);
  const fxHydrate = useFxStore((s) => s.hydrate);
  const watchHydrate = useWatchlistStore((s) => s.hydrate);

  useInstallPrompt();

  // هیدراته‌کردن تنظیمات/نرخ ارز/watchlist از IndexedDB
  useEffect(() => {
    void hydrate();
    void fxHydrate();
    void watchHydrate();
  }, [hydrate, fxHydrate, watchHydrate]);

  // Command Palette: Ctrl/⌘K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pageTitle =
    window.location.hash.includes('dashboard')
      ? t('appShortName')
      : window.location.hash.includes('simulation')
      ? t('simTitle')
      : window.location.hash.includes('market')
        ? t('marketTitle')
        : window.location.hash.includes('defi')
          ? t('defiTitle')
          : window.location.hash.includes('vehicle')
            ? 'سرمایه‌گذاری خودرو'
            : window.location.hash.includes('realestate')
            ? 'سرمایه‌گذاری ملک'
            : window.location.hash.includes('calculators')
            ? 'ماشین‌حساب سرمایه‌گذاری'
            : window.location.hash.includes('providers')
              ? 'Providers و Markets'
              : window.location.hash.includes('hyperliquid')
                ? 'Hyperliquid Watch Only'
                : t('appShortName');

  return (
    <div className="min-h-dvh">
      <a href="#main" className="skip-link">
        پرش به محتوای اصلی
      </a>
      <AmbientBackground />

      {/* سایدبار دسکتاپ — جمع‌شونده (فقط lg+) */}
      <Sidebar />

      {/* محتوای اصلی — در دسکتاپ با فاصله از سایدبار (RTL: start = راست) */}
      <div className={sidebarCollapsed ? 'lg:ps-[76px]' : 'lg:ps-[248px]'}>
        <TopBar
          title={pageTitle}
          onOpenSettings={onOpenSettings}
          onOpenPalette={() => setPaletteOpen(true)}
        />

        <main
          id="main"
          tabIndex={-1}
          className="relative z-10 mx-auto w-full max-w-lg px-4 pb-safe-nav pt-4 outline-none md:max-w-3xl md:px-6 lg:max-w-5xl lg:px-8 lg:pb-12"
        >
          {children}
        </main>
      </div>

      <BottomNav />
      <SettingsSheet open={settingsOpen} onClose={onCloseSettings} />
      <InstallPromptSheet />
      <ToastViewport />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
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
