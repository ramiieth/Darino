/**
 * AuthGate — صفحه‌های «دارایی من» فقط پس از ورود با کلید عبور
 *  • این گارد فقط رابط است؛ کنترل دسترسی واقعی روی سرور (requireSession) انجام می‌شود.
 *  • آفلاین: اگر آخرین بار وارد بوده‌اید، دادهٔ محلی با برچسب «آفلاین» نمایش داده می‌شود.
 *  • سرور بدون پایگاه داده (توسعهٔ محلی): حالت فقط‌محلی با هشدار.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Fingerprint, KeyRound, Link2, ShieldCheck } from 'lucide-react';
import { Page } from '@/shared/components/layout/Page';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input } from '@/shared/components/ui/Input';
import { Notice } from '@/shared/components/ui/StateViews';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { PageSkeleton } from '@/shared/components/ui/Skeleton';
import { authErrorText, loginWithPasskey, registerPasskey, useAuth, webAuthnSupported } from './authClient';

export function AuthGate({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status);
  if (status === 'unknown') return <PageSkeleton label="بررسی ورود" />;
  if (status === 'authenticated') return <>{children}</>;
  if (status === 'offline')
    return (
      <>
        <div className="px-gutter pt-3 md:px-8">
          <Notice tone="stale">آفلاین هستید — دادهٔ ذخیره‌شده روی همین دستگاه نمایش داده می‌شود و پس از اتصال همگام می‌شود.</Notice>
        </div>
        {children}
      </>
    );
  if (status === 'unavailable')
    return (
      <>
        <div className="px-gutter pt-3 md:px-8">
          <Notice tone="warn">ورود در این محیط فعال نیست (پایگاه داده روی سرور تنظیم نشده). فقط دادهٔ محلی همین دستگاه در دسترس است و همگام‌سازی انجام نمی‌شود.</Notice>
        </div>
        {children}
      </>
    );
  return <LoginScreen />;
}

export function LoginScreen() {
  const { hasPasskeys, setupAvailable } = useAuth();
  const [busy, setBusy] = useState<null | 'login' | 'pair' | 'setup'>(null);
  const [error, setError] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const supported = webAuthnSupported();

  const run = async (kind: 'login' | 'pair' | 'setup', fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(authErrorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page>
      <div className="mx-auto max-w-md py-6">
        <Surface variant="focal" className="space-y-5 p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-field bg-accent-soft text-accent">
              <ShieldCheck className="h-6 w-6" aria-hidden />
            </span>
            <div>
              <h1 className="text-xl font-extrabold text-ink">ورود به دارینو</h1>
              <p className="text-xs text-muted">دارایی‌ها، حسابداری و حساب‌های شما پشت ورود امن است.</p>
            </div>
          </div>

          {!supported && <Notice tone="error">این مرورگر از کلید عبور پشتیبانی نمی‌کند.</Notice>}
          {error && <Notice tone="error">{error}</Notice>}

          {hasPasskeys && (
            <Button size="lg" className="w-full" icon={<Fingerprint />} loading={busy === 'login'} disabled={!supported || !!busy} onClick={() => run('login', loginWithPasskey)}>
              ورود با کلید عبور (فیس آیدی / تاچ آیدی)
            </Button>
          )}

          {hasPasskeys && (
            <Disclosure summary={<span className="inline-flex items-center gap-1.5"><Link2 className="h-4 w-4" /> دستگاه جدید با کد اتصال</span>}>
              <div className="space-y-3">
                <p className="text-xs leading-5 text-muted">
                  در دستگاهی که وارد هستید، از «امنیت و دستگاه‌ها» یک کد اتصال بسازید و این‌جا وارد کنید. کد ۱۰ دقیقه اعتبار دارد و یک‌بارمصرف است. اگر کلید عبور شما در جاکلیدی آی‌کلود همگام است، معمولاً همان دکمهٔ «ورود با کلید عبور» روی دستگاه‌های Apple هم کار می‌کند.
                </p>
                <Field label="کد اتصال">
                  <Input dir="ltr" autoComplete="one-time-code" autoCapitalize="characters" maxLength={9} value={pairCode} onChange={(e) => setPairCode(e.target.value)} placeholder="کد ۸ نویسه‌ای" />
                </Field>
                <Button className="w-full" variant="secondary" loading={busy === 'pair'} disabled={!supported || !!busy || pairCode.replace(/[^A-Za-z0-9۰-۹٠-٩]/g, '').length !== 8} onClick={() => run('pair', () => registerPasskey({ mode: 'pair', pairCode }))}>
                  ساخت کلید عبور برای این دستگاه
                </Button>
              </div>
            </Disclosure>
          )}

          {(!hasPasskeys || setupAvailable) && (
            <Disclosure defaultOpen={!hasPasskeys} summary={<span className="inline-flex items-center gap-1.5"><KeyRound className="h-4 w-4" /> راه‌اندازی اولیه / بازیابی</span>}>
              <div className="space-y-3">
                <p className="text-xs leading-5 text-muted">
                  کد راه‌اندازی همان مقدار متغیر محیطی <bdi dir="ltr">DARINO_SETUP_TOKEN</bdi> در ورسل (Vercel) است. پس از ساختن کلید عبور، این متغیر را از ورسل حذف کنید.
                </p>
                {!setupAvailable && <Notice tone="warn">راه‌اندازی غیرفعال است — ابتدا DARINO_SETUP_TOKEN (حداقل ۲۴ نویسه) را در ورسل تنظیم و دوباره منتشر کنید.</Notice>}
                <Field label="کد راه‌اندازی">
                  <Input dir="ltr" type="password" autoComplete="off" value={setupToken} onChange={(e) => setSetupToken(e.target.value)} />
                </Field>
                <Button className="w-full" variant={hasPasskeys ? 'outline' : 'primary'} loading={busy === 'setup'} disabled={!supported || !!busy || !setupAvailable || setupToken.length < 24} onClick={() => run('setup', () => registerPasskey({ mode: 'setup', setupToken }))}>
                  ساخت کلید عبور و ورود
                </Button>
              </div>
            </Disclosure>
          )}

          <p className="text-xs leading-5 text-muted">
            کلید عبور روی همین دستگاه (تراشهٔ امن دستگاه یا جاکلیدی آی‌کلود) ساخته می‌شود و کلید خصوصی آن هرگز به دارینو ارسال نمی‌شود. اپ نصب‌شده روی صفحهٔ اصلی آیفون نشست جدا از Safari دارد؛ یک‌بار داخل خود اپ وارد شوید.
          </p>
        </Surface>
      </div>
    </Page>
  );
}

/** شروع وضعیت ورود و همگام‌سازی پس از ورود — یک‌بار در پوستهٔ اپ */
export function AuthBootstrap() {
  const status = useAuth((s) => s.status);
  const refresh = useAuth((s) => s.refresh);
  useEffect(() => {
    void refresh();
    const onVis = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refresh]);
  useEffect(() => {
    if (status !== 'authenticated') return;
    let stop: (() => void) | undefined;
    void import('@/features/custody/data/sync').then((m) => {
      stop = m.startCustodySync();
    });
    return () => stop?.();
  }, [status]);
  return null;
}
