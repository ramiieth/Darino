/**
 * هوک مرکزی فراداده و قیمت دارایی‌ها:
 *  - لوگوی اختصاصی همه دارایی‌ها (CoinGecko برای رمزارز/توکن‌ایز، CDN برای سهام سنتی)
 *  - قیمت زنده سهام توکن‌ایز از دسته Tokenized Products کوین‌گکو
 *  - کش IndexedDB → آفلاین‌فرست
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCryptoMeta, syncTokenizedAssets, type TokenizedSyncResult } from '@/shared/lib/coingecko';
import { COINS, TRADFI_ASSETS } from '@/features/simulation/domain/constants';
import { TOKENIZED_COIN_MAP } from '@/features/simulation/data/tokenizedCoinMap';
import { useTokenSyncStore } from '@/shared/store/tokenSyncStore';

const CRYPTO_IDS = Object.keys(COINS);
const TRADFI_SYMBOLS = TRADFI_ASSETS.map((a) => a.symbol);

/** آدرس لوگوی سهام سنتی (CDN عمومی با fallback زنجیره‌ای در کامپوننت) */
export const TRADFI_LOGO_URLS: Record<string, string> = Object.fromEntries(
  TRADFI_SYMBOLS.map((s) => [s, `https://assets.parqet.com/logos/symbol/${encodeURIComponent(s)}`])
);

export const TRADFI_LOGO_FALLBACKS: Record<string, string> = Object.fromEntries(
  TRADFI_SYMBOLS.map((s) => [s, `https://financialmodelingprep.com/image-stock/${encodeURIComponent(s)}.png`])
);

/** لوگوی رمزارزها: نماد → آدرس */
let cryptoLogoCache: Record<string, string> = {};

/** یک چرخه همگام‌سازی سینگلتون */
let syncPromise: Promise<TokenizedSyncResult> | null = null;

export interface AssetMetaResult {
  /** نماد → آدرس لوگو (برای همه دسته‌ها) */
  logos: Record<string, string>;
  /** نماد توکن‌ایز → قیمت زنده */
  tokenizedPrices: Record<string, number>;
  /** شناسه توکن‌ایز → قیمت زنده */
  tokenIds: Record<string, string>;
  liveCount: number;
  fetchedAt: number | null;
  syncing: boolean;
}

function runSync(): Promise<TokenizedSyncResult> {
  if (syncPromise) return syncPromise;
  const store = useTokenSyncStore.getState();
  syncPromise = syncTokenizedAssets()
    .then((result) => {
      store.finish(result.liveCount);
      return result;
    })
    .catch(() => {
      store.fail();
      return { prices: {}, logos: {}, ids: {}, liveCount: 0, fetchedAt: Date.now() };
    })
    .finally(() => {
      syncPromise = null;
    });
  return syncPromise;
}

export function useAssetMeta(): AssetMetaResult {
  const [result, setResult] = useState<TokenizedSyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);

  // ۱) لوگوی رمزارزها (یک درخواست، کش ۱ روز)
  useQuery({
    queryKey: ['assetMeta', 'crypto', 'logos'],
    queryFn: async () => {
      const meta = await fetchCryptoMeta(CRYPTO_IDS);
      cryptoLogoCache = Object.fromEntries(
        Object.values(meta).map((m) => [COINS[m.id] ?? m.symbol.toUpperCase(), m.img])
      );
      return meta;
    },
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1
  });

  // ۲) قیمت + لوگوی توکن‌ایزها (همگام‌سازی با صف محدود)
  const tokenQuery = useQuery({
    queryKey: ['assetMeta', 'tokenized'],
    queryFn: async () => {
      setSyncing(true);
      useTokenSyncStore.getState().start(0);
      try {
        const res = await runSync();
        setResult(res);
        return res;
      } finally {
        setSyncing(false);
      }
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
    retry: 2,
    retryDelay: 15_000
  });

  const storePhase = useTokenSyncStore((s) => s.phase);
  const lastSyncAt = useTokenSyncStore((s) => s.lastSyncAt);
  const liveCount = useTokenSyncStore((s) => s.liveCount);

  const data = tokenQuery.data ?? result;

  const logos = useMemo(() => {
    const map: Record<string, string> = { ...cryptoLogoCache };
    // لوگوهای seed توکن‌ایز (تأییدشده از API) — همیشه در دسترس
    for (const [sym, meta] of Object.entries(TOKENIZED_COIN_MAP)) map[sym] = meta.img;
    if (data) {
      for (const [sym, url] of Object.entries(data.logos)) map[sym] = url;
    }
    for (const [sym, url] of Object.entries(TRADFI_LOGO_URLS)) map[sym] = url;
    return map;
  }, [data, tokenQuery.dataUpdatedAt]);

  // به‌روزرسانی result هنگام تازه‌شدن query
  const first = useRef(true);
  useEffect(() => {
    if (tokenQuery.data) setResult(tokenQuery.data);
    first.current = false;
  }, [tokenQuery.data]);

  return {
    logos,
    tokenizedPrices: data?.prices ?? {},
    tokenIds: data?.ids ?? {},
    liveCount: data?.liveCount ?? liveCount,
    fetchedAt: data?.fetchedAt ?? lastSyncAt,
    syncing: syncing || storePhase === 'loading' || tokenQuery.isFetching
  };
}
