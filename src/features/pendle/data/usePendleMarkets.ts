/**
 * هوک Pendle — بازارها + Assets + قیمت‌ها با همگام‌سازی خودکار
 * هیچ لیست Hardcode نیست؛ همه از API (بازار جدید خودکار اضافه می‌شود)
 */
import { useEffect, useMemo, useState } from 'react';
import { fetchAllMarkets, fetchAllAssets, fetchAssetsPrices, usePendleRateStore } from './pendleService';
import { toMarketView, type PendleAsset, type PendleMarketView, type RawPendleMarket } from '@/features/pendle/domain/pendle';

const REFRESH_MS = 60_000; // به‌روزرسانی زنده هر ۱ دقیقه

export interface PendleData {
  markets: PendleMarketView[];
  assets: PendleAsset[];
  /** قیمت‌های زنده: شناسه `chainId-address` → قیمت (برای PT/YT/SY) */
  prices: Record<string, number>;
  loading: boolean;
  error: boolean;
  refresh: () => void;
  lastSync: number | null;
}

export function usePendleMarkets(): PendleData {
  const [raw, setRaw] = useState<RawPendleMarket[] | null>(null);
  const [assets, setAssets] = useState<PendleAsset[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(false);
      try {
        const [markets, assetList] = await Promise.all([fetchAllMarkets(), fetchAllAssets()]);
        if (cancelled) return;
        setRaw(markets);
        setAssets(assetList);

        // قیمت‌های کلیددار (chainId-address) — همه بازارها
        // ⚠️ فیلدهای pt/yt/sy/underlyingAsset خودشان با پیشوند chainId
        // از API می‌آیند (مثل «1-0x4ad8…») — نباید دوباره chainId اضافه شود
        const ids = new Set<string>();
        markets.forEach((m) => {
          ids.add(m.pt);
          ids.add(m.yt);
          ids.add(m.sy);
          ids.add(m.underlyingAsset);
        });
        const priceMap = await fetchAssetsPrices([...ids]);
        if (!cancelled) setPrices(priceMap);
        setLastSync(Date.now());
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  // همگام‌سازی خودکار زنده (هر ۱ دقیقه) + به‌روزرسانی هنگام فوکوس
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(iv);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const markets = useMemo(() => {
    if (!raw) return [];
    const now = Date.now();
    // فقط بازارهای با TVL ≥ ۵۰۰٬۰۰۰ دلار و سررسید فعال (پایان‌نیافته)
    const filtered = raw.filter(
      (m) =>
        (m.details?.totalTvl ?? 0) >= 500_000 &&
        (m.details?.tradingVolume ?? 0) >= 10 &&
        m.expiry &&
        new Date(m.expiry).getTime() > now
    );
    return filtered.map((m) => toMarketView(m, prices));
  }, [raw, prices]);

  return {
    markets,
    assets,
    prices,
    loading: loading && raw === null,
    error,
    refresh: () => setTick((t) => t + 1),
    lastSync
  };
}

/** خلاصه وضعیت Rate Limit برای UI */
export function usePendleRateStatus() {
  return usePendleRateStore((s) => ({
    cu: s.cu,
    remaining: s.remaining,
    limit: s.limit,
    weeklyRemaining: s.weeklyRemaining,
    weeklyLimit: s.weeklyLimit,
    errors: s.errors
  }));
}
