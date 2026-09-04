import { Settings, Sun, Moon, Download, Search } from 'lucide-react';
import { DarinoMark } from '@/shared/components/brand/DarinoLogo';
import { useThemeStore } from '@/shared/store/themeStore';
import { useInstallStore } from '@/shared/store/installStore';
import { t } from '@/shared/i18n/fa';
import { cn } from '@/shared/lib/cn';

/**
 * هدر اپ — موبایل: نوار چسبان ساده با حاشیه ظریف (بدون پیل شیشه‌ای)
 * دسکتاپ: هدر محتوا در کنار سایدبار (lg+)
 */
export function TopBar({
  onOpenSettings,
  onOpenPalette,
  title
}: {
  onOpenSettings: () => void;
  onOpenPalette?: () => void;
  title: string;
}) {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const { installed, openPrompt } = useInstallStore();

  const showInstall = !installed;
  const handleInstall = showInstall ? openPrompt : undefined;

  const actionBtn =
    'flex h-9 w-9 items-center justify-center rounded-xl border border-line/10 bg-card text-ink shadow-card transition-colors hover:bg-surface-2 active:scale-[0.97]';

  return (
    <header
      className={cn(
        'pt-safe sticky top-0 z-40 border-b border-line/10 bg-surface/85 backdrop-blur-md',
        'lg:relative lg:z-30 lg:border-b-0 lg:bg-transparent lg:pt-0 lg:backdrop-blur-none'
      )}
    >
      <div className="flex h-14 items-center justify-between gap-2 px-4 lg:h-16 lg:px-8">
        {/* برند + عنوان */}
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="shrink-0 lg:hidden">
            <DarinoMark size={32} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-extrabold text-ink">{title}</h1>
            <p className="hidden truncate text-[11px] font-medium text-muted sm:block">
              {t('appTagline')}
            </p>
          </div>
        </div>

        {/* اقدامات */}
        <div className="flex shrink-0 items-center gap-1.5 lg:gap-2">
          {handleInstall && (
            <button
              onClick={handleInstall}
              className="flex h-9 items-center gap-1.5 rounded-xl bg-accent px-3 text-[11px] font-bold text-white shadow-accent transition-all hover:opacity-90 active:scale-[0.97]"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('installButton')}</span>
            </button>
          )}
          <button
            onClick={onOpenPalette}
            aria-label={t('paletteOpen')}
            title={t('paletteOpen')}
            className={actionBtn}
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            onClick={toggle}
            aria-label="تغییر تم"
            title="تغییر تم"
            className={actionBtn}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={onOpenSettings}
            aria-label={t('settings')}
            title={t('settings')}
            className={actionBtn}
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
