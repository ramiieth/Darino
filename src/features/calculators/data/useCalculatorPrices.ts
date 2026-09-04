/**
 * هوک قیمت‌های فعلی برای ماشین‌حساب‌ها (فقط داده — بدون محاسبه)
 * از استورهای موجود: کوینگکو (ادغام Llama) + بازار سهام + توکن‌ایز
 */
import { useEffect, useMemo, useState } from 'react';
import { useMergedCryptoPrices } from '@/shared/hooks/useMergedCryptoPrices';
import { useAssetMeta } from '@/shared/hooks/useAssetMeta';
import { useMarketStore } from '@/shared/store/marketStore';
import { PRICE_SNAPSHOT_FALLBACK, TRADFI_ASSETS } from '@/features/simulation/domain/constants';
import { assetsOfClass } from './catalogs';
import { hlMetaAndCtxs } from '@/features/hyperliquid/data/hyperliquidService';

export interface CalculatorPriceContext {
  /** نماد → قیمت فعلی */
  prices: Record<string, number>;
  /** نماد → null یعنی واقعاً موجود نیست */
  has: (symbol: string) => boolean;
}

export function useCalculatorPrices(): CalculatorPriceContext {
  const crypto = useMergedCryptoPrices();
  const { tokenizedPrices } = useAssetMeta();
  const stockQuotes = useMarketStore((s) => s.quotes);
  const [hlPrices, setHlPrices] = useState<Record<string, number>>({});

  // فالبک Hyperliquid: قیمت مارک برای نمادهای موجود در HL (مثل TON/AVAX/ONDO)
  useEffect(() => {
    hlMetaAndCtxs()
      .then(([meta, ctxs]) => {
        const m: Record<string, number> = {};
        meta.universe.forEach((u, i) => {
          const p = parseFloat(ctxs[i]?.markPx ?? '');
          if (Number.isFinite(p) && p > 0) m[u.name] = p;
        });
        setHlPrices(m);
      })
      .catch(() => undefined);
  }, []);

  return useMemo(() => {
    const prices: Record<string, number> = {};

    // رمزارزها — فالبک اسنپ‌شات
    const cryptoAssets = assetsOfClass('crypto');
    for (const a of cryptoAssets) {
      if (a.coinId) {
        const p = crypto.prices[a.coinId];
        if (typeof p === 'number' && Number.isFinite(p)) {
          prices[a.symbol] = p;
        } else if (a.kind === 'crypto') {
          const snap = PRICE_SNAPSHOT_FALLBACK[a.coinId];
          if (typeof snap === 'number' && Number.isFinite(snap)) prices[a.symbol] = snap;
        }
      }
    }

    // توکن‌ایز
    for (const [sym, p] of Object.entries(tokenizedPrices)) {
      if (typeof p === 'number' && Number.isFinite(p)) prices[sym] = p;
    }
    // فالبک اسنپ‌شات توکن‌ایز
    for (const a of assetsOfClass('tokenized')) {
      if (prices[a.symbol] === undefined) {
        const snap = PRICE_SNAPSHOT_FALLBACK[a.symbol];
        if (typeof snap === 'number') prices[a.symbol] = snap;
      }
    }

    // فالبک Hyperliquid برای رمزارزهای بدون قیمت (اگر در HL موجود باشند)
    for (const a of cryptoAssets) {
      if (prices[a.symbol] === undefined && hlPrices[a.symbol] !== undefined) {
        prices[a.symbol] = hlPrices[a.symbol];
      }
    }

    // سهام/ETF/کالا/شاخص
    for (const a of TRADFI_ASSETS) {
      const q = stockQuotes[a.symbol];
      if (q && Number.isFinite(q.price) && q.price > 0) {
        prices[a.symbol] = q.price;
      } else {
        const snap = PRICE_SNAPSHOT_FALLBACK[a.symbol];
        if (typeof snap === 'number' && Number.isFinite(snap)) prices[a.symbol] = snap;
      }
    }

    const has = (symbol: string) => prices[symbol] !== undefined;

    return { prices, has };
  }, [crypto.prices, tokenizedPrices, stockQuotes, hlPrices]);
}
