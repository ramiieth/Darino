/**
 * پنجره نصب سفارشی PWA:
 *  - مرورگرهای پشتیبان: از beforeinstallprompt (نصب واقعی)
 *  - iOS: راهنمای «Add to Home Screen»
 */
import { useEffect } from 'react';
import { Sheet } from '@/shared/components/ui/Sheet';
import { Button } from '@/shared/components/ui/Button';
import { useInstallStore } from '@/shared/store/installStore';
import { t } from '@/shared/i18n/fa';
import { Share, Download, Smartphone } from 'lucide-react';

export function useInstallPrompt(): void {
  const setDeferredPrompt = useInstallStore((s) => s.setDeferredPrompt);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      useInstallStore.getState().setInstalled(true);
      useInstallStore.getState().closePrompt();
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [setDeferredPrompt]);
}

export function InstallPromptSheet() {
  const { promptVisible, closePrompt, deferredPrompt, installed, setInstalled, setDeferredPrompt } =
    useInstallStore();

  const isIOS =
    typeof window !== 'undefined' &&
    (/iphone|ipad|ipod/i.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const handleInstall = async () => {
    const prompt = deferredPrompt as (Event & { prompt?: () => Promise<void> }) | null;
    if (prompt?.prompt) {
      await prompt.prompt();
      const choice = await (prompt as unknown as { userChoice?: Promise<{ outcome: string }> })
        .userChoice;
      if (choice?.outcome === 'accepted') {
        setInstalled(true);
      }
      setDeferredPrompt(null);
    }
    closePrompt();
  };

  return (
    <Sheet open={promptVisible} onClose={closePrompt} title={t('installTitle')} size="sm">
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field bg-accent-soft text-accent">
            {isIOS ? <Share className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />}
          </span>
          <div className="text-sm leading-6 text-ink">
            <p>{t('installDescription')}</p>
            {isIOS && <p className="mt-1 text-muted">{t('installIOSHint')}</p>}
          </div>
        </div>
        <ul className="space-y-1.5 text-sm text-muted">
          <li>• اجرای تمام‌صفحه، بدون نوار مرورگر</li>
          <li>• نمایش آخرین داده‌های ذخیره‌شده در حالت آفلاین</li>
          <li>• باز شدن سریع از صفحه اصلی دستگاه</li>
        </ul>

        {!isIOS && deferredPrompt && (
          <Button size="lg" className="w-full" icon={<Download />} onClick={handleInstall}>
            {t('installButton')}
          </Button>
        )}
        {(isIOS || !deferredPrompt) && (
          <Button size="lg" variant="outline" className="w-full" onClick={closePrompt}>
            {t('close')}
          </Button>
        )}
        {installed && <p className="text-center text-sm font-semibold text-positive">{t('installedBadge')}</p>}
      </div>
    </Sheet>
  );
}
