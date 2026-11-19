/** ============================================================
 * MarketsTable — one table for every universe
 *
 *  desktop: sortable financial table (sticky header, tabular numerals)
 *           # · asset · price · ATH & drawdown · active range & duration · 24H · 7D · 30D · market cap · watch
 *  phones:  list rows — price + 24H prominent, ATH distance + active range band
 *           + 7D / 30D / MCap reflowed into quiet secondary lines, tap → detail sheet
 *
 *  - Rows are memoized; list is sliced with «show more» (no full render)
 *  - Missing metric → "—" (never 0); snapshot data is labelled
 *  - Data comes only from the central pipeline (no fetch in render)
 * ============================================================ */
import { memo, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw, Star } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { AssetName } from '@/shared/components/ui/AssetName';
import { SearchField, Select } from '@/shared/components/ui/Input';
import { ChipGroup } from '@/shared/components/ui/SegmentedControl';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Sheet } from '@/shared/components/ui/Sheet';
import { KeyValueList, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { EmptyState, ErrorState } from '@/shared/components/ui/StateViews';
import { assetDisplayName, assetSearchText } from '@/shared/i18n/assetDisplayName';
import { useWatchlistStore } from '@/shared/store/watchlistStore';
import { toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import { hydrateUniverse, syncUniverse, useMarketsStore } from '../pipeline/store';
import { useMarkets } from '../pipeline/useMarkets';
import type { MarketAsset, MarketSource, MarketUniverse } from '../pipeline/types';
import { getAssetAthAndRangeInfo, type ComputedAthAndRangeInfo } from '../domain/athAndRangeAnalytics';

const PAGE = 50;

const SOURCE_FA: Record<MarketSource, string> = {
  crypto: 'کریپتو',
  ondo: 'Ondo',
  xstocks: 'xStocks'
};

type SortKey = 'rank' | 'price' | 'change24h' | 'change7d' | 'change30d' | 'marketCap';
type SortDir = 'asc' | 'desc';

const SORT_LABEL: Record<SortKey, string> = {
  rank: 'رتبه',
  price: 'قیمت',
  change24h: 'تغییر ۲۴ ساعت',
  change7d: 'تغییر ۷ روز',
  change30d: 'تغییر ۳۰ روز',
  marketCap: 'ارزش بازار'
};

export function MarketsTable({
  universes,
  title,
  initialQuery = '',
  sourceFilter = false
}: {
  universes: MarketUniverse[];
  title: string;
  initialQuery?: string;
  /** show Ondo / xStocks chips (tokenized view) */
  sourceFilter?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [limit, setLimit] = useState(PAGE);
  const [source, setSource] = useState<'all' | MarketSource>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'rank', dir: 'asc' });
  const [detail, setDetail] = useState<MarketAsset | null>(null);
  const watch = useWatchlistStore((s) => s.items);
  const toggleWatch = useWatchlistStore((s) => s.toggle);

  useEffect(() => setQuery(initialQuery), [initialQuery]);

  // central refresh engine: every universe keeps its own timer/retry (deduped)
  useMarkets('crypto_top_200');
  useMarkets('ondo_tokenized');
  useMarkets('xstocks');

  // cached data first (even stale) → background sync; never clears previous data
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const u of universes) {
        await hydrateUniverse(u);
        if (cancelled) return;
        void syncUniverse(u);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universes.join(',')]);

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
    if (source !== 'all') out = out.filter((a) => a.source === source);
    if (q) out = out.filter((a) => assetSearchText(a.symbol).includes(q));
    if (sort.key !== 'rank' || sort.dir !== 'asc') {
      const k = sort.key;
      const sign = sort.dir === 'asc' ? 1 : -1;
      out = [...out].sort((a, b) => {
        if (k === 'rank') return sign * (a.rank - b.rank);
        const av = a[k];
        const bv = b[k];
        // unavailable values always last
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return sign * (av - bv);
      });
    }
    return out;
  }, [assets, query, source, sort]);

  const anyLoading = universes.some((u) => loading[u]);
  const anyError = universes.some((u) => error[u]);
  const visible = filtered.slice(0, limit);

  const onSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'rank' ? 'asc' : 'desc' }
    );

  return (
    <section aria-label={title} className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={query}
          onChange={(v) => {
            setQuery(v);
            setLimit(PAGE);
          }}
          placeholder="جستجوی نماد یا نام…"
          className="min-w-0 flex-1 md:max-w-sm"
        />
        <div className="w-32 shrink-0 md:hidden">
          <Select
            aria-label="مرتب‌سازی"
            value={`${sort.key}:${sort.dir}`}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(':') as [SortKey, SortDir];
              setSort({ key, dir });
            }}
          >
            <option value="rank:asc">رتبه</option>
            <option value="marketCap:desc">بیشترین ارزش بازار</option>
            <option value="change24h:desc">بیشترین رشد ۲۴ ساعت</option>
            <option value="change24h:asc">بیشترین افت ۲۴ ساعت</option>
            <option value="change7d:desc">بیشترین رشد ۷ روز</option>
            <option value="change30d:desc">بیشترین رشد ۳۰ روز</option>
            <option value="price:desc">بیشترین قیمت</option>
          </Select>
        </div>
        <p className="ms-auto hidden text-xs text-muted md:block">
          {toFaDigits(filtered.length)} دارایی
          {sort.key !== 'rank' && ` · مرتب بر اساس ${SORT_LABEL[sort.key]}`}
        </p>
      </div>

      {sourceFilter && (
        <ChipGroup
          bleed
          label="منبع"
          value={source}
          onChange={(v) => {
            setSource(v);
            setLimit(PAGE);
          }}
          options={[
            { value: 'all', label: 'همه' },
            { value: 'ondo', label: 'Ondo' },
            { value: 'xstocks', label: 'xStocks' }
          ]}
        />
      )}

      {anyLoading && assets.length === 0 ? (
        <Surface className="p-4">
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </Surface>
      ) : filtered.length === 0 ? (
        query ? (
          <EmptyState message="نتیجه‌ای یافت نشد" hint={`موردی با «${query}» پیدا نشد.`} />
        ) : anyError ? (
          <ErrorState
            message="اتصال به منبع داده بازار برقرار نشد"
            hint="تلاش خودکار ادامه دارد؛ داده قبلی هرگز پاک نمی‌شود."
            onRetry={retry}
          />
        ) : (
          <EmptyState
            message="داده بازار هنوز دریافت نشده"
            hint="اسنپ‌شات آفلاین هم در دسترس نیست. همگام‌سازی را دوباره امتحان کنید."
            action={
              <Button variant="outline" size="sm" icon={<RefreshCw />} onClick={retry}>
                همگام‌سازی دوباره
              </Button>
            }
          />
        )
      ) : (
        <Surface className="overflow-hidden">
          {/* desktop — table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="data-table w-full">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr>
                  <SortTh k="rank" sort={sort} onSort={onSort} className="w-10 !px-2.5 !ps-4">#</SortTh>
                  <th scope="col" className="!px-2.5">دارایی</th>
                  <SortTh k="price" sort={sort} onSort={onSort} num className="whitespace-nowrap !px-2.5">قیمت</SortTh>
                  <th scope="col" className="whitespace-nowrap !px-2.5">سقف تاریخی و ریزش</th>
                  <th scope="col" className="whitespace-nowrap !px-2.5">بازه و مدت رنج</th>
                  <SortTh k="change24h" sort={sort} onSort={onSort} num className="whitespace-nowrap !px-2">۲۴ ساعت</SortTh>
                  <SortTh k="change7d" sort={sort} onSort={onSort} num className="whitespace-nowrap !px-2">۷ روز</SortTh>
                  <SortTh k="change30d" sort={sort} onSort={onSort} num className="whitespace-nowrap !px-2">۳۰ روز</SortTh>
                  <SortTh k="marketCap" sort={sort} onSort={onSort} num className="whitespace-nowrap !px-2.5">ارزش بازار</SortTh>
                  <th scope="col" className="w-10 !px-2 !pe-3"><span className="sr-only">پیگیری</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((a, i) => (
                  <MarketRow
                    key={a.id}
                    asset={a}
                    index={i}
                    watched={watch[a.symbol] !== undefined}
                    onWatch={() => void toggleWatch(a.symbol)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* phones / PWA — refined mobile cards */}
          <ul className="divide-y divide-divider md:hidden">
            {visible.map((a) => (
              <MarketCard
                key={a.id}
                asset={a}
                watched={watch[a.symbol] !== undefined}
                onOpen={() => setDetail(a)}
              />
            ))}
          </ul>

          {filtered.length > limit && (
            <div className="border-t border-divider p-2">
              <Button variant="ghost" size="sm" className="w-full text-accent" onClick={() => setLimit((l) => l + PAGE)}>
                نمایش بیشتر ({toFaDigits(filtered.length - limit)} باقی‌مانده)
              </Button>
            </div>
          )}
        </Surface>
      )}

      <MarketDetailSheet
        asset={detail}
        onClose={() => setDetail(null)}
        watched={detail ? watch[detail.symbol] !== undefined : false}
        onWatch={() => detail && void toggleWatch(detail.symbol)}
      />
    </section>
  );
}

/* ---------- sortable header ---------- */
function SortTh({
  k,
  sort,
  onSort,
  children,
  num,
  className
}: {
  k: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (k: SortKey) => void;
  children: React.ReactNode;
  num?: boolean;
  className?: string;
}) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn(num && 'col-num', className)}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn('inline-flex items-center gap-1 rounded-control hover:text-ink', active && 'text-ink')}
      >
        {children}
        <Icon aria-hidden className={cn('h-3 w-3', !active && 'opacity-40')} />
      </button>
    </th>
  );
}

/* ---------- logo (CoinGecko small variant) ---------- */
function Logo({ src, symbol, size = 28 }: { src: string | null; symbol: string; size?: number }) {
  const small =
    src?.includes('coin-images.coingecko.com') && src.includes('/large/') ? src.replace('/large/', '/small/') : src;
  if (!small) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-2xs font-bold text-muted "
        style={{ width: size, height: size }}
      >
        {symbol.slice(0, 2)}
      </span>
    );
  }
  return (
    <img
      src={/^(POL|MATIC)$/i.test(symbol)?'/logos/chain-polygon.svg':small}
      alt=""
      loading="lazy"
      decoding="async"
      width={size}
      height={size}
      className="shrink-0 rounded-full bg-card object-contain "
      style={{ width: size, height: size }}
    />
  );
}

function WatchButton({ watched, onClick, symbol }: { watched: boolean; onClick: () => void; symbol: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={watched}
      aria-label={watched ? `حذف ${symbol} از لیست پیگیری` : `افزودن ${symbol} به لیست پیگیری`}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-control transition-colors hover:bg-surface-2',
        watched ? 'text-gold' : 'text-subtle hover:text-ink'
      )}
    >
      <Star className={cn('h-4 w-4', watched && 'fill-current')} />
    </button>
  );
}

/* ---------- ATH & Range Cells (تراز و فشرده بدون شکستگی در دسکتاپ) ---------- */
export function AthDistanceCell({ info }: { info: ComputedAthAndRangeInfo | null }) {
  if (!info) return <span className="text-xs text-subtle">—</span>;
  const isNearAth = info.drawdownFromAthPct >= -5;
  return (
    <div className="min-w-[165px] max-w-[215px] space-y-1 text-xs">
      <div className="flex items-center justify-between gap-1.5">
        <span className="whitespace-nowrap text-[11px] text-muted">
          سقف: <strong className="font-extrabold text-ink">{info.athPriceFa}</strong>
        </span>
        <span
          className={cn(
            'shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-extrabold',
            isNearAth
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
          )}
        >
          {info.drawdownClearFa}
        </span>
      </div>
      <p className="truncate text-[10px] text-subtle">زمان سقف: {info.elapsedSinceAthFa}</p>
    </div>
  );
}

export function RangeDurationCell({ info }: { info: ComputedAthAndRangeInfo | null }) {
  if (!info) return <span className="text-xs text-subtle">—</span>;
  return (
    <div className="min-w-[175px] max-w-[225px] space-y-1 text-xs">
      <div className="flex items-center justify-between gap-1.5">
        <span className="truncate text-[11px] font-bold text-ink" title={info.rangeBandFormatted}>
          {info.rangeBandFormatted}
        </span>
        <span className="shrink-0 whitespace-nowrap rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-extrabold text-indigo-700 dark:text-indigo-300">
          {info.rangeDurationFa}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              info.rangeStatus === 'near-bottom' || info.rangeStatus === 'breakdown-low'
                ? 'bg-emerald-500'
                : info.rangeStatus === 'near-top' || info.rangeStatus === 'breakout-up'
                ? 'bg-amber-500'
                : 'bg-indigo-500'
            )}
            style={{ width: `${Math.max(6, Math.min(100, info.positionInRangePct))}%` }}
          />
        </div>
        <span className="shrink-0 whitespace-nowrap text-[10px] text-muted">{info.rangeStatusLabelFa}</span>
      </div>
    </div>
  );
}

/* ---------- desktop row (memoized) ---------- */
const MarketRow = memo(function MarketRow({
  asset,
  index,
  watched,
  onWatch
}: {
  asset: MarketAsset;
  index: number;
  watched: boolean;
  onWatch: () => void;
}) {
  const athRange = useMemo(
    () =>
      getAssetAthAndRangeInfo({
        symbol: asset.symbol,
        currentPrice: asset.price,
        change30d: asset.change30d,
        change7d: asset.change7d,
        source: asset.source
      }),
    [asset.symbol, asset.price, asset.change30d, asset.change7d, asset.source]
  );

  return (
    <tr className="transition-colors hover:bg-surface-2/40">
      <td className="num-ltr !px-2.5 !ps-4 text-xs text-subtle">{index + 1}</td>
      <td className="!px-2.5">
        <div className="flex items-center gap-2.5">
          <Logo src={asset.image} symbol={asset.symbol} />
          <AssetName symbol={asset.symbol} meta={SOURCE_FA[asset.source]} className="max-w-[10.5rem]" />
        </div>
      </td>
      <td className="col-num whitespace-nowrap !px-2.5 font-bold text-ink">
        <MoneyValue value={asset.price && asset.price > 0 ? asset.price : null} />
      </td>
      <td className="!px-2.5">
        <AthDistanceCell info={athRange} />
      </td>
      <td className="!px-2.5">
        <RangeDurationCell info={athRange} />
      </td>
      <td className="col-num whitespace-nowrap !px-2 text-xs font-semibold"><PercentValue value={asset.change24h} /></td>
      <td className="col-num whitespace-nowrap !px-2 text-xs font-semibold"><PercentValue value={asset.change7d} /></td>
      <td className="col-num whitespace-nowrap !px-2 text-xs font-semibold"><PercentValue value={asset.change30d} /></td>
      <td className="col-num whitespace-nowrap !px-2.5 text-xs text-muted">
        <MoneyValue value={asset.marketCap && asset.marketCap > 0 ? asset.marketCap : null} compact />
      </td>
      <td className="!px-2 !pe-3">
        <WatchButton watched={watched} onClick={onWatch} symbol={asset.symbol} />
      </td>
    </tr>
  );
});

/* ---------- detail sheet (phones) ---------- */
function MarketDetailSheet({
  asset,
  onClose,
  watched,
  onWatch
}: {
  asset: MarketAsset | null;
  onClose: () => void;
  watched: boolean;
  onWatch: () => void;
}) {
  const athRange = useMemo(
    () =>
      asset
        ? getAssetAthAndRangeInfo({
            symbol: asset.symbol,
            currentPrice: asset.price,
            change30d: asset.change30d,
            change7d: asset.change7d,
            source: asset.source
          })
        : null,
    [asset]
  );

  if (!asset) return null;
  const d = assetDisplayName(asset.symbol);
  return (
    <Sheet
      open
      onClose={onClose}
      title={d.name}
      description={SOURCE_FA[asset.source]}
      size="sm"
      footer={
        <Button variant={watched ? 'outline' : 'secondary'} className="w-full" icon={<Star className={cn(watched && 'fill-current')} />} onClick={onWatch}>
          {watched ? 'حذف از لیست پیگیری' : 'افزودن به لیست پیگیری'}
        </Button>
      }
    >
      <div className="flex items-center gap-3">
        <Logo src={asset.image} symbol={asset.symbol} size={44} />
        <div>
          <p className="text-3xl font-extrabold tracking-tight text-ink">
            <MoneyValue value={asset.price && asset.price > 0 ? asset.price : null} state={asset.snapshot ? 'stale' : 'ready'} />
          </p>
          <PercentValue value={asset.change24h} className="text-sm font-semibold" />
          <span className="ms-1 text-xs text-muted">۲۴ ساعت</span>
        </div>
      </div>
      {asset.snapshot && (
        <div className="mt-3">
          <Badge tone="warn">داده ذخیره‌شده — زنده نیست</Badge>
        </div>
      )}
      <KeyValueList
        className="mt-4"
        rows={[
          ...(athRange
            ? [
                {
                  label: 'آخرین سقف تاریخی (ATH)',
                  value: (
                    <span className="text-xs font-extrabold text-ink">
                      {athRange.athPriceFa} ({athRange.elapsedSinceAthFa})
                    </span>
                  )
                },
                {
                  label: 'میزان ریزش از سقف',
                  value: (
                    <span className="text-xs font-extrabold text-negative">
                      {athRange.drawdownClearFa}
                    </span>
                  )
                },
                {
                  label: 'بازه و مدت‌زمان رنج',
                  value: (
                    <span className="text-xs font-bold text-ink">
                      {athRange.rangeSummarySentenceFa} ({athRange.rangeStatusLabelFa})
                    </span>
                  )
                }
              ]
            : []),
          { label: 'تغییر ۷ روز', value: <PercentValue value={asset.change7d} /> },
          { label: 'تغییر ۳۰ روز', value: <PercentValue value={asset.change30d} /> },
          { label: 'ارزش بازار', value: <MoneyValue value={asset.marketCap && asset.marketCap > 0 ? asset.marketCap : null} compact /> },
          { label: 'رتبه', value: <span className="num-ltr">#{asset.rank}</span> }
        ]}
      />
    </Sheet>
  );
}

/* ---------- phone / PWA card: clean hierarchy, single-line price, structured ATH/range ---------- */
const MarketCard = memo(function MarketCard({
  asset,
  watched,
  onOpen
}: {
  asset: MarketAsset;
  watched: boolean;
  onOpen: () => void;
}) {
  const athRange = useMemo(
    () =>
      getAssetAthAndRangeInfo({
        symbol: asset.symbol,
        currentPrice: asset.price,
        change30d: asset.change30d,
        change7d: asset.change7d,
        source: asset.source
      }),
    [asset.symbol, asset.price, asset.change30d, asset.change7d, asset.source]
  );

  const change24 = asset.change24h;
  const changePillTone =
    change24 === null
      ? 'bg-surface-2 text-muted'
      : change24 > 0
        ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
        : change24 < 0
          ? 'bg-rose-500/12 text-rose-600 dark:text-rose-300'
          : 'bg-surface-2 text-muted';

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full space-y-2.5 px-3.5 py-3.5 text-start transition-colors active:bg-surface-2/60"
      >
        {/* ردیف اول: نام دارایی + قیمت تک‌خطی و تغییر ۲۴ ساعت */}
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Logo src={asset.image} symbol={asset.symbol} size={36} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <AssetName symbol={asset.symbol} meta={SOURCE_FA[asset.source]} />
                {watched && <Star className="h-3.5 w-3.5 shrink-0 fill-current text-gold" aria-hidden />}
              </div>
            </div>
          </div>
          <div className="shrink-0 text-end">
            <p className="whitespace-nowrap text-[15px] font-extrabold tracking-tight text-ink">
              <MoneyValue value={asset.price && asset.price > 0 ? asset.price : null} />
            </p>
            <div className="mt-0.5 flex justify-end">
              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold', changePillTone)}>
                <PercentValue value={asset.change24h} tone="none" />
              </span>
            </div>
          </div>
        </div>

        {/* ردیف دوم: کارت فشرده سقف تاریخی و وضعیت کانال رنج */}
        {athRange && (
          <div className="space-y-1.5 rounded-field border border-divider/60 bg-surface-2/45 px-3 py-2 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-muted">
                سقف: <strong className="font-bold text-ink">{athRange.athPriceFa}</strong>
                <span className="ms-1 text-[10px] text-subtle">({athRange.elapsedSinceAthFa})</span>
              </span>
              <span
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-extrabold',
                  athRange.drawdownFromAthPct >= -5
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                )}
              >
                {athRange.drawdownClearFa}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-muted">
                رنج: <strong className="font-bold text-ink">{athRange.rangeBandFormatted}</strong>
              </span>
              <span className="shrink-0 whitespace-nowrap rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-extrabold text-indigo-700 dark:text-indigo-300">
                {athRange.rangeDurationFa}
              </span>
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-card">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    athRange.rangeStatus === 'near-bottom' || athRange.rangeStatus === 'breakdown-low'
                      ? 'bg-emerald-500'
                      : athRange.rangeStatus === 'near-top' || athRange.rangeStatus === 'breakout-up'
                        ? 'bg-amber-500'
                        : 'bg-indigo-500'
                  )}
                  style={{ width: `${Math.max(6, Math.min(100, athRange.positionInRangePct))}%` }}
                />
              </div>
              <span className="shrink-0 whitespace-nowrap text-[10px] text-muted">{athRange.rangeStatusLabelFa}</span>
            </div>
          </div>
        )}

        {/* ردیف سوم: بازده ۷ روز، ۳۰ روز و ارزش بازار بدون شکستگی */}
        <div className="grid grid-cols-3 gap-2 border-t border-divider/50 pt-2 text-[11px]">
          <div className="min-w-0">
            <span className="block text-[10px] text-subtle">۷ روز</span>
            <span className="whitespace-nowrap font-semibold">
              <PercentValue value={asset.change7d} />
            </span>
          </div>
          <div className="min-w-0 text-center">
            <span className="block text-[10px] text-subtle">۳۰ روز</span>
            <span className="whitespace-nowrap font-semibold">
              <PercentValue value={asset.change30d} />
            </span>
          </div>
          <div className="min-w-0 text-end">
            <span className="block text-[10px] text-subtle">ارزش بازار</span>
            <span className="whitespace-nowrap font-semibold text-muted">
              <MoneyValue value={asset.marketCap && asset.marketCap > 0 ? asset.marketCap : null} compact />
            </span>
          </div>
        </div>
      </button>
    </li>
  );
});
