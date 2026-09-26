/**
 * Watchlist — followed assets with live price and 24h change.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Star, X } from 'lucide-react';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { IconButton, buttonClass } from '@/shared/components/ui/Button';
import { DeltaValue, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { useWatchlistStore } from '@/shared/store/watchlistStore';
import { useCryptoPrices } from '@/features/simulation/data/useCryptoPrices';
import { useAssetMeta } from '@/shared/hooks/useAssetMeta';
import { useMarketStore } from '@/shared/store/marketStore';
import {
  COINS,
  COIN_NAMES_FA,
  TOKENIZED_NAMES,
  TRADFI_NAMES,
  PRICE_SNAPSHOT_FALLBACK,
  TOKENIZED_STOCK_PRICES,
  isYieldSymbol
} from '@/features/simulation/domain/constants';
import { t } from '@/shared/i18n/fa';
import { toast } from '@/shared/store/toastStore';

export function WatchlistSection() {
  const items = useWatchlistStore((s) => s.items);
  const remove = useWatchlistStore((s) => s.remove);
  const crypto = useCryptoPrices();
  const { tokenizedPrices } = useAssetMeta();
  const stockLive = useMarketStore((s) => s.quotes);

  // Pendle entries are shown in the Pendle module, not as priced assets
  const symbols = Object.keys(items).filter((k) => !k.startsWith('pendle:'));

  const rows = useMemo(() => {
    const symToId: Record<string, string> = {};
    for (const [id, sym] of Object.entries(COINS)) symToId[sym] = id;

    return symbols.map((sym) => {
      const coinId = symToId[sym];
      let price: number | null = null;
      let change: number | null = null;
      let nameFa = sym;
      let kind: 'crypto' | 'tokenized' | 'tradfi' = 'tradfi';
      let snapshot = false;

      if (coinId) {
        const live = crypto.data?.prices?.[coinId];
        price = live ?? PRICE_SNAPSHOT_FALLBACK[coinId] ?? null;
        snapshot = live === undefined && price !== null;
        change = crypto.data?.changes24h?.[coinId] ?? null;
        nameFa = COIN_NAMES_FA[coinId] ?? sym;
        kind = 'crypto';
      } else if (TOKENIZED_STOCK_PRICES[sym] !== undefined) {
        price = tokenizedPrices[sym] ?? TOKENIZED_STOCK_PRICES[sym];
        snapshot = tokenizedPrices[sym] === undefined;
        nameFa = TOKENIZED_NAMES[sym] ?? sym;
        kind = 'tokenized';
      } else {
        const live = stockLive[sym];
        const ok = live && Number.isFinite(live.price);
        price = ok ? live.price : (PRICE_SNAPSHOT_FALLBACK[sym] ?? null);
        snapshot = !ok && price !== null;
        nameFa = TRADFI_NAMES[sym] ?? sym;
        kind = 'tradfi';
      }
      return { symbol: sym, nameFa, kind, price, change, snapshot };
    });
  }, [symbols, crypto.data, tokenizedPrices, stockLive]);

  return (
    <Section
      id="watchlist"
      title={t('watchlist')}
      description={symbols.length > 0 ? `${symbols.length.toLocaleString('fa-IR')} دارایی` : undefined}
    >
      <Surface className="px-4">
        {symbols.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-muted">
              <Star className="h-5 w-5" />
            </span>
            <p className="max-w-xs text-sm text-muted">{t('watchlistEmpty')}</p>
            <Link to="/" className={buttonClass('outline', 'sm')}>
              رفتن به بازار
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-divider">
            {rows.map((r) => (
              <li key={r.symbol} className="flex items-center gap-3 py-3">
                <AssetLogo symbol={r.symbol} kind={r.kind} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{r.nameFa}</p>
                  <p className="text-2xs font-semibold text-muted">
                    <bdi dir="ltr">{r.symbol}</bdi>
                  </p>
                </div>
                <div className="shrink-0 text-end">
                  <p className="text-sm font-semibold text-ink">
                    {isYieldSymbol(r.symbol) ? (
                      <PercentValue value={r.price} signed={false} tone="none" state={r.snapshot ? 'stale' : 'ready'} />
                    ) : (
                      <MoneyValue value={r.price} state={r.snapshot ? 'stale' : 'ready'} />
                    )}
                  </p>
                  {r.change !== null && <DeltaValue pct={r.change} className="text-xs" />}
                </div>
                <IconButton
                  size="sm"
                  aria-label={`${t('removeFromWatch')} ${r.symbol}`}
                  onClick={() => {
                    void remove(r.symbol);
                    toast('info', t('removedFromWatch'));
                  }}
                  className="-me-1"
                >
                  <X />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </Section>
  );
}
