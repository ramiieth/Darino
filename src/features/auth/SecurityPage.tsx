/**
 * امنیت و دستگاه‌ها — پنل مدیریت ورود
 *  نشست‌های فعال همهٔ دستگاه‌ها (لغو تکی / خروج از بقیه) · رمز عبور و کد ۶ رقمی · کلید عبورها
 *  · کد اتصال دستگاه جدید · رویدادهای امنیتی · وضعیت همگام‌سازی · خروج این دستگاه
 * عملیات حساس تأیید مجدد می‌خواهد (رمز + کد یا فیس آیدی؛ سرور: پنجرهٔ ۱۰ دقیقه‌ای step-up).
 */
import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, LogOut, MonitorSmartphone, Plus, RefreshCw, Trash2, Pencil, Link2, Cloud, ShieldAlert, KeyRound, Smartphone } from 'lucide-react';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Input } from '@/shared/components/ui/Input';
import { Notice } from '@/shared/components/ui/StateViews';
import { Sheet } from '@/shared/components/ui/Sheet';
import { toast } from '@/shared/store/toastStore';
import { fmtDateTime, fmtRelativeAge } from '@/shared/utils/formatters';
import { authApi, authErrorText, type PasskeyInfo, type SecurityEvent, type SessionInfo, useAuth } from './authClient';
import { prepareSignOut, signOut, type SignOutCheck } from './signOut';
import { ChangePasswordSheet, MoveTotpSheet, PasswordStepUpDialog } from './PasswordParts';
import { syncCustodyNow, useCustodySync } from '@/features/custody/data/sync';

const EVENT_LABEL: Record<string, string> = {
  login: 'ورود',
  logout: 'خروج',
  login_failed: 'ورود ناموفق',
  setup_failed: 'کد راه‌اندازی نادرست',
  pair_failed: 'کد اتصال نادرست',
  register_failed: 'ثبت کلید عبور ناموفق',
  passkey_added: 'افزودن کلید عبور',
  passkey_deleted: 'حذف کلید عبور',
  session_revoked: 'لغو نشست',
  sessions_revoked_others: 'خروج از دستگاه‌های دیگر',
  pair_code_created: 'ساخت کد اتصال',
  step_up: 'تأیید مجدد',
  password_login_failed: 'ورود با رمز ناموفق',
  password_set: 'تعیین رمز عبور',
  password_reset: 'بازیابی رمز با کد راه‌اندازی',
  password_changed: 'تغییر رمز عبور',
  totp_setup_failed: 'کد ۶ رقمی نادرست (راه‌اندازی)',
  totp_changed: 'انتقال کد ۶ رقمی به گوشی جدید',
  totp_change_failed: 'کد ۶ رقمی نادرست (انتقال)'
};

const SYNC_LABEL: Record<string, string> = {
  idle: 'در انتظار',
  syncing: 'در حال همگام‌سازی…',
  ok: 'همگام',
  offline: 'آفلاین — بعداً ارسال می‌شود',
  signed_out: 'نیاز به ورود',
  error: 'خطا',
  server_unconfigured: 'سرور پایگاه داده ندارد'
};

export default function SecurityPage() {
  const session = useAuth((s) => s.session);
  const hasPassword = useAuth((s) => s.hasPassword);
  const [pwSheet, setPwSheet] = useState<null | 'change' | 'totp'>(null);
  const sync = useCustodySync();
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [ended, setEnded] = useState<SessionInfo[]>([]);
  const [passkeys, setPasskeys] = useState<PasskeyInfo[] | null>(null);
  const [events, setEvents] = useState<SecurityEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pair, setPair] = useState<{ code: string; expiresAt: number } | null>(null);
  const [rename, setRename] = useState<{ id: string; label: string } | null>(null);
  const [signOutState, setSignOutState] = useState<null | 'checking' | SignOutCheck>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, e] = await Promise.all([authApi.sessions(), authApi.passkeys(), authApi.events()]);
      setSessions(s.sessions);
      setEnded(s.recentlyEnded);
      setPasskeys(p.passkeys);
      setEvents(e.events);
    } catch (err) {
      toast('error', authErrorText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!pair) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pair]);

  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast('success', ok);
      await load();
    } catch (e) {
      toast('error', authErrorText(e));
    } finally {
      setBusy(null);
    }
  };

  const pairLeft = pair ? Math.max(0, Math.floor((pair.expiresAt - now) / 1000)) : 0;
  const failures = (events ?? []).filter((e) => e.kind.endsWith('_failed') && Date.now() - e.at < 7 * 864e5).length;

  return (
    <Page>
      <PageHeader
        title="امنیت و دستگاه‌ها"
        subtitle="دستگاه‌ها و روش‌های ورود"
        actions={
          <Button variant="outline" icon={<RefreshCw className={loading ? 'animate-spin' : ''} />} onClick={() => void load()} disabled={loading}>
            تازه‌سازی
          </Button>
        }
      />

      <div className="space-y-6">
        {failures > 0 && (
          <Notice tone="warn" icon={<ShieldAlert />}>
            {failures} تلاش ناموفق ورود یا ثبت در ۷ روز گذشته. جزئیات در «رویدادهای امنیتی».
          </Notice>
        )}

        {/* ---------- این دستگاه ---------- */}
        <Surface className="flex flex-wrap items-center gap-3 p-4">
          <MonitorSmartphone className="h-6 w-6 text-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">این دستگاه</p>
            <p className="text-xs text-muted">{session ? `${session.label} · ورود ${fmtRelativeAge(session.createdAt)}` : '—'}</p>
          </div>
          <Button
            variant="destructive"
            icon={<LogOut />}
            onClick={async () => {
              setSignOutState('checking');
              setSignOutState(await prepareSignOut());
            }}
          >
            خروج از این دستگاه
          </Button>
        </Surface>

        {/* ---------- همگام‌سازی ---------- */}
        <Surface className="flex flex-wrap items-center gap-3 p-4">
          <Cloud className="h-6 w-6 text-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">همگام‌سازی دارایی چندشبکه‌ای</p>
            <p className="text-xs text-muted">
              {SYNC_LABEL[sync.state]}
              {sync.lastSyncAt ? ` · آخرین بار ${fmtRelativeAge(sync.lastSyncAt)}` : ''}
              {sync.message ? ` · ${sync.message}` : ''}
            </p>
          </div>
          <Button variant="secondary" loading={sync.state === 'syncing'} onClick={() => void syncCustodyNow()}>
            همگام‌سازی اکنون
          </Button>
        </Surface>

        {/* ---------- نشست‌ها ---------- */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-ink">نشست‌های فعال ({sessions?.length ?? '…'})</h2>
            <Button size="sm" variant="destructive" loading={busy === 'others'} disabled={!sessions || sessions.length <= 1} onClick={() => act('others', authApi.revokeOthers, 'از همهٔ دستگاه‌های دیگر خارج شدید')}>
              خروج از همهٔ دستگاه‌های دیگر
            </Button>
          </div>
          <ul className="space-y-2">
            {(sessions ?? []).map((s) => (
              <li key={s.id}>
                <Surface className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                      {s.label}
                      {s.current && <Badge tone="brand">همین دستگاه</Badge>}
                    </p>
                    <p className="text-xs text-muted">
                      آخرین فعالیت {fmtRelativeAge(s.lastSeenAt)} · ورود {fmtDateTime(s.createdAt)}
                      {s.ip && (
                        <>
                          {' · IP '}
                          <bdi dir="ltr">{s.ip}</bdi>
                        </>
                      )}
                    </p>
                  </div>
                  {!s.current && (
                    <Button size="sm" variant="outline" loading={busy === s.id} onClick={() => act(s.id, () => authApi.revokeSession(s.id), 'نشست لغو شد')}>
                      لغو
                    </Button>
                  )}
                </Surface>
              </li>
            ))}
          </ul>
          {ended.length > 0 && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer text-accent">نشست‌های پایان‌یافتهٔ اخیر ({ended.length})</summary>
              <ul className="mt-2 space-y-1">
                {ended.map((s) => (
                  <li key={s.id}>
                    {s.label} — {s.revokedAt ? `لغو ${fmtDateTime(s.revokedAt)}` : `منقضی ${fmtDateTime(s.expiresAt)}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        {/* ---------- رمز عبور + کد ۶ رقمی ---------- */}
        <section className="space-y-3">
          <h2 className="text-base font-bold text-ink">رمز عبور و کد ۶ رقمی</h2>
          <Surface className="space-y-3 p-4">
            {hasPassword ? (
              <>
                <p className="text-sm text-muted">ورود با رمز عبور + کد ۶ رقمی Google Authenticator فعال است.</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" icon={<KeyRound />} onClick={() => setPwSheet('change')}>
                    تغییر رمز عبور
                  </Button>
                  <Button variant="outline" icon={<Smartphone />} onClick={() => setPwSheet('totp')}>
                    انتقال کد به گوشی جدید
                  </Button>
                </div>
                <p className="text-xs leading-5 text-muted">
                  اگر رمز یا گوشی را گم کردید: کد راه‌اندازی تازه‌ای در ورسل بگذارید و از صفحهٔ ورود «بازیابی» را بزنید؛ همهٔ دستگاه‌ها خارج می‌شوند.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted">رمز عبور تعیین نشده است. با کد راه‌اندازی از صفحهٔ ورود («بازیابی») می‌توانید رمز و کد ۶ رقمی بسازید.</p>
            )}
          </Surface>
        </section>

        {/* ---------- کلید عبورها ---------- */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-ink">کلید عبورها ({passkeys?.length ?? '…'})</h2>
            <Button size="sm" variant="secondary" icon={<Plus />} loading={busy === 'add'} onClick={() => act('add', () => authApi.addPasskeyHere(), 'کلید عبور این دستگاه اضافه شد')}>
              افزودن کلید عبور در این دستگاه
            </Button>
          </div>
          <ul className="space-y-2">
            {(passkeys ?? []).map((p) => (
              <li key={p.id}>
                <Surface className="flex flex-wrap items-center gap-3 p-3">
                  <Fingerprint className="h-5 w-5 text-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                      {p.label || 'کلید عبور'}
                      {p.backedUp ? <Badge tone="info">همگام در آی‌کلود / حساب</Badge> : <Badge tone="neutral">فقط همین دستگاه</Badge>}
                      {p.usedByThisSession && <Badge tone="brand">ورود فعلی</Badge>}
                    </p>
                    <p className="text-xs text-muted">
                      ساخت {fmtDateTime(p.createdAt)}
                      {p.lastUsedAt ? ` · آخرین استفاده ${fmtRelativeAge(p.lastUsedAt)}` : ''}
                    </p>
                  </div>
                  <Button size="icon-sm" variant="ghost" aria-label="تغییر نام" onClick={() => setRename({ id: p.id, label: p.label })}>
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="حذف کلید عبور"
                    disabled={((passkeys?.length ?? 0) <= 1 && !hasPassword) || busy === `del-${p.id}`}
                    title={(passkeys?.length ?? 0) <= 1 && !hasPassword ? 'آخرین کلید عبور قابل حذف نیست (رمز عبور تعیین نشده)' : undefined}
                    onClick={() => {
                      if (window.confirm('این کلید عبور حذف و همهٔ نشست‌هایی که با آن وارد شده‌اند لغو می‌شوند. ادامه می‌دهید؟')) {
                        void act(`del-${p.id}`, () => authApi.deletePasskey(p.id), 'کلید عبور حذف شد');
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                </Surface>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-5 text-muted">
            حذف کلید عبور از دارینو، آن را از جاکلیدی آی‌کلود یا مدیر رمز دستگاه پاک نمی‌کند؛ فقط دیگر برای ورود پذیرفته نمی‌شود. برای پاک‌کردن کامل، از تنظیمات رمزهای دستگاه هم حذفش کنید.
          </p>
        </section>

        {/* ---------- کد اتصال ---------- */}
        <section className="space-y-3">
          <h2 className="text-base font-bold text-ink">اتصال دستگاه جدید</h2>
          <Surface className="space-y-3 p-4">
            <p className="text-xs leading-5 text-muted">
              برای دستگاهی که کلید عبور همگام ندارد (مثلاً مرورگر ویندوز یا اندروید)، یک کد یک‌بارمصرف ۱۰ دقیقه‌ای بسازید و در صفحهٔ ورود آن دستگاه وارد کنید.
            </p>
            {pair && pairLeft > 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                <bdi dir="ltr" className="rounded-field bg-surface-2 px-4 py-2 font-mono text-2xl font-bold tracking-[0.3em] text-ink">
                  {pair.code.slice(0, 4)}-{pair.code.slice(4)}
                </bdi>
                <span className="text-xs text-muted">
                  اعتبار: {Math.floor(pairLeft / 60)}:{String(pairLeft % 60).padStart(2, '0')}
                </span>
              </div>
            ) : (
              <Button variant="secondary" icon={<Link2 />} loading={busy === 'pair'} onClick={() => act('pair', async () => setPair(await authApi.pairCode()), 'کد اتصال ساخته شد')}>
                ساخت کد اتصال
              </Button>
            )}
          </Surface>
        </section>

        {/* ---------- رویدادها ---------- */}
        <section className="space-y-3">
          <h2 className="text-base font-bold text-ink">رویدادهای امنیتی اخیر</h2>
          <Surface className="p-3">
            {!events?.length ? (
              <p className="py-4 text-center text-sm text-muted">{events ? 'رویدادی ثبت نشده' : '…'}</p>
            ) : (
              <ul className="divide-y divide-divider text-sm">
                {events.map((e, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 py-2">
                    <Badge tone={e.kind.endsWith('_failed') ? 'loss' : e.kind.includes('revok') || e.kind.includes('deleted') ? 'warn' : 'neutral'}>{EVENT_LABEL[e.kind] ?? e.kind}</Badge>
                    <span className="text-muted">{e.device}</span>
                    {e.ip && <bdi dir="ltr" className="text-xs text-subtle">{e.ip}</bdi>}
                    <span className="ms-auto text-xs text-muted">{fmtDateTime(e.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        </section>
      </div>

      <PasswordStepUpDialog />
      <ChangePasswordSheet open={pwSheet === 'change'} onClose={() => setPwSheet(null)} />
      <MoveTotpSheet open={pwSheet === 'totp'} onClose={() => setPwSheet(null)} />

      {rename && (
        <Sheet
          open
          onClose={() => setRename(null)}
          title="نام کلید عبور"
          size="sm"
          footer={
            <div className="flex w-full justify-end gap-2">
              <Button variant="ghost" onClick={() => setRename(null)}>
                انصراف
              </Button>
              <Button
                disabled={!rename.label.trim()}
                onClick={async () => {
                  await act('rename', () => authApi.renamePasskey(rename.id, rename.label.trim()), 'نام ذخیره شد');
                  setRename(null);
                }}
              >
                ذخیره
              </Button>
            </div>
          }
        >
          <Input value={rename.label} maxLength={60} onChange={(e) => setRename({ ...rename, label: e.target.value })} aria-label="نام" />
        </Sheet>
      )}

      {signOutState && (
        <Sheet open onClose={() => setSignOutState(null)} title="خروج از این دستگاه" size="sm"
          footer={
            signOutState === 'checking' ? undefined : (
              <div className="flex w-full justify-end gap-2">
                <Button variant="ghost" onClick={() => setSignOutState(null)}>
                  انصراف
                </Button>
                <Button
                  variant="destructive"
                  icon={<LogOut />}
                  onClick={async () => {
                    const r = await signOut({ reload: false });
                    if (!r.serverRevoked) toast('info', 'دادهٔ دستگاه پاک شد، اما لغو نشست روی سرور ممکن نشد (آفلاین). از دستگاه دیگر لغوش کنید.');
                    window.location.reload();
                  }}
                >
                  {signOutState.accountingSynced && signOutState.custodySynced ? 'خروج و پاک‌کردن' : 'با وجود این، خارج شو و پاک کن'}
                </Button>
              </div>
            )
          }
        >
          {signOutState === 'checking' ? (
            <p className="text-sm text-muted">در حال ارسال تغییرات به سرور پیش از خروج…</p>
          ) : (
            <div className="space-y-3 text-sm">
              <p>
                نشست این دستگاه لغو می‌شود و دادهٔ مالی ذخیره‌شده روی آن (حسابداری، پورتفولیو، دارایی چندشبکه‌ای و دادهٔ Arcus) پاک می‌شود. با ورود دوباره، از سرور برمی‌گردد.
              </p>
              {signOutState.accountingSynced && signOutState.custodySynced ? (
                <Notice tone="success">همهٔ تغییرات با سرور همگام است.</Notice>
              ) : (
                <Notice tone="error" title="همگام‌سازی تأیید نشد">
                  {!signOutState.accountingSynced && <p>ارسال داده‌های حسابداری به سرور تأیید نشد.</p>}
                  {!signOutState.custodySynced && <p>ارسال دارایی چندشبکه‌ای به سرور تأیید نشد.</p>}
                  <p>اگر خارج شوید، تغییرات ارسال‌نشدهٔ همین دستگاه از بین می‌رود. بهتر است پس از اتصال دوباره امتحان کنید.</p>
                </Notice>
              )}
              <p className="text-xs text-muted">دادهٔ فقط‌محلی بخش‌های خودرو و املاک (که نسخهٔ سروری ندارند) پاک نمی‌شود.</p>
            </div>
          )}
        </Sheet>
      )}
    </Page>
  );
}
