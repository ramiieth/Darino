/**
 * نمای کلی دیفای — TVL/مارکت‌کپ کل از CoinGecko Global
 * (DefiLlama کاملاً حذف شد)
 */
import { useEffect, useState } from 'react';
import { Globe2 } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { fetchWithRetry } from '@/shared/lib/fetchWithRetry';
import { COINGECKO_BASE } from '@/app/config/apiConfig';
import { cacheBulkGetPrice, cachePutPrice } from '@/shared/lib/db';
import { fmtUSD, fmtInt } from '@/shared/utils/formatters';
import { t } from '@/shared/i18n/fa';

export function OverviewPanel() {
  const [data, setData] = useState<{ mcap: number | null; vol: number | null; dominance: number | null } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ck = 'cg:global';
        try {
          const rec = await cacheBulkGetPrice([ck]);
          const r = rec.get(ck);
          if (r && Date.now() - r.fetchedAt < 5 * 60_000) {
            if (!cancelled) setData(r.price as unknown as typeof data);
            return;
          }
        } catch { /* ادامه */ }
        const res = await fetchWithRetry(`${COINGECKO_BASE}/global`, { retries: 0, timeoutMs: 10_000 });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const j = (await res.json()) as { data?: { total_market_cap?: Record<string, number>; total_volume?: Record<string, number>; market_cap_percentage?: Record<string, number> } };
        const out = {
          mcap: j.data?.total_market_cap?.usd ?? null,
          vol: j.data?.total_volume?.usd ?? null,
          dominance: j.data?.market_cap_percentage?.btc ?? null
        };
        if (!cancelled) setData(out);
        try { await cachePutPrice(ck, { price: out as unknown as number, source: 'live', fetchedAt: Date.now() }); } catch { /* خاموش */ }
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!data && !error) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <GlassCard animated className="p-5">
        <p className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
          <Globe2 className="h-3.5 w-3.5 text-accent" />
          {t('defiTvlTotal')}
        </p>
        <p className="num-ltr mt-2 text-3xl font-black text-ink">{fmtUSD(data?.mcap, true)}</p>
        <p className="num-ltr mt-1 text-[10px] font-bold text-muted">
          حجم ۲۴h: {fmtUSD(data?.vol, true)} · سهم BTC: {data?.dominance ? fmtInt(data.dominance) : '—'}٪ · منبع: CoinGecko
        </p>
      </GlassCard>
      {error && <p className="glass-soft rounded-2xl px-4 py-3 text-center text-[10px] font-bold text-warn">ارتباط با CoinGecko برقرار نشد</p>}
      <p className="text-center text-[9px] font-medium text-muted">{t('defiUpdated')}</p>
    </div>
  );
}
