/**
 * پنل غربالگر حرفه‌ای بازار سهام و صندوق‌های ایران — نسخه بازطراحی‌شده (لوپ نقد ۲)
 *   ۱) ۱۲ فیلتر کاربردی بازار با نوار پالس بازار، فیلتر جهت (همه/فعال/صعودی/هشدار)، کارت‌های بنتو رنگی و چیپ‌های لوگودار
 *   ۲) ۶ اندیکاتور تجمیعی (RSI · MACD · CCI · MFI · BB · ADX) با نوار توازن گاوی/خرسی و ستون امضای رنگی
 *   ۳) اسکنر اصلی و اطلاعیه‌های کدال با لوگوی اختصاصی هر نماد
 */
import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Crown,
  Flame,
  Gauge,
  Hammer,
  Info,
  Radar,
  RefreshCw,
  Repeat,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { SearchField } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Notice } from '@/shared/components/ui/StateViews';
import type { IranMarketInstrument } from '@/features/markets/data/iranMarketCatalog';
import { IranInstrumentLogo } from '@/features/markets/presentation/IranInstrumentLogo';
import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import { ASSET_TYPE_LABELS } from '../domain/agents';
import {
  buildSixIndicatorMatrix,
  runTwelvePracticalFilters,
  type IndicatorId,
  type PracticalFilterCard
} from '../domain/indicatorsAndFilters';
import type { ScannerResult, UploadedCodalDocument, UploadedPriceDataset } from '../domain/types';

type ScreenerView = 'filters12' | 'indicators6' | 'core_codal';
type FilterScope = 'all' | 'active' | 'bullish' | 'watch';

const FILTER_VISUALS: Record<
  PracticalFilterCard['id'],
  {
    icon: React.ComponentType<{ className?: string }>;
    category: 'bullish' | 'watch';
    topBar: string;
    glow: string;
    iconBg: string;
    iconText: string;
    countPill: string;
    chipHover: string;
  }
> = {
  correction_5d_vol_up: {
    icon: Activity,
    category: 'watch',
    topBar: 'from-sky-400 via-blue-500 to-indigo-600',
    glow: 'from-sky-500/[0.07] via-transparent to-transparent',
    iconBg: 'bg-sky-500/15 ring-sky-500/30',
    iconText: 'text-sky-600 dark:text-sky-300',
    countPill: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    chipHover: 'hover:border-sky-500/60 hover:bg-sky-500/8'
  },
  positive_range_inflow: {
    icon: ArrowUpRight,
    category: 'bullish',
    topBar: 'from-emerald-400 via-teal-500 to-cyan-500',
    glow: 'from-emerald-500/[0.07] via-transparent to-transparent',
    iconBg: 'bg-emerald-500/15 ring-emerald-500/30',
    iconText: 'text-emerald-600 dark:text-emerald-300',
    countPill: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    chipHover: 'hover:border-emerald-500/60 hover:bg-emerald-500/8'
  },
  per_capita_buy_250m: {
    icon: Crown,
    category: 'bullish',
    topBar: 'from-amber-400 via-yellow-500 to-emerald-500',
    glow: 'from-amber-500/[0.08] via-transparent to-transparent',
    iconBg: 'bg-amber-500/15 ring-amber-500/35',
    iconText: 'text-amber-600 dark:text-amber-300',
    countPill: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    chipHover: 'hover:border-amber-500/60 hover:bg-amber-500/8'
  },
  smart_money_inflow: {
    icon: Flame,
    category: 'bullish',
    topBar: 'from-teal-400 via-emerald-500 to-green-600',
    glow: 'from-teal-500/[0.07] via-transparent to-transparent',
    iconBg: 'bg-teal-500/15 ring-teal-500/30',
    iconText: 'text-teal-600 dark:text-teal-300',
    countPill: 'bg-teal-500/15 text-teal-700 dark:text-teal-300',
    chipHover: 'hover:border-teal-500/60 hover:bg-teal-500/8'
  },
  pos_to_neg_sell_pressure: {
    icon: ArrowDownRight,
    category: 'watch',
    topBar: 'from-rose-400 via-red-500 to-orange-500',
    glow: 'from-rose-500/[0.07] via-transparent to-transparent',
    iconBg: 'bg-rose-500/15 ring-rose-500/30',
    iconText: 'text-rose-600 dark:text-rose-300',
    countPill: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    chipHover: 'hover:border-rose-500/60 hover:bg-rose-500/8'
  },
  neg_to_pos_buy_pressure: {
    icon: TrendingUp,
    category: 'bullish',
    topBar: 'from-green-400 via-emerald-500 to-teal-500',
    glow: 'from-green-500/[0.07] via-transparent to-transparent',
    iconBg: 'bg-green-500/15 ring-green-500/30',
    iconText: 'text-green-600 dark:text-green-300',
    countPill: 'bg-green-500/15 text-green-700 dark:text-green-300',
    chipHover: 'hover:border-green-500/60 hover:bg-green-500/8'
  },
  sell_queue_collected: {
    icon: ShieldCheck,
    category: 'bullish',
    topBar: 'from-emerald-400 via-lime-500 to-teal-500',
    glow: 'from-emerald-500/[0.07] via-transparent to-transparent',
    iconBg: 'bg-emerald-500/15 ring-emerald-500/30',
    iconText: 'text-emerald-600 dark:text-emerald-300',
    countPill: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    chipHover: 'hover:border-emerald-500/60 hover:bg-emerald-500/8'
  },
  suspicious_volume: {
    icon: BarChart3,
    category: 'watch',
    topBar: 'from-amber-400 via-orange-500 to-rose-500',
    glow: 'from-orange-500/[0.07] via-transparent to-transparent',
    iconBg: 'bg-orange-500/15 ring-orange-500/30',
    iconText: 'text-orange-600 dark:text-orange-300',
    countPill: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
    chipHover: 'hover:border-orange-500/60 hover:bg-orange-500/8'
  },
  code_to_code_legal_to_real: {
    icon: Repeat,
    category: 'watch',
    topBar: 'from-violet-400 via-purple-500 to-fuchsia-500',
    glow: 'from-violet-500/[0.07] via-transparent to-transparent',
    iconBg: 'bg-violet-500/15 ring-violet-500/30',
    iconText: 'text-violet-600 dark:text-violet-300',
    countPill: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
    chipHover: 'hover:border-violet-500/60 hover:bg-violet-500/8'
  },
  oversold: {
    icon: Gauge,
    category: 'bullish',
    topBar: 'from-indigo-400 via-blue-500 to-cyan-500',
    glow: 'from-indigo-500/[0.07] via-transparent to-transparent',
    iconBg: 'bg-indigo-500/15 ring-indigo-500/30',
    iconText: 'text-indigo-600 dark:text-indigo-300',
    countPill: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
    chipHover: 'hover:border-indigo-500/60 hover:bg-indigo-500/8'
  },
  bullish_hammer: {
    icon: Hammer,
    category: 'bullish',
    topBar: 'from-emerald-400 via-sky-500 to-indigo-500',
    glow: 'from-sky-500/[0.07] via-transparent to-transparent',
    iconBg: 'bg-emerald-500/15 ring-emerald-500/30',
    iconText: 'text-emerald-600 dark:text-emerald-300',
    countPill: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    chipHover: 'hover:border-emerald-500/60 hover:bg-emerald-500/8'
  },
  per_capita_1d_vs_5d: {
    icon: Sparkles,
    category: 'bullish',
    topBar: 'from-cyan-400 via-teal-500 to-emerald-500',
    glow: 'from-cyan-500/[0.07] via-transparent to-transparent',
    iconBg: 'bg-cyan-500/15 ring-cyan-500/30',
    iconText: 'text-cyan-600 dark:text-cyan-300',
    countPill: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
    chipHover: 'hover:border-cyan-500/60 hover:bg-cyan-500/8'
  }
};

const INDICATOR_VISUALS: Record<
  IndicatorId,
  {
    pillarGradient: string;
    periodLabel: string;
    descFa: string;
  }
> = {
  RSI: {
    pillarGradient: 'from-blue-600 via-indigo-600 to-violet-700',
    periodLabel: '14',
    descFa: 'قدرت نسبی'
  },
  MACD: {
    pillarGradient: 'from-violet-600 via-purple-600 to-fuchsia-700',
    periodLabel: '12 · 26 · 9',
    descFa: 'واگرایی میانگین'
  },
  CCI: {
    pillarGradient: 'from-cyan-600 via-teal-600 to-emerald-700',
    periodLabel: '20',
    descFa: 'کانال کالا'
  },
  MFI: {
    pillarGradient: 'from-emerald-600 via-green-600 to-teal-700',
    periodLabel: '14',
    descFa: 'جریان پول'
  },
  BB: {
    pillarGradient: 'from-amber-500 via-orange-500 to-rose-600',
    periodLabel: '20 · 2',
    descFa: 'باند بولینگر'
  },
  ADX: {
    pillarGradient: 'from-rose-600 via-pink-600 to-purple-700',
    periodLabel: '14',
    descFa: 'قدرت روند'
  }
};

export function IranDeskScreenerPanel({
  datasets,
  documents,
  liveItems,
  scannerResult,
  fetchingLive = false,
  onRefreshLive,
  onRunCoreScan,
  onSelectSymbol
}: {
  datasets: readonly UploadedPriceDataset[];
  documents: readonly UploadedCodalDocument[];
  liveItems: readonly IranMarketInstrument[];
  scannerResult: ScannerResult | null;
  fetchingLive?: boolean;
  onRefreshLive?: () => void;
  onRunCoreScan: () => void;
  onSelectSymbol: (symbol: string) => void;
}) {
  const [view, setView] = useState<ScreenerView>('filters12');
  const [filterScope, setFilterScope] = useState<FilterScope>('all');
  const [query, setQuery] = useState('');
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [formulaOpen, setFormulaOpen] = useState<Record<string, boolean>>({});

  const liveBySymbol = useMemo(() => {
    const map = new Map<string, IranMarketInstrument>();
    for (const item of liveItems) map.set(item.symbol, item);
    return map;
  }, [liveItems]);

  const indicatorCards = useMemo(() => buildSixIndicatorMatrix(datasets), [datasets]);
  const practicalFilters = useMemo(
    () => runTwelvePracticalFilters({ datasets, liveItems }),
    [datasets, liveItems]
  );

  const normalizedQuery = query.trim().toLowerCase();

  const filteredPractical = useMemo(() => {
    return practicalFilters
      .map((f) => ({
        ...f,
        hits: normalizedQuery
          ? f.hits.filter(
              (h) =>
                h.symbol.toLowerCase().includes(normalizedQuery) ||
                h.nameFa.toLowerCase().includes(normalizedQuery)
            )
          : f.hits
      }))
      .filter((f) => {
        if (filterScope === 'active') return f.hits.length > 0;
        if (filterScope === 'bullish') return FILTER_VISUALS[f.id].category === 'bullish';
        if (filterScope === 'watch') return FILTER_VISUALS[f.id].category === 'watch';
        return true;
      });
  }, [practicalFilters, normalizedQuery, filterScope]);

  const filteredIndicators = useMemo(() => {
    if (!normalizedQuery) return indicatorCards;
    return indicatorCards.map((c) => ({
      ...c,
      bullishHits: c.bullishHits.filter(
        (h) =>
          h.symbol.toLowerCase().includes(normalizedQuery) ||
          h.nameFa.toLowerCase().includes(normalizedQuery)
      ),
      bearishHits: c.bearishHits.filter(
        (h) =>
          h.symbol.toLowerCase().includes(normalizedQuery) ||
          h.nameFa.toLowerCase().includes(normalizedQuery)
      )
    }));
  }, [indicatorCards, normalizedQuery]);

  const pulseStats = useMemo(() => {
    let bullish = 0;
    let watch = 0;
    let activeFilters = 0;
    for (const f of practicalFilters) {
      if (f.hits.length > 0) activeFilters++;
      if (FILTER_VISUALS[f.id].category === 'bullish') bullish += f.hits.length;
      else watch += f.hits.length;
    }
    const indBull = indicatorCards.reduce((s, c) => s + c.bullishHits.length, 0);
    const indBear = indicatorCards.reduce((s, c) => s + c.bearishHits.length, 0);
    return {
      totalFilterHits: bullish + watch,
      bullish,
      watch,
      activeFilters,
      indBull,
      indBear,
      totalIndicatorHits: indBull + indBear
    };
  }, [practicalFilters, indicatorCards]);

  const toggleExpand = (id: string) =>
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleFormula = (id: string) =>
    setFormulaOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-4">
      {/* نوار کنترل بالای غربالگر — مینیمال و شیشه‌ای */}
      <Surface className="relative overflow-hidden border border-divider/80 p-3.5 shadow-2xs">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-l from-indigo-500/[0.07] via-sky-500/[0.03] to-emerald-500/[0.07]"
          aria-hidden
        />
        <div className="relative flex flex-wrap items-center justify-between gap-2.5">
          <SegmentedControl<ScreenerView>
            label="نمای غربالگر بازار"
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'filters12', label: `۱۲ فیلتر کاربردی (${toFaDigits(pulseStats.totalFilterHits)})` },
              { value: 'indicators6', label: `۶ اندیکاتور تجمیعی (${toFaDigits(pulseStats.totalIndicatorHits)})` },
              { value: 'core_codal', label: 'اسکنر اصلی و کدال' }
            ]}
          />

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="جستجوی سریع نماد…"
              className="w-full min-w-[140px] sm:w-44"
            />

            {onRefreshLive && (
              <Button
                size="sm"
                variant="outline"
                icon={<RefreshCw className={cn('h-3.5 w-3.5', fetchingLive && 'animate-spin')} />}
                loading={fetchingLive}
                onClick={onRefreshLive}
              >
                تابلوی زنده
              </Button>
            )}

            <Button size="sm" icon={<Radar className="h-3.5 w-3.5" />} onClick={onRunCoreScan}>
              اسکن کدال ({toFaDigits(datasets.length)})
            </Button>
          </div>
        </div>
      </Surface>

      {/* ۱) ۱۲ فیلتر کاربردی بازار سهام */}
      {view === 'filters12' && (
        <div className="space-y-3.5">
          {/* نوار پالس بازار + فیلتر سریع کارت‌ها */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['all', `همه ۱۲ فیلتر`],
                  ['active', `دارای نماد (${toFaDigits(pulseStats.activeFilters)})`],
                  ['bullish', `ورود پول و صعودی (${toFaDigits(pulseStats.bullish)})`],
                  ['watch', `حجم، کدبه‌کد و فشار فروش (${toFaDigits(pulseStats.watch)})`]
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilterScope(id)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-[11px] font-bold transition',
                    filterScope === id
                      ? 'border-ink bg-ink text-card shadow-2xs'
                      : 'border-divider/80 bg-card text-muted hover:border-divider-strong hover:text-ink'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <span className="text-[11px] text-muted">
              روی هر نماد کلیک کنید تا با تیم ۶ نفره و کدال بررسی شود
            </span>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredPractical.map((f) => {
              const vis = FILTER_VISUALS[f.id];
              const Icon = vis.icon;
              const expanded = Boolean(expandedCards[f.id]);
              const showFormula = Boolean(formulaOpen[f.id]);
              const shownHits = expanded ? f.hits : f.hits.slice(0, 10);
              const remaining = f.hits.length - shownHits.length;

              return (
                <Surface
                  key={f.id}
                  className="group relative flex flex-col justify-between overflow-hidden border border-divider/80 transition duration-200 hover:-translate-y-0.5 hover:border-divider-strong hover:shadow-lg"
                >
                  {/* نوار رنگی ظریف بالا */}
                  <div className={cn('h-1 w-full bg-gradient-to-l', vis.topBar)} aria-hidden />
                  {/* هاله نوری بسیار ملایم پس‌زمینه */}
                  <div
                    className={cn('pointer-events-none absolute inset-0 bg-gradient-to-b', vis.glow)}
                    aria-hidden
                  />

                  <div className="relative flex flex-1 flex-col justify-between gap-3 p-3.5">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          <span
                            className={cn(
                              'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1 shadow-2xs',
                              vis.iconBg,
                              vis.iconText
                            )}
                          >
                            <Icon className="h-4 w-4" aria-hidden />
                          </span>
                          <h4 className="text-xs font-extrabold leading-5 text-ink">
                            {f.titleFa}
                          </h4>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <span
                            className={cn(
                              'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-black tabular-nums',
                              f.hits.length > 0 ? vis.countPill : 'bg-surface-2 text-subtle'
                            )}
                          >
                            {toFaDigits(f.hits.length)}
                          </span>
                          <button
                            type="button"
                            aria-label="فرمول فیلتر"
                            title={f.formulaFa}
                            onClick={() => toggleFormula(f.id)}
                            className={cn(
                              'inline-flex h-6 w-6 items-center justify-center rounded-full text-subtle transition hover:bg-surface-2 hover:text-ink',
                              showFormula && 'bg-surface-2 text-accent'
                            )}
                          >
                            <Info className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </div>
                      </div>

                      {showFormula && (
                        <p className="rounded-lg border border-divider/70 bg-surface-2/75 px-2.5 py-1.5 text-[10px] leading-4 text-muted">
                          {f.formulaFa}
                        </p>
                      )}

                      {shownHits.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {shownHits.map((h) => {
                            const liveMeta = liveBySymbol.get(h.symbol);
                            return (
                              <button
                                key={h.symbol}
                                type="button"
                                title={`${h.symbol} — ${h.nameFa} (${h.metricFa})`}
                                onClick={() => onSelectSymbol(h.symbol)}
                                className={cn(
                                  'inline-flex items-center gap-1.5 rounded-full border border-divider/85 bg-card/95 py-0.5 pe-2.5 ps-1 text-[11px] font-bold text-ink shadow-2xs transition duration-150 hover:-translate-y-0.5 hover:shadow-sm',
                                  vis.chipHover
                                )}
                              >
                                <IranInstrumentLogo
                                  item={liveMeta ?? { symbol: h.symbol, nameFa: h.nameFa }}
                                  size="xs"
                                  showCornerIcon={false}
                                />
                                <span>{h.symbol}</span>
                                <span
                                  dir="ltr"
                                  className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[9px] font-bold text-muted tabular-nums"
                                >
                                  {toFaDigits(h.metricFa)}
                                </span>
                              </button>
                            );
                          })}
                          {remaining > 0 && (
                            <button
                              type="button"
                              onClick={() => toggleExpand(f.id)}
                              className="inline-flex items-center rounded-full border border-dashed border-accent/50 bg-accent-soft/20 px-2.5 py-0.5 text-[10px] font-bold text-accent transition hover:bg-accent-soft/45"
                            >
                              +{toFaDigits(remaining)} نماد دیگر
                            </button>
                          )}
                          {expanded && f.hits.length > 10 && (
                            <button
                              type="button"
                              onClick={() => toggleExpand(f.id)}
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-muted hover:text-ink"
                            >
                              بستن
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-divider/70 bg-surface-2/30 px-3 py-2.5 text-center text-[11px] text-subtle">
                          فعلاً نمادی منطبق نیست
                        </div>
                      )}
                    </div>
                  </div>
                </Surface>
              );
            })}
          </div>
        </div>
      )}

      {/* ۲) وضعیت تجمیعی ۶ اندیکاتور (RSI · MACD · CCI · MFI · BB · ADX) */}
      {view === 'indicators6' && (
        <div className="space-y-3.5">
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredIndicators.map((card) => {
              const vis = INDICATOR_VISUALS[card.id];
              const total = card.bullishHits.length + card.bearishHits.length;
              const bullPct = total > 0 ? Math.round((card.bullishHits.length / total) * 100) : 50;

              return (
                <Surface
                  key={card.id}
                  className="overflow-hidden border border-divider/85 shadow-2xs transition duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="grid grid-cols-[1fr_6.75rem] sm:grid-cols-[1fr_7.5rem]">
                    {/* دو ناحیه گاوی (سبز) و خرسی (قرمز) */}
                    <div className="divide-y divide-divider/65">
                      {/* گاوی: خروج از اشباع فروشندگان */}
                      <div className="space-y-2.5 bg-gradient-to-l from-emerald-500/[0.06] via-emerald-500/[0.025] to-transparent p-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-lg bg-emerald-500/18 ring-1 ring-emerald-500/30">
                              <TrendingUp className="h-3 w-3" aria-hidden />
                            </span>
                            خروج از اشباع فروشندگان
                          </span>
                          <span className="rounded-full bg-emerald-500/18 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300 tabular-nums">
                            {toFaDigits(card.bullishHits.length)}
                          </span>
                        </div>

                        {card.bullishHits.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {card.bullishHits.map((h) => {
                              const liveMeta = liveBySymbol.get(h.symbol);
                              return (
                                <button
                                  key={h.symbol}
                                  type="button"
                                  title={`${h.symbol} — ${h.nameFa} (${h.valueLabel})`}
                                  onClick={() => onSelectSymbol(h.symbol)}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-card py-0.5 pe-2.5 ps-1 text-[11px] font-bold text-ink shadow-2xs transition duration-150 hover:-translate-y-0.5 hover:border-emerald-500 hover:shadow-sm"
                                >
                                  <IranInstrumentLogo
                                    item={liveMeta ?? { symbol: h.symbol, nameFa: h.nameFa }}
                                    size="xs"
                                    showCornerIcon={false}
                                  />
                                  <span>{h.symbol}</span>
                                  <span
                                    dir="ltr"
                                    className="rounded-full bg-emerald-500/14 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums"
                                  >
                                    {toFaDigits(h.valueLabel)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[11px] text-subtle">—</p>
                        )}
                      </div>

                      {/* خرسی: خروج از اشباع خریداران */}
                      <div className="space-y-2.5 bg-gradient-to-l from-rose-500/[0.06] via-rose-500/[0.025] to-transparent p-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-rose-700 dark:text-rose-300">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-lg bg-rose-500/18 ring-1 ring-rose-500/30">
                              <TrendingDown className="h-3 w-3" aria-hidden />
                            </span>
                            خروج از اشباع خریداران
                          </span>
                          <span className="rounded-full bg-rose-500/18 px-2 py-0.5 text-[10px] font-black text-rose-700 dark:text-rose-300 tabular-nums">
                            {toFaDigits(card.bearishHits.length)}
                          </span>
                        </div>

                        {card.bearishHits.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {card.bearishHits.map((h) => {
                              const liveMeta = liveBySymbol.get(h.symbol);
                              return (
                                <button
                                  key={h.symbol}
                                  type="button"
                                  title={`${h.symbol} — ${h.nameFa} (${h.valueLabel})`}
                                  onClick={() => onSelectSymbol(h.symbol)}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/35 bg-card py-0.5 pe-2.5 ps-1 text-[11px] font-bold text-ink shadow-2xs transition duration-150 hover:-translate-y-0.5 hover:border-rose-500 hover:shadow-sm"
                                >
                                  <IranInstrumentLogo
                                    item={liveMeta ?? { symbol: h.symbol, nameFa: h.nameFa }}
                                    size="xs"
                                    showCornerIcon={false}
                                  />
                                  <span>{h.symbol}</span>
                                  <span
                                    dir="ltr"
                                    className="rounded-full bg-rose-500/14 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 dark:text-rose-300 tabular-nums"
                                  >
                                    {toFaDigits(h.valueLabel)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[11px] text-subtle">—</p>
                        )}
                      </div>
                    </div>

                    {/* ستون امضای رنگی اندیکاتور + نوار توازن گاوی/خرسی */}
                    <div
                      className={cn(
                        'relative flex flex-col items-center justify-between overflow-hidden bg-gradient-to-b px-2.5 py-3.5 text-center text-white',
                        vis.pillarGradient
                      )}
                    >
                      <span
                        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/20"
                        aria-hidden
                      />
                      <div className="relative z-10 flex flex-col items-center">
                        <span dir="ltr" className="text-lg font-black tracking-wide drop-shadow-xs">
                          {card.titleEn}
                        </span>
                        <span
                          dir="ltr"
                          className="mt-1 rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold tracking-wider backdrop-blur-xs"
                        >
                          {vis.periodLabel}
                        </span>
                        <span className="mt-2 text-[10px] font-semibold text-white/90">
                          {vis.descFa}
                        </span>
                      </div>

                      {/* نوار توازن گاوی/خرسی */}
                      <div className="relative z-10 mt-3 w-full space-y-1">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/25">
                          <div
                            className="h-full rounded-full bg-emerald-300 transition-all duration-300"
                            style={{ width: `${total > 0 ? bullPct : 0}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[9px] font-bold text-white/85 tabular-nums">
                          <span>{toFaDigits(card.bullishHits.length)} گاوی</span>
                          <span>{toFaDigits(card.bearishHits.length)} خرسی</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Surface>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-field bg-surface-2/50 px-3 py-2 text-[11px] text-muted">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-300">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                خروج از اشباع فروشندگان ({toFaDigits(pulseStats.indBull)})
              </span>
              <span className="inline-flex items-center gap-1.5 font-bold text-rose-700 dark:text-rose-300">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                خروج از اشباع خریداران ({toFaDigits(pulseStats.indBear)})
              </span>
            </div>
            <span>محاسبه دقیق روی کندل‌های روزانه (حداقل ۲۱ تا ۳۶ روز سابقه قیمت)</span>
          </div>
        </div>
      )}

      {/* ۳) اسکنر اصلی و اطلاعیه‌های کدال */}
      {view === 'core_codal' && (
        <Surface className="overflow-hidden border border-divider/80 p-4 space-y-3">
          {scannerResult ? (
            scannerResult.emptyMessageFa ? (
              <Notice tone="neutral" title="نتیجه اسکنر">{scannerResult.emptyMessageFa}</Notice>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-divider text-muted">
                      <th className="pb-2.5">نماد</th>
                      <th className="pb-2.5">نوع دارایی</th>
                      <th className="pb-2.5">سیگنال</th>
                      <th className="pb-2.5">مقدار دقیق</th>
                      <th className="pb-2.5">قدرت</th>
                      <th className="pb-2.5">منبع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider/60">
                    {scannerResult.rows.map((r, idx) => {
                      const liveMeta = liveBySymbol.get(r.symbol);
                      return (
                        <tr
                          key={`${r.symbol}-${r.signalCode}-${idx}`}
                          className="transition-colors hover:bg-surface-2/45"
                        >
                          <td className="py-2.5">
                            <button
                              type="button"
                              onClick={() => onSelectSymbol(r.symbol)}
                              className="inline-flex items-center gap-2 font-extrabold text-ink transition hover:text-accent"
                            >
                              <IranInstrumentLogo
                                item={liveMeta ?? { symbol: r.symbol }}
                                size="sm"
                              />
                              <span>{r.symbol}</span>
                            </button>
                          </td>
                          <td className="py-2.5 text-muted">{ASSET_TYPE_LABELS[r.assetType]}</td>
                          <td className="py-2.5 font-bold text-ink">{r.signalTitleFa}</td>
                          <td className="py-2.5 font-semibold text-ink">{r.exactValueFa}</td>
                          <td className="py-2.5">
                            <Badge
                              tone={
                                r.strength === 'strong'
                                  ? 'gain'
                                  : r.strength === 'medium'
                                    ? 'warn'
                                    : 'neutral'
                              }
                            >
                              {r.strength === 'strong'
                                ? 'قوی'
                                : r.strength === 'medium'
                                  ? 'متوسط'
                                  : 'ضعیف'}
                            </Badge>
                          </td>
                          <td className="py-2.5 text-[11px] text-muted">
                            {r.sourceName} ({r.dataDate})
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="rounded-card border border-dashed border-divider bg-surface-2/35 p-5 text-center space-y-2">
              <p className="text-xs font-bold text-ink">
                اسکنر هوشمند ورود پول ۳ روزه، جهش حجم ۲×، شکست ۲۰ روزه، کدال و تخفیف NAV
              </p>
              <p className="text-[11px] text-muted">
                برای بررسی جامع روی {toFaDigits(datasets.length)} فایل قیمت و {toFaDigits(documents.length)} سند کدال، دکمه «اسکن کدال» را بزنید.
              </p>
            </div>
          )}
        </Surface>
      )}
    </div>
  );
}
