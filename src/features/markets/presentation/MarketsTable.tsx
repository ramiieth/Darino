/** ============================================================
 * MarketsTable — جدول واحد برای همه Universeها (بخش ۱۰)
 *
 *  هر Symbol یک Row مستقل: Logo | Symbol | Price | 24H | 7D | 30D | Market Cap
 *  - بدون Asset / Underlying / Company / Grouping در UI (بخش ۱۲/۱۳)
 *  - Row با React.memo — re-render فقط برای ردیف‌های تغییرکرده
 *  - برش + «نمایش بیشتر» — همه Assetها همزمان Render نمی‌شوند
 *  - Metric ناقص → «—» (نه حذف کل Token — بخش ۲۹)
 * ============================================================ */
import { memo, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { hydrateUniverse, syncUniverse, useMarketsStore } from '../pipeline/store';
import { useMarkets } from '../pipeline/useMarkets';
import type { MarketAsset, MarketSource, MarketUniverse } from '../pipeline/types';

const PAGE = 50;

/* ---------- منبع → برچسب (فقط برای badge کوچک — نه Grouping) ---------- */
const SOURCE_FA: Record<MarketSource, string> = {
  crypto: 'کریپتو',
  ondo: 'Ondo',
  xstocks: 'xStocks'
};

export function MarketsTable({
  universes,
  title
}: {
  universes: MarketUniverse[];
  title: string;
}) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [tab, setTab] = useState<'all' | MarketSource>('all');

  // تنظیم موتور Refresh مرکزی: هر Universe همیشه یک تایمر/retry خودکار دارد
  // (حتی وقتی فعلاً در تب فعال نیست — بدون درخواست تکراری به لطف dedup)
  useMarkets('crypto_top_200');
  useMarkets('ondo_tokenized');
  useMarkets('xstocks');

  // شروع همگام‌سازی: کش تازه ← fetch (dedup مرکزی) — فقط همین Universeها
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const u of universes) {
        // ۱) نمایش سریع داده قبلی (حتی کهنه) — بدون انتظار شبکه
        await hydrateUniverse(u);
        if (cancelled) return;
        // ۲) همیشه همگام‌سازی: کش تازه → بازگشت فوری و بدون شبکه؛
        //    کش کهنه → رفرش پس‌زمینه؛ بدون کش → fetch (هرگز داده قبلی پاک نمی‌شود)
        void syncUniverse(u);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universes.join(',')]);

  // selectors جزئی — فقط داده همین جدول
  const data = useMarketsStore((s) => s.data);
  const loading = useMarketsStore((s) => s.loading);
  const error = useMarketsStore((s) => s.error);

  const retry = () => {
    for (const u of universes) void syncUniverse(u);
  };

  const assets = useMemo(() => {
    const list = universes.flatMap((u) => data[u]);
    const order: Record<string, number> = { crypto: 0, ondo: 1, xstocks: 2 };
    return [...list].sort((a, b) => (order[a.source] ?? 9) - (order[b.source] ?? 9) || a.rank - b.rank);
  }, [universes, data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = assets;
    if (tab !== 'all') out = out.filter((a) => a.source === tab);
    if (q) out = out.filter((a) => a.symbol.toLowerCase().includes(q));
    return out;
  }, [assets, query, tab]);

  const anyLoading = universes.some((u) => loading[u]);
  const anyError = universes.some((u) => error[u]);
  const anySnapshot = assets.some((a) => a.snapshot === true);
  const isSingle = universes.length === 1;
  const firstErrorText =
    (error[universes.find((u) => error[u]) ?? universes[0]] ?? 'خطا').slice(0, 120);

  return (
    <GlassCard className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/10 px-3 py-2">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-black text-ink">{title}</p>
          {anySnapshot && (
            <span className="badge shrink-0 bg-warn/10 text-warn">اسنپ‌شات / آفلاین</span>
          )}
        </div>
        <p className="num-ltr text-[9px] font-bold text-muted">{filtered.length} دارایی</p>
      </div>

      {/* جستجو + فیلتر منبع (بدون Grouping — فقط فیلتر) */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
            placeholder="جستجوی نماد…"
            className="glass-inset h-8 w-full rounded-xl ps-9 pe-3 text-[11px] font-bold text-ink outline-none placeholder:text-muted/60"
          />
        </div>
        {!isSingle && (
          <div className="flex gap-1">
            {(['all', 'crypto', 'ondo', 'xstocks'] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setTab(s); setLimit(PAGE); }}
                className={`rounded-full px-2.5 py-1 text-[9px] font-black transition-all ${
                  tab === s ? 'bg-accent text-white shadow-glow' : 'glass-inset text-muted hover:text-ink'
                }`}
              >
                {s === 'all' ? 'همه' : SOURCE_FA[s]}
              </button>
            ))}
          </div>
        )}
      </div>

      {anyLoading && assets.length === 0 ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-[11px] font-black text-warn">{query ? 'نتیجه‌ای یافت نشد' : 'داده ناکافی'}</p>
          <p className="mt-1 text-[10px] font-bold text-muted">
            {query
              ? 'موردی با این جستجو پیدا نشد.'
              : anyError
                ? `اتصال به Provider برقرار نشد (${firstErrorText}). تلاش خودکار ادامه دارد — داده قبلی هرگز پاک نمی‌شود.`
                : 'اطلاعات بازار هنوز دریافت نشده است. اسنپ‌شات آفلاین هم در دسترس نیست — لطفاً همگام‌سازی را دوباره امتحان کنید.'}
          </p>
          {!query && (
            <button
              onClick={retry}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full glass-inset px-3 py-1.5 text-[10px] font-black text-ink transition-all hover:text-accent"
            >
              همگام‌سازی دوباره
            </button>
          )}
        </div>
      ) : (
        <>
          {/* دسکتاپ — جدول */}
          <div className="hidden overflow-x-auto md:block">
            <table className="sim-table w-full text-start">
              <thead>
                <tr>
                  <th className="!text-start">#</th>
                  <th className="!text-start">Symbol</th>
                  <th className="!text-start">Price</th>
                  <th className="!text-start">24H</th>
                  <th className="!text-start">7D</th>
                  <th className="!text-start">30D</th>
                  <th className="!text-start">Market Cap</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map((a, i) => (
                  <MarketRow key={a.id} asset={a} index={i} />
                ))}
              </tbody>
            </table>
          </div>

          {/* موبایل — کارت (همان Row) */}
          <div className="divide-y divide-line/5 md:hidden">
            {filtered.slice(0, limit).map((a, i) => (
              <MarketCard key={a.id} asset={a} index={i} />
            ))}
          </div>

          {filtered.length > limit && (
            <button
              onClick={() => setLimit((l) => l + PAGE)}
              className="w-full py-2.5 text-center text-[10px] font-black text-accent transition-colors hover:bg-accent/[0.04]"
            >
              نمایش بیشتر ({filtered.length - limit} باقی‌مانده)
            </button>
          )}
        </>
      )}
    </GlassCard>
  );
}

/* ---------- Row مستقل (memoized — بخش ۲۷) ---------- */

function Pct({ v }: { v: number | null }) {
  if (v === null || !Number.isFinite(v)) return <span className="num-ltr text-muted/50">—</span>;
  const cls = v > 0 ? 'text-positive' : v < 0 ? 'text-negative' : 'text-ink';
  const sign = v > 0 ? '+' : '';
  return (
    <span className={`num-ltr font-bold tabular-nums ${cls}`}>
      {sign}
      {v.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%
    </span>
  );
}

function Usd({ v }: { v: number | null }) {
  if (v === null || !Number.isFinite(v) || v <= 0) return <span className="num-ltr text-muted/50">—</span>;
  const text = v >= 1e9
    ? `$${(v / 1e9).toLocaleString('en-US', { maximumFractionDigits: 2 })}B`
    : v >= 1e6
      ? `$${(v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 })}M`
      : v >= 1e3
        ? `$${(v / 1e3).toLocaleString('en-US', { maximumFractionDigits: 2 })}K`
        : v < 1
          ? `$${v.toLocaleString('en-US', { maximumFractionDigits: 6 })}`
          : `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  return <span className="num-ltr tabular-nums">{text}</span>;
}

function Logo({ src, symbol }: { src: string | null; symbol: string }) {
  const small = src?.includes('coin-images.coingecko.com') && src.includes('/large/')
    ? src.replace('/large/', '/small/')
    : src;
  if (!small) {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/60 to-info/60 text-[9px] font-black text-white">
        {symbol.slice(0, 1)}
      </span>
    );
  }
  return (
    <img src={small} alt={symbol} loading="lazy" width={24} height={24} className="h-6 w-6 shrink-0 rounded-full object-contain" />
  );
}

const MarketRow = memo(function MarketRow({ asset, index }: { asset: MarketAsset; index: number }) {
  return (
    <tr className="cursor-default">
      <td className="num-ltr text-muted">{index + 1}</td>
      <td>
        <div className="flex items-center gap-2">
          <Logo src={asset.image} symbol={asset.symbol} />
          <div className="min-w-0">
            <p dir="ltr" className="text-[12px] font-extrabold text-ink">{asset.symbol}</p>
            <p className="text-[8px] font-bold text-muted/70">{SOURCE_FA[asset.source]}</p>
          </div>
        </div>
      </td>
      <td><Usd v={asset.price} /></td>
      <td><Pct v={asset.change24h} /></td>
      <td><Pct v={asset.change7d} /></td>
      <td><Pct v={asset.change30d} /></td>
      <td><Usd v={asset.marketCap} /></td>
    </tr>
  );
});

const MarketCard = memo(function MarketCard({ asset, index }: { asset: MarketAsset; index: number }) {
  return (
    <div className="flex items-center gap-2.5 p-3">
      <span className="num-ltr w-5 text-[9px] font-black text-muted">{index + 1}</span>
      <Logo src={asset.image} symbol={asset.symbol} />
      <div className="min-w-0 flex-1">
        <p dir="ltr" className="text-[12px] font-extrabold text-ink">{asset.symbol}</p>
        <p className="text-[8px] font-bold text-muted/70">{SOURCE_FA[asset.source]}</p>
      </div>
      <div className="text-end">
        <p className="num-ltr text-[12px] font-black text-ink"><Usd v={asset.price} /></p>
        <p className="text-[8px] font-bold text-muted/70">MCap: <Usd v={asset.marketCap} /></p>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <Pct v={asset.change24h} />
        <span className="text-[8px] font-bold text-muted/50">24H</span>
      </div>
      <div className="hidden flex-col items-end gap-0.5 sm:flex">
        <Pct v={asset.change7d} />
        <span className="text-[8px] font-bold text-muted/50">7D</span>
      </div>
      <div className="hidden flex-col items-end gap-0.5 sm:flex">
        <Pct v={asset.change30d} />
        <span className="text-[8px] font-bold text-muted/50">30D</span>
      </div>
    </div>
  );
});
