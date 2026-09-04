/**
 * Crypto Markets — Top 150 توکن (CoinGecko)
 * کارت‌ها: لوگو | نام | نماد | قیمت | 24h/7d/30d/60d | حجم | مارکت‌کپ
 * امکانات: جستجو، مرتب‌سازی، علاقه‌مندی
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Star, ArrowUpDown } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { FreshnessBar } from '@/shared/components/ui/FreshnessBar';
import { ErrorState, DeFiListSkeleton } from '@/shared/components/ui/StateViews';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { useTopCryptoMarkets } from '@/features/cryptomarkets/data/useTopCryptoMarkets';
import { useWatchlistStore } from '@/shared/store/watchlistStore';
import { fmtUSD, fmtPct, pnlClass } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

type SortKey = 'rank' | 'mcap' | 'volume' | 'change24h';

export function CryptoMarketExplorer() {
  const { markets, loading, error, stale, fetchedAt, refresh } = useTopCryptoMarkets();
  const watch = useWatchlistStore((s) => s.items);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('mcap');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [favOnly, setFavOnly] = useState(false);

  useEffect(() => {
    void useWatchlistStore.getState().hydrate();
  }, []);

  const visible = useMemo(() => {
    const q = query.toLowerCase();
    let list = markets.filter((m) => {
      if (favOnly && watch[m.symbol] === undefined) return false;
      if (!q) return true;
      return m.symbol.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.nameFa.toLowerCase().includes(q);
    });
    const val = (m: (typeof markets)[number]) =>
      sort === 'mcap' ? (m.marketCap ?? 0) : sort === 'volume' ? (m.volume24h ?? 0) : sort === 'change24h' ? (m.change24h ?? 0) : 0;
    list = [...list].sort((a, b) => (val(a) - val(b)) * (sortDir === 'desc' ? -1 : 1));
    return list;
  }, [markets, query, sort, sortDir, favOnly, watch]);

  if (loading && !error) return <DeFiListSkeleton rows={8} />;
  if (error) return <ErrorState message="ارتباط با API برقرار نشد" onRetry={refresh} />;

  return (
    <div className="space-y-3">
      {/* نوار تازگی داده — منبع، آخرین همگام‌سازی، به‌روزرسانی خودکار */}
      <FreshnessBar
        loadedAt={fetchedAt}
        stale={stale}
        error={error}
        sourceLabel="CoinGecko API"
        autoMs={2 * 60_000}
        onRefresh={refresh}
      />

      {/* هشدار داده کش‌شده — محدودیت نرخ API یا آفلاین */}
      {stale && (
        <ErrorState
          subtle
          message="ارتباط زنده با منبع قیمت برقرار نیست — داده کش‌شده نمایش داده می‌شود"
          onRetry={refresh}
        />
      )}

      {/* نوار ابزار: جستجو + مرتب‌سازی */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی توکن…"
            className="h-11 w-full rounded-xl border border-line/15 bg-card ps-10 pe-4 text-[12px] font-bold text-ink shadow-card outline-none placeholder:text-muted/60 hover:border-line/25 focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-11 rounded-xl border border-line/15 bg-card px-2 text-[10px] font-bold text-ink shadow-card outline-none hover:border-line/25"
          aria-label="مرتب‌سازی"
        >
          <option value="mcap">مارکت‌کپ</option>
          <option value="rank">رتبه</option>
          <option value="volume">حجم</option>
          <option value="change24h">تغییر ۲۴h</option>
        </select>
        <button
          onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line/15 bg-card text-ink shadow-card transition-colors hover:bg-surface-2"
          aria-label="تغییر جهت مرتب‌سازی"
        >
          <ArrowUpDown className="h-4 w-4" />
        </button>
        <button
          onClick={() => setFavOnly((f) => !f)}
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors',
            favOnly
              ? 'border-warn/30 bg-warn/10 text-warn'
              : 'border-line/15 bg-card text-muted shadow-card hover:bg-surface-2'
          )}
          aria-label="فقط علاقه‌مندی‌ها"
          aria-pressed={favOnly}
        >
          <Star className={cn('h-4 w-4', favOnly && 'fill-warn')} />
        </button>
      </div>

      {/* لیست بازار — یک قاب، ردیف‌های جدا با خط ظریف */}
      <div className="overflow-hidden rounded-2xl border border-line/10 bg-card shadow-card">
        {visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] font-bold text-muted">
            برای این جستجو نتیجه‌ای یافت نشد
          </p>
        ) : (
          visible.map((m, i) => {
            const isFav = watch[m.symbol] !== undefined;
            const changes: { label: string; v: number | null }[] = [
              { label: '۲۴h', v: m.change24h },
              { label: '۷d', v: m.change7d },
              { label: '۳۰d', v: m.change30d }
            ];
            return (
              <motion.div
                key={m.symbol}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i < 20 ? i * 0.008 : 0, duration: 0.2 }}
                className={cn(
                  'group px-3.5 py-3 transition-colors hover:bg-surface-2/60',
                  i > 0 && 'border-t border-line/8'
                )}
              >
                <div className="flex items-center gap-3">
                  <AssetLogo symbol={m.symbol} kind="crypto" size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="tnum text-[13px] font-extrabold text-ink">{m.symbol}</p>
                    <p className="truncate text-[10px] font-medium text-muted">{m.nameFa}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="num-ltr text-[14px] font-black text-ink">
                      {m.price && m.price > 0 ? fmtUSD(m.price) : '—'}
                    </span>
                    <span className="num-ltr text-[10px] font-bold text-muted">
                      MC: {m.marketCap ? fmtUSD(m.marketCap, true) : 'N/A'}
                    </span>
                  </div>
                  <button
                    onClick={() => void useWatchlistStore.getState().toggle(m.symbol)}
                    className={cn(
                      'rounded-xl p-1.5 transition-colors',
                      isFav ? 'text-warn' : 'text-muted/60 hover:text-warn'
                    )}
                    aria-label="علاقه‌مندی"
                  >
                    <Star className={cn('h-4 w-4', isFav && 'fill-warn')} />
                  </button>
                </div>
                {/* تغییرات + حجم — فشرده و خوانا */}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 ps-[46px]">
                  {changes.map((c) => (
                    <span
                      key={c.label}
                      className={cn(
                        'num-ltr text-[10px] font-bold',
                        c.v === null
                          ? 'text-muted/60'
                          : c.v >= 0
                            ? 'text-positive'
                            : 'text-negative'
                      )}
                    >
                      {c.label}: {c.v !== null ? `${c.v >= 0 ? '▲' : '▼'} ${fmtPct(c.v)}` : 'N/A'}
                    </span>
                  ))}
                  {m.volume24h !== null && (
                    <span className="text-[10px] font-medium text-muted/80">
                      حجم: {fmtUSD(m.volume24h, true)}
                    </span>
                  )}
                  {m.fdv !== null && (
                    <span className="text-[10px] font-medium text-muted/80">
                      FDV: {fmtUSD(m.fdv, true)}
                    </span>
                  )}
                  {m.chain && (
                    <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-bold text-accent">
                      {m.chain}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}

export { pnlClass as _pnl };
