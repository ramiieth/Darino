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
            <table className="data-table">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr>
                  <SortTh k="rank" sort={sort} onSort={onSort} className="w-12 !ps-5">#</SortTh>
                  <th scope="col">دارایی</th>
                  <SortTh k="price" sort={sort} onSort={onSort} num>قیمت</SortTh>
                  <th scope="col">سقف تاریخی و میزان ریزش</th>
                  <th scope="col">بازه و مدت‌زمان رنج</th>
                  <SortTh k="change24h" sort={sort} onSort={onSort} num>۲۴ ساعت</SortTh>
                  <SortTh k="change7d" sort={sort} onSort={onSort} num>۷ روز</SortTh>
                  <SortTh k="change30d" sort={sort} onSort={onSort} num>۳۰ روز</SortTh>
                  <SortTh k="marketCap" sort={sort} onSort={onSort} num>ارزش بازار</SortTh>
                  <th scope="col" className="w-12 !pe-4"><span className="sr-only">پیگیری</span></th>
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

          {/* phones — list */}
          <ul className="divide-y divide-divider px-4 md:hidden">
            {visible.map((a) => (
              <MarketCard key={a.id} asset={a} onOpen={() => setDetail(a)} />
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

/* ---------- ATH & Range Cells (واضح و به فارسی روان بدون بهم‌ریختگی جهت اعداد) ---------- */
export function AthDistanceCell({ info }: { info: ComputedAthAndRangeInfo | null }) {
  if (!info) return <span className="text-xs text-subtle">—</span>;
  const isNearAth = info.drawdownFromAthPct >= -5;
  return (
    <div className="min-w-[180px] space-y-1 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="text-[11px] text-muted">
          سقف: <strong className="font-extrabold text-ink">{info.athPriceFa}</strong>
        </span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-extrabold',
            isNearAth
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
          )}
        >
          {info.drawdownClearFa}
        </span>
      </div>
      <p className="text-[11px] text-muted">زمان سقف: {info.elapsedSinceAthFa}</p>
    </div>
  );
}

export function RangeDurationCell({ info }: { info: ComputedAthAndRangeInfo | null }) {
  if (!info) return <span className="text-xs text-subtle">—</span>;
  return (
    <div className="min-w-[195px] space-y-1 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="text-[11px] font-bold text-ink">
          بازه: {info.rangeBandFormatted}
        </span>
        <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-extrabold text-indigo-700 dark:text-indigo-300">
          مدت رنج: {info.rangeDurationFa}
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
        <span className="text-[10px] text-muted">{info.rangeStatusLabelFa}</span>
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
    <tr>
      <td className="num-ltr !ps-5 text-xs text-subtle">{index + 1}</td>
      <td>
        <div className="flex items-center gap-3">
          <Logo src={asset.image} symbol={asset.symbol} />
          <AssetName symbol={asset.symbol} meta={SOURCE_FA[asset.source]} className="max-w-[14rem]" />
        </div>
      </td>
      <td className="col-num font-semibold text-ink">
        <MoneyValue value={asset.price && asset.price > 0 ? asset.price : null} />
      </td>
      <td>
        <AthDistanceCell info={athRange} />
      </td>
      <td>
        <RangeDurationCell info={athRange} />
      </td>
      <td className="col-num"><PercentValue value={asset.change24h} /></td>
      <td className="col-num"><PercentValue value={asset.change7d} /></td>
      <td className="col-num"><PercentValue value={asset.change30d} /></td>
      <td className="col-num text-muted">
        <MoneyValue value={asset.marketCap && asset.marketCap > 0 ? asset.marketCap : null} compact />
      </td>
      <td className="!pe-4">
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

/* ---------- phone row: every metric stays visible (reflow, not hide) ---------- */
const MarketCard = memo(function MarketCard({ asset, onOpen }: { asset: MarketAsset; onOpen: () => void }) {
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
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 py-3 text-start">
        <Logo src={asset.image} symbol={asset.symbol} size={36} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <AssetName symbol={asset.symbol} meta={SOURCE_FA[asset.source]} />
          {athRange && (
            <div className="space-y-1 rounded-field border border-divider/60 bg-surface-2/50 px-2.5 py-1.5 text-[11px] leading-5">
              <p className="text-ink">
                <span className="font-bold text-muted">سقف تاریخی: </span>
                <strong className="font-extrabold text-ink">{athRange.athPriceFa}</strong>
                <span className="text-muted"> ({athRange.elapsedSinceAthFa}) · </span>
                <strong className="font-extrabold text-rose-600 dark:text-rose-300">{athRange.drawdownClearFa}</strong>
              </p>
              <p className="text-ink">
                <span className="font-bold text-muted">وضعیت رنج: </span>
                <strong className="font-extrabold text-indigo-700 dark:text-indigo-300">
                  {athRange.rangeSummarySentenceFa}
                </strong>
                <span className="text-muted"> ({athRange.rangeStatusLabelFa})</span>
              </p>
            </div>
          )}
          <p className="flex flex-wrap items-center gap-x-2.5 text-2xs text-muted">
            <span>
              ۷ روز <PercentValue value={asset.change7d} />
            </span>
            <span>
              ۳۰ روز <PercentValue value={asset.change30d} />
            </span>
            <span>
              ارزش <MoneyValue value={asset.marketCap && asset.marketCap > 0 ? asset.marketCap : null} compact />
            </span>
          </p>
        </div>
        <div className="shrink-0 text-end">
          <p className="text-sm font-semibold text-ink">
            <MoneyValue value={asset.price && asset.price > 0 ? asset.price : null} />
          </p>
          <PercentValue value={asset.change24h} className="text-xs font-semibold" />
        </div>
      </button>
    </li>
  );
});
