/**
 * سوابق ارزش دارایی — فهرست، ویرایش، حذف، خروجی (CSV/JSON)
 * + واریز/برداشت خارجی (فقط برای تفکیک بازده؛ جدا از تراکنش‌های بخش دارایی)
 */
import { useMemo, useState } from 'react';
import { Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Dialog, Sheet } from '@/shared/components/ui/Sheet';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { downloadCsv } from '@/shared/utils/csv';
import { toEnDigits } from '@/shared/utils/formatters';
import { formatGregorianIso, formatJalaliLatin } from '@/shared/utils/jalali';
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
  const rows = activeRecords(records).map((r) => [formatJalaliLatin(r.dateTs), formatGregorianIso(r.dateTs), r.usd, r.rateToman ?? '', tomanOf(r) !== null ? Math.round(tomanOf(r)!) : '', r.rateSource ?? '', r.origin, r.note]);
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

  return (
    <div className="space-y-5">
      <Surface className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider p-4">
          <div>
            <h2 className="text-sm font-bold text-ink">سوابق ارزش دارایی</h2>
            <p className="mt-0.5 text-xs text-muted">{rs.length ? `${rs.length} سابقه` : 'خالی'} — هر رکورد = مجموع ارزش سرمایه در یک تاریخ</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" icon={<Download />} disabled={!rs.length} onClick={() => exportCsv(rs)}>CSV</Button>
            <Button size="sm" variant="ghost" icon={<Download />} disabled={!rs.length} onClick={() => exportJson(rs, flows)}>JSON</Button>
            <Button size="sm" icon={<Plus />} onClick={onAdd}>ثبت سابقه</Button>
          </div>
        </div>
        {!rs.length ? (
          <EmptyState className="p-6" message="سابقه‌ای ثبت نشده" hint="اولین رکورد را با تاریخ و ارزش کل دارایی ثبت کنید." />
        ) : (
          <ul className="divide-y divide-divider">
            {desc.map((r, i) => {
              const prev = desc[i + 1];
              const ch = prev ? r.usd / prev.usd - 1 : null;
              return (
                <li key={r.id} className="grid grid-cols-[auto,1fr,auto] items-center gap-x-3 gap-y-1 px-4 py-3 md:grid-cols-[8rem,1fr,1fr,auto]">
                  <DualDate ts={r.dateTs} className="text-xs" />
                  <div className="min-w-0 text-sm">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <Usd v={r.usd} className="font-bold" />
                      {ch !== null && <Pct v={ch} className="text-xs" />}
                    </div>
                    <div className="text-xs text-muted">
                      <Toman v={tomanOf(r)} />
                      {r.rateToman ? <span className="text-subtle"> · نرخ {Math.round(r.rateToman).toLocaleString('fa-IR')}</span> : <span className="text-subtle"> · نرخ نامعلوم</span>}
                    </div>
                  </div>
                  <div className="col-span-3 row-start-2 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted md:col-span-1 md:row-start-auto">
                    {r.origin === 'live' && <Badge tone="info">از دارایی‌های متصل</Badge>}
                    {r.rateSource === 'manual' && <Badge tone="neutral">نرخ دستی</Badge>}
                    {r.note && <span className="truncate">{r.note}</span>}
                  </div>
                  <div className="col-start-3 row-start-1 flex gap-1 md:col-start-auto">
                    <Button size="icon-sm" variant="ghost" icon={<Pencil />} aria-label="ویرایش سابقه" onClick={() => onEdit(r)} />
                    <Button size="icon-sm" variant="ghost" icon={<Trash2 />} aria-label="حذف سابقه" onClick={() => setRemoving(r)} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Surface>

      <Surface variant="subtle" className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-ink">واریز و برداشت خارجی</h2>
            <p className="mt-1 text-xs leading-6 text-muted">
              فقط پولی که از بیرون به سرمایه اضافه یا از آن خارج شده (مثلاً خرید تتر با ریال یا برداشت برای خرج). انتقال بین کیف پول‌ها، سواپ، بریج، ییلد و سود و زیان معاملات
              جزو بازده‌اند و اینجا ثبت نمی‌شوند.
            </p>
          </div>
          <Button size="sm" variant="outline" icon={<Plus />} onClick={() => setFlowOpen(true)}>افزودن</Button>
        </div>
        {opsInfo && opsInfo.internal > 0 && (
          <p className="mt-2 text-2xs leading-5 text-subtle">
            {opsInfo.internal.toLocaleString('fa-IR')} عملیات داخلی در بخش تراکنش‌ها (سواپ، بریج، انتقال، واریز به پلتفرم) در این بازه هست که بازده را تغییر نمی‌دهند و خودکار کنار گذاشته شدند.
          </p>
        )}
        {flows.length > 0 && (
          <ul className="mt-3 divide-y divide-divider text-xs">
            {flows.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                <DualDate ts={f.dateTs} />
                <span className="min-w-0 flex-1 truncate text-muted">{f.note}</span>
                <Usd v={f.usd} signed />
                <Button size="icon-sm" variant="ghost" icon={<Trash2 />} aria-label="حذف جریان" onClick={() => void deleteFlow(f)} />
              </li>
            ))}
          </ul>
        )}
        <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-2 text-xs leading-6 text-ink">
          <input
            type="checkbox"
            className="mt-1.5 h-4 w-4"
            checked={settings.flowsComplete}
            onChange={(e) => void saveSettings({ ...settings, flowsComplete: e.target.checked })}
          />
          <span>
            همهٔ واریز و برداشت‌های خارجی از اولین سابقه تا امروز را ثبت کرده‌ام
            <span className="block text-2xs text-muted">با تأیید این گزینه، بازده واقعی (TWR و XIRR) محاسبه می‌شود؛ بدون آن فقط «تغییر ارزش» نمایش داده می‌شود.</span>
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
            <Button variant="ghost" onClick={() => setRemoving(null)}>انصراف</Button>
          </div>
        }
      >
        {removing && <p className="text-sm"><Usd v={removing.usd} /></p>}
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
            await saveFlow({ id: newId(), dateTs: date, usd: dir === 'in' ? n : -n, note: note.trim().slice(0, 200), createdAt: now, updatedAt: now });
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
          <Input inputMode="decimal" dir="ltr" suffix="$" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="توضیح (اختیاری)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>
        <Notice tone="neutral">اگر مبلغ به تومان بوده، با نرخ همان روز به دلار تبدیل کنید.</Notice>
      </div>
    </Sheet>
  );
}
