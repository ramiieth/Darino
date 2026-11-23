/**
 * جدول و بخش یکپارچه «بورس ایران و آتیه» در صفحهٔ بازارها:
 *   • بورس تهران (TSE)
 *   • فرابورس ایران (IFB)
 *   • بورس کالای ایران (IME — گواهی سپرده طلا، سکه، نقره، زعفران و سلف موازی)
 *   • صندوق‌های سهامی، اهرمی، بخشی، شاخصی، طلا و درآمد ثابت
 *   • صندوق‌های بازنشستگی تکمیلی (آتیه مفید، اندوخته آگاه، کاریز کاریزما و…)
 *   • دارای لوگوی اختصاصی رنگ‌بندی‌شده برای تمام نمادها و صندوق‌ها
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Coins,
  ExternalLink,
  Flame,
  Landmark,
  Layers,
  PiggyBank,
  RefreshCw,
  ShieldCheck,
  Star,
  TrendingUp,
  Zap
} from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { SearchField } from '@/shared/components/ui/Input';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
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
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return `${toFaDigits(Math.round(val).toLocaleString('en-US'))} ریال`;
};

const SEGMENT_BADGE: Record<IranMarketSegment, { label: string; tone: 'info' | 'gain' | 'warn' | 'neutral' }> = {
  tse: { label: 'بورس تهران', tone: 'info' },
  ifb: { label: 'فرابورس', tone: 'neutral' },
  ime: { label: 'بورس کالا', tone: 'warn' },
  funds: { label: 'صندوق ETF', tone: 'gain' },
  pension: { label: 'بازنشستگی / آتیه', tone: 'gain' }
};

/** لوگوی اختصاصی و رنگ‌بندی‌شده برای تک‌تک نمادها، کالاها و صندوق‌های بازار سرمایه ایران */
function IranInstrumentLogo({ item }: { item: IranMarketInstrument }) {
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

  return (
    <span
      className="relative inline-flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-xl text-[11px] font-black text-white shadow-xs ring-1 ring-black/10 dark:ring-white/15"
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

export function IranMarketTable() {
  const [items, setItems] = useState<IranMarketInstrument[]>([...IRAN_MARKET_CATALOG]);
  const [source, setSource] = useState<'live' | 'catalog'>('catalog');
  const [loading, setLoading] = useState(false);

  const [segment, setSegment] = useState<IranMarketSegment | 'all'>('all');
  const [fundSubtype, setFundSubtype] = useState<IranFundSubtype | 'all'>('all');
  const [query, setQuery] = useState('');
  const [onlyWatchlist, setOnlyWatchlist] = useState(false);
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

  const filtered = useMemo(
    () =>
      filterIranMarketInstruments({
        items,
        segment,
        fundSubtype,
        query,
        onlyWatchlist,
        watchlistIds: watchlist
      }),
    [items, segment, fundSubtype, query, onlyWatchlist, watchlist]
  );

  const segmentIcons: Record<IranMarketSegment, React.ReactNode> = {
    tse: <Building2 className="h-3.5 w-3.5" aria-hidden />,
    ifb: <TrendingUp className="h-3.5 w-3.5" aria-hidden />,
    ime: <Landmark className="h-3.5 w-3.5" aria-hidden />,
    funds: <Layers className="h-3.5 w-3.5" aria-hidden />,
    pension: <PiggyBank className="h-3.5 w-3.5" aria-hidden />
  };

  return (
    <section aria-label="بازار سرمایه ایران" className="space-y-4">
      <Notice
        tone="info"
        title={
          source === 'live'
            ? 'متصل به تابلوی زندهٔ بازار سرمایه ایران (BrsApi)'
            : 'کاتالوگ یکپارچهٔ بازار سرمایه ایران (پس از ثبت BRSAPI_KEY در Vercel قیمت زنده فعال می‌شود)'
        }
        action={
          <Button
            size="sm"
            variant="outline"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            loading={loading}
            onClick={() => void sync()}
          >
            به‌روزرسانی زنده
          </Button>
        }
      >
        بورس تهران، فرابورس، بورس کالا (گواهی سپرده طلا/سکه/نقره/زعفران)، انواع صندوق‌های سهامی/اهرمی/طلا و صندوق‌های بازنشستگی تکمیلی (مانند آتیه مفید، اندوخته آگاه و کاریز کاریزما) همگی در یک نما.
      </Notice>

      {/* فیلترهای دسته‌بندی ۵ بازار + دیده‌بان */}
      <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => {
            setSegment('all');
            setFundSubtype('all');
          }}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition',
            segment === 'all'
              ? 'border-accent bg-accent text-on-accent'
              : 'border-divider bg-card text-muted hover:text-ink'
          )}
        >
          <span>همه</span>
          <span className="opacity-80">({toFaDigits(counts.all)})</span>
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
              }}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition',
                active
                  ? 'border-accent bg-accent text-on-accent'
                  : 'border-divider bg-card text-muted hover:text-ink'
              )}
            >
              {segmentIcons[seg.id]}
              <span>{seg.labelFa}</span>
              <span className="opacity-80">({toFaDigits(counts[seg.id])})</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setOnlyWatchlist((v) => !v)}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition',
            onlyWatchlist
              ? 'border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-300'
              : 'border-divider bg-card text-muted hover:text-ink'
          )}
        >
          <Star className={cn('h-3.5 w-3.5', onlyWatchlist && 'fill-current')} aria-hidden />
          <span>دیده‌بان من ({toFaDigits(watchlist.size)})</span>
        </button>
      </div>

      {/* زیرفیلتر نوع صندوق */}
      {segment === 'funds' && (
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {(['all', 'equity', 'leveraged', 'sector', 'index', 'gold', 'fixed_income'] as const).map((sub) => {
            const active = fundSubtype === sub;
            return (
              <button
                key={sub}
                type="button"
                onClick={() => setFundSubtype(sub)}
                className={cn(
                  'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold transition',
                  active
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-divider bg-surface-2/60 text-muted hover:text-ink'
                )}
              >
                {sub === 'all' ? 'همهٔ صندوق‌ها' : IRAN_FUND_SUBTYPE_LABELS[sub]}
              </button>
            );
          })}
        </div>
      )}

      {/* جستجوی فارسی */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="جستجوی نماد، صندوق یا صنعت (مثلاً فولاد، آتیه مفید، عیار، اهرم، شمش طلا)…"
          className="flex-1 md:max-w-md"
        />
        <p className="ms-auto text-xs text-muted">{toFaDigits(filtered.length)} نماد / صندوق</p>
      </div>

      {/* جدول واکنش‌گرا */}
      {filtered.length === 0 ? (
        <EmptyState
          message="نماد یا صندوقی با این فیلتر یافت نشد"
          hint={
            onlyWatchlist
              ? 'هنوز نمادی به دیده‌بان خود اضافه نکرده‌اید؛ روی ستارهٔ کنار هر نماد کلیک کنید.'
              : 'عبارت جستجو را کوتاه‌تر کنید یا دستهٔ دیگری انتخاب نمایید.'
          }
        />
      ) : (
        <Surface className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <caption className="sr-only">
                بازار سرمایه ایران — بورس، فرابورس، بورس کالا، صندوق‌ها و صندوق‌های بازنشستگی
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="!ps-4 md:!ps-5">نماد و نام</th>
                  <th scope="col">بازار / نوع</th>
                  <th scope="col" className="hidden md:table-cell">صنعت / مدیر صندوق</th>
                  <th scope="col" className="col-num">آخرین قیمت / صدور</th>
                  <th scope="col" className="col-num hidden sm:table-cell">تغییر روز</th>
                  <th scope="col" className="!pe-4 text-end md:!pe-5">مرجع رسمی</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const starred = watchlist.has(item.id);
                  const segBadge = SEGMENT_BADGE[item.segment];
                  return (
                    <tr key={item.id}>
                      <td className="!ps-4 md:!ps-5">
                        <div className="flex items-start gap-2.5">
                          <button
                            type="button"
                            aria-label={starred ? `حذف ${item.symbol} از دیده‌بان` : `افزودن ${item.symbol} به دیده‌بان`}
                            onClick={() => toggleStar(item.id)}
                            className="mt-2 shrink-0 text-subtle transition hover:text-amber-500"
                          >
                            <Star className={cn('h-4 w-4', starred && 'fill-amber-400 text-amber-500')} />
                          </button>
                          <IranInstrumentLogo item={item} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-extrabold text-ink">{item.symbol}</span>
                              {item.tradeMode === 'issuance' && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-gain/15 px-1.5 py-0.5 text-[10px] font-bold text-positive">
                                  <ShieldCheck className="h-2.5 w-2.5" aria-hidden />
                                  صدور و ابطالی
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted">{item.nameFa}</p>
                            <p className="mt-0.5 line-clamp-1 text-[11px] text-subtle">{item.noteFa}</p>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="flex flex-col items-start gap-1">
                          <Badge tone={segBadge.tone}>{segBadge.label}</Badge>
                          {item.fundSubtype && item.segment !== 'pension' && (
                            <span className="text-[10px] font-semibold text-muted">
                              {IRAN_FUND_SUBTYPE_LABELS[item.fundSubtype]}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="hidden md:table-cell">
                        <p className="text-xs font-semibold text-ink">{item.sectorFa}</p>
                        {item.managerFa && <p className="text-[11px] text-muted">{item.managerFa}</p>}
                      </td>

                      <td className="col-num whitespace-nowrap font-bold text-ink">
                        {item.live && item.lastPriceRial ? (
                          fmtRial(item.lastPriceRial)
                        ) : (
                          <span className="text-xs font-normal text-subtle">در انتظار BRSAPI_KEY</span>
                        )}
                      </td>

                      <td className="col-num hidden whitespace-nowrap sm:table-cell">
                        {item.live && item.changePct !== null && item.changePct !== undefined ? (
                          <span className={cn('font-bold', item.changePct >= 0 ? 'text-positive' : 'text-negative')}>
                            {item.changePct > 0 ? '+' : ''}
                            {toFaDigits(item.changePct.toFixed(2))}٪
                          </span>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </td>

                      <td className="!pe-4 text-end md:!pe-5">
                        <a
                          href={item.officialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-control border border-divider bg-surface-2/60 px-2.5 py-1 text-[11px] font-bold text-accent hover:border-accent"
                        >
                          <span>مشاهده</span>
                          <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Surface>
      )}
    </section>
  );
}
