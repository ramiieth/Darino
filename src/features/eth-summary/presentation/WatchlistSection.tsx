/**
 * لیست پیگیری (Watchlist) — نمایش روی داشبورد با قیمت زنده
 */
import { useMemo } from 'react';
import { Star, X } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
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
  TOKENIZED_STOCK_PRICES
} from '@/features/simulation/domain/constants';
import { fmtUSD, fmtPctEn } from '@/shared/utils/formatters';
import { isYieldSymbol } from '@/features/simulation/domain/constants';
import { t } from '@/shared/i18n/fa';
import { toast } from '@/shared/store/toastStore';

export function WatchlistSection() {
  const items = useWatchlistStore((s) => s.items);
  const remove = useWatchlistStore((s) => s.remove);
  const crypto = useCryptoPrices();
  const { tokenizedPrices } = useAssetMeta();
  const stockLive = useMarketStore((s) => s.quotes);

  const symbols = Object.keys(items);

  const rows = useMemo(() => {
    // نگاشت نماد → شناسه رمزارز
    const symToId: Record<string, string> = {};
    for (const [id, sym] of Object.entries(COINS)) symToId[sym] = id;

    return symbols.map((sym) => {
      const coinId = symToId[sym];
      let price: number | null = null;
      let nameFa = sym;
      let kind: 'crypto' | 'tokenized' | 'tradfi' = 'tradfi';

      if (coinId) {
        price = crypto.data?.prices?.[coinId] ?? PRICE_SNAPSHOT_FALLBACK[coinId] ?? null;
        nameFa = COIN_NAMES_FA[coinId] ?? sym;
        kind = 'crypto';
      } else if (TOKENIZED_STOCK_PRICES[sym] !== undefined) {
        price = tokenizedPrices[sym] ?? TOKENIZED_STOCK_PRICES[sym];
        nameFa = TOKENIZED_NAMES[sym] ?? sym;
        kind = 'tokenized';
      } else {
        const live = stockLive[sym];
        price = live && Number.isFinite(live.price) ? live.price : (PRICE_SNAPSHOT_FALLBACK[sym] ?? null);
        nameFa = TRADFI_NAMES[sym] ?? sym;
        kind = 'tradfi';
      }
      return { symbol: sym, nameFa, kind, price };
    });
  }, [symbols, crypto.data, tokenizedPrices, stockLive]);

  if (symbols.length === 0) {
    return (
      <GlassCard variant="soft" className="p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-ink">
          <Star className="h-4 w-4 text-warn" />
          {t('watchlist')}
        </h3>
        <p className="mt-2 text-[11px] font-medium text-muted">{t('watchlistEmpty')}</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard variant="soft" className="p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-extrabold text-ink">
        <Star className="h-4 w-4 fill-warn text-warn" />
        {t('watchlist')}
        <span className="badge bg-warn/10 text-warn">{symbols.length}</span>
      </h3>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.symbol} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-line/[0.04]">
            <AssetLogo symbol={r.symbol} kind={r.kind} size={30} />
            <div className="min-w-0 flex-1">
              <p className="tnum text-[12px] font-extrabold text-ink">{r.symbol}</p>
              <p className="truncate text-[11px] font-medium text-muted">{r.nameFa}</p>
            </div>
            <span className="num-ltr text-[12px] font-black text-ink">
              {isYieldSymbol(r.symbol) ? fmtPctEn(r.price) : fmtUSD(r.price)}
            </span>
            <button
              onClick={() => {
                void remove(r.symbol);
                toast('info', t('removedFromWatch'));
              }}
              className="rounded-lg p-2 text-muted hover:bg-negative/10 hover:text-negative"
              aria-label={t('removeFromWatch')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
