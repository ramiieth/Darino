/**
 * Asset detail (drill-down from the simulation table) + watchlist toggle
 */
import { Star } from 'lucide-react';
import { Sheet } from '@/shared/components/ui/Sheet';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { SourceBadge } from '@/shared/components/ui/SourceBadge';
import { Button } from '@/shared/components/ui/Button';
import { KeyValueList, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { useWatchlistStore } from '@/shared/store/watchlistStore';
import { toast } from '@/shared/store/toastStore';
import type { SimAssetRow } from '@/shared/types';
import { t } from '@/shared/i18n/fa';
import { cn } from '@/shared/lib/cn';

export function AssetDetailSheet({ row, onClose }: { row: SimAssetRow | null; onClose: () => void }) {
  const items = useWatchlistStore((s) => s.items);
  const toggle = useWatchlistStore((s) => s.toggle);
  const isWatched = row ? items[row.symbol] !== undefined : false;

  if (!row) return null;

  const price = (v: number | null) =>
    row.unit === 'pct' ? <PercentValue value={v} signed={false} tone="none" /> : <MoneyValue value={v} />;

  return (
    <Sheet
      open
      onClose={onClose}
      title={row.nameFa}
      description={row.symbol}
      variant="panel"
      footer={
        <Button
          variant={isWatched ? 'outline' : 'primary'}
          size="lg"
          className="w-full"
          icon={<Star className={cn(isWatched && 'fill-current text-gold')} />}
          onClick={() => {
            void toggle(row.symbol);
            toast(isWatched ? 'info' : 'success', isWatched ? t('removedFromWatch') : t('addedToWatch'));
          }}
        >
          {isWatched ? t('removeFromWatch') : t('addToWatch')}
        </Button>
      }
    >
      <div className="flex items-center gap-3">
        <AssetLogo symbol={row.symbol} kind={row.kind} size={48} />
        <div className="min-w-0 flex-1">
          <p className="text-3xl font-extrabold tracking-tight text-ink">
            <MoneyValue value={row.valueUsd} />
          </p>
          <p className="text-sm">
            <MoneyValue value={row.profitLoss} signed tone="auto" className="font-semibold" />{' '}
            <PercentValue value={row.changePct} />
          </p>
        </div>
        <SourceBadge source={row.source} />
      </div>
      <KeyValueList
        className="mt-5"
        rows={[
          { label: t('buyColumn'), value: price(row.buyPrice) },
          { label: t('currentColumn'), value: price(row.currentPrice) },
          { label: t('valueColumn'), value: <MoneyValue value={row.valueUsd} /> },
          { label: t('plColumn'), value: <MoneyValue value={row.profitLoss} signed tone="auto" /> },
          { label: t('vsEthColumn'), value: <MoneyValue value={row.vsEth} signed tone="auto" /> },
          { label: 'بازده', value: <PercentValue value={row.changePct} /> }
        ]}
      />
    </Sheet>
  );
}
