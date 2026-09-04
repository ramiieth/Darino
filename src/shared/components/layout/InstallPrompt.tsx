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
    <Sheet open={promptVisible} onClose={closePrompt} title={t('installTitle')}>
      <div className="space-y-4">
        <div className="glass-inset flex items-start gap-3 rounded-2xl p-4">
          {isIOS ? (
            <Share className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          ) : (
            <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          )}
          <p className="text-xs font-medium leading-6 text-ink">
            {t('installDescription')}
            {isIOS && <span className="mt-1 block text-muted">{t('installIOSHint')}</span>}
          </p>
        </div>

        {!isIOS && deferredPrompt && (
          <Button size="lg" className="w-full" onClick={handleInstall}>
            <Download className="h-4 w-4" />
            {t('installButton')}
          </Button>
        )}
        {isIOS && (
          <Button size="lg" variant="outline" className="w-full" onClick={closePrompt}>
            {t('close')}
          </Button>
        )}

        {installed && (
          <p className="text-center text-xs font-bold text-positive">
            ✓ {t('installedBadge')}
          </p>
        )}
      </div>
    </Sheet>
  );
}
