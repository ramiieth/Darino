/**
 * داده‌های زنده رمزارز — TanStack Query v5
 *  - یک درخواست دسته‌ای با همه شناسه‌های CoinGecko (comma-separated)
 *  - staleTime: 60,000ms | refetchInterval: 120,000ms
 *  - کش IndexedDB به‌عنوان لایه آفلاین
 */
import { useQuery } from '@tanstack/react-query';
import { fetchCryptoPrices, type CryptoPriceMap } from '@/shared/lib/coingecko';
import { CRYPTO_REFETCH_MS, CRYPTO_STALE_MS } from '@/app/config/apiConfig';
import { COINS } from '@/features/simulation/domain/constants';

const ALL_IDS = Object.keys(COINS);

export function useCryptoPrices() {
  return useQuery<CryptoPriceMap>({
    queryKey: ['prices', 'crypto', 'batch'],
    queryFn: () => fetchCryptoPrices(ALL_IDS),
    staleTime: CRYPTO_STALE_MS,
    refetchInterval: CRYPTO_REFETCH_MS,
    retry: 1,
    placeholderData: (prev) => prev,
    gcTime: 10 * 60_000
  });
}

/** قیمت زنده یک رمزارز خاص (یا null) */
export function useCoinLivePrice(id: string): number | null {
  const { data } = useCryptoPrices();
  const p = data?.prices?.[id];
  return typeof p === 'number' && Number.isFinite(p) ? p : null;
}
