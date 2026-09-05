/**
 * ثبت دارایی ملک — فقط قیمت‌ها و تاریخ‌ها دستی؛
 * نوع ملک/شهر/محله/وضعیت ساختمان فقط از گزینه‌های آماده (بدون تایپ آزاد).
 * تاریخ میلادی به‌صورت اتوماتیک از شمسی ساخته می‌شود.
 */
import { useMemo, useState } from 'react';
import { Save, AlertTriangle } from 'lucide-react';
import { Sheet } from '@/shared/components/ui/Sheet';
import { Input } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { useRealEstateStore, NEIGHBORHOODS, PROPERTY_TYPES, BUILDING_CONDITIONS } from '../data/useRealEstate';
import { formatJalali, jalaaliToTimestamp } from '@/shared/utils/jalali';
import { toFaDigits } from '@/shared/utils/formatters';
import { useFxStore } from '@/shared/store/fxStore';
import type { NewRealAssetInput } from '../domain/types';
import { cn } from '@/shared/lib/cn';

export function AssetFormSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addAsset } = useRealEstateStore();
  const fxRate = useFxStore((s) => s.rate);

  /* --- ساختار: فقط از گزینه‌ها --- */
  const [propertyType, setPropertyType] = useState<'apartment' | 'villa'>('apartment');
  const [neighborhoodId, setNeighborhoodId] = useState(NEIGHBORHOODS[0]?.id ?? '');
  const [buildingCondition, setBuildingCondition] = useState<'new' | 'few-years' | 'old'>('new');

  /* --- تاریخ تملک (شمسی → میلادی اتوماتیک) --- */
  const [ownY, setOwnY] = useState('1405');
  const [ownM, setOwnM] = useState('5');
  const [ownD, setOwnD] = useState('18');
  /* --- تاریخ ارزش‌گذاری --- */
  const [valY, setValY] = useState('1405');
  const [valM, setValM] = useState('5');
  const [valD, setValD] = useState('18');

  /* --- قیمت‌ها (دستی) --- */
  const [purchasePrice, setPurchasePrice] = useState('');
  const [currentValue, setCurrentValue] = useState('');
  /* --- نرخ دلار (پیش‌فرض از نرخ فعلی اپ — قابل ویرایش؛ ثبت‌شده در دارایی) --- */
  const [ownRate, setOwnRate] = useState('');
  const [valRate, setValRate] = useState('');

  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // پیش‌فرض نرخ‌ها از نرخ فعلی اپ
  useMemo(() => {
    if (open) {
      setOwnRate(String(fxRate));
      setValRate(String(fxRate));
      setSaved(false);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ownDateJalali = useMemo(() => {
    try {
      return formatJalali(jalaaliToTimestamp(Number(ownY), Number(ownM), Number(ownD)));
    } catch {
      return '';
    }
  }, [ownY, ownM, ownD]);

  const valDateJalali = useMemo(() => {
    try {
      return formatJalali(jalaaliToTimestamp(Number(valY), Number(valM), Number(valD)));
    } catch {
      return '';
    }
  }, [valY, valM, valD]);

  const purchaseUsdPreview =
    Number(purchasePrice) > 0 && Number(ownRate) > 0
      ? Number(purchasePrice) / Number(ownRate)
      : null;
  const valueUsdPreview =
    Number(currentValue) > 0 && Number(valRate) > 0
      ? Number(currentValue) / Number(valRate)
      : null;

  const submit = async () => {
    const ownTs = jalaaliToTimestamp(Number(ownY), Number(ownM), Number(ownD));
    const valTs = jalaaliToTimestamp(Number(valY), Number(valM), Number(valD));
    const purchaseN = Number(purchasePrice);
    const valueN = Number(currentValue);
    const ownRateN = Number(ownRate);
    const valRateN = Number(valRate);

    if (!(purchaseN > 0)) { setError('قیمت خرید (تومان) را وارد کنید'); return; }
    if (!(valueN > 0)) { setError('ارزش فعلی (تومان) را وارد کنید'); return; }
    if (!(ownRateN > 0) || !(valRateN > 0)) { setError('نرخ دلار را وارد کنید'); return; }

    const input: NewRealAssetInput = {
      propertyType,
      city: 'ahvaz',
      neighborhoodId,
      buildingCondition,
      ownershipDateJalali: ownDateJalali,
      ownershipDateGregorian: ownTs,
      ownershipUsdRate: ownRateN,
      purchasePriceToman: purchaseN,
      valuationDateJalali: valDateJalali,
      valuationDateGregorian: valTs,
      valuationUsdRate: valRateN,
      currentValueToman: valueN
    };
    const asset = await addAsset(input);
    if (asset) {
      setSaved(true);
      setError('');
    } else {
      setError('ثبت نشد — دوباره تلاش کنید');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="ثبت دارایی ملک">
      <div className="space-y-3">
        <div className="rounded-lg border border-warn/20 bg-warn/5 px-2.5 py-2 text-[8px] font-medium leading-4 text-muted">
          <AlertTriangle className="me-1 inline h-3 w-3 text-warn" />
          فقط قیمت خرید و ارزش فعلی دستی وارد می‌شود. نام دارایی/نوع ملک/شهر/محله/وضعیت ساختمان از گزینه‌های
          آماده انتخاب می‌شود (بدون تایپ آزاد). تاریخ میلادی به‌صورت خودکار از شمسی ساخته می‌شود.
        </div>

        {/* ساختار — گزینه‌های آماده */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[9px] font-bold text-muted">نوع ملک</label>
            <select
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value as 'apartment' | 'villa')}
              className="h-9 w-full rounded-xl border border-line/15 bg-card px-2 text-[10px] font-bold text-ink shadow-card outline-none"
            >
              {PROPERTY_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold text-muted">وضعیت ساختمان</label>
            <select
              value={buildingCondition}
              onChange={(e) => setBuildingCondition(e.target.value as 'new' | 'few-years' | 'old')}
              className="h-9 w-full rounded-xl border border-line/15 bg-card px-2 text-[10px] font-bold text-ink shadow-card outline-none"
            >
              {BUILDING_CONDITIONS.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-[9px] font-bold text-muted">شهر</label>
            <select className="h-9 w-full rounded-xl border border-line/15 bg-card px-2 text-[10px] font-bold text-ink shadow-card outline-none">
              <option>اهواز</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-[9px] font-bold text-muted">محله (از لیست تعریف‌شده)</label>
            <select
              value={neighborhoodId}
              onChange={(e) => setNeighborhoodId(e.target.value)}
              className="h-9 w-full rounded-xl border border-line/15 bg-card px-2 text-[10px] font-bold text-ink shadow-card outline-none"
            >
              {NEIGHBORHOODS.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* تاریخ تملک */}
        <div className="rounded-xl border border-line/10 bg-surface-2/40 p-2">
          <p className="mb-1.5 text-[9px] font-black text-ink">تاریخ تملک (شمسی)</p>
          <div className="grid grid-cols-3 gap-2">
            <Input dir="ltr" value={ownY} onChange={(e) => setOwnY(e.target.value)} className="h-9 text-[10px] text-start" placeholder="سال" />
            <Input dir="ltr" value={ownM} onChange={(e) => setOwnM(e.target.value)} className="h-9 text-[10px] text-start" placeholder="ماه" />
            <Input dir="ltr" value={ownD} onChange={(e) => setOwnD(e.target.value)} className="h-9 text-[10px] text-start" placeholder="روز" />
          </div>
          {ownDateJalali && (
            <p className="mt-1 text-[8px] font-medium text-muted">
              {ownDateJalali} · میلادی: <span className="num-ltr">{new Date(jalaaliToTimestamp(Number(ownY), Number(ownM), Number(ownD))).toISOString().slice(0, 10)}</span> (اتوماتیک)
            </p>
          )}
        </div>

        {/* تاریخ ارزش‌گذاری */}
        <div className="rounded-xl border border-line/10 bg-surface-2/40 p-2">
          <p className="mb-1.5 text-[9px] font-black text-ink">تاریخ ارزش‌گذاری (شمسی)</p>
          <div className="grid grid-cols-3 gap-2">
            <Input dir="ltr" value={valY} onChange={(e) => setValY(e.target.value)} className="h-9 text-[10px] text-start" placeholder="سال" />
            <Input dir="ltr" value={valM} onChange={(e) => setValM(e.target.value)} className="h-9 text-[10px] text-start" placeholder="ماه" />
            <Input dir="ltr" value={valD} onChange={(e) => setValD(e.target.value)} className="h-9 text-[10px] text-start" placeholder="روز" />
          </div>
          {valDateJalali && (
            <p className="mt-1 text-[8px] font-medium text-muted">
              {valDateJalali} · میلادی: <span className="num-ltr">{new Date(jalaaliToTimestamp(Number(valY), Number(valM), Number(valD))).toISOString().slice(0, 10)}</span> (اتوماتیک)
            </p>
          )}
        </div>

        {/* قیمت‌ها */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[9px] font-bold text-muted">قیمت خرید (تومان) *</label>
            <Input dir="ltr" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="مثلاً 10000000000" className="h-9 text-[10px] text-start" />
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold text-muted">نرخ دلار تاریخ تملک</label>
            <Input dir="ltr" value={ownRate} onChange={(e) => setOwnRate(e.target.value)} className="h-9 text-[10px] text-start" />
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold text-muted">ارزش فعلی (تومان) *</label>
            <Input dir="ltr" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} placeholder="مثلاً 13000000000" className="h-9 text-[10px] text-start" />
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold text-muted">نرخ دلار تاریخ ارزش‌گذاری</label>
            <Input dir="ltr" value={valRate} onChange={(e) => setValRate(e.target.value)} className="h-9 text-[10px] text-start" />
          </div>
        </div>

        {/* پیش‌نمایش دلاری */}
        <div className="grid grid-cols-2 gap-1.5 text-[9px] font-bold">
          <div className="rounded-lg bg-line/5 p-2">
            <p className="text-muted">معادل دلاری خرید (اتوماتیک)</p>
            <p className="num-ltr text-ink">{purchaseUsdPreview !== null ? `$${toFaDigits(Math.round(purchaseUsdPreview).toLocaleString('en-US'))}` : '—'}</p>
          </div>
          <div className="rounded-lg bg-line/5 p-2">
            <p className="text-muted">معادل دلاری ارزش فعلی (اتوماتیک)</p>
            <p className="num-ltr text-ink">{valueUsdPreview !== null ? `$${toFaDigits(Math.round(valueUsdPreview).toLocaleString('en-US'))}` : '—'}</p>
          </div>
        </div>

        {error && <p className="text-[9px] font-bold text-negative">{error}</p>}
        {saved && (
          <p className="rounded-lg bg-positive/10 px-2.5 py-2 text-[10px] font-black text-positive">
            ✓ دارایی ملک ثبت شد — سود تومانی/دلاری به‌صورت خودکار محاسبه می‌شود.
          </p>
        )}

        <Button onClick={() => void submit()} className="w-full" disabled={saved}>
          <Save className="h-3.5 w-3.5" /> ثبت دارایی ملک
        </Button>
      </div>
    </Sheet>
  );
}
