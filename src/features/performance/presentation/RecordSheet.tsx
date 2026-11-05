/**
 * فرم ثبت/ویرایش سابقهٔ ارزش دارایی — ساده و سریع
 *  تاریخ (شمسی + میلادی) · ارزش دلاری · نرخ دلار (خودکار از تاریخچهٔ تتر اپ، قابل ویرایش) ·
 *  ارزش تومانی (خودکار = دلار × نرخ، قابل جایگزینی) · توضیحات
 *  پیشنهاد ارزش از دارایی‌های متصل فقط برای امروز و فقط با لمس کاربر اعمال می‌شود.
 */
import { useEffect, useMemo, useState } from 'react';
import { Wand2 } from 'lucide-react';
import { Sheet } from '@/shared/components/ui/Sheet';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input } from '@/shared/components/ui/Input';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { Notice } from '@/shared/components/ui/StateViews';
import { useUsdRate } from '@/shared/store/usdtStore';
import { toEnDigits } from '@/shared/utils/formatters';
import { formatGregorianIso } from '@/shared/utils/jalali';
import { toast } from '@/shared/store/toastStore';
import type { ValueBreakdown, ValueRecord } from '../domain/types';
import { newId, saveRecord } from '../data/store';
import type { LiveValue } from '../data/useLiveValue';
import { Toman, Usd } from './parts';

const parseNum = (s: string): number | null => {
  const n = Number(toEnDigits(s).replace(/[,\s٬]/g, ''));
  return s.trim() && Number.isFinite(n) ? n : null;
};
const fmtInput = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(Math.round(n * 100) / 100));
const todayNoon = () => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.getTime();
};

export function RecordSheet({
  open,
  onClose,
  editing,
  existing,
  rateOn,
  live,
  preset
}: {
  open: boolean;
  onClose: () => void;
  editing: ValueRecord | null;
  existing: ValueRecord[];
  rateOn: (ts: number) => number | null;
  live: LiveValue;
  /** ثبت Snapshot از ارزش لحظه‌ای (پس از تأیید کاربر) */
  preset?: { usd: number; breakdown: ValueBreakdown | null } | null;
}) {
  const liveRate = useUsdRate();
  const [date, setDate] = useState<number | null>(null);
  const [usd, setUsd] = useState('');
  const [rate, setRate] = useState('');
  const [rateManual, setRateManual] = useState(false);
  const [toman, setToman] = useState('');
  const [tomanManual, setTomanManual] = useState(false);
  const [note, setNote] = useState('');
  const [breakdown, setBreakdown] = useState<ValueBreakdown | null>(null);
  const [origin, setOrigin] = useState<'manual' | 'live'>('manual');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDate(editing.dateTs);
      setUsd(fmtInput(editing.usd));
      setRate(fmtInput(editing.rateToman));
      setRateManual(editing.rateSource === 'manual');
      setToman(fmtInput(editing.toman));
      setTomanManual(editing.toman !== null && editing.rateToman !== null && Math.abs(editing.toman - editing.usd * editing.rateToman) > 1);
      setNote(editing.note);
      setBreakdown(editing.breakdown ?? null);
      setOrigin(editing.origin);
    } else {
      setDate(todayNoon());
      setUsd(preset ? fmtInput(preset.usd) : '');
      setRate('');
      setRateManual(false);
      setToman('');
      setTomanManual(false);
      setNote('');
      setBreakdown(preset?.breakdown ?? null);
      setOrigin(preset ? 'live' : 'manual');
    }
  }, [open, editing, preset]);

  const isToday = date !== null && formatGregorianIso(date) === formatGregorianIso(Date.now());
  // نرخ خودکار: امروز = نرخ زندهٔ اپ؛ گذشته = تاریخچهٔ روزانهٔ تتر همان روز
  const autoRate = useMemo(() => {
    if (date === null) return null;
    if (isToday && liveRate.rate) return { v: liveRate.rate, src: 'live' as const };
    const h = rateOn(date);
    return h ? { v: h, src: 'history' as const } : null;
  }, [date, isToday, liveRate.rate, rateOn]);

  useEffect(() => {
    if (!rateManual) setRate(autoRate ? String(Math.round(autoRate.v)) : '');
  }, [autoRate, rateManual]);

  const usdN = parseNum(usd);
  const rateN = parseNum(rate);
  const autoToman = usdN !== null && rateN ? usdN * rateN : null;
  useEffect(() => {
    if (!tomanManual) setToman(autoToman !== null ? String(Math.round(autoToman)) : '');
  }, [autoToman, tomanManual]);
  const tomanN = parseNum(toman);

  const duplicate = date !== null && existing.some((r) => r.id !== editing?.id && formatGregorianIso(r.dateTs) === formatGregorianIso(date));
  const valid = date !== null && usdN !== null && usdN >= 0 && (rateN === null || rateN > 0) && date <= Date.now() + 86_400_000;

  async function submit() {
    if (!valid || date === null || usdN === null) return;
    setBusy(true);
    try {
      const now = Date.now();
      const rec: ValueRecord = {
        id: editing?.id ?? newId(),
        dateTs: date,
        usd: usdN,
        rateToman: rateN,
        rateSource: rateN === null ? null : rateManual ? 'manual' : (autoRate?.src ?? 'manual'),
        toman: tomanN ?? (usdN !== null && rateN ? usdN * rateN : null),
        note: note.trim().slice(0, 500),
        origin,
        breakdown,
        createdAt: editing?.createdAt ?? now,
        updatedAt: now
      };
      await saveRecord(rec);
      toast('success', editing ? 'سابقه ویرایش شد' : 'سابقهٔ ارزش ثبت شد');
      onClose();
    } catch {
      toast('error', 'ذخیره انجام نشد؛ دوباره تلاش کنید');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'ویرایش سابقهٔ ارزش' : 'ثبت ارزش کل دارایی'}
      description="مجموع ارزش دارایی‌های مالی شما در یک تاریخ؛ این یک تراکنش نیست و موجودی‌ها را تغییر نمی‌دهد."
      footer={
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => void submit()} disabled={!valid} loading={busy}>
            {editing ? 'ذخیرهٔ تغییرات' : 'ثبت سابقه'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <SmartDateField label="تاریخ (شمسی · میلادی)" value={date} onChange={setDate} max={Date.now()} />
          {date !== null && <p className="mt-1 text-2xs text-subtle">میلادی: <span className="num-ltr">{formatGregorianIso(date)}</span></p>}
        </div>
        {duplicate && <Notice tone="warn">برای این روز قبلاً سابقه‌ای ثبت شده؛ اگر اشتباه است، رکورد قبلی را ویرایش کنید.</Notice>}

        <Field
          label="ارزش کل دارایی (دلار)"
          labelAside={
            isToday && live.total !== null && !editing ? (
              <button
                type="button"
                className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-accent"
                onClick={() => {
                  setUsd(fmtInput(live.total));
                  setBreakdown(live.breakdown);
                  setOrigin('live');
                }}
              >
                <Wand2 className="h-3.5 w-3.5" /> از دارایی‌های متصل
              </button>
            ) : undefined
          }
        >
          <Input inputMode="decimal" dir="ltr" suffix="دلار" value={usd} onChange={(e) => { setUsd(e.target.value); if (origin === 'live') { setOrigin('manual'); setBreakdown(null); } }} placeholder="مثلاً 35000" />
        </Field>
        {breakdown && origin === 'live' && (
          <p className="text-2xs leading-5 text-muted">
            تفکیک پیشنهادی: کیف پول <Usd v={breakdown.wallets} compact /> · دیفای <Usd v={breakdown.defi} compact /> · پرپچوال <Usd v={breakdown.perps} compact />
            {breakdown.bitcoin ? <> · بیت‌کوین <Usd v={breakdown.bitcoin} compact /></> : null}
            {breakdown.partial && ' · برخی منابع پاسخ نداده‌اند (ممکن است کمتر از واقع باشد)'}
          </p>
        )}

        <Field
          label="نرخ دلار (تومان)"
          labelAside={
            <span className="text-2xs text-subtle">
              {rateManual ? (
                <button type="button" className="font-semibold text-accent" onClick={() => setRateManual(false)}>
                  بازگشت به نرخ اپ
                </button>
              ) : autoRate ? (
                autoRate.src === 'live' ? 'نرخ زندهٔ اپ' : 'تاریخچهٔ تتر همان روز'
              ) : (
                'نرخ این تاریخ در اپ نیست — دستی وارد کنید'
              )}
            </span>
          }
        >
          <Input inputMode="numeric" dir="ltr" suffix="تومان" value={rate} onChange={(e) => { setRate(e.target.value); setRateManual(true); }} />
        </Field>

        <Field
          label="ارزش کل دارایی (تومان)"
          labelAside={
            tomanManual ? (
              <button type="button" className="text-2xs font-semibold text-accent" onClick={() => setTomanManual(false)}>
                محاسبهٔ خودکار
              </button>
            ) : (
              <span className="text-2xs text-subtle">خودکار = دلار × نرخ</span>
            )
          }
        >
          <Input inputMode="numeric" dir="ltr" suffix="تومان" value={toman} onChange={(e) => { setToman(e.target.value); setTomanManual(true); }} />
        </Field>
        {tomanN !== null && (
          <p className="-mt-2 text-xs text-muted">
            ≈ <Toman v={tomanN} /> {usdN !== null && <>· <Usd v={usdN} /></>}
          </p>
        )}

        <Field label="توضیحات (اختیاری)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="مثلاً بعد از برداشت برای خرید خودرو" />
        </Field>
      </div>
    </Sheet>
  );
}
