/**
 * جدول و بخش یکپارچه «بورس ایران» در صفحهٔ بازارها:
 *   • بورس تهران (TSE)
 *   • فرابورس ایران (IFB)
 *   • بورس کالای ایران (IME — گواهی سپرده طلا، سکه، نقره، زعفران و سلف موازی)
 *   • صندوق‌های سهامی، اهرمی، بخشی، شاخصی، طلا و درآمد ثابت
 *   • صندوق‌های بازنشستگی تکمیلی (آتیه مفید، اندوخته آگاه، کاریز کاریزما و…)
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  ExternalLink,
  Landmark,
  Layers,
  PiggyBank,
  RefreshCw,
  ShieldCheck,
  Star,
  TrendingUp
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
      {/* نوار وضعیت اتصال زنده / کاتالوگ مرجع */}
      <Notice
        tone="info"
        title={
          source === 'live'
            ? 'متصل به تابلوی زندهٔ بازار سرمایه ایران'
            : 'کاتالوگ یکپارچهٔ بازار سرمایه ایران (آمادهٔ اتصال به کلید BrsApi / TSETMC)'
        }
        action={
          <Button size="sm" variant="outline" icon={<RefreshCw className="h-3.5 w-3.5" />} loading={loading} onClick={() => void sync()}>
            بررسی اتصال زنده
          </Button>
        }
      >
        بورس تهران، فرابورس، بورس کالا (گواهی سپرده طلا/سکه/نقره/زعفران)، انواع صندوق‌های سهامی/اهرمی/طلا و صندوق‌های بازنشستگی تکمیلی (مانند آتیه مفید، اندوخته آگاه و کاریز کاریزما) همگی در یک نما؛ بدون قیمت جعلی تا زمان فعال‌سازی کلید زنده.
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

      {/* زیرفیلتر نوع صندوق (وقتی تب صندوق‌ها فعال است) */}
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
        <p className="ms-auto text-xs text-muted">
          {toFaDigits(filtered.length)} نماد / صندوق
        </p>
      </div>

      {/* جدول واکنش‌گرا */}
      {filtered.length === 0 ? (
        <EmptyState
          message="نماد یا صندوقی با این فیلتر یافت نشد"
          hint={onlyWatchlist ? 'هنوز نمادی به دیده‌بان خود اضافه نکرده‌اید؛ روی ستارهٔ کنار هر نماد کلیک کنید.' : 'عبارت جستجو را کوتاه‌تر کنید یا دستهٔ دیگری انتخاب نمایید.'}
        />
      ) : (
        <Surface className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <caption className="sr-only">بازار سرمایه ایران — بورس، فرابورس، بورس کالا، صندوق‌ها و صندوق‌های بازنشستگی</caption>
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
                            className="mt-0.5 shrink-0 text-subtle hover:text-amber-500 transition"
                          >
                            <Star className={cn('h-4 w-4', starred && 'fill-amber-400 text-amber-500')} />
                          </button>
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
                          <span className="text-xs font-normal text-subtle">نیاز به اتصال زنده</span>
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
