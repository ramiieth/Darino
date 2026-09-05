/**
 * ثبت قیمت محله — «ثبت قیمت جدید»
 *
 *  - شهر/محله/نوع ملک/وضعیت ساختمان: فقط از گزینه‌های آماده
 *  - قیمت هر مترمربع (تومان): دستی
 *  - نرخ دلار همان روز: پیش‌فرض از نرخ فعلی اپ — قابل ویرایش (ثبت‌شده در Snapshot)
 *  - Snapshot جدید (Immutable) — Snapshotهای قبلی هرگز تغییر نمی‌کنند
 *  - اگر برای همان تاریخ Snapshot موجود باشد، رکورد جدید merge می‌شود
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
import { cn } from '@/shared/lib/cn';

export function PriceFormSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { snapshots, addNeighborhoodSnapshot } = useRealEstateStore();
  const fxRate = useFxStore((s) => s.rate);

  const [neighborhoodId, setNeighborhoodId] = useState(NEIGHBORHOODS[0]?.id ?? '');
  const [propertyType, setPropertyType] = useState<'apartment' | 'villa'>('apartment');
  const [buildingCondition, setBuildingCondition] = useState<'new' | 'few-years' | 'old'>('new');
  const [jy, setJy] = useState('1405');
  const [jm, setJm] = useState('5');
  const [jd, setJd] = useState('18');
  const [usdRate, setUsdRate] = useState('');
  const [pricePerSqm, setPricePerSqm] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useMemo(() => {
    if (open) {
      setUsdRate(String(fxRate));
      setSaved(false);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dateLabel = useMemo(() => {
    try {
      return formatJalali(jalaaliToTimestamp(Number(jy), Number(jm), Number(jd)));
    } catch {
      return '';
    }
  }, [jy, jm, jd]);

  const usdPreview = Number(pricePerSqm) > 0 && Number(usdRate) > 0 ? Number(pricePerSqm) / Number(usdRate) : null;

  const submit = async () => {
    const ts = jalaaliToTimestamp(Number(jy), Number(jm), Number(jd));
    const rate = Number(usdRate);
    const price = Number(pricePerSqm);
    if (!(rate > 0)) { setError('نرخ دلار همان روز را وارد کنید'); return; }
    if (!(price > 0)) { setError('قیمت هر مترمربع (تومان) را وارد کنید'); return; }

    const snap = await addNeighborhoodSnapshot({
      dateTs: ts,
      dateLabel,
      usdRate: rate,
      prices: [
        {
          neighborhoodId,
          propertyType,
          buildingCondition,
          averagePricePerSqmToman: price
        }
      ]
    });
    if (snap) {
      setSaved(true);
      setError('');
    } else {
      setError('ثبت نشد — دوباره تلاش کنید');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="ثبت قیمت محله">
      <div className="space-y-3">
        <div className="rounded-lg border border-warn/20 bg-warn/5 px-2.5 py-2 text-[8px] font-medium leading-4 text-muted">
          <AlertTriangle className="me-1 inline h-3 w-3 text-warn" />
          فقط «قیمت هر مترمربع» دستی وارد می‌شود. شهر/محله/نوع ملک/وضعیت ساختمان از گزینه‌های آماده انتخاب
          می‌شوند. نرخ دلار همان روز در Snapshot فریز می‌شود — Snapshotهای قبلی هرگز تغییر نمی‌کنند.
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[9px] font-bold text-muted">شهر</label>
            <select className="h-9 w-full rounded-xl border border-line/15 bg-card px-2 text-[10px] font-bold text-ink shadow-card outline-none">
              <option>اهواز</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold text-muted">محله</label>
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
        </div>

        {/* تاریخ */}
        <div className="rounded-xl border border-line/10 bg-surface-2/40 p-2">
          <p className="mb-1.5 text-[9px] font-black text-ink">تاریخ ارزش‌گذاری (شمسی)</p>
          <div className="grid grid-cols-3 gap-2">
            <Input dir="ltr" value={jy} onChange={(e) => setJy(e.target.value)} className="h-9 text-[10px] text-start" placeholder="سال" />
            <Input dir="ltr" value={jm} onChange={(e) => setJm(e.target.value)} className="h-9 text-[10px] text-start" placeholder="ماه" />
            <Input dir="ltr" value={jd} onChange={(e) => setJd(e.target.value)} className="h-9 text-[10px] text-start" placeholder="روز" />
          </div>
          {dateLabel && (
            <p className="mt-1 text-[8px] font-medium text-muted">
              {dateLabel} · میلادی: <span className="num-ltr">{new Date(jalaaliToTimestamp(Number(jy), Number(jm), Number(jd))).toISOString().slice(0, 10)}</span>
            </p>
          )}
        </div>

        {/* قیمت */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[9px] font-bold text-muted">قیمت هر مترمربع (تومان) *</label>
            <Input dir="ltr" value={pricePerSqm} onChange={(e) => setPricePerSqm(e.target.value)} placeholder="مثلاً 50000000" className="h-9 text-[10px] text-start" />
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold text-muted">نرخ دلار همان روز</label>
            <Input dir="ltr" value={usdRate} onChange={(e) => setUsdRate(e.target.value)} className="h-9 text-[10px] text-start" />
          </div>
        </div>
        <div className="rounded-lg bg-line/5 p-2 text-[9px] font-bold">
          <p className="text-muted">معادل دلاری هر متر (اتوماتیک — فریز در Snapshot)</p>
          <p className="num-ltr text-ink">{usdPreview !== null ? `$${toFaDigits(Math.round(usdPreview).toLocaleString('en-US'))}` : '—'}</p>
        </div>

        {error && <p className="text-[9px] font-bold text-negative">{error}</p>}
        {saved && (
          <p className="rounded-lg bg-positive/10 px-2.5 py-2 text-[10px] font-black text-positive">
            ✓ قیمت محله ثبت شد — Snapshotهای قبلی تغییری نکردند.
          </p>
        )}

        <Button onClick={() => void submit()} className="w-full" disabled={saved}>
          <Save className="h-3.5 w-3.5" /> ثبت قیمت محله
        </Button>
      </div>
    </Sheet>
  );
}
