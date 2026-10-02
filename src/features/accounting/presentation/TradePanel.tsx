/**
 * Buy / sell crypto against the cash balance — transaction engine UI
 *  - buy:  cash → crypto (double-entry + FIFO lot)
 *  - sell: consumes lots FIFO + realized P/L (fee booked separately as expense)
 *  - live price prefill from CoinGecko with Llama fallback (shared hook)
 *
 * One focused form at a time (buy | sell) with a live summary beside it.
 * Business calls and inputs are unchanged.
 */
import { useMemo, useState } from 'react';
import { ArrowDownUp, ShoppingCart, BadgeDollarSign, Zap } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { KeyValueList, MoneyValue, QuantityValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { useAccountingData } from './AccountingContext';
import { fifoConsume } from '@/features/accounting/domain/engine';
import { COINS, COIN_NAMES_FA } from '@/features/simulation/domain/constants';
import { isCashStablecoin, CASH_STABLECOIN_SYMBOL } from '@/features/accounting/domain/types';
import { useMergedCryptoPrices } from '@/shared/hooks/useMergedCryptoPrices';
import { fmtUSD } from '@/shared/utils/formatters';

const SYMBOL_TO_ID = Object.fromEntries(Object.entries(COINS).map(([id, s]) => [s, id]));

type Side = 'buy' | 'sell';

export function TradePanel() {
  const { cashBalance, buyCrypto, sellCrypto, holdings, lots } = useAccountingData();
  const merged = useMergedCryptoPrices();
  const [side, setSide] = useState<Side>('buy');
  const [busy, setBusy] = useState(false);

  /* ---------- buy ---------- */
  const [buySym, setBuySym] = useState('ETH');
  const [buyQty, setBuyQty] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [buyFee, setBuyFee] = useState('');
  const [buyDate, setBuyDate] = useState<number | null>(Date.now());

  /* ---------- sell ---------- */
  const [sellSym, setSellSym] = useState('');
  const [sellQty, setSellQty] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [sellFee, setSellFee] = useState('');
  const [sellDate, setSellDate] = useState<number | null>(Date.now());

  const livePrice = (sym: string): number | null => {
    const id = SYMBOL_TO_ID[sym];
    if (!id) return null;
    const p = merged.prices[id];
    return typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : null;
  };

  const buyTotal = useMemo(() => {
    const q = Number(buyQty);
    const p = Number(buyPrice);
    const f = Number(buyFee || 0);
    return q > 0 && p > 0 ? q * p + f : 0;
  }, [buyQty, buyPrice, buyFee]);

  const sellHolding = holdings.find((h) => h.symbol === sellSym);

  const sellPreview = useMemo(() => {
    if (!sellSym || !sellQty) return null;
    const q = Number(sellQty);
    const p = Number(sellPrice);
    if (q <= 0 || p <= 0) return null;
    try {
      const open = lots.filter((l) => l.asset === sellSym && !l.closedAt);
      const { costBasis } = fifoConsume(open, q);
      return { proceeds: q * p, costBasis, realized: q * p - costBasis, fee: Number(sellFee || 0) };
    } catch {
      return null;
    }
  }, [sellSym, sellQty, sellPrice, sellFee, lots]);

  const sellQtyNum = Number(sellQty);
  const sellTooMuch = !!sellHolding && sellQtyNum > sellHolding.qty + 1e-9;
  const buyOverCash = buyTotal > cashBalance + 1e-6;

  const onBuy = async () => {
    setBusy(true);
    try {
      const ok = await buyCrypto({
        symbol: buySym,
        qty: Number(buyQty),
        unitPrice: Number(buyPrice),
        fee: Number(buyFee || 0),
        date: buyDate ?? Date.now()
      });
      if (ok) {
        setBuyQty('');
        setBuyFee('');
        setBuyPrice(livePrice(buySym) ? String(livePrice(buySym)) : '');
      }
    } finally {
      setBusy(false);
    }
  };

  const onSell = async () => {
    if (!sellSym) return;
    setBusy(true);
    try {
      const ok = await sellCrypto({
        symbol: sellSym,
        qty: Number(sellQty),
        unitPrice: Number(sellPrice),
        fee: Number(sellFee || 0),
        date: sellDate ?? Date.now(),
        lots
      });
      if (ok) {
        setSellQty('');
        setSellFee('');
      }
    } finally {
      setBusy(false);
    }
  };

  // stablecoins are cash — buying/selling them here is meaningless
  const coinOptions = Object.entries(COINS)
    .filter(([, sym]) => !isCashStablecoin(sym))
    .sort((a, b) => a[1].localeCompare(b[1]));
  const sellable = holdings.filter((h) => !isCashStablecoin(h.symbol));

  const priceAside = (sym: string, apply: (v: string) => void) => {
    const p = livePrice(sym);
    return p ? (
      <button
        type="button"
        onClick={() => apply(String(p))}
        className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
      >
        <Zap aria-hidden className="h-3 w-3" />
        قیمت زنده {fmtUSD(p)}
      </button>
    ) : null;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <Surface className="space-y-5 p-4 md:p-6 lg:col-span-7">
        <SegmentedControl<Side>
          label="نوع معامله"
          fill
          value={side}
          onChange={setSide}
          options={[
            { value: 'buy', label: 'خرید', icon: <ShoppingCart /> },
            { value: 'sell', label: 'فروش', icon: <BadgeDollarSign /> }
          ]}
        />

        {side === 'buy' ? (
          <>
            <Field label="رمزارز">
              <Select
                value={buySym}
                onChange={(e) => {
                  const sym = e.target.value;
                  setBuySym(sym);
                  const p = livePrice(sym);
                  if (p) setBuyPrice(String(p));
                }}
              >
                {coinOptions.map(([id, sym]) => (
                  <option key={id} value={sym}>
                    {COIN_NAMES_FA[id] ?? sym} ({sym})
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="تعداد">
                <Input dir="ltr" inputMode="decimal" value={buyQty} onChange={(e) => setBuyQty(e.target.value)} placeholder="0.00" suffix={buySym} />
              </Field>
              <Field label="قیمت واحد" labelAside={priceAside(buySym, setBuyPrice)}>
                <Input dir="ltr" inputMode="decimal" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} placeholder="0.00" suffix="دلار" />
              </Field>
              <Field label="کارمزد" hint="اختیاری">
                <Input dir="ltr" inputMode="decimal" value={buyFee} onChange={(e) => setBuyFee(e.target.value)} placeholder="0.00" suffix="دلار" />
              </Field>
              <SmartDateField value={buyDate} onChange={setBuyDate} label="تاریخ خرید" />
            </div>
            <Button onClick={() => void onBuy()} disabled={buyTotal <= 0} loading={busy} className="w-full" size="lg">
              ثبت خرید {buySym}
            </Button>
          </>
        ) : (
          <>
            <Field
              label="دارایی"
              hint={
                sellHolding
                  ? `موجودی ${sellHolding.qty.toLocaleString('en-US', { maximumFractionDigits: 6 })} · میانگین ${fmtUSD(sellHolding.avgCost)}`
                  : `${CASH_STABLECOIN_SYMBOL} معادل موجودی نقد است و از بخش «برداشت نقد» مدیریت می‌شود.`
              }
            >
              <Select
                value={sellSym}
                onChange={(e) => {
                  const sym = e.target.value;
                  setSellSym(sym);
                  const p = livePrice(sym);
                  if (p) setSellPrice(String(p));
                }}
              >
                <option value="">انتخاب دارایی…</option>
                {sellable.map((h) => (
                  <option key={h.symbol} value={h.symbol}>
                    {h.symbol} — {h.qty.toLocaleString('en-US', { maximumFractionDigits: 6 })} واحد
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="تعداد"
                error={sellTooMuch ? 'بیشتر از موجودی است' : undefined}
                labelAside={
                  sellHolding ? (
                    <button type="button" onClick={() => setSellQty(String(sellHolding.qty))} className="text-xs font-semibold text-accent hover:underline">
                      همه موجودی
                    </button>
                  ) : undefined
                }
              >
                <Input dir="ltr" inputMode="decimal" value={sellQty} onChange={(e) => setSellQty(e.target.value)} placeholder="0.00" suffix={sellSym || undefined} />
              </Field>
              <Field label="قیمت واحد" labelAside={sellSym ? priceAside(sellSym, setSellPrice) : undefined}>
                <Input dir="ltr" inputMode="decimal" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} placeholder="0.00" suffix="دلار" />
              </Field>
              <Field label="کارمزد" hint="اختیاری — به‌صورت هزینه جداگانه ثبت می‌شود">
                <Input dir="ltr" inputMode="decimal" value={sellFee} onChange={(e) => setSellFee(e.target.value)} placeholder="0.00" suffix="دلار" />
              </Field>
              <SmartDateField value={sellDate} onChange={setSellDate} label="تاریخ فروش" />
            </div>
            <Button onClick={() => void onSell()} disabled={!sellSym || !sellPreview} loading={busy} className="w-full" size="lg">
              ثبت فروش {sellSym}
            </Button>
          </>
        )}
      </Surface>

      {/* live summary */}
      <aside className="lg:col-span-5" aria-live="polite">
        <div className="space-y-4 lg:sticky lg:top-8">
          <Surface variant="subtle" className="p-4 md:p-5">
            <h3 className="text-sm font-bold text-ink">{side === 'buy' ? 'خلاصه خرید' : 'پیش‌نمایش فروش'}</h3>
            {side === 'buy' ? (
              <KeyValueList
                className="mt-2"
                dense
                rows={[
                  { label: 'موجودی نقد', value: <MoneyValue value={cashBalance} /> },
                  { label: 'هزینه کل (با کارمزد)', value: <MoneyValue value={buyTotal > 0 ? buyTotal : null} /> },
                  {
                    label: 'نقد پس از خرید',
                    emphasis: true,
                    value: <MoneyValue value={buyTotal > 0 ? cashBalance - buyTotal : null} tone={buyOverCash ? 'loss' : 'none'} />
                  }
                ]}
              />
            ) : sellPreview ? (
              <KeyValueList
                className="mt-2"
                dense
                rows={[
                  { label: 'هزینهٔ خرید (از قدیمی‌ترین خریدها)', value: <MoneyValue value={sellPreview.costBasis} /> },
                  { label: 'ارزش فروش', value: <MoneyValue value={sellPreview.proceeds} /> },
                  { label: 'کارمزد', value: <MoneyValue value={sellPreview.fee} /> },
                  { label: 'دریافتی نقد', value: <MoneyValue value={sellPreview.proceeds - sellPreview.fee} /> },
                  {
                    label: 'سود و زیان این فروش',
                    hint: 'پیش از کارمزد — کارمزد جداگانه هزینه می‌شود',
                    emphasis: true,
                    value: <MoneyValue value={sellPreview.realized} signed tone="auto" />
                  }
                ]}
              />
            ) : (
              <p className="mt-3 flex items-center gap-2 text-sm text-muted">
                <ArrowDownUp aria-hidden className="h-4 w-4" />
                برای پیش‌نمایش، دارایی، تعداد و قیمت را وارد کنید.
              </p>
            )}
          </Surface>

          {side === 'buy' && buyOverCash && (
            <Notice tone="warn">هزینه کل از موجودی نقد بیشتر است؛ ثبت خرید ممکن است رد شود.</Notice>
          )}

          {sellable.length > 0 && (
            <Surface className="px-4">
              <p className="pt-3 text-xs font-semibold text-muted">نگهداری‌های فعلی</p>
              <ul className="divide-y divide-divider">
                {sellable.map((h) => {
                  const p = livePrice(h.symbol);
                  const value = p ? p * h.qty : null;
                  return (
                    <li key={h.symbol} className="flex items-center gap-3 py-2.5">
                      <AssetLogo symbol={h.symbol} kind="crypto" size={28} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink"><bdi dir="ltr">{h.symbol}</bdi></p>
                        <p className="text-xs text-muted">
                          <QuantityValue value={h.qty} /> · میانگین <MoneyValue value={h.avgCost} />
                        </p>
                      </div>
                      <div className="text-end text-sm">
                        <MoneyValue value={value} className="font-semibold text-ink" />
                        <p className="text-xs">
                          <MoneyValue value={value !== null ? value - h.costBasis : null} signed tone="auto" />
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Surface>
          )}
        </div>
      </aside>
    </div>
  );
}
