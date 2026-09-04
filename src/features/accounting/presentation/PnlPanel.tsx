/**
 * سود/زیان — لات‌های FIFO، سود تحقق‌یافته و تحقق‌نیافته
 */
import { useMemo } from 'react';
import { Layers, TrendingUp, TrendingDown } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { useAccounting } from '@/features/accounting/data/useAccounting';
import { isCashStablecoin } from '@/features/accounting/domain/types';
import { COINS } from '@/features/simulation/domain/constants';
import { useMergedCryptoPrices } from '@/shared/hooks/useMergedCryptoPrices';
import { fmtUSD } from '@/shared/utils/formatters';
import { formatJalali } from '@/shared/utils/jalali';
import { cn } from '@/shared/lib/cn';

const SYMBOL_TO_ID = Object.fromEntries(Object.entries(COINS).map(([id, s]) => [s, id]));

export function PnlPanel() {
  const { lots, realizedPnl, holdings, cashBalance } = useAccounting();
  const merged = useMergedCryptoPrices();

  const unrealized = useMemo(() => {
    let total = 0;
    for (const h of holdings) {
      if (isCashStablecoin(h.symbol)) continue; // استیبل‌کوین = نقد (سود/زیان ندارد)
      const id = SYMBOL_TO_ID[h.symbol];
      const p = id ? merged.prices[id] : undefined;
      if (typeof p === 'number' && Number.isFinite(p)) {
        total += p * h.qty - h.costBasis;
      }
    }
    return total;
  }, [holdings, merged.prices]);

  const lotsSorted = useMemo(() => [...lots].sort((a, b) => a.openedAt - b.openedAt), [lots]);

  return (
    <div className="space-y-3">
      {/* خلاصه */}
      <div className="grid grid-cols-2 gap-2">
        <GlassCard variant="soft" className="p-3.5">
          <p className="flex items-center gap-1 text-[10px] font-bold text-muted">
            <TrendingUp className="h-3.5 w-3.5 text-positive" /> سود/زیان تحقق‌یافته
          </p>
          <p className={cn('num-ltr mt-1 text-lg font-black', realizedPnl >= 0 ? 'text-positive' : 'text-negative')}>
            {realizedPnl >= 0 ? '+' : ''}
            {fmtUSD(realizedPnl)}
          </p>
        </GlassCard>
        <GlassCard variant="soft" className="p-3.5">
          <p className="flex items-center gap-1 text-[10px] font-bold text-muted">
            <TrendingDown className="h-3.5 w-3.5 text-info" /> تحقق‌نیافته
          </p>
          <p className={cn('num-ltr mt-1 text-lg font-black', unrealized >= 0 ? 'text-positive' : 'text-negative')}>
            {unrealized >= 0 ? '+' : ''}
            {fmtUSD(unrealized)}
          </p>
        </GlassCard>
      </div>

      {/* لات‌های FIFO */}
      <GlassCard variant="soft" className="p-3.5">
        <h4 className="mb-2 flex items-center gap-1.5 text-[12px] font-black text-ink">
          <Layers className="h-4 w-4 text-accent" /> لات‌های FIFO (بهای تمام‌شده)
        </h4>
        {lotsSorted.length === 0 ? (
          <p className="text-[11px] font-medium text-muted">لاتی ثبت نشده — با خرید رمزارز ایجاد می‌شود</p>
        ) : (
          <div className="space-y-1.5">
            {lotsSorted.map((l) => (
              <div
                key={l.id}
                className={cn(
                  'flex items-center justify-between rounded-xl px-3 py-2',
                  l.closedAt ? 'bg-line/5 opacity-60' : 'bg-line/5'
                )}
              >
                <div>
                  <p className="tnum text-[11px] font-extrabold text-ink">
                    {l.asset} <span className="text-muted">#{l.id}</span>
                  </p>
                  <p className="num-ltr text-[9px] font-medium text-muted">
                    {l.qty.toFixed(6)} واحد @ {fmtUSD(l.unitCost)} · {formatJalali(l.openedAt)}
                  </p>
                </div>
                <div className="text-end">
                  <p className="num-ltr text-[10px] font-black text-ink">{fmtUSD(l.qty * l.unitCost)}</p>
                  <p className="text-[9px] font-bold text-muted">
                    {l.closedAt ? 'بسته‌شده' : 'باز'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <p className="text-center text-[9px] font-medium text-muted/70">
        ارزش کل دارایی‌ها: {fmtUSD(cashBalance + holdings.filter((h) => !isCashStablecoin(h.symbol)).reduce((s, h) => s + h.costBasis, 0) + unrealized)} (ارزش روز)
      </p>
    </div>
  );
}
