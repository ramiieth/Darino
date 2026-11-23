/**
 * بخش «بورس ایران و آتیه» — بازطراحی مینیمال برای وب (جدول چسبان) و PWA (لیست کارتی بومی)
 *
 * پوشش یکپارچه:
 *   • بورس تهران (TSE) · فرابورس (IFB) · بورس کالا (IME)
 *   • صندوق‌های سهامی، اهرمی، بخشی، شاخصی، طلا و درآمد ثابت (ETF)
 *   • صندوق‌های بازنشستگی تکمیلی / آتیه (آتیه مفید، اندوخته آگاه، کاریز کاریزما و…)
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  ChevronDown,
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
import { Badge } from '@/shared/components/ui/Badge';
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

type SortMode = 'value' | 'gain' | 'loss' | 'name';

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
    // ignore storage errors in private mode
  }
}

const fmtRial = (val: number | null | undefined) => {
  if (val === null || val === undefined || !Number.isFinite(val)) return null;
  return `${toFaDigits(Math.round(val).toLocaleString('en-US'))}`;
};

const fmtPct = (val: number | null | undefined) => {
  if (val === null || val === undefined || !Number.isFinite(val)) return null;
  const sign = val > 0 ? '+' : '';
  return `${sign}${toFaDigits(val.toFixed(2))}٪`;
};

const SEGMENT_SHORT: Record<IranMarketSegment, string> = {
  tse: 'بورس',
  ifb: 'فرابورس',
  ime: 'بورس کالا',
  funds: 'صندوق',
  pension: 'بازنشستگی'
};

/** لوگوی مینیمال و رنگ‌بندی‌شده برای تمام نمادها و صندوق‌ها (بدون عکس شکسته روی ۱,۰۰۰+ نماد) */
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
  const dim = size === 'sm' ? 'h-9 w-9 text-[10px]' : 'h-10 w-10 text-[11px]';

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
        <span className="absolute -bottom-1 -end-1 z-20 flex h-4 w-4 items-center justify-center rounded-full bg-card shadow-xs ring-1 ring-divider">
          {cornerIcon}
        </span>
      )}
    </span>
  );
}

function ChangePill({ value }: { value: number | null | undefined }) {
  const txt = fmtPct(value);
  if (!txt || value === null || value === undefined) {
    return <span className="text-xs text-subtle">—</span>;
  }
  const positive = value > 0;
  const negative = value < 0;
  return (
    <span
      dir="ltr"
      className={cn(
        'inline-flex min-w-[3.75rem] items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
        positive
          ? 'bg-gain/12 text-positive'
          : negative
            ? 'bg-negative/12 text-negative'
            : 'bg-surface-2 text-muted'
      )}
    >
      {txt}
    </span>
  );
}

export function IranMarketTable() {
  const [items, setItems] = useState<IranMarketInstrument[]>([...IRAN_MARKET_CATALOG]);
  const [source, setSource] = useState<'live' | 'catalog'>('catalog');
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
      setSource(res.source);
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

  const breadth = useMemo(() => {
    let up = 0;
    let down = 0;
    for (const it of items) {
      if (!it.live || it.changePct === null || it.changePct === undefined) continue;
      if (it.changePct > 0) up++;
      else if (it.changePct < 0) down++;
    }
    return { up, down };
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
    if (sortBy === 'gain') {
      sorted.sort((a, b) => (b.changePct ?? -999) - (a.changePct ?? -999));
    } else if (sortBy === 'loss') {
      sorted.sort((a, b) => (a.changePct ?? 999) - (b.changePct ?? 999));
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => a.symbol.localeCompare(b.symbol, 'fa'));
    } else {
      sorted.sort((a, b) => (b.tradeValueBillionToman ?? -1) - (a.tradeValueBillionToman ?? -1));
    }
    return sorted;
  }, [items, segment, fundSubtype, query, onlyWatchlist, watchlist, sortBy]);

  const visible = filtered.slice(0, limit);

  return (
    <section aria-label="بازار سرمایه ایران" className="space-y-3.5">
      {/* ۱) نوار وضعیت مینیمال و کنترل همگام‌سازی */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-divider/70 bg-card/80 px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <span className="inline-flex items-center gap-1.5 font-bold text-ink">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                source === 'live' ? 'bg-positive animate-pulse' : 'bg-amber-500'
              )}
            />
            {source === 'live' ? 'تابلوی زنده (BrsApi)' : 'کاتالوگ مرجع · آمادهٔ BRSAPI_KEY'}
          </span>
          <span className="text-divider">|</span>
          <span className="text-muted">{toFaDigits(counts.all)} نماد و صندوق</span>
          {source === 'live' && (breadth.up > 0 || breadth.down > 0) && (
            <>
              <span className="hidden text-divider sm:inline">|</span>
              <span className="hidden items-center gap-2 text-[11px] font-semibold sm:inline-flex">
                <span className="text-positive">▲ {toFaDigits(breadth.up)}</span>
                <span className="text-negative">▼ {toFaDigits(breadth.down)}</span>
              </span>
            </>
          )}
        </div>

        <Button
          size="sm"
          variant="ghost"
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          loading={loading}
          onClick={() => void sync()}
        >
          به‌روزرسانی
        </Button>
      </div>

      {/* ۲) فیلترهای مینیمال بازارها + دیده‌بان */}
      <div className="space-y-2.5">
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
                ? 'bg-ink text-card shadow-xs'
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
                  active
                    ? 'bg-ink text-card shadow-xs'
                    : 'bg-surface-2/80 text-muted hover:text-ink'
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
            <span>دیده‌بان ({toFaDigits(watchlist.size)})</span>
          </button>
        </div>

        {/* زیرفیلتر نوع صندوق فقط در بخش صندوق‌ها */}
        {segment === 'funds' && (
          <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
            {(['all', 'equity', 'leveraged', 'sector', 'index', 'gold', 'fixed_income'] as const).map((sub) => {
              const active = fundSubtype === sub;
              return (
                <button
                  key={sub}
                  type="button"
                  onClick={() => {
                    setFundSubtype(sub);
                    setLimit(PAGE_SIZE);
                  }}
                  className={cn(
                    'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold transition',
                    active
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-divider/70 bg-card text-muted hover:text-ink'
                  )}
                >
                  {sub === 'all' ? 'همهٔ صندوق‌ها' : IRAN_FUND_SUBTYPE_LABELS[sub]}
                </button>
              );
            })}
          </div>
        )}

        {/* جستجو + مرتب‌سازی */}
        <div className="flex flex-wrap items-center gap-2">
          <SearchField
            value={query}
            onChange={(v) => {
              setQuery(v);
              setLimit(PAGE_SIZE);
            }}
            placeholder="جستجوی نماد، صندوق یا صنعت (فولاد، آتیه مفید، عیار، اهرم)…"
            className="min-w-[220px] flex-1 md:max-w-md"
          />

          <div className="ms-auto flex items-center gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-subtle" aria-hidden />
            <div className="flex items-center gap-1 rounded-control bg-surface-2/70 p-0.5 text-[11px]">
              {(
                [
                  ['value', 'ارزش'],
                  ['gain', 'بیشترین رشد'],
                  ['loss', 'بیشترین افت'],
                  ['name', 'الفبا']
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSortBy(id)}
                  className={cn(
                    'rounded-[6px] px-2 py-1 font-bold transition',
                    sortBy === id ? 'bg-card text-ink shadow-xs' : 'text-muted hover:text-ink'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ۳) نمایش داده‌ها: جدول چسبان مینیمال در وب + لیست کارتی بومی در PWA */}
      {visible.length === 0 ? (
        <EmptyState
          message="نماد یا صندوقی یافت نشد"
          hint={
            onlyWatchlist
              ? 'روی ستارهٔ کنار هر نماد بزنید تا به دیده‌بان اضافه شود.'
              : 'عبارت جستجو را ساده‌تر کنید یا دستهٔ «همه» را بزنید.'
          }
        />
      ) : (
        <Surface className="overflow-hidden">
          {/* نمای وب (Desktop) */}
          <div className="hidden overflow-x-auto md:block">
            <table className="data-table">
              <caption className="sr-only">
                بازار سرمایه ایران — بورس، فرابورس، بورس کالا، صندوق‌ها و صندوق‌های آتیه
              </caption>
              <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                <tr>
                  <th scope="col" className="!ps-4 lg:!ps-5">نماد</th>
                  <th scope="col">بازار / صنعت</th>
                  <th scope="col" className="col-num">قیمت (ریال)</th>
                  <th scope="col" className="col-num">تغییر روز</th>
                  <th scope="col" className="col-num hidden lg:table-cell">ارزش / P/E</th>
                  <th scope="col" className="!pe-4 text-end lg:!pe-5">
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
                      <td className="!ps-4 lg:!ps-5">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            aria-label={starred ? `حذف ${item.symbol} از دیده‌بان` : `افزودن ${item.symbol} به دیده‌بان`}
                            onClick={() => toggleStar(item.id)}
                            className="shrink-0 text-subtle transition hover:text-amber-500"
                          >
                            <Star className={cn('h-4 w-4', starred && 'fill-amber-400 text-amber-500')} />
                          </button>
                          <IranInstrumentLogo item={item} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-ink">{item.symbol}</span>
                              {item.tradeMode === 'issuance' && (
                                <Badge tone="gain" className="text-[10px]">صدور و ابطالی</Badge>
                              )}
                            </div>
                            <p className="max-w-[16rem] truncate text-xs text-muted">{item.nameFa}</p>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-ink">
                            {item.fundSubtype && item.segment === 'funds'
                              ? IRAN_FUND_SUBTYPE_LABELS[item.fundSubtype]
                              : SEGMENT_SHORT[item.segment]}
                          </span>
                          <span className="max-w-[11rem] truncate text-xs text-muted">
                            {item.managerFa ?? item.sectorFa}
                          </span>
                        </div>
                      </td>

                      <td className="col-num whitespace-nowrap">
                        {lastPx ? (
                          <div>
                            <span className="font-extrabold text-ink tabular-nums">{lastPx}</span>
                            {closePx && closePx !== lastPx && (
                              <span className="block text-[10px] text-subtle">پایانی: {closePx}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-subtle">—</span>
                        )}
                      </td>

                      <td className="col-num whitespace-nowrap">
                        <ChangePill value={item.live ? item.changePct : null} />
                      </td>

                      <td className="col-num hidden whitespace-nowrap text-xs text-muted lg:table-cell">
                        {item.tradeValueBillionToman ? (
                          <span>{toFaDigits(item.tradeValueBillionToman.toLocaleString('en-US'))} م.ت</span>
                        ) : item.pe && item.pe > 0 ? (
                          <span dir="ltr">P/E {toFaDigits(item.pe.toFixed(1))}</span>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </td>

                      <td className="!pe-4 text-end lg:!pe-5">
                        <a
                          href={item.officialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`صفحه رسمی ${item.symbol}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-control text-muted transition hover:bg-surface-2 hover:text-accent"
                        >
                          <ExternalLink className="h-4 w-4" aria-hidden />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* نمای موبایل و PWA (لیست کارتی بومی و لمسی بدون اسکرول افقی) */}
          <ul className="divide-y divide-divider/60 md:hidden">
            {visible.map((item) => {
              const starred = watchlist.has(item.id);
              const expanded = expandedId === item.id;
              const lastPx = item.live ? fmtRial(item.lastPriceRial) : null;
              return (
                <li key={item.id} className="px-3.5 py-3">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      aria-label={starred ? `حذف ${item.symbol} از دیده‌بان` : `افزودن ${item.symbol} به دیده‌بان`}
                      onClick={() => toggleStar(item.id)}
                      className="flex h-9 w-7 shrink-0 items-center justify-center text-subtle active:scale-95"
                    >
                      <Star className={cn('h-4 w-4', starred && 'fill-amber-400 text-amber-500')} />
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
                            <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-muted">
                              {item.fundSubtype && item.segment === 'funds'
                                ? IRAN_FUND_SUBTYPE_LABELS[item.fundSubtype]
                                : SEGMENT_SHORT[item.segment]}
                            </span>
                          </div>
                          <p className="truncate text-[11px] text-muted">{item.nameFa}</p>
                        </div>
                      </div>

                      <div className="shrink-0 text-end">
                        {lastPx ? (
                          <>
                            <p className="text-xs font-extrabold text-ink tabular-nums">{lastPx} ریال</p>
                            <div className="mt-0.5">
                              <ChangePill value={item.changePct} />
                            </div>
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[11px] text-subtle">
                            <span>جزئیات</span>
                            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
                          </span>
                        )}
                      </div>
                    </button>
                  </div>

                  {expanded && (
                    <div className="mt-2.5 space-y-2 rounded-field bg-surface-2/55 p-2.5 text-xs">
                      <p className="leading-5 text-muted">{item.noteFa}</p>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
                        <span className="font-semibold text-ink">
                          {item.managerFa ? `${item.sectorFa} · ${item.managerFa}` : item.sectorFa}
                        </span>
                        <a
                          href={item.officialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-bold text-accent"
                        >
                          <span>صفحه رسمی</span>
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* دکمه نمایش بیشتر برای لیست‌های بزرگ ۱,۰۰۰+ نماد */}
          {filtered.length > limit && (
            <div className="border-t border-divider/70 p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-accent"
                onClick={() => setLimit((n) => n + PAGE_SIZE)}
              >
                نمایش بیشتر ({toFaDigits(filtered.length - limit)} نماد باقی‌مانده)
              </Button>
            </div>
          )}
        </Surface>
      )}
    </section>
  );
}
