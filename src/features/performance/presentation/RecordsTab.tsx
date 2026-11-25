/**
 * سوابق ارزش دارایی — ریدیزاین مدرن با نوار خلاصه، تایم‌لاین تمیز و مدیریت واریز/برداشت خارجی
 */
import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Download, History, Pencil, Plus, Trash2 } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Dialog, Sheet } from '@/shared/components/ui/Sheet';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { cn } from '@/shared/lib/cn';
import { downloadCsv } from '@/shared/utils/csv';
import { toEnDigits, toFaDigits } from '@/shared/utils/formatters';
import { formatGregorianIso, formatJalali, formatJalaliLatin } from '@/shared/utils/jalali';
import { toast } from '@/shared/store/toastStore';
import { activeRecords, classifyOps, tomanOf } from '../domain/engine';
import type { ExternalFlow, PerfSettings, ValueRecord } from '../domain/types';
import { deleteFlow, deleteRecord, newId, saveFlow, saveSettings } from '../data/store';
import { DualDate, Pct, Toman, Usd } from './parts';

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function exportCsv(records: ValueRecord[]) {
  const head = ['jalali_date', 'gregorian_date', 'total_usd', 'usd_rate_toman', 'total_toman', 'rate_source', 'origin', 'note'];
  const rows = activeRecords(records).map((r) => [
    formatJalaliLatin(r.dateTs),
    formatGregorianIso(r.dateTs),
    r.usd,
    r.rateToman ?? '',
    tomanOf(r) !== null ? Math.round(tomanOf(r)!) : '',
    r.rateSource ?? '',
    r.origin,
    r.note
  ]);
  downloadCsv(`darino-asset-history-${formatGregorianIso(Date.now())}.csv`, '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n'));
}

function exportJson(records: ValueRecord[], flows: ExternalFlow[]) {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), records: activeRecords(records), externalFlows: flows }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `darino-asset-history-${formatGregorianIso(Date.now())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function RecordsTab({
  records,
  flows,
  settings,
  ops,
  onAdd,
  onEdit
}: {
  records: ValueRecord[];
  flows: ExternalFlow[];
  settings: PerfSettings;
  ops: { kind: string; occurredAt: number | null; voidedAt: number | null }[];
  onAdd: () => void;
  onEdit: (r: ValueRecord) => void;
}) {
  const rs = useMemo(() => activeRecords(records), [records]);
  const desc = useMemo(() => [...rs].reverse(), [rs]);
  const [removing, setRemoving] = useState<ValueRecord | null>(null);
  const [flowOpen, setFlowOpen] = useState(false);
  const opsInfo = useMemo(() => (rs.length ? classifyOps(ops, rs[0].dateTs, Date.now()) : null), [ops, rs]);
  const netFlowsUsd = useMemo(() => flows.reduce((sum, f) => sum + f.usd, 0), [flows]);

  return (
    <div className="space-y-5">
      {/* نوار خلاصه آماری سوابق */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Surface className="border border-divider/80 p-3.5">
          <p className="text-[11px] font-semibold text-muted">تعداد سوابق ثبت‌شده</p>
          <p className="mt-1 text-lg font-black text-ink tabular-nums">{toFaDigits(rs.length)} سابقه</p>
          <p className="mt-0.5 text-[11px] text-subtle">
            {rs.length >= 2 ? `${formatJalali(rs[0].dateTs)} تا ${formatJalali(rs[rs.length - 1].dateTs)}` : 'نیاز به حداقل ۲ سابقه'}
          </p>
        </Surface>

        <Surface className="border border-divider/80 p-3.5">
          <p className="text-[11px] font-semibold text-muted">خالص واریز / برداشت خارجی</p>
          <p className="mt-1 text-lg font-black text-ink">
            {flows.length > 0 ? <Usd v={netFlowsUsd} signed /> : '۰ دلار'}
          </p>
          <p className="mt-0.5 text-[11px] text-subtle">{toFaDigits(flows.length)} جریان نقدی ثبت‌شده</p>
        </Surface>

        <Surface className="border border-divider/80 p-3.5 flex flex-col justify-between">
          <p className="text-[11px] font-semibold text-muted">وضعیت محاسبه بازده واقعی (TWR)</p>
          <div className="mt-1.5">
            <Badge tone={settings.flowsComplete ? 'gain' : 'warn'}>
              {settings.flowsComplete ? 'بازده واقعی TWR / XIRR فعال' : 'فقط تغییر ارزش (جریان‌ها تکمیل نشده)'}
            </Badge>
          </div>
        </Surface>
      </div>

      {/* لیست تایم‌لاین سوابق ارزش دارایی */}
      <Surface className="overflow-hidden border border-divider/80 p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider/80 bg-surface-2/35 p-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-accent" aria-hidden />
            <div>
              <h2 className="text-sm font-extrabold text-ink">تاریخچه سوابق ارزش دارایی</h2>
              <p className="text-[11px] text-muted">هر رکورد = مجموع ارزش کل سرمایه در یک تاریخ مشخص</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" icon={<Download className="h-3.5 w-3.5" />} disabled={!rs.length} onClick={() => exportCsv(rs)}>
              CSV
            </Button>
            <Button size="sm" variant="outline" icon={<Download className="h-3.5 w-3.5" />} disabled={!rs.length} onClick={() => exportJson(rs, flows)}>
              JSON
            </Button>
            <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={onAdd}>
              ثبت سابقه
            </Button>
          </div>
        </div>

        {!rs.length ? (
          <EmptyState className="p-6" message="سابقه‌ای ثبت نشده" hint="اولین رکورد را با تاریخ و ارزش کل دارایی ثبت کنید." />
        ) : (
          <ul className="divide-y divide-divider/70">
            {desc.map((r, i) => {
              const prev = desc[i + 1];
              const ch = prev ? r.usd / prev.usd - 1 : null;
              return (
                <li
                  key={r.id}
                  className="grid grid-cols-[auto,1fr,auto] items-center gap-x-3.5 gap-y-1.5 px-4 py-3.5 transition-colors hover:bg-surface-2/40 md:grid-cols-[8.5rem,1fr,1fr,auto]"
                >
                  <DualDate ts={r.dateTs} className="text-xs font-semibold" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Usd v={r.usd} className="text-sm font-black text-ink" />
                      {ch !== null && (
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-extrabold',
                            ch >= 0 ? 'bg-emerald-500/12 text-positive' : 'bg-rose-500/12 text-negative'
                          )}
                        >
                          <Pct v={ch} />
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      <Toman v={tomanOf(r)} />
                      {r.rateToman ? (
                        <span className="text-subtle"> · نرخ {Math.round(r.rateToman).toLocaleString('fa-IR')}</span>
                      ) : (
                        <span className="text-subtle"> · نرخ نامعلوم</span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-3 row-start-2 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted md:col-span-1 md:row-start-auto">
                    {r.origin === 'live' && <Badge tone="info">از دارایی‌های متصل</Badge>}
                    {r.rateSource === 'manual' && <Badge tone="neutral">نرخ دستی</Badge>}
                    {r.note && <span className="truncate">{r.note}</span>}
                  </div>
                  <div className="col-start-3 row-start-1 flex gap-1 md:col-start-auto">
                    <Button size="icon-sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} aria-label="ویرایش سابقه" onClick={() => onEdit(r)} />
                    <Button size="icon-sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5 text-negative" />} aria-label="حذف سابقه" onClick={() => setRemoving(r)} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Surface>

      {/* بخش واریز و برداشت خارجی */}
      <Surface className="border border-divider/80 p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-ink">واریز و برداشت خارجی</h2>
            <p className="mt-0.5 text-xs leading-6 text-muted">
              فقط پولی که از بیرون به سرمایه اضافه یا برای خرج از آن خارج شده است. سواپ، بریج، انتقال بین کیف پول‌ها و سود معاملات اینجا ثبت نمی‌شوند.
            </p>
          </div>
          <Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setFlowOpen(true)}>
            افزودن جریان نقدی
          </Button>
        </div>

        {opsInfo && opsInfo.internal > 0 && (
          <p className="rounded-xl bg-surface-2/50 px-3 py-2 text-[11px] text-muted">
            {opsInfo.internal.toLocaleString('fa-IR')} عملیات داخلی (سواپ، بریج، انتقال) به‌صورت خودکار کنار گذاشته شدند تا بازده واقعی مخدوش نشود.
          </p>
        )}

        {flows.length > 0 && (
          <ul className="divide-y divide-divider/70 rounded-xl border border-divider/70 bg-surface-2/25 text-xs">
            {flows.map((f) => {
              const isIn = f.usd >= 0;
              return (
                <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex h-6 w-6 items-center justify-center rounded-lg',
                        isIn ? 'bg-emerald-500/15 text-positive' : 'bg-rose-500/15 text-negative'
                      )}
                    >
                      {isIn ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                    </span>
                    <DualDate ts={f.dateTs} />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-muted">{f.note || (isIn ? 'واریز خارجی' : 'برداشت خارجی')}</span>
                  <Usd v={f.usd} signed className="font-bold" />
                  <Button size="icon-sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} aria-label="حذف جریان" onClick={() => void deleteFlow(f)} />
                </li>
              );
            })}
          </ul>
        )}

        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-divider/75 bg-surface-2/40 p-3 text-xs leading-6 text-ink">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-[rgb(var(--c-brand-500))]"
            checked={settings.flowsComplete}
            onChange={(e) => void saveSettings({ ...settings, flowsComplete: e.target.checked })}
          />
          <span>
            <strong className="font-bold">همهٔ واریز و برداشت‌های خارجی از اولین سابقه تا امروز را ثبت کرده‌ام</strong>
            <span className="block text-[11px] text-muted">
              با فعال کردن این گزینه، بازده واقعی سرمایه‌گذاری (TWR و XIRR) در تب مقایسه نمایش داده می‌شود.
            </span>
          </span>
        </label>
      </Surface>

      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="حذف این سابقه؟"
        description={removing ? `${formatJalaliLatin(removing.dateTs)} — این سابقه از نمودار و مقایسه‌ها حذف می‌شود.` : undefined}
        footer={
          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="flex-1"
              onClick={async () => {
                if (removing) await deleteRecord(removing);
                setRemoving(null);
                toast('success', 'سابقه حذف شد');
              }}
            >
              حذف
            </Button>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              انصراف
            </Button>
          </div>
        }
      >
        {removing && (
          <p className="text-sm">
            <Usd v={removing.usd} />
          </p>
        )}
      </Dialog>

      <FlowSheet open={flowOpen} onClose={() => setFlowOpen(false)} />
    </div>
  );
}

function FlowSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [date, setDate] = useState<number | null>(Date.now());
  const [dir, setDir] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const n = Number(toEnDigits(amount).replace(/[,\s]/g, ''));
  const valid = date !== null && amount.trim() !== '' && Number.isFinite(n) && n > 0;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="واریز یا برداشت خارجی"
      size="sm"
      footer={
        <Button
          className="w-full"
          disabled={!valid}
          onClick={async () => {
            if (!valid || date === null) return;
            const now = Date.now();
            await saveFlow({
              id: newId(),
              dateTs: date,
              usd: dir === 'in' ? n : -n,
              note: note.trim().slice(0, 200),
              createdAt: now,
              updatedAt: now
            });
            setAmount('');
            setNote('');
            toast('success', 'جریان نقدی ثبت شد');
            onClose();
          }}
        >
          ثبت
        </Button>
      }
    >
      <div className="space-y-4">
        <SmartDateField label="تاریخ" value={date} onChange={setDate} max={Date.now()} />
        <Field label="نوع">
          <Select value={dir} onChange={(e) => setDir(e.target.value as 'in' | 'out')}>
            <option value="in">واریز از بیرون (افزایش سرمایه)</option>
            <option value="out">برداشت به بیرون (کاهش سرمایه)</option>
          </Select>
        </Field>
        <Field label="مبلغ (دلار)">
          <Input inputMode="decimal" dir="ltr" suffix="دلار" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="توضیح (اختیاری)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>
        <Notice tone="neutral">اگر مبلغ به تومان بوده، با نرخ همان روز به دلار تبدیل کنید.</Notice>
      </div>
    </Sheet>
  );
}
