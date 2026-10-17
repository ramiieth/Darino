/**
 * اعلان‌ها — Web Push این دستگاه، قواعد (اسپرد فاندینگ، نزدیک لیکویید)، بررسی خودکار رایگان و بلهٔ اختیاری
 * همه چیز رایگان: Web Push خود مرورگر، GitHub Actions ریپوی عمومی، دیتابیس فعلی.
 */
import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Copy, RefreshCw, Send, Smartphone, Trash2 } from 'lucide-react';
import { Page, PageHeader } from '@/shared/components/layout/Page';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button, IconButton } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Field, Input } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Notice } from '@/shared/components/ui/StateViews';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { PageSkeleton } from '@/shared/components/ui/Skeleton';
import { toast } from '@/shared/store/toastStore';
import { fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { syncWithServer } from '@/features/calculators/data/spreadAlerts';
import { VENUE_FA, type AlertRules } from '../domain/rules';
import {
  checkNow,
  currentSubscription,
  disablePush,
  enablePush,
  getAlertsStatus,
  newTickKey,
  pushSupport,
  removeDevice,
  saveAlertRules,
  sendTestAlert,
  type AlertsStatus
} from '../data/alertsApi';

const REPO_ACTIONS = 'https://github.com/ramiieth/Darino/settings/secrets/actions';

export default function AlertsPage() {
  const [status, setStatus] = useState<AlertsStatus | null>(null);
  const [error, setError] = useState('');
  const [here, setHere] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tickKey, setTickKey] = useState<string | null>(null);
  const [threshold, setThreshold] = useState('15');
  const support = pushSupport();

  const load = useCallback(async () => {
    try {
      const s = await getAlertsStatus();
      setStatus(s);
      setThreshold(String(s.rules.liquidation.thresholdPct));
      setError('');
    } catch {
      setError('وضعیت اعلان‌ها دریافت نشد. اتصال را بررسی کنید و دوباره تلاش کنید.');
    }
    setHere(!!(await currentSubscription().catch(() => null)));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try { await fn(); } finally { setBusy(null); }
  };
  const saveRules = (rules: AlertRules) => run('rules', async () => {
    try {
      const r = await saveAlertRules(rules);
      setStatus((s) => (s ? { ...s, rules: r.rules } : s));
      void syncWithServer();
      toast('success', 'ذخیره شد');
    } catch { toast('error', 'ذخیره نشد'); }
  });

  if (!status && !error) return <PageSkeleton />;

  return (
    <Page>
      <PageHeader title="اعلان‌ها" subtitle="هشدار روی گوشی یا مرورگر، حتی وقتی دارینو بسته است — رایگان" />
      {error && <Notice tone="warn" title="خطا">{error}</Notice>}
      {status && (
        <div className="space-y-5">
          {/* ۱. این دستگاه */}
          <Surface className="space-y-4 p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><Smartphone className="h-4 w-4" aria-hidden /> این دستگاه</h2>
              <Badge tone={here ? 'gain' : 'neutral'}>{here ? 'اعلان روشن' : 'اعلان خاموش'}</Badge>
            </div>
            {support === 'ios-install' && (
              <Notice tone="info" title="آیفون: اول دارینو را به صفحهٔ اصلی اضافه کنید">
                در Safari دکمهٔ «اشتراک‌گذاری» ← «Add to Home Screen». بعد دارینو را از همان آیکون باز کنید و اینجا اعلان را روشن کنید (iOS 16.4 به بعد).
              </Notice>
            )}
            {support === 'unsupported' && <Notice tone="warn" title="این مرورگر اعلان پشتیبانی نمی‌کند">از Chrome، Edge، Firefox یا Safari جدید استفاده کنید.</Notice>}
            <div className="flex flex-wrap gap-2">
              {here ? (
                <Button variant="outline" icon={<BellOff />} loading={busy === 'push'} onClick={() => run('push', async () => { await disablePush(); await load(); toast('info', 'اعلان این دستگاه خاموش شد'); })}>
                  خاموش کردن روی این دستگاه
                </Button>
              ) : (
                <Button icon={<Bell />} disabled={support !== 'ok'} loading={busy === 'push'} onClick={() => run('push', async () => {
                  try { await enablePush(status.vapidPublicKey); await load(); toast('success', 'اعلان روی این دستگاه روشن شد'); }
                  catch (e) { toast('error', (e as Error).message === 'denied' ? 'اجازهٔ اعلان داده نشد؛ از تنظیمات مرورگر اجازه دهید' : 'روشن کردن اعلان انجام نشد'); }
                })}>
                  روشن کردن اعلان
                </Button>
              )}
              <Button variant="outline" icon={<Send />} loading={busy === 'test'} disabled={!status.devices.length && !status.bale} onClick={() => run('test', async () => {
                try { const r = await sendTestAlert(); toast(r.push || r.bale === 'sent' ? 'success' : 'error', `ارسال شد به ${toFaDigits(r.push)} دستگاه${r.bale === 'sent' ? ' و بله' : r.bale === 'failed' ? ' — بله ناموفق' : ''}`); await load(); }
                catch { toast('error', 'ارسال آزمایشی انجام نشد'); }
              })}>
                اعلان آزمایشی
              </Button>
            </div>
            {status.devices.length > 0 && (
              <ul className="divide-y divide-divider">
                {status.devices.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{d.label ?? 'دستگاه'}<span className="ms-2 text-2xs text-subtle">{fmtRelativeAge(d.createdAt)}</span></span>
                    <IconButton size="sm" aria-label="حذف این دستگاه" onClick={() => run('dev', async () => { await removeDevice(d.id).catch(() => undefined); await load(); })}><Trash2 aria-hidden /></IconButton>
                  </li>
                ))}
              </ul>
            )}
          </Surface>

          {/* ۲. قواعد */}
          <Surface className="space-y-4 p-4 md:p-5">
            <h2 className="text-sm font-bold text-ink">چه چیزی خبر بدهد</h2>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-ink">برعکس شدن اسپرد فاندینگ</h3>
              {status.rules.funding.length === 0 ? (
                <p className="text-xs leading-6 text-muted">هنوز جفتی زیر نظر نیست. در «ماشین‌حساب ← اسکنر فاندینگ» زنگ کنار هر جفت را بزنید.</p>
              ) : (
                <ul className="divide-y divide-divider">
                  {status.rules.funding.map((w) => (
                    <li key={w.key} className="flex items-center gap-3 py-2 text-sm">
                      <bdi dir="ltr" className="font-latin font-bold text-ink">{w.base}</bdi>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted">Long {VENUE_FA[w.longVenue]} · Short {VENUE_FA[w.shortVenue]}</span>
                      <Badge tone={w.lastSign > 0 ? 'gain' : 'loss'}>{w.lastSign > 0 ? 'به نفع' : 'برعکس'}</Badge>
                      <IconButton size="sm" aria-label="حذف از فهرست" onClick={() => saveRules({ ...status.rules, funding: status.rules.funding.filter((x) => x.key !== w.key) })}><Trash2 aria-hidden /></IconButton>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="space-y-3 border-t border-divider pt-4">
              <h3 className="text-sm font-semibold text-ink">نزدیک لیکویید (لایتر و آرکوس)</h3>
              <p className="text-xs leading-6 text-muted">حساب‌هایی که در «مدیریت کیف پول‌ها»، «لایتر» یا «آرکوس» با آدرس عمومی ثبت کرده‌اید. برای آرکوس فاصله تقریبی است (مارجین متقاطع).</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-muted">وضعیت</p>
                  <SegmentedControl<'on' | 'off'>
                    label="هشدار نزدیک لیکویید"
                    fill
                    value={status.rules.liquidation.enabled ? 'on' : 'off'}
                    onChange={(v) => saveRules({ ...status.rules, liquidation: { ...status.rules.liquidation, enabled: v === 'on' } })}
                    options={[{ value: 'on', label: 'روشن' }, { value: 'off', label: 'خاموش' }]}
                  />
                </div>
                <Field label="وقتی فاصله کمتر از این شد">
                  <Input dir="ltr" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} suffix="٪"
                    onBlur={() => { const v = Number(threshold); if (Number.isFinite(v) && v !== status.rules.liquidation.thresholdPct) saveRules({ ...status.rules, liquidation: { ...status.rules.liquidation, thresholdPct: v } }); }} />
                </Field>
              </div>
            </section>
            <Button variant="ghost" size="sm" className="text-accent" icon={<RefreshCw />} loading={busy === 'check'} onClick={() => run('check', async () => {
              try {
                const r = await checkNow();
                toast(r.errors.length ? 'error' : 'info', `بررسی شد: ${toFaDigits(r.exposures)} پوزیشن/حساب، ${toFaDigits(r.sent)} اعلان${r.errors.length ? ' — بخشی از داده دریافت نشد' : ''}`);
                await load();
              } catch { toast('error', 'بررسی انجام نشد'); }
            })}>
              همین حالا بررسی کن
            </Button>
          </Surface>

          {/* ۳. بررسی خودکار */}
          <Surface className="space-y-3 p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-ink">بررسی خودکار (رایگان، با GitHub)</h2>
              <Badge tone={status.tick.lastAt && Date.now() - status.tick.lastAt < 40 * 60_000 ? 'gain' : status.tick.configured ? 'warn' : 'neutral'}>
                {status.tick.lastAt ? `آخرین بررسی ${fmtRelativeAge(status.tick.lastAt)}` : status.tick.configured ? 'کلید ساخته شده؛ هنوز اجرا نشده' : 'راه‌اندازی نشده'}
              </Badge>
            </div>
            <p className="text-xs leading-6 text-muted">وقتی دارینو بسته است، GitHub هر ۱۰ دقیقه یک بار از سرور می‌خواهد قواعد را بررسی کند. گاهی ۵ تا ۱۵ دقیقه دیرتر اجرا می‌شود.</p>
            <ol className="list-decimal space-y-2 ps-5 text-xs leading-6 text-muted">
              <li>
                کلید بسازید (فقط همین یک بار نمایش داده می‌شود):{' '}
                <Button size="sm" variant="outline" loading={busy === 'key'} onClick={() => run('key', async () => { try { setTickKey((await newTickKey()).key); await load(); } catch { toast('error', 'ساخت کلید انجام نشد'); } })}>
                  {status.tick.configured ? 'کلید تازه (کلید قبلی باطل می‌شود)' : 'ساخت کلید'}
                </Button>
                {tickKey && (
                  <span className="mt-2 flex items-center gap-2">
                    <code dir="ltr" className="min-w-0 flex-1 break-all rounded-field bg-surface-2 px-2 py-1 font-latin text-2xs text-ink">{tickKey}</code>
                    <IconButton size="sm" aria-label="کپی کلید" onClick={() => { void navigator.clipboard?.writeText(tickKey).then(() => toast('success', 'کپی شد')); }}><Copy aria-hidden /></IconButton>
                  </span>
                )}
              </li>
              <li>
                در <a className="text-accent underline" href={REPO_ACTIONS} target="_blank" rel="noreferrer">GitHub ← Settings ← Secrets and variables ← Actions</a> روی «New repository secret» بزنید؛ نام <code dir="ltr" className="font-latin">ALERTS_TICK_KEY</code> و مقدار همان کلید.
              </li>
              <li>در تب «Actions» ریپو، گردش‌کار «Darino alerts tick» را باز کنید و «Run workflow» بزنید تا اولین بررسی انجام شود.</li>
            </ol>
            {status.tick.lastResult && status.tick.lastResult.errors.length > 0 && (
              <p className="text-2xs text-warn">در آخرین بررسی بخشی از داده دریافت نشد ({status.tick.lastResult.errors.join('، ')}).</p>
            )}
            <p className="text-2xs leading-5 text-subtle">اگر ریپو ۶۰ روز هیچ تغییری نداشته باشد، GitHub زمان‌بندی را خاموش می‌کند؛ با یک «Enable workflow» دوباره روشن می‌شود.</p>
          </Surface>

          {/* ۴. بله */}
          <Surface className="space-y-2 p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-ink">بازوی بله (اختیاری)</h2>
              <Badge tone={status.bale ? 'gain' : 'neutral'}>{status.bale ? 'فعال' : 'تنظیم نشده'}</Badge>
            </div>
            <Disclosure summary="راه‌اندازی رایگان بله">
              <ol className="list-decimal space-y-1.5 ps-5 text-xs leading-6 text-muted">
                <li>در بله به <bdi dir="ltr">@botfather</bdi> پیام دهید و یک بازو بسازید؛ توکن را نگه دارید.</li>
                <li>به بازوی جدیدتان یک پیام بدهید (مثلاً «سلام»).</li>
                <li>در مرورگر باز کنید: <code dir="ltr" className="font-latin">https://tapi.bale.ai/bot&lt;TOKEN&gt;/getUpdates</code> و عدد <code dir="ltr" className="font-latin">chat.id</code> را بردارید.</li>
                <li>در Vercel ← Settings ← Environment Variables دو متغیر <code dir="ltr" className="font-latin">BALE_BOT_TOKEN</code> و <code dir="ltr" className="font-latin">BALE_CHAT_ID</code> را اضافه و دوباره Deploy کنید.</li>
                <li>با «اعلان آزمایشی» امتحان کنید. اگر «بله ناموفق» دیدید، سرور Vercel به بله دسترسی ندارد و Web Push کافی است.</li>
              </ol>
            </Disclosure>
          </Surface>

          {/* ۵. تاریخچه */}
          {status.log.length > 0 && (
            <Surface className="space-y-2 p-4 md:p-5">
              <h2 className="text-sm font-bold text-ink">آخرین اعلان‌ها</h2>
              <ul className="divide-y divide-divider">
                {status.log.map((l) => (
                  <li key={l.at} className="py-2 text-xs leading-6">
                    <span className="font-semibold text-ink">{l.title}</span>
                    <span className="ms-2 text-subtle">{fmtRelativeAge(l.at)}، ارسال به {toFaDigits(l.push)} دستگاه{l.bale === 'sent' ? ' و بله' : ''}</span>
                    <p className="text-muted">{l.body}</p>
                  </li>
                ))}
              </ul>
            </Surface>
          )}
        </div>
      )}
    </Page>
  );
}
