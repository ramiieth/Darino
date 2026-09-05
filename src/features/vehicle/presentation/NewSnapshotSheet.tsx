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
import { useMemo, useState } from 'react';
import { Save, AlertTriangle, PlusCircle, PencilLine } from 'lucide-react';
import { Sheet } from '@/shared/components/ui/Sheet';
import { Input } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { useVehicleStore } from '../data/useVehicles';
import { formatJalali, jalaaliToTimestamp, tsToJalaali } from '@/shared/utils/jalali';
import { fmtTomanAmount, toFaDigits } from '@/shared/utils/formatters';
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

  // پیش‌فرض قیمت‌ها از آخرین Snapshot (یک بار هنگام باز شدن)
  useMemo(() => {
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
    <Sheet open={open} onClose={onClose} title="ثبت قیمت خودرو">
      <div className="space-y-3">
        <div className="rounded-lg border border-warn/20 bg-warn/5 px-2.5 py-2 text-[8px] font-medium leading-4 text-muted">
          <AlertTriangle className="me-1 inline h-3 w-3 text-warn" />
          این عمل یک Snapshot تاریخی جدید می‌سازد. قیمت‌های Snapshotهای قبلی به هیچ عنوان تغییر نمی‌کنند.
          قیمت خالی = N/A (نه صفر).
        </div>

        {/* انتخاب حالت */}
        <div className="flex gap-1 rounded-xl bg-surface-2/70 p-1">
          <button
            onClick={() => { setMode('update'); setError(''); }}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[10px] font-black transition-colors',
              mode === 'update' ? 'bg-card text-accent shadow-card' : 'text-muted hover:text-ink'
            )}
          >
            <PencilLine className="h-3.5 w-3.5" /> به‌روزرسانی قیمت خودروهای موجود
          </button>
          <button
            onClick={() => { setMode('new-car'); setError(''); }}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[10px] font-black transition-colors',
              mode === 'new-car' ? 'bg-card text-accent shadow-card' : 'text-muted hover:text-ink'
            )}
          >
            <PlusCircle className="h-3.5 w-3.5" /> ثبت خودرو جدید
          </button>
        </div>

        {/* تاریخ + نرخ دلار (مشترک) */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-[9px] font-bold text-muted">سال</label>
            <Input dir="ltr" value={jy} onChange={(e) => setJy(e.target.value)} className="h-9 text-[10px] text-start" />
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold text-muted">ماه</label>
            <Input dir="ltr" value={jm} onChange={(e) => setJm(e.target.value)} className="h-9 text-[10px] text-start" />
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold text-muted">روز</label>
            <Input dir="ltr" value={jd} onChange={(e) => setJd(e.target.value)} className="h-9 text-[10px] text-start" />
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold text-muted">نرخ دلار روز</label>
            <Input dir="ltr" value={usdRate} onChange={(e) => setUsdRate(e.target.value)} className="h-9 text-[10px] text-start" />
          </div>
        </div>
        {dateLabel && <p className="text-[9px] font-bold text-ink">تاریخ: {dateLabel}</p>}

        {/* ===== حالت A: به‌روزرسانی ===== */}
        {mode === 'update' && (
          <>
            {/* انتخاب خودرو — بدون تایپ دستی */}
            <div>
              <label className="mb-1 block text-[9px] font-bold text-muted">
                انتخاب خودرو (از لیست — بدون تایپ نام)
              </label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="h-10 w-full rounded-xl border border-line/15 bg-card px-2 text-[10px] font-bold text-ink shadow-card outline-none hover:border-line/25"
              >
                <option value="all">همه خودروها ({toFaDigits(vehicles.length)}) — به‌روزرسانی دسته‌جمعی</option>
                {grouped.map(([brand, list]) => (
                  <optgroup key={brand} label={brand}>
                    {list.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                        {v.modelYear ? ` (${v.modelYear})` : ''}
                        {prices[v.id] ? ` — ${fmtTomanAmount(Number(prices[v.id]))}` : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {selectedVehicle && (
                <p className="mt-1 text-[8px] font-medium text-muted">
                  خودروی انتخابی: <span className="font-bold text-ink">{selectedVehicle.brand} · {selectedVehicle.name}</span>
                  {selectedVehicle.modelYear && <span className="num-ltr"> ({selectedVehicle.modelYear})</span>}
                  — سایر خودروها با آخرین قیمت ثبت‌شده در Snapshot قرار می‌گیرند (برای تغییر آن‌ها «همه خودروها» را انتخاب کنید).
                </p>
              )}
            </div>

            {/* لیست قیمت‌ها (فیلترشده) */}
            <div className={cn('space-y-1 overflow-y-auto rounded-xl border border-line/10 bg-surface-2/40 p-2', selectedId === 'all' ? 'max-h-[38vh]' : '')}>
              {visible.map((v) => (
                <div key={v.id} className="flex items-center gap-2 rounded-lg bg-card px-2 py-1.5 shadow-card">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[9px] font-extrabold text-ink">
                      {v.brand} · {v.name}
                      {v.modelYear && <span className="num-ltr text-[8px] text-muted"> ({v.modelYear})</span>}
                    </p>
                    {prices[v.id] && (
                      <p className="num-ltr text-[8px] font-medium text-muted">
                        قبلی: {fmtTomanAmount(Number(prices[v.id]))}
                      </p>
                    )}
                  </div>
                  <div className="w-28">
                    <label className="block text-[9px] font-bold text-muted">بازار (تومان)</label>
                    <Input dir="ltr" value={prices[v.id] ?? ''} onChange={(e) => setPrices((p) => ({ ...p, [v.id]: e.target.value }))} className="h-7 text-[9px] text-start" />
                  </div>
                  <div className="w-28">
                    <label className="block text-[9px] font-bold text-muted">نمایندگی (تومان)</label>
                    <Input dir="ltr" value={dealerPrices[v.id] ?? ''} onChange={(e) => setDealerPrices((p) => ({ ...p, [v.id]: e.target.value }))} className="h-7 text-[9px] text-start" />
                  </div>
                </div>
              ))}
              {visible.length === 0 && (
                <p className="py-4 text-center text-[9px] font-bold text-muted">خودرویی یافت نشد</p>
              )}
            </div>
          </>
        )}

        {/* ===== حالت B: خودرو جدید ===== */}
        {mode === 'new-car' && (
          <>
            <div className="rounded-lg border border-info/20 bg-info/5 px-2.5 py-2 text-[8px] font-medium leading-4 text-muted">
              فقط وقتی از این بخش استفاده کنید که خودرو **جدید** است و قبلاً در تاریخچه Snapshot وجود ندارد
              (برند/مدل جدید). اگر خودرو در لیست است، از حالت «به‌روزرسانی قیمت» انتخاب کنید.
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[9px] font-bold text-muted">برند *</label>
                <Input dir="rtl" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="مثلاً: چری" className="h-9 text-[10px]" />
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold text-muted">نام مدل *</label>
                <Input dir="rtl" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثلاً: تیگو ۹" className="h-9 text-[10px]" />
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold text-muted">سال/مدل (اختیاری)</label>
                <Input dir="ltr" value={newYear} onChange={(e) => setNewYear(e.target.value)} placeholder="1405 یا 2025" className="h-9 text-[10px] text-start" />
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold text-muted">دسته</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as 'imported' | 'domestic')}
                  className="h-9 w-full rounded-xl border border-line/15 bg-card px-2 text-[10px] font-bold text-ink shadow-card outline-none"
                >
                  <option value="domestic">داخلی</option>
                  <option value="imported">وارداتی</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold text-muted">قیمت بازار (تومان) *</label>
                <Input dir="ltr" value={newMarket} onChange={(e) => setNewMarket(e.target.value)} placeholder="مثلاً 2500000000" className="h-9 text-[10px] text-start" />
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold text-muted">قیمت نمایندگی (اختیاری)</label>
                <Input dir="ltr" value={newDealer} onChange={(e) => setNewDealer(e.target.value)} className="h-9 text-[10px] text-start" />
              </div>
            </div>

            {/* هشدار تکراری */}
            {dupVehicle && (
              <p className="rounded-lg border border-negative/20 bg-negative/8 px-2.5 py-2 text-[9px] font-bold text-negative">
                ⚠ این خودرو قبلاً در سیستم ثبت شده است: {dupVehicle.brand} · {dupVehicle.name}
                — از حالت «به‌روزرسانی قیمت» انتخاب کنید، نه ثبت جدید.
              </p>
            )}
          </>
        )}

        {error && <p className="text-[9px] font-bold text-negative">{error}</p>}
        {saved && (
          <p className="rounded-lg bg-positive/10 px-2.5 py-2 text-[10px] font-black text-positive">
            ✓ Snapshot ثبت شد — Snapshotهای قبلی تغییری نکردند.
          </p>
        )}

        <Button
          onClick={() => void submit()}
          className="w-full"
          disabled={saved || (mode === 'new-car' && !!dupVehicle)}
        >
          <Save className="h-3.5 w-3.5" />
          {mode === 'update'
            ? `ثبت Snapshot (${toFaDigits(visible.length)} خودرو)`
            : 'ثبت خودرو جدید + Snapshot'}
        </Button>
      </div>
    </Sheet>
  );
}
