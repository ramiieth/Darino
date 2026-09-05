/** ============================================================
 * TradFiTable — بازار سنتی (سبک — داده مرجع، بدون درخواست سنگین)
 *
 * ⚠️ فقط قیمت/MCAP مرجع با برچسب «≈ مرجع»؛ داده ناشناخته N/A.
 * این بخش داده زنده Provider ندارد (کلید سرور اختیاری) — هرگز حدس نمی‌زند.
 * ============================================================ */
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { TRADFI_ASSETS, TRADFI_NAMES, TRADFI_JUL_2026 } from '@/features/simulation/domain/constants';
import { referenceMarketCap, hasReferenceMarketCap } from '@/features/market/data/marketCapReference';
import { fmtUSD } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

const PAGE = 30;

export function TradFiTable() {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TRADFI_ASSETS.filter((a) => {
      if (!q) return true;
      return (
        a.symbol.toLowerCase().includes(q) ||
        (TRADFI_NAMES[a.symbol] ?? a.nameFa).toLowerCase().includes(q)
      );
    }).slice(0, limit);
  }, [query, limit]);

  return (
    <GlassCard className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/10 px-3 py-2">
        <p className="text-[11px] font-black text-ink">سهام / ETF / شاخص / کامودیتی / اوراق</p>
        <p className="num-ltr text-[9px] font-bold text-muted">{TRADFI_ASSETS.length} دارایی</p>
      </div>

      <div className="relative px-3 py-2">
        <Search className="pointer-events-none absolute start-6 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
          placeholder="جستجوی نماد…"
          className="glass-inset h-8 w-full rounded-xl ps-9 pe-3 text-[11px] font-bold text-ink outline-none placeholder:text-muted/60"
        />
      </div>

      {rows.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-[11px] font-black text-warn">نتیجه‌ای یافت نشد</p>
          <p className="mt-1 text-[10px] font-bold text-muted">موردی با این جستجو پیدا نشد.</p>
        </div>
      ) : (
        <div className="divide-y divide-line/5">
          {rows.map((a) => {
            const price = TRADFI_JUL_2026[a.symbol] ?? null;
            const mcap = hasReferenceMarketCap(a.symbol) ? referenceMarketCap(a.symbol) : null;
            return (
              <div key={a.symbol} className="flex items-center gap-2.5 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-extrabold text-ink">
                    {TRADFI_NAMES[a.symbol] ?? a.nameFa}
                  </p>
                  <p dir="ltr" className="text-[9px] font-black text-muted">{a.symbol}</p>
                </div>
                <div className="text-end">
                  <p className="num-ltr text-[12px] font-black text-ink">{price ? fmtUSD(price) : 'N/A'}</p>
                  <p className="text-[8px] font-bold text-muted/70">
                    MCap: {mcap ? fmtUSD(mcap, true) : 'N/A'}
                  </p>
                </div>
                <span
                  className={cn(
                    'badge shrink-0',
                    price ? 'bg-warn/10 text-warn' : 'bg-line/5 text-muted'
                  )}
                >
                  {price ? '≈ مرجع' : 'N/A'}
                </span>
              </div>
            );
          })}
          {TRADFI_ASSETS.length > limit && (
            <button
              onClick={() => setLimit((l) => l + PAGE)}
              className="w-full py-2.5 text-center text-[10px] font-black text-accent"
            >
              نمایش بیشتر
            </button>
          )}
        </div>
      )}
    </GlassCard>
  );
}
