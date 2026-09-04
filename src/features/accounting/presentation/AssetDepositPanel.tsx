/**
 * واریز دارایی (Deposit Asset)
 *
 * ثبت ورود هر نوع دارایی دیجیتال به سیستم — کاملاً مستقل:
 *  - انتخاب دارایی فقط از طریق Asset Explorer (جستجو/فیلتر/لوگو/نوع)
 *  - محاسبه خودکار ارزش دلاری و تومانی (قیمت لحظه‌ای + نرخ ارز سیستم)
 *  - پیش‌نمایش کامل ← «تأیید نهایی» ← ثبت از مسیر استاندارد Transaction Engine
 *
 * ⚠️ فقط ورود موجودی: بدون فروش/خرید/برداشت مخارج — بدون FIFO مصرفی، بدون Realized P&L
 * افزایش دارایی (و Net Worth) بدون تغییر در Cost Basis یا تاریخچه معاملات قبلی
 */
import { useMemo, useState } from 'react';
import { Search, Plus, Eye, CheckCheck, Coins, Lock } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { useAccounting } from '@/features/accounting/data/useAccounting';
import { isCashStablecoin } from '@/features/accounting/domain/types';
import { COINS, COIN_NAMES_FA } from '@/features/simulation/domain/constants';
import { useMergedCryptoPrices } from '@/shared/hooks/useMergedCryptoPrices';
import { useFxStore } from '@/shared/store/fxStore';
import { fmtUSD, fmtToman, fmtInt } from '@/shared/utils/formatters';
import { formatDualDate } from '@/shared/utils/jalali';
import { cn } from '@/shared/lib/cn';

/** تمام دارایی‌های پشتیبانی‌شده: رمزارزها (CoinGecko) + استیبل‌کوین‌های نقدی */
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

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[10px] font-bold">
      <span className="text-muted">{label}</span>
      <span className="num-ltr text-ink">{value}</span>
    </div>
  );
}

export function AssetDepositPanel() {
  const { depositAsset } = useAccounting();
  const merged = useMergedCryptoPrices();
  const fxRate = useFxStore((s) => s.rate);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AssetOption | null>(null);
  const [qty, setQty] = useState('');
  const [date, setDate] = useState<number | null>(Date.now());
  const [memo, setMemo] = useState('');
  const [previewing, setPreviewing] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ASSETS;
    return ASSETS.filter(
      (a) =>
        a.symbol.toLowerCase().includes(q) ||
        a.nameFa.toLowerCase().includes(q) ||
        (a.id && a.id.includes(q))
    );
  }, [query]);

  /** قیمت لحظه‌ای دارایی (استیبل‌کوین = ۱ دلار) */
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
  };

  return (
    <div className="space-y-3">
      {/* Explorer انتخاب دارایی */}
      <GlassCard className="p-3.5">
        <h4 className="mb-2 flex items-center gap-1.5 text-[12px] font-black text-ink">
          <Coins className="h-4 w-4 text-accent" /> انتخاب دارایی (Explorer)
        </h4>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی دارایی…"
            className="glass-inset h-10 w-full rounded-2xl ps-9 pe-3 text-[11px] font-bold text-ink outline-none placeholder:text-muted/60 focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto pe-1">
          {filtered.length === 0 && (
            <p className="py-4 text-center text-[11px] font-medium text-muted">
              دارایی‌ای یافت نشد
            </p>
          )}
          {filtered.map((a) => {
            const p = priceOf(a);
            const isSel = selected?.symbol === a.symbol;
            return (
              <button
                key={a.symbol}
                onClick={() => {
                  setSelected(a);
                  setPreviewing(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start transition-all',
                  isSel ? 'bg-accent/15 ring-1 ring-accent/40' : 'hover:bg-line/5'
                )}
              >
                <AssetLogo symbol={a.symbol} kind={a.kind === 'stablecoin' ? 'crypto' : 'crypto'} size={26} />
                <div className="min-w-0 flex-1">
                  <p className="tnum truncate text-[11px] font-extrabold text-ink">{a.symbol}</p>
                  <p className="truncate text-[9px] font-medium text-muted">{a.nameFa}</p>
                </div>
                <span
                  className={cn(
                    'badge shrink-0 ring-1',
                    a.kind === 'stablecoin'
                      ? 'bg-emerald-400/10 text-emerald-400 ring-emerald-400/20'
                      : 'bg-line/5 text-muted ring-line/10'
                  )}
                >
                  {a.kind === 'stablecoin' ? 'استیبل‌کوین' : 'رمزارز'}
                </span>
                {p !== null && (
                  <span className="num-ltr shrink-0 text-[9px] font-bold text-muted">
                    {fmtUSD(p)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </GlassCard>

      {/* فرم مقدار */}
      {selected && (
        <GlassCard className="p-3.5">
          <div className="mb-2.5 flex items-center gap-2.5">
            <AssetLogo symbol={selected.symbol} kind="crypto" size={28} />
            <div className="min-w-0 flex-1">
              <p className="tnum text-[12px] font-extrabold text-ink">{selected.symbol}</p>
              <p className="text-[9px] font-medium text-muted">{selected.nameFa}</p>
            </div>
            <span className="badge bg-accent/10 text-accent ring-1 ring-accent/20">انتخاب‌شده</span>
          </div>
          <div className="space-y-2.5">
            <div>
              <label className="mb-1 block text-[11px] font-bold text-muted">
                مقدار ({selected.symbol})
              </label>
              <Input
                dir="ltr"
                inputMode="decimal"
                value={qty}
                onChange={(e) => {
                  setQty(e.target.value);
                  setPreviewing(false);
                }}
                placeholder="0.00"
                className="h-10 text-xs text-start"
              />
            </div>
            {price !== null ? (
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-line/5 px-3 py-2 text-[10px] font-bold">
                <span className="text-muted">ارزش دلاری</span>
                <span className="num-ltr text-end text-positive">{fmtUSD(valueUsd ?? 0)}</span>
                <span className="text-muted">ارزش تومانی</span>
                <span className="num-ltr text-end text-accent">
                  {valueUsd ? fmtToman(valueUsd, fxRate) : '—'}
                </span>
              </div>
            ) : (
              <p className="rounded-xl bg-warn/10 px-3 py-2 text-[10px] font-bold text-warn">
                قیمت لحظه‌ای {selected.symbol} در دسترس نیست — بعداً تلاش کنید
              </p>
            )}
            <SmartDateField value={date} onChange={setDate} label="تاریخ واریز" />
            <Input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="توضیحات (اختیاری)"
              className="h-10 text-xs"
            />
            <Button onClick={() => setPreviewing(true)} disabled={!canPreview} className="w-full" size="sm">
              <Eye className="h-3.5 w-3.5" /> پیش‌نمایش واریز
            </Button>
          </div>
        </GlassCard>
      )}

      {/* پیش‌نمایش کامل — قبل از ثبت نهایی */}
      {previewing && selected && price !== null && valueUsd !== null && (
        <GlassCard className="border-accent/30 p-3.5">
          <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-black text-ink">
            <Eye className="h-3.5 w-3.5 text-accent" /> پیش‌نمایش — بررسی و تأیید نهایی
          </p>
          <div className="space-y-1.5 rounded-2xl bg-line/5 p-3">
            <p className="mb-1 text-[10px] font-black text-muted">اطلاعات دارایی</p>
            <PreviewRow label="نام دارایی" value={selected.nameFa} />
            <PreviewRow label="نماد" value={selected.symbol} />
            <PreviewRow label="مقدار" value={`${qtyNum} ${selected.symbol}`} />
            <div className="my-1 border-t border-line/10" />
            <p className="mb-1 text-[10px] font-black text-muted">ارزش‌گذاری</p>
            <PreviewRow label="قیمت لحظه‌ای" value={fmtUSD(price)} />
            <PreviewRow label="ارزش دلاری" value={fmtUSD(valueUsd)} />
            <PreviewRow label="ارزش تومانی" value={fmtToman(valueUsd, fxRate)} />
            <PreviewRow label="نرخ دلار استفاده‌شده" value={`${fmtInt(fxRate)} تومان / دلار`} />
            <div className="my-1 border-t border-line/10" />
            <p className="mb-1 text-[10px] font-black text-muted">اطلاعات تراکنش</p>
            <PreviewRow label="تاریخ شمسی" value={formatDualDate(date ?? Date.now()).split(' · ')[0]} />
            <PreviewRow label="تاریخ میلادی" value={formatDualDate(date ?? Date.now()).split(' · ')[1]} />
            <PreviewRow label="نوع عملیات" value="واریز دارایی" />
            {memo.trim() && <PreviewRow label="توضیحات" value={memo.trim()} />}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[9px] font-medium leading-4 text-muted/70">
            <Lock className="mt-0.5 h-3 w-3 shrink-0" />
            واریز فقط ورود موجودی است: بدون FIFO، بدون سود/زیان؛ دارایی و ارزش خالص افزایش
            می‌یابد و سند به‌صورت غیرقابل تغییر در دفتر کل ثبت می‌شود.
          </p>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => setPreviewing(false)} variant="outline" size="sm" className="flex-1">
              انصراف
            </Button>
            <Button onClick={() => void confirm()} size="sm" className="flex-1">
              <CheckCheck className="h-3.5 w-3.5" /> تأیید نهایی
            </Button>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
