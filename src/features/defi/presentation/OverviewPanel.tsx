/**
 * نمای کلی دیفای — TVL/مارکت‌کپ کل از CoinGecko Global
 * (DefiLlama کاملاً حذف شد)
 */
import { useEffect, useState } from 'react';
import { Globe2 } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { ErrorState } from '@/shared/components/ui/StateViews';
import { Metric, MetricGrid, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { fetchWithRetry } from '@/shared/lib/fetchWithRetry';
import { COINGECKO_BASE } from '@/app/config/apiConfig';
import { cacheBulkGetPrice, cachePutPrice } from '@/shared/lib/db';
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
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <div className="space-y-4">
      {error && !data ? (
        <ErrorState message="ارتباط با کوین‌گکو برقرار نشد" />
      ) : (
        <Surface className="p-4 md:p-6">
          <MetricGrid cols={3}>
            <Metric size="hero" label="ارزش کل بازار رمزارزها" value={<MoneyValue value={data?.mcap ?? null} compact />} icon={<Globe2 />} />
            <Metric size="lg" label="حجم معاملات ۲۴ ساعت" value={<MoneyValue value={data?.vol ?? null} compact />} />
            <Metric
              size="lg"
              label="سهم بیت‌کوین از بازار"
              value={<PercentValue value={data?.dominance ?? null} signed={false} tone="none" digits={1} />}
            />
          </MetricGrid>
        </Surface>
      )}
      <p className="text-xs text-muted">منبع: CoinGecko Global · {t('defiUpdated')}</p>
    </div>
  );
}
