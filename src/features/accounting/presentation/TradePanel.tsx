/**
 * خرید/فروش رمزارز با موجودی نقد — موتور تراکنش
 *  - خرید: نقد → رمزارز (سند دوطرفه + لات FIFO)
 *  - فروش: مصرف لات‌ها به روش FIFO + ثبت سود/زیان تحقق‌یافته
 *  - قیمت زنده از CoinGecko + فالبک Llama (همان هوک مشترک پروژه)
 */
import { useMemo, useState } from 'react';
import { ArrowDownUp, Wallet, ShoppingCart, BadgeDollarSign } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { useAccounting } from '@/features/accounting/data/useAccounting';
import { fifoConsume } from '@/features/accounting/domain/engine';
import { COINS, COIN_NAMES_FA } from '@/features/simulation/domain/constants';
import { isCashStablecoin, CASH_STABLECOIN_SYMBOL } from '@/features/accounting/domain/types';

const CASH_STABLECOIN_NAME = CASH_STABLECOIN_SYMBOL;
import { useMergedCryptoPrices } from '@/shared/hooks/useMergedCryptoPrices';
import { fmtUSD } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

const SYMBOL_TO_ID = Object.fromEntries(Object.entries(COINS).map(([id, s]) => [s, id]));

function Field({
  label,
  children,
  hint
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-bold text-muted">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[9px] font-medium text-muted/70">{hint}</p>}
    </div>
  );
}

export function TradePanel() {
  const { cashBalance, buyCrypto, sellCrypto, holdings, lots, refresh } = useAccounting();
  const merged = useMergedCryptoPrices();

  /* ---------- حالت خرید ---------- */
  const [buySym, setBuySym] = useState('ETH');
  const [buyQty, setBuyQty] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [buyFee, setBuyFee] = useState('');
  const [buyDate, setBuyDate] = useState<number | null>(Date.now());

  /* ---------- حالت فروش ---------- */
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

  const onBuy = async () => {
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
  };

  const onSell = async () => {
    if (!sellSym) return;
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
  };

  // استیبل‌کوین‌ها (USDT/USDC) معادل موجودی نقدند — خرید/فروش آن‌ها در اینجا معنا ندارد
  const coinOptions = Object.entries(COINS)
    .filter(([, sym]) => !isCashStablecoin(sym))
    .sort((a, b) => a[1].localeCompare(b[1]));
  const stableHeld = holdings.some((h) => isCashStablecoin(h.symbol));

  return (
    <div className="space-y-3">
      {/* موجودی نقد */}
      <GlassCard variant="soft" className="flex items-center gap-3 p-3.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-400">
          <Wallet className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-muted">موجودی نقد (دلار)</p>
          <p className="num-ltr text-lg font-black text-ink">{fmtUSD(cashBalance)}</p>
        </div>
        <button onClick={() => void refresh()} className="text-[10px] font-bold text-accent">
          به‌روزرسانی
        </button>
      </GlassCard>

      <div className="grid gap-2.5 lg:grid-cols-2">
        {/* ---------- خرید ---------- */}
        <GlassCard className="p-3.5">
          <h4 className="mb-2.5 flex items-center gap-1.5 text-[12px] font-black text-ink">
            <ShoppingCart className="h-4 w-4 text-positive" /> خرید رمزارز
          </h4>
          <div className="space-y-2.5">
            <Field label="رمزارز">
              <select
                value={buySym}
                onChange={(e) => {
                  const sym = e.target.value;
                  setBuySym(sym);
                  const p = livePrice(sym);
                  if (p) setBuyPrice(String(p));
                }}
                className="glass-inset h-10 w-full rounded-2xl px-3 text-xs font-bold text-ink outline-none"
              >
                {coinOptions.map(([id, sym]) => (
                  <option key={id} value={sym}>
                    {COIN_NAMES_FA[id] ?? sym} ({sym})
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="تعداد">
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  value={buyQty}
                  onChange={(e) => setBuyQty(e.target.value)}
                  placeholder="0.00"
                  className="h-10 text-xs text-start"
                />
              </Field>
              <Field label="قیمت واحد ($)" hint="از قیمت زنده پیش‌پر می‌شود">
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  placeholder="0.00"
                  className="h-10 text-xs text-start"
                />
                {livePrice(buySym) && (
                  <button
                    onClick={() => setBuyPrice(String(livePrice(buySym)))}
                    className="mt-1 text-[9px] font-bold text-accent"
                  >
                    قیمت زنده: {fmtUSD(livePrice(buySym))}
                  </button>
                )}
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <Field label="کارمزد ($)">
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  value={buyFee}
                  onChange={(e) => setBuyFee(e.target.value)}
                  placeholder="0.00"
                  className="h-10 text-xs text-start"
                />
              </Field>
              <SmartDateField value={buyDate} onChange={setBuyDate} label="تاریخ خرید" />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-line/5 px-3 py-2">
              <span className="text-[10px] font-bold text-muted">هزینه کل</span>
              <span className={cn('num-ltr text-[13px] font-black', buyTotal > cashBalance ? 'text-negative' : 'text-ink')}>
                {fmtUSD(buyTotal)}
              </span>
            </div>
            <Button onClick={() => void onBuy()} disabled={buyTotal <= 0} className="w-full" size="sm">
              ثبت خرید {buySym}
            </Button>
          </div>
        </GlassCard>

        {/* ---------- فروش ---------- */}
        <GlassCard className="p-3.5">
          <h4 className="mb-2.5 flex items-center gap-1.5 text-[12px] font-black text-ink">
            <BadgeDollarSign className="h-4 w-4 text-negative" /> فروش رمزارز (FIFO)
          </h4>
          <div className="space-y-2.5">
            <Field label="نگهداری">
              <select
                value={sellSym}
                onChange={(e) => {
                  const sym = e.target.value;
                  setSellSym(sym);
                  const p = livePrice(sym);
                  if (p) setSellPrice(String(p));
                }}
                className="glass-inset h-10 w-full rounded-2xl px-3 text-xs font-bold text-ink outline-none"
              >
                <option value="">انتخاب دارایی…</option>
                {holdings.filter((h) => !isCashStablecoin(h.symbol)).map((h) => (
                  <option key={h.symbol} value={h.symbol}>
                    {h.symbol} — {h.qty.toFixed(6)} واحد
                  </option>
                ))}
                {stableHeld && (
                  <option value="" disabled>
                    {CASH_STABLECOIN_NAME} = موجودی نقد (از تب مخارج استفاده کنید)
                  </option>
                )}
              </select>
              {sellHolding && (
                <p className="mt-1 text-[9px] font-medium text-muted/80">
                  میانگین بهای تمام‌شده: {fmtUSD(sellHolding.avgCost)} · موجودی:{' '}
                  {sellHolding.qty.toFixed(6)}
                </p>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="تعداد">
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  value={sellQty}
                  onChange={(e) => setSellQty(e.target.value)}
                  placeholder="0.00"
                  className="h-10 text-xs text-start"
                />
              </Field>
              <Field label="قیمت واحد ($)">
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                  placeholder="0.00"
                  className="h-10 text-xs text-start"
                />
                {sellSym && livePrice(sellSym) && (
                  <button
                    onClick={() => setSellPrice(String(livePrice(sellSym)))}
                    className="mt-1 text-[9px] font-bold text-accent"
                  >
                    قیمت زنده: {fmtUSD(livePrice(sellSym))}
                  </button>
                )}
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <Field label="کارمزد ($)">
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  value={sellFee}
                  onChange={(e) => setSellFee(e.target.value)}
                  placeholder="0.00"
                  className="h-10 text-xs text-start"
                />
              </Field>
              <SmartDateField value={sellDate} onChange={setSellDate} label="تاریخ فروش" />
            </div>
            {/* پیش‌نمایش زنده سود/زیان FIFO */}
            {sellPreview ? (
              <div className="space-y-1 rounded-xl bg-line/5 px-3 py-2 text-[10px] font-bold">
                <div className="flex justify-between text-muted">
                  <span>بهای تمام‌شده (FIFO)</span>
                  <span className="num-ltr">{fmtUSD(sellPreview.costBasis)}</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>دریافتی نقد</span>
                  <span className="num-ltr">{fmtUSD(sellPreview.proceeds - sellPreview.fee)}</span>
                </div>
                <div className="flex justify-between">
                  <span>سود/زیان تحقق‌یافته</span>
                  <span className={cn('num-ltr font-black', sellPreview.realized >= 0 ? 'text-positive' : 'text-negative')}>
                    {sellPreview.realized >= 0 ? '+' : ''}
                    {fmtUSD(sellPreview.realized)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-1.5 rounded-xl bg-line/5 px-3 py-2 text-[10px] font-bold text-muted">
                <ArrowDownUp className="h-3 w-3" /> برای پیش‌نمایش، دارایی و تعداد را وارد کنید
              </div>
            )}
            <Button
              onClick={() => void onSell()}
              disabled={!sellSym || !sellPreview}
              variant="outline"
              className="w-full"
              size="sm"
            >
              ثبت فروش
            </Button>
          </div>
        </GlassCard>
      </div>

      {/* نگهداری‌ها */}
      <GlassCard variant="soft" className="p-3.5">
        <h4 className="mb-2 text-[12px] font-black text-ink">نگهداری‌های رمزارز</h4>
        {holdings.length === 0 ? (
          <p className="text-[11px] font-medium text-muted">
            هنوز رمزارزی ندارید — از فرم خرید استفاده کنید (موجودی نقد: {fmtUSD(cashBalance)})
          </p>
        ) : (
          <div className="space-y-2">
            {holdings.map((h) => {
              const price = livePrice(h.symbol);
              const value = price ? price * h.qty : null;
              const unrealized = value !== null ? value - h.costBasis : null;
              return (
                <div key={h.symbol} className="flex items-center gap-2.5 rounded-xl bg-line/5 px-3 py-2">
                  <AssetLogo symbol={h.symbol} kind="crypto" size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="tnum text-[11px] font-extrabold text-ink">{h.symbol}</p>
                    <p className="num-ltr text-[9px] font-medium text-muted">
                      {h.qty.toFixed(6)} واحد · میانگین {fmtUSD(h.avgCost)}
                    </p>
                  </div>
                  <div className="text-end">
                    {value !== null && (
                      <p className="num-ltr text-[11px] font-black text-ink">{fmtUSD(value)}</p>
                    )}
                    {unrealized !== null && (
                      <p className={cn('num-ltr text-[9px] font-bold', unrealized >= 0 ? 'text-positive' : 'text-negative')}>
                        {unrealized >= 0 ? '+' : ''}
                        {fmtUSD(unrealized)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
