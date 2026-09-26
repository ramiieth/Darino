/** ============================================================
 * Property Market — مرکز منابع داده
 *
 *  سه مسیر مستقل (هر کدام نشد، بعدی):
 *   ۱) خودکار — سرور دارینو از دیوار و شیپور واکشی می‌کند
 *   ۲) پل مرورگر — اجرای همان کلکشنر روی divar.ir / sheypoor.com (IP خود کاربر)
 *   ۳) ورود فایل — خروجی پل یا اسکریپت محلی
 *  + تست اتصال، پیشرفت هر منبع، قیف کیفیت داده
 * ============================================================ */
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  Bookmark,
  CheckCircle2,
  CircleSlash,
  Cloud,
  Copy,
  ExternalLink,
  FileUp,
  Loader2,
  PlugZap,
  Square,
  XCircle
} from 'lucide-react';
import bookmarkletCode from 'virtual:pm-bookmarklet';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Tabs } from '@/shared/components/ui/SegmentedControl';
import { Notice } from '@/shared/components/ui/StateViews';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { cn } from '@/shared/lib/cn';
import { fmtInt, fmtRelativeAge, toFaDigits } from '@/shared/utils/formatters';
import { LISTING_SOURCE_FA, type ListingSource, type PropertyMarketSnapshot } from '../domain/types';
import { usePropertyMarketStore, type SourceProgress } from '../data/store';

type Mode = 'auto' | 'bridge' | 'file';

const SOURCES: ListingSource[] = ['divar', 'sheypoor'];

const SOURCE_SITE: Record<ListingSource, { url: string; host: string }> = {
  divar: { url: 'https://divar.ir/s/ahvaz/buy-apartment', host: 'divar.ir' },
  sheypoor: { url: 'https://www.sheypoor.com/s/ahvaz/houses-apartments-for-sale', host: 'sheypoor.com' }
};

/** دلایل رد در قیف پاک‌سازی (فارسی) */
export const REJECT_REASON_FA: Record<string, string> = {
  'missing-price': 'بدون قیمت یا متراژ',
  'ppm-out-of-range': 'قیمت هر متر نامعقول',
  'total-price-spam': 'قیمت کل نامعقول',
  'area-out-of-range': 'متراژ نامعقول',
  'missing-neighborhood': 'بدون محله',
  'not-apartment': 'ویلایی/غیرآپارتمان',
  'other-city': 'ملک شهر دیگر (مثل تهران)',
  outlier: 'پرت آماری'
};

/** لینک Bookmarklet با origin همین استقرار دارینو */
export function buildBookmarklet(origin: string): { href: string; code: string } {
  const code = bookmarkletCode.split('%%DARINO_ORIGIN%%').join(origin);
  return { href: `javascript:${encodeURIComponent(code)}`, code };
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/* ---------------- ردیف پیشرفت منبع ---------------- */

function SourceRow({ source, p }: { source: ListingSource; p: SourceProgress }) {
  const icon =
    p.status === 'running' ? <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden /> :
    p.status === 'done' ? <CheckCircle2 className="h-4 w-4 text-positive" aria-hidden /> :
    p.status === 'error' ? <XCircle className="h-4 w-4 text-negative" aria-hidden /> :
    <CircleSlash className="h-4 w-4 text-subtle" aria-hidden />;
  const label: Record<SourceProgress['status'], string> = {
    idle: '—',
    waiting: 'در صف',
    running: 'در حال جمع‌آوری',
    done: 'تمام شد',
    error: 'ناموفق',
    skipped: 'غیرفعال',
    cancelled: 'متوقف شد'
  };
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-field bg-surface-2 px-3 py-2.5">
      {icon}
      <span className="text-sm font-bold text-ink">{LISTING_SOURCE_FA[source]}</span>
      <span className="text-xs text-muted">{label[p.status]}</span>
      {(p.seen > 0 || p.valid > 0) && (
        <span className="ms-auto text-xs text-muted">
          صفحه {toFaDigits(p.pages)} · دیده‌شده {fmtInt(p.seen)} · معتبر{' '}
          <span className="font-semibold text-ink">{fmtInt(p.valid)}</span>
          {p.failed > 0 && <> · ناموفق {fmtInt(p.failed)}</>}
        </span>
      )}
      {p.error && <p className="w-full text-xs text-negative">{p.error}</p>}
    </li>
  );
}

/* ---------------- پنل ---------------- */

export function SourcesPanel({ lastSnapshot }: { lastSnapshot: PropertyMarketSnapshot | null }) {
  const st = usePropertyMarketStore();
  const { collect, diagnostics, importState, enabledSources } = st;
  const [mode, setMode] = useState<Mode>('auto');
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const busy = collect.status === 'running' || collect.status === 'checking';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const bookmarklet = buildBookmarklet(origin);

  // href جاوااسکریپتی از طریق DOM تنظیم می‌شود (React لینک javascript: را هشدار/مسدود می‌کند)
  useEffect(() => {
    linkRef.current?.setAttribute('href', bookmarklet.href);
  }, [bookmarklet.href, mode]);

  // سرور در دسترس نیست → پیشنهاد مستقیم پل مرورگر
  useEffect(() => {
    if (collect.serverUnavailable) setMode('bridge');
  }, [collect.serverUnavailable]);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    for (const f of files) {
      await usePropertyMarketStore.getState().importFileText(await f.text());
    }
  };

  const c = lastSnapshot?.cleaning;
  const rejects = c ? Object.entries(c.rejectReasons).filter(([, v]) => v > 0) : [];

  return (
    <Surface className="p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink">منابع داده</h2>
          <p className="text-xs text-muted">
            آپارتمان‌های فروشی اهواز از دیوار و شیپور — اگر یک راه کار نکرد، راه بعدی را امتحان کنید
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SOURCES.map((s) => (
            <button
              key={s}
              type="button"
              role="switch"
              aria-checked={enabledSources[s]}
              disabled={busy}
              onClick={() => void st.setSourceEnabled(s, !enabledSources[s])}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-control border px-3 text-xs font-semibold transition-colors disabled:opacity-50',
                enabledSources[s] ? 'border-accent bg-accent-soft text-accent' : 'border-divider-strong bg-card text-muted'
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', enabledSources[s] ? 'bg-accent' : 'bg-subtle')} aria-hidden />
              {LISTING_SOURCE_FA[s]}
            </button>
          ))}
        </div>
      </div>

      <Tabs<Mode>
        className="mt-4"
        label="روش جمع‌آوری"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'auto', label: 'خودکار (سرور)', icon: <Cloud /> },
          { value: 'bridge', label: 'پل مرورگر', icon: <Bookmark /> },
          { value: 'file', label: 'ورود فایل', icon: <FileUp /> }
        ]}
      />

      <div className="pt-4">
        {/* هشدارهای مسیر خودکار در همه تب‌ها دیده می‌شوند (بعد از انتقال خودکار به پل) */}
        {collect.status === 'unavailable' && (
          <Notice tone="warn" className="mb-4" title="سرور کلکشن در دسترس نیست">{collect.message}</Notice>
        )}
        {collect.status === 'error' && (
          <Notice
            tone="error"
            className="mb-4"
            title="جمع‌آوری ناموفق"
            action={
              collect.serverUnavailable && mode !== 'bridge' ? (
                <Button size="sm" variant="outline" onClick={() => setMode('bridge')}>پل مرورگر</Button>
              ) : undefined
            }
          >
            {collect.message}
          </Notice>
        )}
        {/* ---------- خودکار ---------- */}
        {mode === 'auto' && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-muted">
              سرور دارینو آگهی‌ها را از منابع فعال می‌خواند؛ پاک‌سازی و ذخیره روی همین دستگاه انجام می‌شود.
              پیشرفت هر مرحله فوراً ذخیره می‌شود و هر وقت بخواهید می‌توانید متوقف کنید.
            </p>
            <div className="flex flex-wrap gap-2">
              {busy ? (
                <Button variant="outline" icon={<Square />} onClick={() => st.cancelCollection()}>
                  توقف
                </Button>
              ) : (
                <Button icon={<Cloud />} onClick={() => void st.startCollection()}>
                  جمع‌آوری خودکار
                </Button>
              )}
              <Button
                variant="ghost"
                icon={<PlugZap />}
                loading={diagnostics.status === 'running'}
                disabled={busy}
                onClick={() => void st.runDiagnostics()}
              >
                تست اتصال
              </Button>
            </div>

            {collect.status === 'checking' && (
              <p className="text-xs text-muted" role="status">{collect.message}</p>
            )}
            {(collect.status === 'running' || collect.status === 'done' || collect.status === 'error') &&
              SOURCES.some((s) => collect.sources[s].status !== 'idle') && (
                <ul className="space-y-2" aria-live="polite">
                  {SOURCES.map((s) => (
                    <SourceRow key={s} source={s} p={collect.sources[s]} />
                  ))}
                </ul>
              )}
            {collect.status === 'done' && collect.message && <Notice tone="success">{collect.message}</Notice>}

            {diagnostics.status === 'done' && (
              <div className="rounded-field border border-divider p-3">
                <p className="mb-2 text-xs font-semibold text-muted">
                  نتیجه تست اتصال {diagnostics.checkedAt ? `· ${fmtRelativeAge(diagnostics.checkedAt)}` : ''}
                </p>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex items-center gap-2">
                    {diagnostics.server ? <CheckCircle2 className="h-4 w-4 text-positive" aria-hidden /> : <XCircle className="h-4 w-4 text-negative" aria-hidden />}
                    سرور دارینو: {diagnostics.server ? 'در دسترس' : 'در دسترس نیست — از پل مرورگر استفاده کنید'}
                  </li>
                  {diagnostics.server &&
                    SOURCES.map((s) => {
                      const r = diagnostics.results[s];
                      return (
                        <li key={s} className="flex flex-wrap items-center gap-2">
                          {r?.ok ? <CheckCircle2 className="h-4 w-4 text-positive" aria-hidden /> : <XCircle className="h-4 w-4 text-negative" aria-hidden />}
                          سرور ← {LISTING_SOURCE_FA[s]}:{' '}
                          {r ? (r.ok ? `سالم (${toFaDigits((r.ms / 1000).toFixed(1))} ثانیه، ${fmtInt(r.listings)} آگهی در صفحه اول)` : `ناموفق — ${r.error ?? ''}`) : 'نامشخص'}
                        </li>
                      );
                    })}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ---------- پل مرورگر ---------- */}
        {mode === 'bridge' && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-muted">
              بدون نیاز به سرور: همان کلکشنر دارینو روی سایت دیوار یا شیپور در مرورگر خودتان اجرا می‌شود
              (با اینترنت خودتان، پس مسدود نمی‌شود) و نتیجه مستقیم به این صفحه می‌آید.
            </p>
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">۱</span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink">این دکمه را با کشیدن به نوار بوکمارک مرورگر اضافه کنید:</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <a
                      ref={linkRef}
                      onClick={(e) => e.preventDefault()}
                      draggable
                      className="inline-flex h-9 cursor-grab items-center gap-1.5 rounded-field border border-dashed border-accent bg-accent-soft px-3 text-xs font-bold text-accent"
                      title="به نوار بوکمارک بکشید"
                    >
                      <Bookmark className="h-3.5 w-3.5" aria-hidden /> دارینو · بازار ملک
                    </a>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Copy />}
                      onClick={() => void copyText(bookmarklet.code).then((ok) => setCopied(ok))}
                    >
                      {copied ? 'کپی شد' : 'کپی اسکریپت (برای Console)'}
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    روی موبایل یا اگر کشیدن ممکن نبود: اسکریپت را کپی کنید و در Console مرورگر (F12) روی سایت دیوار/شیپور اجرا کنید.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">۲</span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink">سایت منبع را باز کنید و روی بوکمارک «دارینو · بازار ملک» بزنید:</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {SOURCES.map((s) => (
                      <a
                        key={s}
                        href={SOURCE_SITE[s].url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-control border border-divider-strong bg-card px-3 text-xs font-semibold text-ink hover:bg-surface-2"
                      >
                        {LISTING_SOURCE_FA[s]} <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    ))}
                  </div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">۳</span>
                <p className="min-w-0 flex-1 text-ink">
                  بعد از پایان، «ارسال به دارینو» را بزنید — داده خودکار اینجا ثبت می‌شود. (یا «دانلود فایل» و سپس تب «ورود فایل»)
                </p>
              </li>
            </ol>
          </div>
        )}

        {/* ---------- ورود فایل ---------- */}
        {mode === 'file' && (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-muted">
              فایل JSON خروجی «پل مرورگر» یا اسکریپت محلی را وارد کنید. اسکریپت محلی روی کامپیوتر خودتان و بدون دیتابیس اجرا می‌شود:
            </p>
            <pre dir="ltr" className="overflow-x-auto rounded-field bg-surface-2 px-3 py-2 text-xs text-ink">
              node scripts/collect-property-market.mjs
            </pre>
            <input ref={fileRef} type="file" accept="application/json,.json" multiple className="hidden" onChange={(e) => void onFile(e)} />
            <Button variant="outline" icon={<FileUp />} onClick={() => fileRef.current?.click()}>
              انتخاب فایل JSON
            </Button>
          </div>
        )}

        {importState.status !== 'idle' && importState.message && (
          <Notice tone={importState.status === 'done' ? 'success' : 'error'} className="mt-4">
            {importState.message}
          </Notice>
        )}
      </div>

      {c && (
        <Disclosure className="mt-4 border-t border-divider pt-2" summary="کیفیت داده آخرین Snapshot">
          <ol className="grid grid-cols-3 gap-2 text-center sm:grid-cols-5">
            {[
              ['دریافتی', c.raw],
              ['معتبر', c.valid],
              ['تکراری', c.deduplicated],
              ['پرت', c.outliersRemoved],
              ['در تحلیل', c.market]
            ].map(([label, value]) => (
              <li key={label as string} className="rounded-field bg-surface-2 px-1 py-2">
                <p className="text-sm font-bold text-ink">{fmtInt(value as number)}</p>
                <p className="text-2xs text-muted">{label}</p>
              </li>
            ))}
          </ol>
          {rejects.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {rejects.map(([k, v]) => (
                <Badge key={k} tone="neutral">
                  {REJECT_REASON_FA[k] ?? k}: {fmtInt(v)}
                </Badge>
              ))}
            </div>
          )}
          {lastSnapshot?.sourceCounts && (
            <p className="mt-3 text-xs text-muted">
              سهم منابع:{' '}
              {SOURCES.filter((s) => lastSnapshot.sourceCounts?.[s])
                .map((s) => `${LISTING_SOURCE_FA[s]} ${fmtInt(lastSnapshot.sourceCounts?.[s] ?? 0)}`)
                .join(' · ')}
            </p>
          )}
        </Disclosure>
      )}
    </Surface>
  );
}
