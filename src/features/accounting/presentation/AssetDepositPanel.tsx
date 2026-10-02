/**
 * Deposit asset — record any supported digital asset entering the system.
 *  - pick the asset from a searchable list (logo · name · kind · live price)
 *  - USD and Toman value computed from the live price and the system FX rate
 *  - review (dialog) → final confirmation → standard transaction engine
 *
 * ⚠️ Inflow only: no sale/purchase/withdrawal, no FIFO consumption, no realized P&L.
 */
import { useMemo, useState } from 'react';
import { Eye, CheckCheck, Lock, Check } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input, SearchField } from '@/shared/components/ui/Input';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { Badge } from '@/shared/components/ui/Badge';
import { Dialog } from '@/shared/components/ui/Sheet';
import { KeyValueList, MoneyValue, QuantityValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { useAccountingData } from './AccountingContext';
import { COINS, COIN_NAMES_FA } from '@/features/simulation/domain/constants';
import { useMergedCryptoPrices } from '@/shared/hooks/useMergedCryptoPrices';
import { useUsdRate } from '@/shared/store/usdtStore';
import { fmtToman, fmtInt } from '@/shared/utils/formatters';
import { formatDualDate } from '@/shared/utils/jalali';
import { cn } from '@/shared/lib/cn';

const STABLES = [
  { symbol: 'USDT', nameFa: 'تتر' },
  { symbol: 'USDC', nameFa: 'یواس‌دی کوین' },
  { symbol: 'DAI', nameFa: 'دای' }
];

interface AssetOption {
  symbol: string;
  id: string;
  nameFa: string;
  kind: 'crypto' | 'stablecoin';
}

const ASSETS: AssetOption[] = [
  ...Object.entries(COINS).map(([id, sym]) => ({
    symbol: sym,
    id,
    nameFa: COIN_NAMES_FA[id] ?? sym,
    kind: 'crypto' as const
  })),
  ...STABLES.map((s) => ({ symbol: s.symbol, id: '', nameFa: s.nameFa, kind: 'stablecoin' as const }))
].sort((a, b) => a.symbol.localeCompare(b.symbol));

export function AssetDepositPanel() {
  const { depositAsset } = useAccountingData();
  const merged = useMergedCryptoPrices();
  const fxRate = useUsdRate().rate;

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AssetOption | null>(null);
  const [qty, setQty] = useState('');
  const [date, setDate] = useState<number | null>(Date.now());
  const [memo, setMemo] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ASSETS;
    return ASSETS.filter(
      (a) => a.symbol.toLowerCase().includes(q) || a.nameFa.toLowerCase().includes(q) || (a.id && a.id.includes(q))
    );
  }, [query]);

  /** live price (stablecoin = $1) */
  const priceOf = (a: AssetOption): number | null => {
    if (a.kind === 'stablecoin') return 1;
    const p = merged.prices[a.id];
    return typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : null;
  };

  const qtyNum = Number(qty) || 0;
  const price = selected ? priceOf(selected) : null;
  const valueUsd = selected && price !== null && qtyNum > 0 ? qtyNum * price : null;
  const canPreview = !!selected && qtyNum > 0 && price !== null;

  const confirm = async () => {
    if (!selected || !price || qtyNum <= 0) return;
    setBusy(true);
    try {
      const ok = await depositAsset({
        symbol: selected.symbol,
        qty: qtyNum,
        unitPrice: price,
        date: date ?? Date.now(),
        memo: memo.trim() || undefined
      });
      if (ok) {
        setQty('');
        setMemo('');
        setPreviewing(false);
        setSelected(null);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* asset picker */}
      <Surface className="p-4 md:p-5 lg:col-span-5">
        <h3 className="mb-3 text-sm font-bold text-ink">۱. انتخاب دارایی</h3>
        <SearchField value={query} onChange={setQuery} placeholder="جستجوی دارایی…" />
        <ul className="mt-2 max-h-80 divide-y divide-divider overflow-y-auto" role="listbox" aria-label="دارایی‌ها">
          {filtered.length === 0 && <li className="py-6 text-center text-sm text-muted">دارایی‌ای یافت نشد</li>}
          {filtered.map((a) => {
            const p = priceOf(a);
            const isSel = selected?.symbol === a.symbol;
            return (
              <li key={a.symbol} role="option" aria-selected={isSel}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(a);
                    setPreviewing(false);
                  }}
                  className={cn(
                    '-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-field px-2 py-2.5 text-start transition-colors',
                    isSel ? 'bg-accent-soft' : 'hover:bg-surface-2'
                  )}
                >
                  <AssetLogo symbol={a.symbol} kind="crypto" size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{a.nameFa}</p>
                    <p className="text-2xs font-semibold text-muted">
                      <bdi dir="ltr">{a.symbol}</bdi>
                      {a.kind === 'stablecoin' && ' · استیبل‌کوین'}
                    </p>
                  </div>
                  <MoneyValue value={p} className="shrink-0 text-xs text-muted" />
                  {isSel && <Check aria-hidden className="h-4 w-4 shrink-0 text-accent" />}
                </button>
              </li>
            );
          })}
        </ul>
      </Surface>

      {/* amount + details */}
      <Surface className="space-y-5 p-4 md:p-6 lg:col-span-7">
        <h3 className="text-sm font-bold text-ink">۲. مقدار و جزئیات</h3>
        {!selected ? (
          <p className="rounded-field bg-surface-2 px-4 py-8 text-center text-sm text-muted">
            ابتدا دارایی را از فهرست انتخاب کنید.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <AssetLogo symbol={selected.symbol} kind="crypto" size={36} />
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-ink">{selected.nameFa}</p>
                <p className="text-xs text-muted">
                  قیمت لحظه‌ای <MoneyValue value={price} />
                </p>
              </div>
              <Badge tone="brand">انتخاب‌شده</Badge>
            </div>
            <Field label={`مقدار (${selected.symbol})`}>
              <Input
                dir="ltr"
                inputMode="decimal"
                value={qty}
                onChange={(e) => {
                  setQty(e.target.value);
                  setPreviewing(false);
                }}
                placeholder="0.00"
                suffix={selected.symbol}
                
              />
            </Field>
            {price === null && (
              <Notice tone="warn">قیمت لحظه‌ای {selected.symbol} در دسترس نیست؛ ارزش‌گذاری و ثبت پس از دریافت قیمت ممکن است.</Notice>
            )}
            {valueUsd !== null && (
              <div className="grid grid-cols-2 gap-4 rounded-field bg-surface-2 p-4">
                <div>
                  <p className="text-xs text-muted">ارزش دلاری</p>
                  <p className="text-lg font-bold text-ink"><MoneyValue value={valueUsd} /></p>
                </div>
                <div>
                  <p className="text-xs text-muted">معادل تومانی</p>
                  <p className="text-sm font-semibold text-ink">{fmtToman(valueUsd, fxRate)}</p>
                </div>
              </div>
            )}
            <SmartDateField value={date} onChange={setDate} label="تاریخ واریز" />
            <Field label="توضیحات" hint="اختیاری">
              <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
            </Field>
            <Button onClick={() => setPreviewing(true)} disabled={!canPreview} className="w-full" size="lg" icon={<Eye />}>
              بررسی و تأیید
            </Button>
          </>
        )}
      </Surface>

      <Dialog
        open={previewing && !!selected && price !== null && valueUsd !== null}
        onClose={() => setPreviewing(false)}
        title="تأیید واریز دارایی"
        description="واریز فقط موجودی را اضافه می‌کند؛ فروشی انجام نمی‌شود و سود یا زیانی ثبت نمی‌شود."
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setPreviewing(false)}>
              انصراف
            </Button>
            <Button className="flex-1" loading={busy} icon={<CheckCheck />} onClick={() => void confirm()}>
              تأیید نهایی
            </Button>
          </div>
        }
      >
        {selected && price !== null && valueUsd !== null && (
          <>
            <KeyValueList
              rows={[
                { label: 'دارایی', value: `${selected.nameFa} (${selected.symbol})` },
                { label: 'مقدار', value: <QuantityValue value={qtyNum} unit={selected.symbol} /> },
                { label: 'قیمت لحظه‌ای', value: <MoneyValue value={price} /> },
                { label: 'ارزش دلاری', emphasis: true, value: <MoneyValue value={valueUsd} /> },
                { label: 'ارزش تومانی', value: fmtToman(valueUsd, fxRate) },
                { label: 'نرخ دلار', value: fxRate ? `${fmtInt(fxRate)} تومان / دلار (تتر زنده)` : 'نرخ تتر در دسترس نیست' },
                { label: 'تاریخ', value: formatDualDate(date ?? Date.now()) },
                ...(memo.trim() ? [{ label: 'توضیحات', value: memo.trim() }] : [])
              ]}
            />
            <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted">
              <Lock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              دارایی و ارزش خالص افزایش می‌یابد و تراکنش به‌صورت دائمی در تاریخچه ثبت می‌شود.
            </p>
          </>
        )}
      </Dialog>
    </div>
  );
}
