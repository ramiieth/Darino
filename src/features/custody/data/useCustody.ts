/** ============================================================
 * هوک اصلی دارایی چندشبکه‌ای — کاتالوگ + دادهٔ کاربر + دفتر محاسبه‌شده
 * ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import { ARCUS_ASSETS, ASSETS, NETWORKS } from '../domain/catalog';
import { computeLedger, type LedgerContext, type LedgerState } from '../domain/ledger';
import type { PriceInfo } from '../domain/valuation';
import type { Asset, Holding, Network, Operation } from '../domain/types';
import { loadCustody, useCustodyStore } from './repository';

export interface CustodyData {
  loaded: boolean;
  persistent: boolean;
  networks: Network[];
  assets: Asset[];
  holdings: Holding[];
  operations: Operation[];
  networkById: Map<string, Network>;
  assetById: Map<string, Asset>;
  holdingById: Map<string, Holding>;
  ctx: LedgerContext;
  ledger: LedgerState;
}

export function useCustody(): CustodyData {
  const s = useCustodyStore();

  useEffect(() => {
    void loadCustody();
  }, []);

  return useMemo(() => {
    // کاتالوگ تأییدشده اولویت دارد؛ رکورد کاربر هم‌شناسه آن را بازنویسی نمی‌کند
    const networks = [...NETWORKS, ...s.customNetworks.filter((n) => !NETWORKS.some((c) => c.id === n.id))];
    const catalogAssets = [...ASSETS, ...ARCUS_ASSETS];
    const assets = [...catalogAssets, ...s.customAssets.filter((a) => !catalogAssets.some((c) => c.id === a.id))];
    const networkById = new Map(networks.map((n) => [n.id, n]));
    const assetById = new Map(assets.map((a) => [a.id, a]));
    const holdingById = new Map(s.holdings.map((h) => [h.id, h]));
    const ctx: LedgerContext = { assets: assetById, holdings: holdingById };
    const ledger = computeLedger(s.operations);
    return {
      loaded: s.loaded,
      persistent: s.persistent,
      networks,
      assets,
      holdings: s.holdings,
      operations: s.operations,
      networkById,
      assetById,
      holdingById,
      ctx,
      ledger
    };
  }, [s]);
}

/**
 * قیمت دارایی‌ها از CoinGecko (زیرساخت موجود اپ) — همراه منبع و زمان.
 * شناسهٔ بدون قیمت در نقشه نیست → در UI «نامشخص».
 */
export function useAssetPrices(coingeckoIds: string[]): { prices: Map<string, PriceInfo>; loading: boolean } {
  const key = [...new Set(coingeckoIds)].sort().join(',');
  const [prices, setPrices] = useState<Map<string, PriceInfo>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!key) {
      setPrices(new Map());
      return;
    }
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const ids = key.split(',');
        const [{ fetchCryptoPrices }, { cacheBulkGetPrice }] = await Promise.all([
          import('@/shared/lib/coingecko'),
          import('@/shared/lib/db')
        ]);
        const res = await fetchCryptoPrices(ids);
        // زمان دقیق هر قیمت از کش (fetchedAt هر شناسه) — نه زمان دسته
        const cached = await cacheBulkGetPrice(ids.map((id) => `coingecko:${id}`));
        const map = new Map<string, PriceInfo>();
        for (const id of ids) {
          const p = res.prices[id];
          if (typeof p !== 'number' || !Number.isFinite(p)) continue;
          const at = cached.get(`coingecko:${id}`)?.fetchedAt ?? res.fetchedAt;
          map.set(id, { usd: p, source: res.sources[id] === 'live' ? 'کوین‌گکو (زنده)' : 'کوین‌گکو (ذخیره‌شده)', fetchedAt: at });
        }
        if (alive) setPrices(map);
      } catch {
        if (alive) setPrices(new Map());
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [key]);

  return { prices, loading };
}
