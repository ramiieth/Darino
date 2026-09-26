/**
 * ثبت Snapshot جدید — «ثبت قیمت جدید»
 *
 * دو حالت:
 *  A) به‌روزرسانی قیمت خودروهای موجود — انتخاب از لیست (بدون تایپ نام)
 *     - «همه خودروها»: به‌روزرسانی دسته‌جمعی (پیش‌فرض از آخرین Snapshot)
 *     - یک خودروی مشخص: فقط همان خودرو نمایش داده می‌شود
 *  B) ثبت خودرو جدید — فقط وقتی برند/مدل در تاریخچه نیست (تایپ دستی نام)
 *     - اگر خودرو تکراری باشد، سیستم خطا می‌دهد و پیشنهاد انتخاب از لیست می‌کند
 *
 * ⚠️ Snapshot جدید ساخته می‌شود؛ Snapshotهای قبلی هرگز تغییر نمی‌کنند.
 * ⚠️ قیمت خالی = N/A (نه ۰).
 */
import { useEffect, useMemo, useState } from 'react';
import { Save, PlusCircle, PencilLine } from 'lucide-react';
import { Sheet } from '@/shared/components/ui/Sheet';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Notice } from '@/shared/components/ui/StateViews';
import { useVehicleStore } from '../data/useVehicles';
import { formatJalali, jalaaliToTimestamp, tsToJalaali } from '@/shared/utils/jalali';
import { toFaDigits } from '@/shared/utils/formatters';
import { findExistingVehicle } from '../domain/engine';
import type { NewSnapshotInput, Vehicle } from '../domain/types';
import { cn } from '@/shared/lib/cn';

type Mode = 'update' | 'new-car';

export function NewSnapshotSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { vehicles, snapshots, addSnapshot, addVehicle } = useVehicleStore();
  const latest = snapshots[snapshots.length - 1];

  const [mode, setMode] = useState<Mode>('update');
  /* --- حالت A: به‌روزرسانی --- */
  const [selectedId, setSelectedId] = useState<string>('all'); // 'all' | vehicleId
  /* --- تاریخ + نرخ دلار --- */
  const [jy, setJy] = useState('1405');
  const [jm, setJm] = useState('6');
  const [jd, setJd] = useState('18');
  const [usdRate, setUsdRate] = useState('');
  /* --- قیمت‌ها --- */
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [dealerPrices, setDealerPrices] = useState<Record<string, string>>({});
  /* --- حالت B: خودرو جدید --- */
  const [newBrand, setNewBrand] = useState('');
  const [newName, setNewName] = useState('');
  const [newYear, setNewYear] = useState('');
  const [newCategory, setNewCategory] = useState<'imported' | 'domestic'>('domestic');
  const [newMarket, setNewMarket] = useState('');
  const [newDealer, setNewDealer] = useState('');

  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // پیش‌فرض قیمت‌ها از آخرین Snapshot (یک بار هنگام باز شدن) — اثر جانبی → useEffect
  useEffect(() => {
    if (!open) return;
    if (!latest) return;
    const m: Record<string, string> = {};
    const d: Record<string, string> = {};
    for (const r of latest.records) {
      if (r.marketPriceToman !== null) m[r.vehicleId] = String(r.marketPriceToman);
      if (r.dealerPriceToman !== null) d[r.vehicleId] = String(r.dealerPriceToman);
    }
    setPrices(m);
    setDealerPrices(d);
    setUsdRate(String(latest.usdRate));
    const j = tsToJalaali(latest.dateTs);
    setJy(String(j.year));
    setJm(String(j.month));
    setJd(String(j.day));
    setMode('update');
    setSelectedId('all');
    setNewBrand('');
    setNewName('');
    setNewYear('');
    setNewMarket('');
    setNewDealer('');
    setSaved(false);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** خودروهای گروه‌بندی‌شده بر اساس برند (برای dropdown) */
  const grouped = useMemo(() => {
    const map = new Map<string, Vehicle[]>();
    for (const v of vehicles) {
      if (!map.has(v.brand)) map.set(v.brand, []);
      map.get(v.brand)!.push(v);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fa'));
  }, [vehicles]);

  /** خودروهای قابل نمایش در حالت A */
  const visible = useMemo(
    () => (selectedId === 'all' ? vehicles : vehicles.filter((v) => v.id === selectedId)),
    [vehicles, selectedId]
  );

  const selectedVehicle = selectedId === 'all' ? null : vehicles.find((v) => v.id === selectedId) ?? null;

  /** تشخیص خودرو تکراری در حالت B (زنده) */
  const dupVehicle = useMemo(
    () => (mode === 'new-car' ? findExistingVehicle(vehicles, newBrand, newName) : null),
    [mode, vehicles, newBrand, newName]
  );

  const dateLabel = useMemo(() => {
    const jyN = Number(jy), jmN = Number(jm), jdN = Number(jd);
    if (!jyN || !jmN || !jdN) return '';
    try {
      return formatJalali(jalaaliToTimestamp(jyN, jmN, jdN));
    } catch {
      return '';
    }
  }, [jy, jm, jd]);

  const submit = async () => {
    const jyN = Number(jy), jmN = Number(jm), jdN = Number(jd);
    const rate = Number(usdRate);
    if (!jyN || !jmN || !jdN) {
      setError('تاریخ معتبر وارد کنید');
      return;
    }
    if (!(rate > 0)) {
      setError('نرخ دلار همان روز را وارد کنید');
      return;
    }
    const ts = jalaaliToTimestamp(jyN, jmN, jdN);
    if (snapshots.some((s) => s.dateTs === ts)) {
      setError('برای این تاریخ قبلاً Snapshot ثبت شده است');
      return;
    }

    let vehiclesForSnap = vehicles;

    // حالت B: ثبت خودرو جدید
    if (mode === 'new-car') {
      const dup = findExistingVehicle(vehicles, newBrand, newName);
      if (dup) {
        setError(`این خودرو قبلاً در سیستم ثبت شده است — از لیست «به‌روزرسانی قیمت» انتخاب کنید (${dup.brand} · ${dup.name})`);
        return;
      }
      const marketN = Number(newMarket);
      if (!newBrand.trim() || !newName.trim()) {
        setError('برند و نام مدل را وارد کنید');
        return;
      }
      if (!(marketN > 0)) {
        setError('قیمت بازار خودروی جدید را وارد کنید');
        return;
      }
      const newVehicle: Vehicle = {
        id: `custom-${Date.now()}-${newBrand.trim().replace(/\s+/g, '-')}-${newName.trim().replace(/\s+/g, '-')}`.toLowerCase(),
        brand: newBrand.trim(),
        name: newName.trim(),
        modelYear: newYear.trim() || null,
        category: newCategory
      };
      const added = await addVehicle(newVehicle);
      if (!added) {
        setError('ثبت خودرو ناموفق بود (تکراری؟)');
        return;
      }
      vehiclesForSnap = [...vehicles, newVehicle];
      // قیمت خودروی جدید به state قیمت‌ها اضافه می‌شود
      prices[newVehicle.id] = String(marketN);
      if (newDealer.trim()) dealerPrices[newVehicle.id] = newDealer.trim();
      setPrices({ ...prices });
      setDealerPrices({ ...dealerPrices });
    }

    const marketPrices: Record<string, number | null> = {};
    for (const v of vehiclesForSnap) {
      const raw = prices[v.id]?.trim();
      marketPrices[v.id] = raw === '' || raw === undefined ? null : Number(raw);
    }
    const dealerPricesOut: Record<string, number | null> = {};
    for (const v of vehiclesForSnap) {
      const raw = dealerPrices[v.id]?.trim();
      dealerPricesOut[v.id] = raw === '' || raw === undefined ? null : Number(raw);
    }
    const input: NewSnapshotInput = {
      dateTs: ts,
      dateLabel,
      usdRate: rate,
      priceSource: 'قیمت پیشنهادی بازار (میانگین فروشندگان و نمایشگاه‌داران)',
      marketPrices,
      dealerPrices: dealerPricesOut
    };
    const snap = await addSnapshot(input);
    if (snap) {
      setSaved(true);
      setError('');
    } else {
      setError('ثبت نشد — دوباره تلاش کنید');
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="ثبت قیمت خودرو"
      description="یک Snapshot تاریخی جدید ساخته می‌شود؛ Snapshotهای قبلی تغییر نمی‌کنند. قیمت خالی = N/A (نه صفر)."
      variant="panel"
      size="lg"
      footer={
        <div className="space-y-2">
          {error && <p className="text-sm text-negative" role="alert">{error}</p>}
          {saved && <p className="text-sm text-positive" role="status">Snapshot ثبت شد — Snapshotهای قبلی تغییری نکردند.</p>}
          <Button
            onClick={() => void submit()}
            className="w-full"
            size="lg"
            icon={<Save />}
            disabled={saved || (mode === 'new-car' && !!dupVehicle)}
          >
            {mode === 'update' ? `ثبت Snapshot (${toFaDigits(visible.length)} خودرو)` : 'ثبت خودرو جدید و Snapshot'}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <SegmentedControl<Mode>
          label="نوع ثبت"
          fill
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError('');
          }}
          options={[
            { value: 'update', label: 'به‌روزرسانی قیمت‌ها', icon: <PencilLine /> },
            { value: 'new-car', label: 'خودرو جدید', icon: <PlusCircle /> }
          ]}
        />

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-bold text-ink">تاریخ و نرخ دلار</legend>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            <Field label="سال">
              <Input dir="ltr" inputMode="numeric" value={jy} onChange={(e) => setJy(e.target.value)} />
            </Field>
            <Field label="ماه">
              <Input dir="ltr" inputMode="numeric" value={jm} onChange={(e) => setJm(e.target.value)} />
            </Field>
            <Field label="روز">
              <Input dir="ltr" inputMode="numeric" value={jd} onChange={(e) => setJd(e.target.value)} />
            </Field>
            <Field label="نرخ دلار همان روز" className="col-span-3 sm:col-span-1">
              <Input dir="ltr" inputMode="numeric" value={usdRate} onChange={(e) => setUsdRate(e.target.value)} suffix="تومان" />
            </Field>
          </div>
          {dateLabel && <p className="text-xs text-muted">تاریخ Snapshot: <span className="font-semibold text-ink">{dateLabel}</span></p>}
        </fieldset>

        {mode === 'update' && (
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-bold text-ink">قیمت‌ها</legend>
            <Field
              label="خودرو"
              hint={
                selectedVehicle
                  ? 'سایر خودروها با آخرین قیمت ثبت‌شده در Snapshot قرار می‌گیرند.'
                  : 'همه خودروها با امکان ویرایش دسته‌جمعی'
              }
            >
              <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                <option value="all">همه خودروها ({toFaDigits(vehicles.length)})</option>
                {grouped.map(([brand, list]) => (
                  <optgroup key={brand} label={brand}>
                    {list.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                        {v.modelYear ? ` (${v.modelYear})` : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </Field>

            <div className={cn('overflow-y-auto rounded-field border border-divider', selectedId === 'all' && 'max-h-[45dvh]')}>
              <table className="data-table is-compact">
                <caption className="sr-only">قیمت خودروها</caption>
                <thead>
                  <tr>
                    <th scope="col" className="!ps-3">خودرو</th>
                    <th scope="col" className="w-36">بازار (تومان)</th>
                    <th scope="col" className="w-36 !pe-3">نمایندگی (تومان)</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((v) => (
                    <tr key={v.id}>
                      <td className="!ps-3 !whitespace-normal">
                        <p className="text-sm font-semibold text-ink">
                          {v.brand} · {v.name}
                          {v.modelYear && <span className="num-ltr text-xs font-normal text-muted"> ({v.modelYear})</span>}
                        </p>
                      </td>
                      <td>
                        <Input
                          dir="ltr"
                          inputMode="numeric"
                          aria-label={`قیمت بازار ${v.name}`}
                          value={prices[v.id] ?? ''}
                          onChange={(e) => setPrices((p) => ({ ...p, [v.id]: e.target.value }))}
                          className="h-9"
                        />
                      </td>
                      <td className="!pe-3">
                        <Input
                          dir="ltr"
                          inputMode="numeric"
                          aria-label={`قیمت نمایندگی ${v.name}`}
                          value={dealerPrices[v.id] ?? ''}
                          onChange={(e) => setDealerPrices((p) => ({ ...p, [v.id]: e.target.value }))}
                          className="h-9"
                        />
                      </td>
                    </tr>
                  ))}
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-sm text-muted">خودرویی یافت نشد</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </fieldset>
        )}

        {mode === 'new-car' && (
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm font-bold text-ink">مشخصات خودرو جدید</legend>
            <Notice tone="info">
              فقط برای برند یا مدلی که در تاریخچه نیست. اگر خودرو در فهرست هست، از «به‌روزرسانی قیمت‌ها» استفاده کنید.
            </Notice>
            <div className="grid grid-cols-2 gap-4">
              <Field label="برند">
                <Input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="مثلاً: چری" />
              </Field>
              <Field label="نام مدل">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثلاً: تیگو ۹" />
              </Field>
              <Field label="سال/مدل" hint="اختیاری">
                <Input dir="ltr" value={newYear} onChange={(e) => setNewYear(e.target.value)} placeholder="1405" />
              </Field>
              <Field label="دسته">
                <Select value={newCategory} onChange={(e) => setNewCategory(e.target.value as 'imported' | 'domestic')}>
                  <option value="domestic">داخلی</option>
                  <option value="imported">وارداتی</option>
                </Select>
              </Field>
              <Field label="قیمت بازار">
                <Input dir="ltr" inputMode="numeric" value={newMarket} onChange={(e) => setNewMarket(e.target.value)} suffix="تومان" />
              </Field>
              <Field label="قیمت نمایندگی" hint="اختیاری">
                <Input dir="ltr" inputMode="numeric" value={newDealer} onChange={(e) => setNewDealer(e.target.value)} suffix="تومان" />
              </Field>
            </div>
            {dupVehicle && (
              <Notice tone="error">
                این خودرو قبلاً ثبت شده است ({dupVehicle.brand} · {dupVehicle.name}) — از «به‌روزرسانی قیمت‌ها» انتخاب کنید.
              </Notice>
            )}
          </fieldset>
        )}
      </div>
    </Sheet>
  );
}
