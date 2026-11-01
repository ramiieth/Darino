/**
 * ورود استیتمنت متاتریدر — یک لمس: فایل را انتخاب یا رها کنید، خلاصه را ببینید، ذخیره
 *   فایل روی همین دستگاه خوانده می‌شود (بدون ارسال به سرور).
 *
 *   MT4: Account History → راست‌کلیک → Save as Detailed Report (.htm)
 *   MT5: History → راست‌کلیک → Report → HTML (یا CSV با همان سرستون‌ها)
 * شمارهٔ حساب: از متن فایل؛ وگرنه از نام فایل (MT5: ReportHistory-<login>)؛ وگرنه تنها حساب واردشدهٔ قبلی — تایپ لازم نیست.
 * ساعت سرور: پیش‌فرض «بستن نیویورک» (اغلب بروکرها)؛ فقط در «تنظیمات بیشتر».
 * ورود دوباره همان فایل یا فایل بزرگ‌تر فقط پوزیشن‌های تازه را اضافه می‌کند (کلید = حساب + تیکت).
 */
import { useMemo, useRef, useState } from 'react';
import { FileUp, Trash2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { Sheet } from '@/shared/components/ui/Sheet';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Notice } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import { decodeStatement, loginFromFileName, parseStatement, type MtParseResult, type MtTrade, type ServerTime } from '../domain/metatrader';
import { deleteMtAccount, saveMtTrades } from '../data/journalStore';
import { fa, faDate, pnlTone, usd } from './parts';

const SERVER_TIME: { value: string; label: string }[] = [
  { value: 'ny', label: 'بستن نیویورک: UTC+2 زمستان / UTC+3 تابستان (اغلب بروکرها)' },
  { value: '0', label: 'UTC+0' },
  { value: '1', label: 'UTC+1' },
  { value: '2', label: 'UTC+2 ثابت' },
  { value: '3', label: 'UTC+3 ثابت' }
];

const HOW: Record<'mt5' | 'mt4' | 'phone', string[]> = {
  mt5: ['در متاتریدر ۵ دسکتاپ پایین صفحه زبانهٔ History را باز کنید.', 'راست‌کلیک ← Report ← HTML (بازه: All History).', 'فایل ReportHistory را این‌جا انتخاب کنید.'],
  mt4: ['در متاتریدر ۴ زبانهٔ Account History را باز کنید.', 'راست‌کلیک ← All History، بعد دوباره راست‌کلیک ← Save as Detailed Report.', 'فایل Statement.htm را این‌جا انتخاب کنید.'],
  phone: ['اپ موبایل متاتریدر استیتمنت نمی‌سازد.', 'از پنل بروکر (بخش History / Statement) گزارش HTML یا CSV را دانلود کنید، یا فایل را از کامپیوتر به Files آیفون بفرستید.', 'این‌جا «انتخاب فایل» را بزنید و فایل را از Files باز کنید.']
};

export function MetaTraderImport({ open, onClose, existing }: { open: boolean; onClose: () => void; existing: MtTrade[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [serverTime, setServerTime] = useState('ny');
  const [login, setLogin] = useState('');
  const [how, setHow] = useState<'mt5' | 'mt4' | 'phone'>('mt5');
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const logins = [...new Set(existing.map((m) => m.login))];
  const mode: ServerTime = serverTime === 'ny' ? 'ny' : Number(serverTime);
  const guessLogin = login || loginFromFileName(fileName) || (logins.length === 1 ? logins[0] : null);
  const result: MtParseResult | null = useMemo(() => (text ? parseStatement(text, { serverTime: mode, login: null }) : null), [text, mode]);
  // شمارهٔ حساب فایل اولویت دارد؛ وگرنه حدس بالا تا ورود دوباره تکراری نسازد
  const final = useMemo(() => (result && !result.login && guessLogin ? parseStatement(text!, { serverTime: mode, login: guessLogin }) : result), [result, guessLogin, text, mode]);
  const known = new Set(existing.map((m) => m.id));
  const fresh = final ? final.trades.filter((t) => !known.has(t.id)).length : 0;
  const range = final?.trades.length ? [Math.min(...final.trades.map((t) => t.openTime)), Math.max(...final.trades.map((t) => t.closeTime))] : null;
  const net = final ? final.trades.reduce((s, t) => s + t.profit + t.commission + t.swap, 0) : 0;
  const symbols = final ? [...new Set(final.trades.map((t) => t.symbol))] : [];

  async function pick(file: File | undefined) {
    setErr(null); setMsg(null);
    if (!file) return;
    if (file.size > 20_000_000) return setErr('فایل بزرگ‌تر از ۲۰ مگابایت است.');
    setFileName(file.name);
    setText(decodeStatement(new Uint8Array(await file.arrayBuffer())));
  }

  async function save() {
    if (!final?.trades.length) return;
    setBusy(true);
    try {
      const n = await saveMtTrades(final.trades, existing);
      setMsg(n ? `${fa(n)} پوزیشن به ژورنال اضافه شد${n < final.trades.length ? ` (${fa(final.trades.length - n)} قبلاً بود)` : ''}.` : 'همهٔ این پوزیشن‌ها قبلاً وارد شده بودند.');
      setText(null); setFileName('');
      if (input.current) input.current.value = '';
    } catch {
      setErr('ذخیره نشد؛ دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  }

  const warnings = (final?.warnings ?? []).filter((w) => !(final?.login && w.startsWith('شمارهٔ حساب')));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="ورود استیتمنت متاتریدر"
      description="فایل فقط روی همین دستگاه خوانده می‌شود؛ پوزیشن‌ها مثل بقیهٔ ژورنال بین دستگاه‌هایتان همگام می‌شوند."
      footer={final?.trades.length ? <Button size="lg" className="w-full" loading={busy} onClick={() => void save()}>{fresh ? `افزودن ${fa(fresh)} پوزیشن تازه` : 'ذخیره'}</Button> : undefined}
    >
      <div className="space-y-4 text-sm">
        <input ref={input} type="file" accept=".htm,.html,.csv,.txt,text/html,text/csv" className="sr-only" aria-label="فایل استیتمنت" onChange={(e) => void pick(e.target.files?.[0])} />
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void pick(e.dataTransfer.files[0]); }}
          className={cn('flex w-full flex-col items-center gap-2 rounded-card border-2 border-dashed p-6 text-center transition-colors', drag ? 'border-accent bg-accent-soft' : 'border-divider-strong hover:border-accent')}
        >
          <FileUp className="h-7 w-7 text-accent" aria-hidden />
          <span className="text-sm font-bold text-ink">{fileName || 'انتخاب فایل استیتمنت'}</span>
          <span className="text-xs text-muted">{fileName ? 'برای فایل دیگر دوباره بزنید' : 'HTML یا CSV · روی کامپیوتر می‌توانید فایل را این‌جا رها کنید'}</span>
        </button>

        {final && (final.trades.length ? (
          <div className="rounded-card border border-divider p-3">
            <p className="text-xs text-muted">
              {final.format === 'mt4' ? 'MT4' : final.format === 'mt5' ? 'MT5' : 'CSV'}{final.login && final.login !== 'unknown' ? ` · حساب ${final.login}` : ''}{final.currency ? ` · ${final.currency}` : ''}
              {range ? ` · ${faDate(range[0])} تا ${faDate(range[1])}` : ''}
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div><p className="num-ltr text-lg font-bold text-ink">{fa(final.trades.length)}</p><p className="text-[11px] text-muted">پوزیشن</p></div>
              <div><p className="num-ltr text-lg font-bold text-accent">{fa(fresh)}</p><p className="text-[11px] text-muted">تازه</p></div>
              <div><p className={cn('num-ltr text-lg font-bold', pnlTone(net))}>{usd(net, true)}</p><p className="text-[11px] text-muted">سود خالص</p></div>
            </div>
            <p className="mt-2 text-[11px] text-subtle" dir="ltr">{symbols.slice(0, 8).join(' · ')}{symbols.length > 8 ? ' …' : ''}</p>
          </div>
        ) : (
          <Notice tone="warn">در این فایل جدول معاملات بسته پیدا نشد. گزارش «Detailed» در MT4 یا Report ← HTML در MT5 لازم است (راهنمای پایین).</Notice>
        ))}
        {warnings.map((w) => <Notice key={w} tone="info">{w}</Notice>)}
        {msg && <Notice tone="success">{msg}</Notice>}
        {err && <p className="text-xs text-negative">{err}</p>}

        <Disclosure summary="فایل استیتمنت را از کجا بیاورم؟" defaultOpen={!existing.length && !text}>
          <div className="space-y-2">
            <SegmentedControl size="sm" label="نسخه" value={how} onChange={setHow} options={[{ value: 'mt5', label: 'MT5' }, { value: 'mt4', label: 'MT4' }, { value: 'phone', label: 'فقط موبایل دارم' }]} />
            <ol className="list-decimal space-y-1 ps-5 text-xs leading-6 text-muted">{HOW[how].map((s) => <li key={s}>{s}</li>)}</ol>
          </div>
        </Disclosure>

        <Disclosure summary="تنظیمات بیشتر (معمولاً لازم نیست)">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ساعت سرور بروکر">
              <Select value={serverTime} onChange={(e) => setServerTime(e.target.value)}>
                {SERVER_TIME.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            {result && !result.login && (
              <Field label="شمارهٔ حساب (اگر در فایل نبود)">
                <Input inputMode="numeric" dir="ltr" placeholder={guessLogin ?? ''} value={login} onChange={(e) => setLogin(e.target.value.replace(/\D/g, '').slice(0, 20))} />
              </Field>
            )}
          </div>
        </Disclosure>

        {logins.length > 0 && (
          <div className="space-y-1 border-t border-divider pt-3 text-xs text-muted">
            <p className="font-semibold text-ink">حساب‌های واردشده</p>
            {logins.map((l) => (
              <div key={l} className="flex items-center gap-2">
                <span>{l === 'unknown' ? 'حساب بی‌شماره' : `حساب ${l}`}: {fa(existing.filter((m) => m.login === l).length)} پوزیشن</span>
                <Button size="sm" variant="ghost" className="ms-auto" icon={<Trash2 />} onClick={() => { if (window.confirm(`همهٔ پوزیشن‌های واردشدهٔ ${l === 'unknown' ? 'حساب بی‌شماره' : `حساب ${l}`} حذف شود؟`)) void deleteMtAccount(l, existing); }}>حذف</Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
