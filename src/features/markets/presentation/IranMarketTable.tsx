/**
 * بخش «بورس ایران و آتیه» — رابط کاملاً مینیمال و خلوت برای وب و PWA
 * نمایش هر نماد با لوگو، قیمت و بازده‌های ۱، ۷، ۳۰، ۶۰، ۹۰ و ۳۶۵ روزه
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Coins,
  ExternalLink,
  Flame,
  PiggyBank,
  RefreshCw,
  ShieldCheck,
  Star,
  Zap
} from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { SearchField } from '@/shared/components/ui/Input';
import { EmptyState } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import {
  IRAN_FUND_SUBTYPE_LABELS,
  IRAN_MARKET_CATALOG,
  IRAN_MARKET_SEGMENTS,
  fetchIranMarketData,
  filterIranMarketInstruments,
  type IranFundSubtype,
  type IranMarketInstrument,
  type IranMarketSegment
} from '../data/iranMarketCatalog';

const WATCHLIST_KEY = 'darino:iran-market:watchlist:v1';
const PAGE_SIZE = 40;

type SortMode = 'value' | '1d' | '7d' | '30d' | '365d' | 'name';

const RETURN_WINDOWS = [
  { key: 'changePct', label: '۱ روز' },
  { key: 'change7dPct', label: '۷ روز' },
  { key: 'change30dPct', label: '۳۰ روز' },
  { key: 'change60dPct', label: '۶۰ روز' },
  { key: 'change90dPct', label: '۹۰ روز' },
  { key: 'change365dPct', label: '۳۶۵ روز' }
] as const;

function loadWatchlist(): Set<string> {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function saveWatchlist(ids: Set<string>) {
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore storage errors
  }
}

const fmtRial = (val: number | null | undefined) => {
  if (val === null || val === undefined || !Number.isFinite(val)) return null;
  return toFaDigits(Math.round(val).toLocaleString('en-US'));
};

const fmtPct = (val: number | null | undefined) => {
  if (val === null || val === undefined || !Number.isFinite(val)) return null;
  const sign = val > 0 ? '+' : '';
  return `${sign}${toFaDigits(val.toFixed(1))}٪`;
};

const SEGMENT_SHORT: Record<IranMarketSegment, string> = {
  tse: 'بورس',
  ifb: 'فرابورس',
  ime: 'کالا',
  funds: 'صندوق',
  pension: 'آتیه'
};

/** لوگوی اختصاصی و رنگ‌بندی‌شده برای تمام نمادها و صندوق‌ها */
function IranInstrumentLogo({ item, size = 'md' }: { item: IranMarketInstrument; size?: 'sm' | 'md' }) {
  const txt = `${item.symbol} ${item.nameFa} ${item.sectorFa} ${item.managerFa ?? ''}`;

  let gradient = 'from-sky-500 to-indigo-600';
  let cornerIcon: React.ReactNode = null;

  if (item.segment === 'pension' || /آتیه|آتيه|بازنشست/.test(txt)) {
    gradient = /مفید/.test(txt)
      ? 'from-teal-500 to-emerald-600'
      : /آگاه/.test(txt)
        ? 'from-blue-600 to-indigo-700'
        : /کاریز/.test(txt)
          ? 'from-violet-600 to-purple-700'
          : 'from-emerald-500 to-teal-700';
    cornerIcon = <PiggyBank className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-300" aria-hidden />;
  } else if (item.fundSubtype === 'gold' || /طلا|سکه|شمش|عیار|لوتوس|کهربا|فزر/.test(txt)) {
    gradient = 'from-amber-400 to-yellow-600';
    cornerIcon = <Coins className="h-2.5 w-2.5 text-amber-600 dark:text-amber-300" aria-hidden />;
  } else if (item.fundSubtype === 'leveraged' || /اهرم|شتاب|توان|موج/.test(txt)) {
    gradient = 'from-rose-500 to-orange-600';
    cornerIcon = <Zap className="h-2.5 w-2.5 text-rose-600 dark:text-rose-300" aria-hidden />;
  } else if (item.fundSubtype === 'fixed_income' || /درآمد\s*ثابت|آوند|کارا/.test(txt)) {
    gradient = 'from-emerald-500 to-cyan-600';
    cornerIcon = <ShieldCheck className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-300" aria-hidden />;
  } else if (/نقره/.test(txt)) {
    gradient = 'from-slate-400 to-zinc-600';
    cornerIcon = <Coins className="h-2.5 w-2.5 text-slate-600 dark:text-slate-300" aria-hidden />;
  } else if (/زعفران/.test(txt)) {
    gradient = 'from-fuchsia-600 to-rose-600';
  } else if (/پسته/.test(txt)) {
    gradient = 'from-lime-500 to-emerald-600';
  } else if (/فولاد|معدن|کگل|کچاد|هرمز|استیل|فلزات/.test(txt)) {
    gradient = 'from-slate-600 to-blue-800';
  } else if (/مس|فملی/.test(txt)) {
    gradient = 'from-orange-500 to-amber-700';
  } else if (/پتروشیمی|شیمیایی|پالایش|نفت|فارس|آریا|زاگرس|شپنا|شبندر|نوری|اکتان/.test(txt)) {
    gradient = 'from-cyan-500 to-teal-700';
    cornerIcon = <Flame className="h-2.5 w-2.5 text-cyan-600 dark:text-cyan-300" aria-hidden />;
  } else if (/بانک|بیمه|وبملت|وتجارت|دارا|بپاس/.test(txt)) {
    gradient = 'from-indigo-600 to-blue-800';
  } else if (/خودرو|خساپا/.test(txt)) {
    gradient = 'from-red-500 to-rose-700';
  } else if (/مخابرات|همراه/.test(txt)) {
    gradient = 'from-sky-500 to-cyan-600';
  } else if (item.segment === 'ifb') {
    gradient = 'from-violet-500 to-indigo-600';
  }

  const shortLabel = item.symbol.replace(/\(.*?\)/g, '').trim().split(/\s+/)[0].slice(0, 5);
  const dim = size === 'sm' ? 'h-9 w-9 text-[10px]' : 'h-9 w-9 text-[11px]';

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center rounded-xl font-black text-white shadow-xs ring-1 ring-black/10 dark:ring-white/15',
        dim
      )}
      aria-hidden
    >
      <span className={cn('absolute inset-0 rounded-xl bg-gradient-to-br', gradient)} />
      <span className="relative z-10 leading-none tracking-tight">{shortLabel}</span>
      {cornerIcon && (
        <span className="absolute -bottom-1 -end-1 z-20 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-card shadow-xs ring-1 ring-divider">
          {cornerIcon}
        </span>
      )}
    </span>
  );
}

function ReturnCell({ value, pill = false }: { value: number | null | undefined; pill?: boolean }) {
  const txt = fmtPct(value);
  if (!txt || value === null || value === undefined) {
    return <span className="text-[11px] text-subtle">—</span>;
  }
  const color = value > 0 ? 'text-positive' : value < 0 ? 'text-negative' : 'text-muted';
  if (pill) {
    const bg = value > 0 ? 'bg-gain/12' : value < 0 ? 'bg-negative/12' : 'bg-surface-2';
    return (
      <span dir="ltr" className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums', color, bg)}>
        {txt}
      </span>
    );
  }
  return (
    <span dir="ltr" className={cn('text-xs font-bold tabular-nums', color)}>
      {txt}
    </span>
  );
}

export function IranMarketTable() {
  const [items, setItems] = useState<IranMarketInstrument[]>([...IRAN_MARKET_CATALOG]);
  const [loading, setLoading] = useState(false);

  const [segment, setSegment] = useState<IranMarketSegment | 'all'>('all');
  const [fundSubtype, setFundSubtype] = useState<IranFundSubtype | 'all'>('all');
  const [query, setQuery] = useState('');
  const [onlyWatchlist, setOnlyWatchlist] = useState(false);
  const [sortBy, setSortBy] = useState<SortMode>('value');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<Set<string>>(() => loadWatchlist());

  const sync = async () => {
    setLoading(true);
    try {
      const res = await fetchIranMarketData();
      setItems(res.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void sync();
  }, []);

  const toggleStar = (id: string) => {
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveWatchlist(next);
      return next;
    });
  };

  const counts = useMemo(() => {
    const map: Record<IranMarketSegment | 'all', number> = {
      all: items.length,
      tse: 0,
      ifb: 0,
      ime: 0,
      funds: 0,
      pension: 0
    };
    for (const it of items) map[it.segment]++;
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    const base = filterIranMarketInstruments({
      items,
      segment,
      fundSubtype,
      query,
      onlyWatchlist,
      watchlistIds: watchlist
    });

    const sorted = [...base];
    if (sortBy === '1d') sorted.sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999));
    else if (sortBy === '7d') sorted.sort((a, b) => (b.change7dPct ?? -999) - (a.change7dPct ?? -999));
    else if (sortBy === '30d') sorted.sort((a, b) => (b.change30dPct ?? -999) - (a.change30dPct ?? -999));
    else if (sortBy === '365d') sorted.sort((a, b) => (b.change365dPct ?? -999) - (a.change365dPct ?? -999));
    else if (sortBy === 'name') sorted.sort((a, b) => a.symbol.localeCompare(b.symbol, 'fa'));
    else sorted.sort((a, b) => (b.tradeValueBillionToman ?? -1) - (a.tradeValueBillionToman ?? -1));
    return sorted;
  }, [items, segment, fundSubtype, query, onlyWatchlist, watchlist, sortBy]);

  const visible = filtered.slice(0, limit);

  return (
    <section aria-label="بازار سرمایه ایران" className="space-y-3">
      {/* ۱) فیلترهای قرصی مینیمال */}
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-0.5">
        <button
          type="button"
          onClick={() => {
            setSegment('all');
            setFundSubtype('all');
            setLimit(PAGE_SIZE);
          }}
          className={cn(
            'shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition',
            segment === 'all' && !onlyWatchlist
              ? 'bg-ink text-card'
              : 'bg-surface-2/80 text-muted hover:text-ink'
          )}
        >
          همه ({toFaDigits(counts.all)})
        </button>

        {IRAN_MARKET_SEGMENTS.map((seg) => {
          const active = segment === seg.id;
          return (
            <button
              key={seg.id}
              type="button"
              onClick={() => {
                setSegment(seg.id);
                setFundSubtype('all');
                setLimit(PAGE_SIZE);
              }}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition',
                active ? 'bg-ink text-card' : 'bg-surface-2/80 text-muted hover:text-ink'
              )}
            >
              {seg.shortFa} ({toFaDigits(counts[seg.id])})
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => {
            setOnlyWatchlist((v) => !v);
            setLimit(PAGE_SIZE);
          }}
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition',
            onlyWatchlist
              ? 'bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/40 dark:text-amber-300'
              : 'bg-surface-2/80 text-muted hover:text-ink'
          )}
        >
          <Star className={cn('h-3.5 w-3.5', onlyWatchlist && 'fill-current')} aria-hidden />
          <span>دیده‌بان</span>
        </button>
      </div>

      {/* زیرفیلتر صندوق‌ها */}
      {segment === 'funds' && (
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
          {(['all', 'equity', 'leveraged', 'sector', 'index', 'gold', 'fixed_income'] as const).map((sub) => (
            <button
              key={sub}
              type="button"
              onClick={() => {
                setFundSubtype(sub);
                setLimit(PAGE_SIZE);
              }}
              className={cn(
                'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold transition',
                fundSubtype === sub
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-divider/70 bg-card text-muted hover:text-ink'
              )}
            >
              {sub === 'all' ? 'همه' : IRAN_FUND_SUBTYPE_LABELS[sub]}
            </button>
          ))}
        </div>
      )}

      {/* ۲) جستجو + مرتب‌سازی + رفرش خلوت */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={query}
          onChange={(v) => {
            setQuery(v);
            setLimit(PAGE_SIZE);
          }}
          placeholder="جستجوی نماد یا صندوق…"
          className="min-w-[190px] flex-1 md:max-w-xs"
        />

        <div className="no-scrollbar ms-auto flex items-center gap-1.5 overflow-x-auto">
          <div className="flex items-center gap-0.5 rounded-control bg-surface-2/70 p-0.5 text-[11px]">
            {(
              [
                ['value', 'ارزش'],
                ['1d', '۱ روز'],
                ['7d', '۷ روز'],
                ['30d', '۳۰ روز'],
                ['365d', '۳۶۵ روز'],
                ['name', 'نام']
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSortBy(id)}
                className={cn(
                  'shrink-0 rounded-[6px] px-2 py-1 font-bold transition',
                  sortBy === id ? 'bg-card text-ink shadow-xs' : 'text-muted hover:text-ink'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            aria-label="به‌روزرسانی"
            onClick={() => void sync()}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-divider/70 bg-card text-muted transition hover:text-ink"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden />
          </button>
        </div>
      </div>

      {/* ۳) جدول وب (با ستون‌های ۱، ۷، ۳۰، ۶۰، ۹۰ و ۳۶۵ روزه) + کارت‌های مینیمال PWA */}
      {visible.length === 0 ? (
        <EmptyState message="موردی یافت نشد" hint="جستجو یا فیلتر را تغییر دهید." />
      ) : (
        <Surface className="overflow-hidden">
          {/* نمای وب (Desktop) */}
          <div className="hidden overflow-x-auto md:block">
            <table className="data-table">
              <caption className="sr-only">بازار سهام و صندوق‌های ایران</caption>
              <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                <tr>
                  <th scope="col" className="!ps-4">نماد</th>
                  <th scope="col" className="col-num">قیمت</th>
                  <th scope="col" className="col-num">۱ روز</th>
                  <th scope="col" className="col-num">۷ روز</th>
                  <th scope="col" className="col-num">۳۰ روز</th>
                  <th scope="col" className="col-num hidden lg:table-cell">۶۰ روز</th>
                  <th scope="col" className="col-num hidden lg:table-cell">۹۰ روز</th>
                  <th scope="col" className="col-num">۳۶۵ روز</th>
                  <th scope="col" className="!pe-3 text-end">
                    <span className="sr-only">لینک</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const starred = watchlist.has(item.id);
                  const lastPx = item.live ? fmtRial(item.lastPriceRial) : null;
                  const closePx = item.live ? fmtRial(item.closePriceRial) : null;
                  return (
                    <tr key={item.id} className="transition-colors hover:bg-surface-2/40">
                      <td className="!ps-4">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            aria-label={`دیده‌بان ${item.symbol}`}
                            onClick={() => toggleStar(item.id)}
                            className="shrink-0 text-subtle transition hover:text-amber-500"
                          >
                            <Star className={cn('h-3.5 w-3.5', starred && 'fill-amber-400 text-amber-500')} />
                          </button>
                          <IranInstrumentLogo item={item} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-ink">{item.symbol}</span>
                              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                                {item.fundSubtype && item.segment === 'funds'
                                  ? IRAN_FUND_SUBTYPE_LABELS[item.fundSubtype]
                                  : SEGMENT_SHORT[item.segment]}
                              </span>
                            </div>
                            <p className="max-w-[13rem] truncate text-[11px] text-muted">{item.nameFa}</p>
                          </div>
                        </div>
                      </td>

                      <td className="col-num whitespace-nowrap">
                        {lastPx ? (
                          <div>
                            <span className="font-extrabold text-ink tabular-nums">{lastPx}</span>
                            {closePx && closePx !== lastPx && (
                              <span className="block text-[10px] text-subtle">{closePx}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-subtle">—</span>
                        )}
                      </td>

                      <td className="col-num whitespace-nowrap">
                        <ReturnCell value={item.live ? item.changePct : null} pill />
                      </td>
                      <td className="col-num whitespace-nowrap">
                        <ReturnCell value={item.live ? item.change7dPct : null} />
                      </td>
                      <td className="col-num whitespace-nowrap">
                        <ReturnCell value={item.live ? item.change30dPct : null} />
                      </td>
                      <td className="col-num hidden whitespace-nowrap lg:table-cell">
                        <ReturnCell value={item.live ? item.change60dPct : null} />
                      </td>
                      <td className="col-num hidden whitespace-nowrap lg:table-cell">
                        <ReturnCell value={item.live ? item.change90dPct : null} />
                      </td>
                      <td className="col-num whitespace-nowrap">
                        <ReturnCell value={item.live ? item.change365dPct : null} />
                      </td>

                      <td className="!pe-3 text-end">
                        <a
                          href={item.officialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={item.symbol}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-control text-subtle transition hover:bg-surface-2 hover:text-accent"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* نمای موبایل و PWA — خلوت با نوار ۶ بازه (۱، ۷، ۳۰، ۶۰، ۹۰، ۳۶۵ روز) */}
          <ul className="divide-y divide-divider/60 md:hidden">
            {visible.map((item) => {
              const starred = watchlist.has(item.id);
              const expanded = expandedId === item.id;
              const lastPx = item.live ? fmtRial(item.lastPriceRial) : null;
              return (
                <li key={item.id} className="px-3 py-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`دیده‌بان ${item.symbol}`}
                      onClick={() => toggleStar(item.id)}
                      className="flex h-8 w-6 shrink-0 items-center justify-center text-subtle"
                    >
                      <Star className={cn('h-3.5 w-3.5', starred && 'fill-amber-400 text-amber-500')} />
                    </button>

                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : item.id)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-2 text-start"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <IranInstrumentLogo item={item} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-extrabold text-ink">{item.symbol}</span>
                            <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                              {item.fundSubtype && item.segment === 'funds'
                                ? IRAN_FUND_SUBTYPE_LABELS[item.fundSubtype]
                                : SEGMENT_SHORT[item.segment]}
                            </span>
                          </div>
                          <p className="truncate text-[11px] text-muted">{item.nameFa}</p>
                        </div>
                      </div>

                      <div className="shrink-0 text-end">
                        <p className="text-xs font-extrabold text-ink tabular-nums">
                          {lastPx ? `${lastPx} ریال` : '—'}
                        </p>
                        <div className="mt-0.5">
                          <ReturnCell value={item.live ? item.changePct : null} pill />
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* نوار فشردهٔ بازده ۱ تا ۳۶۵ روز */}
                  <div className="grid grid-cols-6 gap-1 rounded-field bg-surface-2/45 px-1.5 py-1.5 text-center">
                    {RETURN_WINDOWS.map((w) => (
                      <div key={w.key} className="space-y-0.5">
                        <span className="block text-[9px] text-subtle">{w.label}</span>
                        <ReturnCell value={item.live ? item[w.key] : null} />
                      </div>
                    ))}
                  </div>

                  {expanded && (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-0.5 text-[11px] text-muted">
                      <span>
                        {item.sectorFa}
                        {item.managerFa ? ` · ${item.managerFa}` : ''}
                        {item.pe && item.pe > 0 ? ` · P/E ${toFaDigits(item.pe.toFixed(1))}` : ''}
                      </span>
                      <a
                        href={item.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-bold text-accent"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {filtered.length > limit && (
            <div className="border-t border-divider/70 p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-accent"
                onClick={() => setLimit((n) => n + PAGE_SIZE)}
              >
                نمایش بیشتر ({toFaDigits(filtered.length - limit)})
              </Button>
            </div>
          )}
        </Surface>
      )}
    </section>
  );
}
