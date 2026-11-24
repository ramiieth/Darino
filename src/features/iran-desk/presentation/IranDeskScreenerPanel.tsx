/**
 * پنل غربالگر حرفه‌ای بازار سهام و صندوق‌های ایران — طراحی مدرن، رنگی و مجهز به لوگوی اختصاصی هر نماد
 *   ۱) ۱۲ فیلتر کاربردی بازار (حجم مشکوک، چکش صعودی، اشباع فروش، رنج مثبت + ورود پول، سرانه > ۲۵۰ م.ت، کدبه‌کد و…)
 *   ۲) وضعیت تجمیعی ۶ اندیکاتور (RSI · MACD · CCI · MFI · BB · ADX) با تفکیک گاوی و خرسی
 *   ۳) اسکنر اصلی و اطلاعیه‌های کدال (ورود پول ۳ روزه، جهش حجم ۲×، شکست ۲۰ روزه، تخفیف/حباب NAV)
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

const FILTER_VISUALS: Record<
  PracticalFilterCard['id'],
  {
    icon: React.ComponentType<{ className?: string }>;
    topBar: string;
    iconBg: string;
    iconText: string;
    chipHover: string;
  }
> = {
  correction_5d_vol_up: {
    icon: Activity,
    topBar: 'from-sky-500 via-blue-500 to-indigo-500',
    iconBg: 'bg-sky-500/12 ring-sky-500/25',
    iconText: 'text-sky-600 dark:text-sky-300',
    chipHover: 'hover:border-sky-500/60 hover:bg-sky-500/8'
  },
  positive_range_inflow: {
    icon: ArrowUpRight,
    topBar: 'from-emerald-500 via-teal-500 to-cyan-500',
    iconBg: 'bg-emerald-500/12 ring-emerald-500/25',
    iconText: 'text-emerald-600 dark:text-emerald-300',
    chipHover: 'hover:border-emerald-500/60 hover:bg-emerald-500/8'
  },
  per_capita_buy_250m: {
    icon: Crown,
    topBar: 'from-amber-400 via-yellow-500 to-emerald-500',
    iconBg: 'bg-amber-500/14 ring-amber-500/30',
    iconText: 'text-amber-600 dark:text-amber-300',
    chipHover: 'hover:border-amber-500/60 hover:bg-amber-500/8'
  },
  smart_money_inflow: {
    icon: Flame,
    topBar: 'from-teal-500 via-emerald-500 to-green-500',
    iconBg: 'bg-teal-500/12 ring-teal-500/25',
    iconText: 'text-teal-600 dark:text-teal-300',
    chipHover: 'hover:border-teal-500/60 hover:bg-teal-500/8'
  },
  pos_to_neg_sell_pressure: {
    icon: ArrowDownRight,
    topBar: 'from-rose-500 via-red-500 to-orange-500',
    iconBg: 'bg-rose-500/12 ring-rose-500/25',
    iconText: 'text-rose-600 dark:text-rose-300',
    chipHover: 'hover:border-rose-500/60 hover:bg-rose-500/8'
  },
  neg_to_pos_buy_pressure: {
    icon: TrendingUp,
    topBar: 'from-green-500 via-emerald-500 to-teal-500',
    iconBg: 'bg-green-500/12 ring-green-500/25',
    iconText: 'text-green-600 dark:text-green-300',
    chipHover: 'hover:border-green-500/60 hover:bg-green-500/8'
  },
  sell_queue_collected: {
    icon: ShieldCheck,
    topBar: 'from-emerald-500 via-lime-500 to-teal-500',
    iconBg: 'bg-emerald-500/12 ring-emerald-500/25',
    iconText: 'text-emerald-600 dark:text-emerald-300',
    chipHover: 'hover:border-emerald-500/60 hover:bg-emerald-500/8'
  },
  suspicious_volume: {
    icon: BarChart3,
    topBar: 'from-amber-500 via-orange-500 to-rose-500',
    iconBg: 'bg-orange-500/12 ring-orange-500/25',
    iconText: 'text-orange-600 dark:text-orange-300',
    chipHover: 'hover:border-orange-500/60 hover:bg-orange-500/8'
  },
  code_to_code_legal_to_real: {
    icon: Repeat,
    topBar: 'from-violet-500 via-purple-500 to-fuchsia-500',
    iconBg: 'bg-violet-500/12 ring-violet-500/25',
    iconText: 'text-violet-600 dark:text-violet-300',
    chipHover: 'hover:border-violet-500/60 hover:bg-violet-500/8'
  },
  oversold: {
    icon: Gauge,
    topBar: 'from-indigo-500 via-blue-500 to-cyan-500',
    iconBg: 'bg-indigo-500/12 ring-indigo-500/25',
    iconText: 'text-indigo-600 dark:text-indigo-300',
    chipHover: 'hover:border-indigo-500/60 hover:bg-indigo-500/8'
  },
  bullish_hammer: {
    icon: Hammer,
    topBar: 'from-emerald-500 via-sky-500 to-indigo-500',
    iconBg: 'bg-emerald-500/12 ring-emerald-500/25',
    iconText: 'text-emerald-600 dark:text-emerald-300',
    chipHover: 'hover:border-emerald-500/60 hover:bg-emerald-500/8'
  },
  per_capita_1d_vs_5d: {
    icon: Sparkles,
    topBar: 'from-cyan-500 via-teal-500 to-emerald-500',
    iconBg: 'bg-cyan-500/12 ring-cyan-500/25',
    iconText: 'text-cyan-600 dark:text-cyan-300',
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
  const [query, setQuery] = useState('');
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

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
    if (!normalizedQuery) return practicalFilters;
    return practicalFilters.map((f) => ({
      ...f,
      hits: f.hits.filter(
        (h) =>
          h.symbol.toLowerCase().includes(normalizedQuery) ||
          h.nameFa.toLowerCase().includes(normalizedQuery)
      )
    }));
  }, [practicalFilters, normalizedQuery]);

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

  const totalFilterHits = useMemo(
    () => practicalFilters.reduce((s, f) => s + f.hits.length, 0),
    [practicalFilters]
  );
  const totalIndicatorHits = useMemo(
    () => indicatorCards.reduce((s, c) => s + c.bullishHits.length + c.bearishHits.length, 0),
    [indicatorCards]
  );

  const toggleExpand = (id: string) =>
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-4">
      {/* نوار بالای مدرن غربالگر: انتخاب نما + جستجو + آمار و به‌روزرسانی */}
      <Surface className="relative overflow-hidden border border-divider/80 p-3.5">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-l from-indigo-500/[0.06] via-transparent to-emerald-500/[0.06]"
          aria-hidden
        />
        <div className="relative flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl<ScreenerView>
              label="نمای غربالگر بازار"
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'filters12', label: `۱۲ فیلتر کاربردی (${toFaDigits(totalFilterHits)})` },
                { value: 'indicators6', label: `۶ اندیکاتور تجمیعی (${toFaDigits(totalIndicatorHits)})` },
                { value: 'core_codal', label: 'اسکنر اصلی و کدال' }
              ]}
            />
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="فیلتر نماد…"
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

            <Button
              size="sm"
              icon={<Radar className="h-3.5 w-3.5" />}
              onClick={onRunCoreScan}
            >
              اسکن کدال ({toFaDigits(datasets.length)})
            </Button>
          </div>
        </div>
      </Surface>

      {/* ۱) ۱۲ فیلتر کاربردی بازار سهام — کارت‌های بنتو رنگی با لوگوی اختصاصی هر نماد */}
      {view === 'filters12' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredPractical.map((f) => {
              const vis = FILTER_VISUALS[f.id];
              const Icon = vis.icon;
              const expanded = Boolean(expandedCards[f.id]);
              const shownHits = expanded ? f.hits : f.hits.slice(0, 12);
              const remaining = f.hits.length - shownHits.length;

              return (
                <Surface
                  key={f.id}
                  className="group relative flex flex-col justify-between overflow-hidden border border-divider/80 transition duration-200 hover:border-divider hover:shadow-md"
                >
                  {/* نوار رنگی بالای کارت */}
                  <div className={cn('h-1 w-full bg-gradient-to-l', vis.topBar)} aria-hidden />

                  <div className="flex flex-1 flex-col justify-between gap-3 p-3.5">
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <span
                            className={cn(
                              'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1',
                              vis.iconBg,
                              vis.iconText
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" aria-hidden />
                          </span>
                          <h4 className="text-xs font-extrabold leading-5 text-ink">
                            {f.titleFa}
                          </h4>
                        </div>

                        <span
                          className={cn(
                            'inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-black tabular-nums',
                            f.hits.length > 0
                              ? f.tone === 'loss'
                                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                                : f.tone === 'warn'
                                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                  : f.tone === 'info'
                                    ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300'
                                    : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'bg-surface-2 text-subtle'
                          )}
                        >
                          {toFaDigits(f.hits.length)}
                        </span>
                      </div>

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
                                  'inline-flex items-center gap-1.5 rounded-full border border-divider/80 bg-card/90 py-0.5 pe-2 ps-1 text-[11px] font-bold text-ink shadow-2xs transition duration-150 hover:-translate-y-0.5 hover:shadow-xs',
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
                                  className="rounded-full bg-surface-2/90 px-1.5 py-0.5 text-[9px] font-semibold text-muted tabular-nums"
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
                              className="inline-flex items-center rounded-full border border-dashed border-divider px-2 py-0.5 text-[10px] font-bold text-accent hover:bg-accent-soft/40"
                            >
                              +{toFaDigits(remaining)} نماد دیگر
                            </button>
                          )}
                          {expanded && f.hits.length > 12 && (
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
                        <div className="rounded-lg border border-dashed border-divider/70 bg-surface-2/35 px-2.5 py-2 text-center text-[11px] text-subtle">
                          نمادی با این شرط یافت نشد
                        </div>
                      )}
                    </div>

                    <p className="border-t border-divider/50 pt-2 text-[10px] leading-4 text-muted">
                      {f.formulaFa}
                    </p>
                  </div>
                </Surface>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-field bg-surface-2/50 px-3 py-2 text-[11px] text-muted">
            <span>
              روی هر نماد کلیک کنید تا مستقیماً با لوگوی اختصاصی و سابقه داده‌ها به تیم ۶ نفره (بنیادی، کدال و مدیر ریسک) ارسال شود.
            </span>
            <span className="font-semibold text-ink">هیچ فیلتری به‌تنهایی سیگنال خرید یا فروش نیست.</span>
          </div>
        </div>
      )}

      {/* ۲) وضعیت تجمیعی ۶ اندیکاتور (RSI · MACD · CCI · MFI · BB · ADX) — کارت‌های دوزونه مدرن با ستون گرادیان */}
      {view === 'indicators6' && (
        <div className="space-y-3">
          <div className="grid gap-3.5 lg:grid-cols-2">
            {filteredIndicators.map((card) => {
              const vis = INDICATOR_VISUALS[card.id];
              return (
                <Surface
                  key={card.id}
                  className="overflow-hidden border border-divider/85 shadow-2xs transition duration-200 hover:shadow-md"
                >
                  <div className="grid grid-cols-[1fr_6.25rem] sm:grid-cols-[1fr_7rem]">
                    {/* دو ناحیه گاوی (سبز) و خرسی (قرمز) */}
                    <div className="divide-y divide-divider/65">
                      {/* گاوی: خروج از اشباع فروشندگان */}
                      <div className="space-y-2 bg-emerald-500/[0.04] p-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/15">
                              <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                            </span>
                            خروج از اشباع فروشندگان
                          </span>
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300 tabular-nums">
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
                                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-card py-0.5 pe-2 ps-1 text-[11px] font-bold text-ink shadow-2xs transition duration-150 hover:-translate-y-0.5 hover:border-emerald-500 hover:shadow-xs"
                                >
                                  <IranInstrumentLogo
                                    item={liveMeta ?? { symbol: h.symbol, nameFa: h.nameFa }}
                                    size="xs"
                                    showCornerIcon={false}
                                  />
                                  <span>{h.symbol}</span>
                                  <span
                                    dir="ltr"
                                    className="rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums"
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
                      <div className="space-y-2 bg-rose-500/[0.04] p-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-rose-700 dark:text-rose-300">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-rose-500/15">
                              <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                            </span>
                            خروج از اشباع خریداران
                          </span>
                          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-black text-rose-700 dark:text-rose-300 tabular-nums">
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
                                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-card py-0.5 pe-2 ps-1 text-[11px] font-bold text-ink shadow-2xs transition duration-150 hover:-translate-y-0.5 hover:border-rose-500 hover:shadow-xs"
                                >
                                  <IranInstrumentLogo
                                    item={liveMeta ?? { symbol: h.symbol, nameFa: h.nameFa }}
                                    size="xs"
                                    showCornerIcon={false}
                                  />
                                  <span>{h.symbol}</span>
                                  <span
                                    dir="ltr"
                                    className="rounded-full bg-rose-500/12 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 dark:text-rose-300 tabular-nums"
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

                    {/* ستون امضای رنگی اندیکاتور */}
                    <div
                      className={cn(
                        'relative flex flex-col items-center justify-center bg-gradient-to-b px-2 py-3 text-center text-white',
                        vis.pillarGradient
                      )}
                    >
                      <span dir="ltr" className="text-base font-black tracking-wide drop-shadow-xs">
                        {card.titleEn}
                      </span>
                      <span
                        dir="ltr"
                        className="mt-1 rounded-full bg-white/18 px-2 py-0.5 text-[9px] font-bold tracking-wider backdrop-blur-xs"
                      >
                        {vis.periodLabel}
                      </span>
                      <span className="mt-2 text-[10px] font-semibold text-white/90">
                        {vis.descFa}
                      </span>
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
                خروج از اشباع فروشندگان (گاوی)
              </span>
              <span className="inline-flex items-center gap-1.5 font-bold text-rose-700 dark:text-rose-300">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                خروج از اشباع خریداران (خرسی)
              </span>
            </div>
            <span>محاسبه دقیق بر اساس کندل‌های روزانه (حداقل ۲۱ تا ۳۶ روز سابقه در بخش داده‌ها)</span>
          </div>
        </div>
      )}

      {/* ۳) اسکنر اصلی و اطلاعیه‌های کدال با لوگوی اختصاصی هر نماد */}
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
                برای اجرای بررسی جامع روی {toFaDigits(datasets.length)} فایل قیمت و {toFaDigits(documents.length)} سند کدال، دکمه «اسکن کدال» را بزنید.
              </p>
            </div>
          )}
        </Surface>
      )}
    </div>
  );
}
