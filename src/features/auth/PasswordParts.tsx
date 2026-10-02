/**
 * رمز عبور + کد ۶ رقمی Google Authenticator — اجزای رابط
 *  • PasswordSetupWizard: کد راه‌اندازی + رمز → اسکن QR → اولین کد → ورود
 *  • PasswordLoginForm: ورود با رمز + کد
 *  • PasswordStepUpDialog: تأیید مجدد با رمز + کد برای عملیات حساس
 *  • ChangePasswordSheet / MoveTotpSheet: در صفحهٔ امنیت
 * رمز و کلید QR فقط در حافظهٔ همین صفحه‌اند و هرگز در مرورگر ذخیره نمی‌شوند.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Copy, KeyRound, LogIn, Smartphone } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input } from '@/shared/components/ui/Input';
import { Notice } from '@/shared/components/ui/StateViews';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Sheet } from '@/shared/components/ui/Sheet';
import { toast } from '@/shared/store/toastStore';
import {
  AuthError,
  authApi,
  authErrorText,
  loginWithPassword,
  passwordSetupBegin,
  passwordSetupFinish,
  passwordStepUp,
  useStepUpPrompt,
  type TotpSetup
} from './authClient';

const PASSWORD_MIN = 12;
const passwordLength = (s: string) => [...s.normalize('NFKC')].length;
/** فقط ارقام (فارسی/عربی → لاتین)، حداکثر ۶ */
const cleanCode = (s: string) =>
  s
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\D/g, '')
    .slice(0, 6);

function CodeInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <Field label="کد ۶ رقمی Google Authenticator">
      <Input
        dir="ltr"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        maxLength={6}
        value={value}
        onChange={(e) => onChange(cleanCode(e.target.value))}
        placeholder="۶ رقم"
        className="text-center text-lg tracking-[0.4em]"
      />
    </Field>
  );
}

/** QR + دکمهٔ باز کردن مستقیم Google Authenticator (روی همین گوشی) + کلید دستی */
export function TotpQr({ setup }: { setup: TotpSetup }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void import('qrcode').then((m) =>
      m.toDataURL(setup.uri, { margin: 1, width: 240, errorCorrectionLevel: 'M' }).then((url) => alive && setQr(url))
    );
    return () => {
      alive = false;
    };
  }, [setup.uri]);
  const grouped = setup.secret.match(/.{1,4}/g)?.join(' ') ?? setup.secret;
  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 ps-5 text-xs leading-5 text-muted">
        <li>اپ Google Authenticator را روی گوشی باز کنید.</li>
        <li>دکمهٔ «+» و بعد «اسکن کد QR» را بزنید و کد زیر را اسکن کنید.</li>
        <li>کد ۶ رقمی‌ای را که برای «Darino» نشان می‌دهد پایین وارد کنید.</li>
      </ol>
      <div className="flex justify-center">
        {qr ? (
          <img src={qr} alt="کد QR برای Google Authenticator" width={200} height={200} className="rounded-field bg-white p-2" />
        ) : (
          <div className="skeleton h-[200px] w-[200px] rounded-field" />
        )}
      </div>
      <a href={setup.uri} className="flex items-center justify-center gap-1.5 text-sm font-semibold text-accent">
        <Smartphone className="h-4 w-4" aria-hidden /> روی همین گوشی هستید؟ افزودن مستقیم به Google Authenticator
      </a>
      <Disclosure summary="اسکن نمی‌شود؟ وارد کردن دستی کلید">
        <div className="space-y-2 text-xs text-muted">
          <p>در Google Authenticator «+» ← «وارد کردن کلید راه‌اندازی» را بزنید، نام را Darino بگذارید و این کلید را وارد کنید (نوع: بر اساس زمان).</p>
          <div className="flex items-center gap-2">
            <bdi dir="ltr" className="flex-1 break-all rounded-field bg-surface-2 px-3 py-2 font-mono text-sm text-ink">
              {grouped}
            </bdi>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="کپی کلید"
              onClick={() => void navigator.clipboard?.writeText(setup.secret).then(() => toast('success', 'کلید کپی شد'))}
            >
              <Copy />
            </Button>
          </div>
        </div>
      </Disclosure>
      <Notice tone="info">این QR یا کلید را برای کسی نفرستید و عکس نگیرید؛ هرکس داشته باشدش می‌تواند کدهای شما را بسازد.</Notice>
    </div>
  );
}

/* ---------------- راه‌اندازی / بازیابی ---------------- */

export function PasswordSetupWizard({ setupAvailable, hasPassword }: { setupAvailable: boolean; hasPassword: boolean }) {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = password.length > 0 && passwordLength(password) < PASSWORD_MIN;
  const mismatch = repeat.length > 0 && repeat !== password;
  const canBegin = setupAvailable && token.length >= 24 && passwordLength(password) >= PASSWORD_MIN && repeat === password;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(authErrorText(e));
      if (e instanceof AuthError && e.code === 'challenge_expired') {
        setSetup(null);
        setCode('');
      }
    } finally {
      setBusy(false);
    }
  };

  if (setup) {
    return (
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (code.length === 6) void run(() => passwordSetupFinish(code));
        }}
      >
        <p className="text-sm font-semibold text-ink">گام ۲ از ۲ — اتصال Google Authenticator</p>
        {error && <Notice tone="error">{error}</Notice>}
        <TotpQr setup={setup} />
        <CodeInput value={code} onChange={setCode} />
        <Button type="submit" className="w-full" icon={<LogIn />} loading={busy} disabled={code.length !== 6}>
          تأیید و ورود
        </Button>
        <p className="text-xs text-muted">تا این مرحله تمام نشود، هیچ رمزی ذخیره نمی‌شود. مهلت: ۱۰ دقیقه.</p>
      </form>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (canBegin)
          void run(async () => {
            setSetup(await passwordSetupBegin(token, password));
          });
      }}
    >
      <p className="text-xs leading-5 text-muted">
        {hasPassword
          ? 'بازیابی: با کد راه‌اندازی، رمز و کد ۶ رقمی تازه تعیین می‌شود و همهٔ دستگاه‌های واردشده خارج می‌شوند.'
          : 'گام ۱ از ۲ — کد راه‌اندازی همان مقدار DARINO_SETUP_TOKEN در ورسل است. پس از ورود، آن را از ورسل حذف کنید.'}
      </p>
      {!setupAvailable && <Notice tone="warn">راه‌اندازی غیرفعال است — ابتدا DARINO_SETUP_TOKEN (حداقل ۲۴ نویسه) را در ورسل تنظیم و دوباره منتشر کنید.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <Field label="کد راه‌اندازی">
        <Input dir="ltr" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value.trim())} />
      </Field>
      <input type="text" name="username" autoComplete="username" value="darino" readOnly hidden />
      <Field label="رمز عبور جدید" hint="حداقل ۱۲ نویسه؛ یک عبارت طولانی که جای دیگری استفاده نکرده‌اید." error={tooShort ? 'کوتاه است' : undefined}>
        <Input dir="ltr" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="تکرار رمز عبور" error={mismatch ? 'با رمز بالا یکی نیست' : undefined}>
        <Input dir="ltr" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" icon={<KeyRound />} loading={busy} disabled={!canBegin}>
        ادامه
      </Button>
    </form>
  );
}

/* ---------------- ورود ---------------- */

export function PasswordLoginForm() {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        if (!password || code.length !== 6) return;
        setBusy(true);
        setError(null);
        try {
          await loginWithPassword(password, code);
        } catch (err) {
          setError(authErrorText(err));
          setCode('');
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && <Notice tone="error">{error}</Notice>}
      <input type="text" name="username" autoComplete="username" value="darino" readOnly hidden />
      <Field label="رمز عبور">
        <Input dir="ltr" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <CodeInput value={code} onChange={setCode} />
      <Button type="submit" size="lg" className="w-full" icon={<LogIn />} loading={busy} disabled={!password || code.length !== 6}>
        ورود
      </Button>
    </form>
  );
}

/* ---------------- تأیید مجدد ---------------- */

export function PasswordStepUpDialog() {
  const { open, resolve, reject } = useStepUpPrompt();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (ok: boolean) => {
    useStepUpPrompt.setState({ open: false, resolve: null, reject: null });
    setPassword('');
    setCode('');
    setError(null);
    if (ok) resolve?.();
    else reject?.(new AuthError('step_up_cancelled', 0));
  };

  return (
    <Sheet open={open} onClose={() => close(false)} title="تأیید مجدد" description="برای این کار، رمز عبور و کد ۶ رقمی را دوباره وارد کنید." size="sm">
      <form
        className="space-y-3"
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          if (!password || code.length !== 6) return;
          setBusy(true);
          setError(null);
          try {
            await passwordStepUp(password, code);
            close(true);
          } catch (err) {
            setError(authErrorText(err));
            setCode('');
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && <Notice tone="error">{error}</Notice>}
        <input type="text" name="username" autoComplete="username" value="darino" readOnly hidden />
        <Field label="رمز عبور">
          <Input dir="ltr" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <CodeInput value={code} onChange={setCode} />
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={() => close(false)}>
            انصراف
          </Button>
          <Button type="submit" className="flex-1" loading={busy} disabled={!password || code.length !== 6}>
            تأیید
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

/* ---------------- صفحهٔ امنیت ---------------- */

export function ChangePasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = passwordLength(password) >= PASSWORD_MIN && repeat === password;
  return (
    <Sheet open={open} onClose={onClose} title="تغییر رمز عبور" size="sm">
      <form
        className="space-y-3"
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          if (!ok) return;
          setBusy(true);
          try {
            const r = await authApi.changePassword(password);
            toast('success', r.sessionsRevoked > 0 ? 'رمز تغییر کرد؛ دستگاه‌های دیگر خارج شدند' : 'رمز تغییر کرد');
            setPassword('');
            setRepeat('');
            onClose();
          } catch (err) {
            toast('error', authErrorText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <input type="text" name="username" autoComplete="username" value="darino" readOnly hidden />
        <Field label="رمز عبور جدید" hint="حداقل ۱۲ نویسه" error={password && passwordLength(password) < PASSWORD_MIN ? 'کوتاه است' : undefined}>
          <Input dir="ltr" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="تکرار رمز عبور" error={repeat && repeat !== password ? 'یکی نیست' : undefined}>
          <Input dir="ltr" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </Field>
        <Notice tone="info">پس از تغییر، همهٔ دستگاه‌های دیگر خارج می‌شوند و باید با رمز جدید وارد شوند. کد ۶ رقمی تغییری نمی‌کند.</Notice>
        <Button type="submit" className="w-full" loading={busy} disabled={!ok}>
          ذخیرهٔ رمز جدید
        </Button>
      </form>
    </Sheet>
  );
}

export function MoveTotpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => {
    setSetup(null);
    setCode('');
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} title="انتقال کد ۶ رقمی به گوشی جدید" size="sm">
      {!setup ? (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-muted">
            یک کلید تازه ساخته می‌شود. کلید قبلی تا وقتی اولین کد گوشی جدید را تأیید نکنید معتبر می‌ماند؛ بعد از آن، کدهای گوشی قبلی دیگر کار نمی‌کنند.
          </p>
          <Button
            className="w-full"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setSetup(await authApi.totpBegin());
              } catch (err) {
                toast('error', authErrorText(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            ساخت کد QR تازه
          </Button>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e: FormEvent) => {
            e.preventDefault();
            if (code.length !== 6) return;
            setBusy(true);
            try {
              await authApi.totpFinish(code);
              toast('success', 'کد ۶ رقمی به گوشی جدید منتقل شد');
              close();
            } catch (err) {
              toast('error', authErrorText(err));
              // challenge یک‌بارمصرف است → شروع دوباره
              setSetup(null);
              setCode('');
            } finally {
              setBusy(false);
            }
          }}
        >
          <TotpQr setup={setup} />
          <CodeInput value={code} onChange={setCode} />
          <Button type="submit" className="w-full" loading={busy} disabled={code.length !== 6}>
            تأیید
          </Button>
        </form>
      )}
    </Sheet>
  );
}
