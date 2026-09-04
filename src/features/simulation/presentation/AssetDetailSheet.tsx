/**
 * شیت جزئیات دارایی (Drill-Down) — کلیک روی ردیف جدول
 * نمایش کامل اعداد با ایزوله LTR + افزودن به Watchlist
 */
import { Star } from 'lucide-react';
import { Sheet } from '@/shared/components/ui/Sheet';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { SourceBadge } from '@/shared/components/ui/SourceBadge';
import { Button } from '@/shared/components/ui/Button';
import { useWatchlistStore } from '@/shared/store/watchlistStore';
import { toast } from '@/shared/store/toastStore';
import type { SimAssetRow } from '@/shared/types';
import { fmtUSD, fmtPct, fmtPctEn, pnlClass } from '@/shared/utils/formatters';
import { t } from '@/shared/i18n/fa';
import { cn } from '@/shared/lib/cn';

export function AssetDetailSheet({
  row,
  onClose
}: {
  row: SimAssetRow | null;
  onClose: () => void;
}) {
  const items = useWatchlistStore((s) => s.items);
  const toggle = useWatchlistStore((s) => s.toggle);
  const isWatched = row ? items[row.symbol] !== undefined : false;

  if (!row) return null;

  const fmtPrice = (v: number | null) =>
    row.unit === 'pct' ? fmtPctEn(v) : fmtUSD(v);

  const rows: { label: string; value: string; tone?: 'pos' | 'neg' }[] = [
    { label: t('buyColumn'), value: fmtPrice(row.buyPrice) },
    { label: t('currentColumn'), value: fmtPrice(row.currentPrice) },
    { label: t('valueColumn'), value: fmtUSD(row.valueUsd) },
    { label: t('plColumn'), value: fmtUSD(row.profitLoss), tone: row.profitLoss && row.profitLoss >= 0 ? 'pos' : 'neg' },
    { label: t('vsEthColumn'), value: fmtUSD(row.vsEth), tone: row.vsEth && row.vsEth >= 0 ? 'pos' : 'neg' },
    { label: 'بازده', value: fmtPct(row.changePct), tone: row.changePct && row.changePct >= 0 ? 'pos' : 'neg' }
  ];

  return (
    <Sheet open onClose={onClose} title={t('assetDetail')}>
      <div className="flex items-center gap-3">
        <AssetLogo symbol={row.symbol} kind={row.kind} size={48} />
        <div className="min-w-0 flex-1">
          <p className="tnum text-lg font-black text-ink">{row.symbol}</p>
          <p className="truncate text-[11px] font-medium text-muted">{row.nameFa}</p>
        </div>
        <SourceBadge source={row.source} />
      </div>

      <div className="mt-4 space-y-1.5">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center justify-between rounded-xl bg-line/[0.03] px-3.5 py-2.5"
          >
            <span className="text-[11px] font-bold text-muted">{r.label}</span>
            <span
              className={cn(
                'num-ltr text-[13px] font-black',
                r.tone === 'pos' ? 'text-positive' : r.tone === 'neg' ? 'text-negative' : 'text-ink'
              )}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>

      <Button
        variant={isWatched ? 'outline' : 'primary'}
        size="lg"
        className="mt-5 w-full"
        onClick={() => {
          void toggle(row.symbol);
          toast(isWatched ? 'info' : 'success', isWatched ? t('removedFromWatch') : t('addedToWatch'));
        }}
      >
        <Star className={cn('h-4 w-4', isWatched && 'fill-warn text-warn')} />
        {isWatched ? t('removeFromWatch') : t('addToWatch')}
      </Button>
    </Sheet>
  );
}
