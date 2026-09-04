/**
 * هوک قیمت‌های ادغام‌شده رمزارز: CoinGecko + فالبک Llama
 * (مصرف‌شده در موتور شبیه‌سازی، بازار و کارت اتریوم)
 */
import { useEffect, useMemo } from 'react';
import { useCryptoPrices } from '@/features/simulation/data/useCryptoPrices';
import { useLlamaFallbackStore, fetchMissingLlamaPrices, mergePriceMaps } from './useLlamaPriceFallback';

export interface MergedCryptoPrices {
  prices: Record<string, number>;
  changes24h: Record<string, number>;
  fetchedAt: number | null;
  live: boolean;
}

export function useMergedCryptoPrices(): MergedCryptoPrices {
  const crypto = useCryptoPrices();
  const llamaPrices = useLlamaFallbackStore((s) => s.prices);

  // فالبک خودکار برای دارایی‌های بدون قیمت (مثل ONDO)
  useEffect(() => {
    if (crypto.data?.prices) {
      void fetchMissingLlamaPrices(crypto.data.prices);
    }
  }, [crypto.data]);

  return useMemo(() => {
    const prices = mergePriceMaps(crypto.data?.prices ?? {}, llamaPrices);
    return {
      prices,
      changes24h: crypto.data?.changes24h ?? {},
      fetchedAt: crypto.data?.fetchedAt ?? null,
      live: crypto.data?.live ?? false
    };
  }, [crypto.data, llamaPrices]);
}
