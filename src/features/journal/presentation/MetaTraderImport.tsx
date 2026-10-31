/**
 * ورود استیتمنت متاتریدر — فایل روی همین دستگاه خوانده می‌شود (بدون ارسال به سرور)، پیش‌نمایش، بعد ذخیره
 *
 *   MT4: Account History → راست‌کلیک → Save as Detailed Report (.htm)
 *   MT5: History → راست‌کلیک → Report → HTML (یا CSV با همان سرستون‌ها)
 * ورود دوباره همان فایل یا فایل بزرگ‌تر فقط پوزیشن‌های تازه را اضافه می‌کند (کلید = حساب + تیکت).
 */
import { useState } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { Dialog } from '@/shared/components/ui/Sheet';
import { Notice } from '@/shared/components/ui/StateViews';
import { decodeStatement, parseStatement, type MtParseResult, type MtTrade, type ServerTime } from '../domain/metatrader';
import { deleteMtAccount, saveMtTrades } from '../data/journalStore';
import { fa, faDateTime, usd } from './parts';

const SERVER_TIME: { value: string; label: string }[] = [
  { value: 'ny', label: 'بستن نیویورک: UTC+2 زمستان / UTC+3 تابستان (اغلب بروکرها)' },
  { value: '0', label: 'UTC+0' },
  { value: '1', label: 'UTC+1' },
  { value: '2', label: 'UTC+2 ثابت' },
  { value: '3', label: 'UTC+3 ثابت' }
];

export function MetaTraderImport({ open, onClose, existing }: { open: boolean; onClose: () => void; existing: MtTrade[] }) {
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [serverTime, setServerTime] = useState('ny');
  const [login, setLogin] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const mode: ServerTime = serverTime === 'ny' ? 'ny' : Number(serverTime);
  const result: MtParseResult | null = text ? parseStatement(text, { serverTime: mode, login: login || null }) : null;
  const known = new Set(existing.map((m) => m.id));
  const fresh = result ? result.trades.filter((t) => !known.has(t.id)).length : 0;
  const logins = [...new Set(existing.map((m) => m.login))];

  async function pick(file: File | undefined) {
    setErr(null); setMsg(null);
    if (!file) return;
    if (file.size > 20_000_000) return setErr('فایل بزرگ‌تر از ۲۰ مگابایت است.');
    setFileName(file.name);
    setText(decodeStatement(new Uint8Array(await file.arrayBuffer())));
  }

  async function save() {
    if (!result?.trades.length) return;
    if (!result.login) return setErr('شمارهٔ حساب را وارد کنید.');
    setBusy(true);
    try {
      const n = await saveMtTrades(result.trades, existing);
      setMsg(`${fa(n)} پوزیشن ذخیره شد${n < result.trades.length ? ` (${fa(result.trades.length - n)} قبلاً بود)` : ''}.`);
      setText(null); setFileName('');
    } catch {
      setErr('ذخیره نشد؛ دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  }

  const range = result?.trades.length ? [Math.min(...result.trades.map((t) => t.openTime)), Math.max(...result.trades.map((t) => t.closeTime))] : null;
  const net = result ? result.trades.reduce((s, t) => s + t.profit + t.commission + t.swap, 0) : 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="ورود استیتمنت متاتریدر"
      description="فایل روی همین دستگاه خوانده می‌شود و به سرور فرستاده نمی‌شود؛ فقط پوزیشن‌های استخراج‌شده مثل بقیهٔ دادهٔ ژورنال همگام می‌شوند."
      footer={<Button disabled={!result?.trades.length || busy} onClick={() => void save()}>{busy ? 'در حال ذخیره…' : result?.trades.length ? `ذخیرهٔ ${fa(result.trades.length)} پوزیشن` : 'ذخیره'}</Button>}
    >
      <div className="space-y-3 text-sm">
        <p className="text-xs leading-6 text-muted">
          MT4: پنجرهٔ Account History ← راست‌کلیک ← Save as Detailed Report. MT5: History ← راست‌کلیک ← Report ← HTML. بازهٔ «All History» را انتخاب کنید.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="فایل استیتمنت (.htm، .html، .csv)">
            <Input type="file" accept=".htm,.html,.csv,.txt" onChange={(e) => void pick(e.target.files?.[0])} dir="ltr" />
          </Field>
          <Field label="ساعت سرور بروکر">
            <Select value={serverTime} onChange={(e) => setServerTime(e.target.value)}>
              {SERVER_TIME.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          {result && !result.login && (
            <Field label="شمارهٔ حساب متاتریدر">
              <Input inputMode="numeric" value={login} onChange={(e) => setLogin(e.target.value.replace(/\D/g, '').slice(0, 20))} dir="ltr" />
            </Field>
          )}
        </div>

        {result && (result.trades.length ? (
          <div className="rounded-lg border border-divider p-3 text-xs leading-6">
            <p className="font-medium text-ink">{fileName} · {result.format === 'mt4' ? 'MT4' : result.format === 'mt5' ? 'MT5' : 'CSV'}{result.login ? ` · حساب ${result.login}` : ''}{result.currency ? ` · ${result.currency}` : ''}</p>
            <p className="text-muted">
              {fa(result.trades.length)} پوزیشن بسته ({fa(fresh)} تازه){range ? ` · ${faDateTime(range[0])} تا ${faDateTime(range[1])}` : ''} · سود خالص {usd(net)}
              {result.skipped ? ` · ${fa(result.skipped)} ردیف غیرمعامله (بالانس، سفارش لغوشده، جمع) کنار گذاشته شد` : ''}
            </p>
            <p className="text-muted">
              اندازهٔ قرارداد هر لات: {Object.entries(result.contract).map(([s, v]) => `${s} ${v === null ? 'نامعلوم' : fa(v)}`).join('، ')}
            </p>
          </div>
        ) : (
          <Notice tone="warn">در این فایل جدول معاملات بسته پیدا نشد. مطمئن شوید گزارش «Detailed» (MT4) یا Report → HTML بخش Positions (MT5) است.</Notice>
        ))}
        {result?.warnings.map((w) => <Notice key={w} tone="info">{w}</Notice>)}
        {msg && <Notice tone="success">{msg}</Notice>}
        {err && <p className="text-xs text-negative">{err}</p>}

        {logins.length > 0 && (
          <div className="border-t border-divider pt-3 text-xs text-muted">
            {logins.map((l) => (
              <div key={l} className="flex items-center gap-2">
                <span>حساب {l}: {fa(existing.filter((m) => m.login === l).length)} پوزیشن واردشده</span>
                <Button size="sm" variant="ghost" className="ms-auto" onClick={() => { if (window.confirm(`همهٔ پوزیشن‌های واردشدهٔ حساب ${l} حذف شود؟`)) void deleteMtAccount(l, existing); }}>حذف</Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
