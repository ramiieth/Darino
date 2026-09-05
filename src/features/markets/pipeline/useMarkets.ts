/** ============================================================
 * useMarkets — هوک مصرفی Pipeline (بخش ۲۵: Refresh مرکزی)
 *
 *  - همه Universeها با یک همگام‌سازی مرکزی رفرش می‌شوند
 *  - فقط Universe فعال mount شده sync می‌شود؛ بقیه با کش
 *  - Re-render فقط وقتی داده واقعی تغییر کند (selectors جزئی)
 * ============================================================ */
import { useEffect, useMemo } from 'react';
import { useAutoSync } from '@/shared/hooks/useAutoSync';
import { hydrateUniverse, syncUniverse, useMarketsStore } from './store';
import { UNIVERSE_TTL_MS } from './cache';
import type { MarketUniverse } from './types';

/** فاصله Refresh مرکزی — هم‌اندازه TTL کش هر Universe */
const REFRESH_MS: Record<MarketUniverse, number> = {
  crypto_top_200: 120_000,
  ondo_tokenized: 10 * 60_000,
  xstocks: 10 * 60_000
};

export function useMarkets(u: MarketUniverse) {
  // selectors جزئی — فقط همین Universe (بدون re-render بقیه)
  const assets = useMarketsStore((s) => s.data[u]);
  const loading = useMarketsStore((s) => s.loading[u]);
  const lastSyncAt = useMarketsStore((s) => s.lastSyncAt[u]);
  const error = useMarketsStore((s) => s.error[u]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // نمایش سریع داده قبلی (حتی کهنه) — بدون انتظار شبکه
      await hydrateUniverse(u);
      if (cancelled) return;
      // همیشه تلاش همگام‌سازی: کش تازه → بازگشت فوری؛ کهنه/بدون کش → رفرش پس‌زمینه
      void syncUniverse(u);
    })();
    return () => {
      cancelled = true;
    };
  }, [u]);

  // Refresh مرکزی — یک تایمر برای همه Universeها (نه چند Polling مستقل)
  useAutoSync(
    `markets-pipeline-${u}`,
    () => {
      const st = useMarketsStore.getState();
      if (st.loading[u]) return;
      void syncUniverse(u);
    },
    { intervalMs: REFRESH_MS[u], minAgeMs: UNIVERSE_TTL_MS[u] }
  );

  return { assets, loading, lastSyncAt, error };
}

/** داده چند Universe (برای تب «همه») — با حفظ استقلال هر Symbol */
export function useCombinedMarkets(universes: MarketUniverse[]) {
  const a = useMarkets(universes[0]);
  const b = useMarkets(universes[1]);
  const c = universes[2] ? useMarkets(universes[2]) : null;

  const combined = useMemo(() => {
    const list = [...a.assets, ...b.assets, ...(c ? c.assets : [])];
    // مرتب‌سازی: منبع (ترتیب مشخصات) سپس rank
    const order: Record<string, number> = { crypto: 0, ondo: 1, xstocks: 2 };
    return [...list].sort(
      (x, y) => (order[x.source] ?? 9) - (order[y.source] ?? 9) || x.rank - y.rank
    );
  }, [a.assets, b.assets, c?.assets]);

  const anyLoading = a.loading || b.loading || (c?.loading ?? false);
  const anyError = a.error ?? b.error ?? c?.error ?? null;

  return { assets: combined, loading: anyLoading, error: anyError };
}

export { useMarketsStore };
