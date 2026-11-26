/**
 * تب «کمیته مناظره ایجنت» در میز معاملهٔ دارینو — بازطراحی کامل با زبان فارسی ساده و سیستم دیزاین دارینو
 *
 * معماری ۴ مرحله‌ای شفاف و بدون اصطلاحات پیچیده:
 *   ۱) انتخابگر بصری بازار (رمزارز، طلا و نفت، سهام و فارکس) + تنظیم دقت بررسی (سریع / متعادل / عمیق)
 *   ۲) کارت خلاصهٔ وضعیت فعلی بازار با شاخص امتیاز ۰ تا ۱۰، نوار وضعیت دوقطبی و ۴ کارت خوانش ساده
 *   ۳) کارت حکم نهایی کمیته با نقشهٔ ورود/حد ضرر/هدف سود و تب‌های ۴ مرحلهٔ مناظره
 *   ۴) شیت‌های تنظیم سرمایه و ریسک، جزئیات ۱۱ شاخص بازار و سابقهٔ تصمیم‌ها
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  Bot,
  ChevronDown,
  Download,
  Gauge,
  History,
  Layers,
  Scale,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet
} from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input, SearchField } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Sheet } from '@/shared/components/ui/Sheet';
import { ErrorState, ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { MarketAssetLogo, marketAssetName } from '@/features/perps/presentation/MarketAssetIdentity';
import { fetchJson } from '@/repositories/remoteClient';
import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import { useCommitteeMarkets, useRiskCandles, useFundingStats, useSwing, type PerpMarket } from '../data/intelApi';
import { assess, buildRiskModel } from '../domain/survival';
import {
  CONFIDENCE_FA,
  MARKET_CATEGORY_FA,
  RATING_FA,
  SENTIMENT_BAND_FA,
  TRADER_ACTION_FA,
  buildDeterministicCommitteeBaseline,
  buildDeterministicTradingAgentsReport,
  buildIndicatorDiagnostics,
  buildPastLessonsContext,
  computeTechnicalSnapshot,
  computeTradeGeometry,
  getMarketVisualMeta,
  renderCompleteReportHtml,
  settleMemoryEntries,
  type CommitteeMarketInput,
  type IndicatorDiagnosticRow,
  type MarketAssetCategory,
  type TradingAgentsReport,
  type TradingMemoryEntry
} from '../domain/tradingAgents';
import { fmtPrice, UsdShort } from './parts';

const MEMORY_STORAGE_KEY = 'darino:trading-agents:memory:v1';

/** نمادهای منتخب روی نوار دسترسی سریع */
const QUICK_PICK_COINS = [
  'BTC',
  'ETH',
  'xyz:GOLD',
  'xyz:SILVER',
  'xyz:BRENTOIL',
  'xyz:CL',
  'xyz:NVDA',
  'xyz:TSLA',
  'xyz:AAPL',
  'xyz:MSFT',
  'xyz:SPY',
  'xyz:QQQ',
  'xyz:EUR',
  'SOL',
  'HYPE'
] as const;

type StageView = 'debate' | 'risk' | 'analysts' | 'indicators';
type CategoryFilter = 'all' | MarketAssetCategory;

/** نمایش استاندارد فین‌تک فارسی برای درصدهای علامت‌دار (+ / - سمت چپ عدد در جعبه LTR، و ٪ سمت راست عدد) */
function SignedPct({
  value,
  digits = 1,
  className
}: {
  value: number | null | undefined;
  digits?: number;
  className?: string;
}) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className={cn('num-ltr text-subtle', className)}>—</span>;
  }
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  const absFormatted = toFaDigits(Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: digits }));
  return (
    <bdi dir="ltr" className={cn('num-ltr inline-block', className)}>
      {sign}
      {absFormatted}٪
    </bdi>
  );
}

/** نمایش درصد بدون علامت (مثل میزان نوسان یا فاصلهٔ حد ضرر) */
function PlainPct({ value, digits = 1, className }: { value: number | null | undefined; digits?: number; className?: string }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className={cn('num-ltr text-subtle', className)}>—</span>;
  }
  return (
    <bdi dir="ltr" className={cn('num-ltr inline-block', className)}>
      {toFaDigits(Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: digits }))}٪
    </bdi>
  );
}

/**
 * نمایش استاندارد قیمت دلاری دارینو در چیدمان راست‌به‌چپ:
 * عدد در جعبه LTR ایزوله و واژهٔ «دلار» بیرون از آن.
 */
function PriceUsd({
  value,
  className,
  unitClassName = 'text-[0.82em] font-medium text-muted'
}: {
  value: number | null | undefined;
  className?: string;
  unitClassName?: string;
}) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className={cn('num-ltr text-subtle', className)}>—</span>;
  }
  return (
    <span dir="rtl" className={cn('persian-amount inline-flex items-baseline gap-1 whitespace-nowrap', className)}>
      <bdi dir="ltr" className="num-ltr">
        {fmtPrice(value)}
      </bdi>
      <span className={unitClassName}>دلار</span>
    </span>
  );
}

function resolveMarketVisual(coin: string) {
  const meta = getMarketVisualMeta(coin);
  const perpsFa = marketAssetName(meta.base);
  const nameFa =
    meta.nameFa !== meta.base
      ? meta.nameFa
      : perpsFa && perpsFa.toUpperCase() !== meta.base
        ? perpsFa
        : meta.nameFa;
  return { ...meta, nameFa };
}

function loadMemory(): TradingMemoryEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(MEMORY_STORAGE_KEY) ?? '[]');
    return Array.isArray(raw) ? (raw as TradingMemoryEntry[]) : [];
  } catch {
    return [];
  }
}

function saveMemory(entries: TradingMemoryEntry[]): void {
  try {
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(entries.slice(0, 50)));
  } catch {
    /* نادیده گرفتن خطای حافظه در مرورگرهای محدود */
  }
}

function describeBuyerStrength(rsi: number | null): { label: string; hint: string; tone: 'gain' | 'loss' | 'warn' | 'neutral' } {
  if (rsi === null) return { label: 'نامشخص', hint: 'دادهٔ کافی ثبت نشده', tone: 'neutral' };
  const val = toFaDigits(Math.round(rsi));
  if (rsi >= 70) return { label: `داغ و پرخرید (${val} از ۱۰۰)`, hint: 'احتمال استراحت یا اصلاح قیمت', tone: 'warn' };
  if (rsi <= 30) return { label: `ارزان و پرفروش (${val} از ۱۰۰)`, hint: 'احتمال بازگشت خریداران', tone: 'gain' };
  if (rsi >= 55) return { label: `برتری خریداران (${val} از ۱۰۰)`, hint: 'تمایل بازار به سمت رشد است', tone: 'gain' };
  if (rsi <= 45) return { label: `برتری فروشندگان (${val} از ۱۰۰)`, hint: 'فشار فروش بیشتر از خرید است', tone: 'loss' };
  return { label: `متعادل (${val} از ۱۰۰)`, hint: 'خریداران و فروشندگان برابرند', tone: 'neutral' };
}

function describeMacroMood(state: 'on' | 'off' | 'unknown' | undefined): { label: string; tone: 'gain' | 'warn' | 'neutral' } {
  if (state === 'on') return { label: 'پرانرژی و مثبت', tone: 'gain' };
  if (state === 'off') return { label: 'محتاطانه', tone: 'warn' };
  return { label: 'متعادل', tone: 'neutral' };
}

export function TradingAgentsTab({
  market,
  onChangeMarket,
  onSelectCoin
}: {
  market: string;
  onChangeMarket: (coin: string) => void;
  onSelectCoin: (coin: string) => void;
}) {
  const markets = useCommitteeMarkets();
  const selectedMarket = useMemo(() => {
    const list = markets.data ?? [];
    const upper = market.toUpperCase();
    return (
      list.find((x) => x.coin.toUpperCase() === upper) ??
      list.find((x) => getMarketVisualMeta(x.coin).base === upper) ??
      list[0] ??
      null
    );
  }, [markets.data, market]);

  const activeCoin = selectedMarket?.coin ?? market;
  const activeVisual = useMemo(() => resolveMarketVisual(activeCoin), [activeCoin]);

  const candles = useRiskCandles(
    selectedMarket ? activeCoin : null,
    selectedMarket?.markPx ?? null,
    selectedMarket?.change24h ?? null
  );
  const funding = useFundingStats(
    selectedMarket ? activeCoin : null,
    selectedMarket?.fundingHourly ?? null,
    !selectedMarket?.isReference
  );
  const swing = useSwing();

  const [depth, setDepth] = useState<1 | 2 | 3>(1);
  const [cashInput, setCashInput] = useState('10000');
  const [riskPctInput, setRiskPctInput] = useState('1');
  const [holdingDaysInput, setHoldingDaysInput] = useState<'5' | '14' | '30'>('14');
  const [stageView, setStageView] = useState<StageView>('debate');
  const [marketPickerOpen, setMarketPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [indicatorsSheetOpen, setIndicatorsSheetOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<TradingAgentsReport | null>(null);
  const [reportCoin, setReportCoin] = useState<string | null>(null);
  const [memory, setMemory] = useState<TradingMemoryEntry[]>(loadMemory);

  const quickMarkets = useMemo(() => {
    const list = markets.data ?? [];
    const byUpper = new Map(list.map((m) => [m.coin.toUpperCase(), m]));
    return QUICK_PICK_COINS.map((c) => byUpper.get(c.toUpperCase())).filter((m): m is PerpMarket => !!m);
  }, [markets.data]);

  // به‌روزرسانی خودکار نتیجهٔ تصمیم‌های قبلی با قیمت‌های زنده بازار
  useEffect(() => {
    if (!markets.data?.length) return;
    const liveMap: Record<string, number> = {};
    for (const m of markets.data) liveMap[m.coin] = m.markPx;
    setMemory((prev) => {
      if (!prev.length) return prev;
      const { updated } = settleMemoryEntries(prev, liveMap);
      saveMemory(updated);
      return updated;
    });
  }, [markets.data]);

  const technical = useMemo(() => (candles.data ? computeTechnicalSnapshot(candles.data, 6) : null), [candles.data]);
  const indicatorRows = useMemo(() => (technical ? buildIndicatorDiagnostics(technical) : []), [technical]);

  const riskAssessment = useMemo(() => {
    if (!candles.data || !selectedMarket) return null;
    const model = buildRiskModel(candles.data, 'long');
    return {
      model,
      assessment: assess(model, {
        leverage: 3,
        maxLeverage: selectedMarket.maxLeverage,
        fundingHourly: selectedMarket.fundingHourly
      })
    };
  }, [candles.data, selectedMarket]);

  const committeeInput = useMemo<CommitteeMarketInput | null>(() => {
    if (!technical || !selectedMarket) return null;
    const cashNum = Number(cashInput);
    const riskNum = Number(riskPctInput);
    const analysisDate = new Date().toISOString().slice(0, 10);
    const situationHint = `${technical.trendRegime} rsi:${technical.rsi14 ?? 50} funding:${funding.data?.regime ?? 'normal'}`;
    return {
      coin: activeCoin,
      analysisDate,
      researchDepth: depth,
      technical,
      derivatives: {
        fundingAprNow: funding.data?.aprNow ?? selectedMarket.fundingHourly * 24 * 365 * 100,
        fundingAvg7dApr: funding.data?.avg7dApr ?? null,
        fundingPercentile30d: funding.data?.percentile ?? null,
        fundingRegime: funding.data?.regime ?? 'unknown',
        openInterestUsd: selectedMarket.openInterestUsd,
        volume24hUsd: selectedMarket.volume24h,
        maxLeverage: selectedMarket.maxLeverage,
        worstCrash24hPct: riskAssessment?.model.crashPct ?? null,
        safeLeverage7d: riskAssessment?.assessment.safeLeverage ?? null
      },
      macroRegime: swing.data
        ? {
            state: swing.data.regime.state,
            btcAbove200: swing.data.regime.btcAbove200,
            breadthPct: swing.data.regime.breadth === null ? null : Math.round(swing.data.regime.breadth * 100)
          }
        : null,
      portfolio: {
        cashUsd: Number.isFinite(cashNum) && cashNum > 0 ? cashNum : null,
        maxRiskPct: Number.isFinite(riskNum) && riskNum > 0 ? Math.min(20, Math.max(0.1, riskNum)) : 1
      },
      pastLessons: buildPastLessonsContext(memory, activeCoin, 4, situationHint)
    };
  }, [technical, selectedMarket, cashInput, riskPctInput, activeCoin, depth, funding.data, riskAssessment, swing.data, memory]);

  const baseline = useMemo(
    () => (committeeInput ? buildDeterministicCommitteeBaseline(committeeInput) : null),
    [committeeInput]
  );

  async function runCommittee() {
    if (!committeeInput || busy) return;
    setBusy(true);
    setError(null);
    let finalReport: TradingAgentsReport;
    let generatedAt = Date.now();
    try {
      const res = await fetchJson<{ report: TradingAgentsReport; generatedAt: number }>(
        '/api/integrations?op=analyze-trading-agents',
        {
          method: 'POST',
          body: committeeInput,
          timeoutMs: 115_000
        }
      );
      finalReport = res.report;
      generatedAt = res.generatedAt || Date.now();
    } catch {
      finalReport = buildDeterministicTradingAgentsReport(committeeInput);
    }

    setReport(finalReport);
    setReportCoin(activeCoin);
    setStageView('debate');

    const pm = finalReport.riskDebate.portfolioDecision;
    const tp = finalReport.traderProposal;
    const newEntry: TradingMemoryEntry = {
      id: `${activeCoin}-${Date.now()}`,
      coin: activeCoin,
      analysisDate: committeeInput.analysisDate,
      createdAt: generatedAt,
      rating: pm.rating,
      traderAction: tp.action,
      entryPrice: tp.entryPrice ?? committeeInput.technical.close,
      stopLoss: tp.stopLoss,
      priceTarget: pm.priceTarget ?? tp.takeProfit,
      holdingPeriodDays: Number(holdingDaysInput) || 14,
      executiveSummary: pm.executiveSummary,
      settledAt: null,
      settledPrice: committeeInput.technical.close,
      realizedReturnPct: 0,
      lesson: null
    };
    setMemory((prev) => {
      const next = [newEntry, ...prev].slice(0, 50);
      saveMemory(next);
      return next;
    });
    setBusy(false);
  }

  function downloadHtmlReport() {
    if (!committeeInput || !report) return;
    const html = renderCompleteReportHtml(committeeInput, report);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `darino-debate-${activeCoin}-${committeeInput.analysisDate}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (markets.isLoading) return <ListSkeleton rows={4} />;
  if (markets.isError) return <ErrorState message="فهرست بازارها دریافت نشد" onRetry={() => void markets.refetch()} />;

  const activeReport = report && reportCoin === activeCoin ? report : null;
  const catMeta = MARKET_CATEGORY_FA[activeVisual.category];

  return (
    <div className="space-y-4">
      {/* ۱) پنل کنترل و انتخاب دارایی با هویت بصری سرمه‌ای/آبی دارینو */}
      <Surface className="overflow-hidden p-0">
        {/* نوار معرفی کوتاه بالای پنل */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider/80 bg-[#0B1B5C]/[0.03] px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#0B1B5C] text-white shadow-2xs">
              <Bot className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-extrabold text-ink">کمیتهٔ مناظره و تصمیم‌گیری</h2>
              <p className="text-2xs text-muted">
                موافقان و مخالفان خرید با هم بحث می‌کنند تا تصویر شفاف‌تری از فرصت و ریسک داشته باشید.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onSelectCoin(activeCoin)}
            className="inline-flex items-center gap-1 rounded-full bg-accent-soft/70 px-3 py-1 text-xs font-bold text-accent transition hover:bg-accent-soft"
          >
            <Users className="h-3.5 w-3.5" aria-hidden />
            <span>نظر معامله‌گران برتر روی {activeVisual.nameFa}</span>
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        <div className="p-4 sm:p-5">
          <div className="grid gap-3.5 lg:grid-cols-12 lg:items-end">
            {/* کارت انتخابگر بازار */}
            <div className="lg:col-span-6">
              <span className="mb-1.5 block text-xs font-semibold text-muted">
                دارایی مورد بررسی
              </span>
              <button
                type="button"
                onClick={() => setMarketPickerOpen(true)}
                aria-label="انتخاب دارایی مورد بررسی"
                className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-divider bg-surface-2/60 px-3.5 py-2.5 text-start transition hover:border-accent/60 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="relative shrink-0 rounded-full ring-2 ring-white shadow-xs">
                    <MarketAssetLogo symbol={activeVisual.logoKey} size={42} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-extrabold text-ink sm:text-base">
                        {activeVisual.nameFa}
                      </span>
                      <span
                        dir="ltr"
                        className="rounded-md bg-card px-1.5 py-0.5 text-[11px] font-bold text-muted ring-1 ring-divider"
                      >
                        {activeVisual.ticker}
                      </span>
                      <Badge tone={catMeta.tone} className="text-[10px]">
                        {catMeta.short}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <PriceUsd value={selectedMarket?.markPx} className="font-bold text-ink" />
                      {selectedMarket?.change24h !== null && selectedMarket?.change24h !== undefined && (
                        <SignedPct
                          value={selectedMarket.change24h}
                          digits={2}
                          className={cn(
                            'rounded-md px-1.5 py-0.5 text-[11px] font-bold',
                            selectedMarket.change24h >= 0
                              ? 'bg-gain/10 text-positive'
                              : 'bg-negative/10 text-negative'
                          )}
                        />
                      )}
                      {selectedMarket && (
                        <span className="text-2xs text-subtle">
                          · سقف اهرم {toFaDigits(selectedMarket.maxLeverage)} برابر
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-card px-3 py-1.5 text-xs font-bold text-[#0B1B5C] shadow-2xs ring-1 ring-divider transition group-hover:bg-[#0B1B5C] group-hover:text-white group-hover:ring-[#0B1B5C]">
                  <span>تغییر</span>
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                </span>
              </button>
            </div>

            {/* دقت بررسی */}
            <div className="lg:col-span-3">
              <Field label="دقت بررسی">
                <SegmentedControl<string>
                  fill
                  label="دقت بررسی"
                  value={String(depth)}
                  onChange={(v) => setDepth((Number(v) as 1 | 2 | 3) || 1)}
                  options={[
                    { value: '1', label: 'سریع' },
                    { value: '2', label: 'متعادل' },
                    { value: '3', label: 'عمیق' }
                  ]}
                />
              </Field>
            </div>

            {/* دکمه اصلی شروع مناظره */}
            <div className="lg:col-span-3">
              <Button
                className="min-h-[48px] w-full rounded-xl bg-gradient-to-l from-[#0B1B5C] to-[#2E5BFF] font-extrabold shadow-sm hover:opacity-95"
                loading={busy}
                icon={<Sparkles />}
                disabled={!committeeInput || busy}
                onClick={() => void runCommittee()}
              >
                {busy ? 'در حال گفت‌وگو…' : activeReport ? 'مناظرهٔ دوباره' : 'شروع مناظره'}
              </Button>
            </div>
          </div>

          {/* نوار انتخاب سریع دارایی‌ها */}
          <div
            aria-label="انتخاب سریع دارایی"
            className="no-scrollbar mt-3.5 flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5"
          >
            {quickMarkets.map((m) => {
              const v = resolveMarketVisual(m.coin);
              const selected = m.coin.toUpperCase() === activeCoin.toUpperCase();
              return (
                <button
                  key={m.coin}
                  type="button"
                  onClick={() => onChangeMarket(m.coin)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition',
                    selected
                      ? 'border-[#0B1B5C] bg-[#0B1B5C] font-bold text-white shadow-2xs'
                      : 'border-divider bg-surface-2/60 font-semibold text-ink hover:border-accent/40 hover:bg-surface-2'
                  )}
                >
                  <MarketAssetLogo symbol={v.logoKey} size={18} />
                  <span>{v.nameFa}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setMarketPickerOpen(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-accent/50 bg-accent-soft/30 px-3 py-1.5 text-xs font-bold text-accent hover:bg-accent-soft"
            >
              <span>همهٔ بازارها ({toFaDigits((markets.data ?? []).length)}) ←</span>
            </button>
          </div>

          {/* نوار ابزارهای جانبی (با زبان کاملاً ساده) */}
          <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-divider/80 pt-3 text-xs">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-divider/70 bg-surface-2/60 px-3 py-1.5 font-semibold text-ink transition hover:border-accent/40 hover:bg-accent-soft/40 hover:text-accent"
            >
              <Settings2 className="h-3.5 w-3.5 text-accent" aria-hidden />
              <span>
                سرمایه: <bdi dir="ltr" className="num-ltr font-bold">{toFaDigits(Number(cashInput || 0).toLocaleString('en-US'))}</bdi> دلار · سقف ضرر{' '}
                <PlainPct value={Number(riskPctInput)} className="font-bold" />
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIndicatorsSheetOpen(true)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-divider/70 bg-surface-2/60 px-3 py-1.5 font-semibold text-ink transition hover:border-accent/40 hover:bg-accent-soft/40 hover:text-accent"
            >
              <Layers className="h-3.5 w-3.5 text-accent" aria-hidden />
              <span>جزئیات ۱۱ شاخص بازار</span>
            </button>

            <button
              type="button"
              onClick={() => setMemoryOpen(true)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-divider/70 bg-surface-2/60 px-3 py-1.5 font-semibold text-ink transition hover:border-accent/40 hover:bg-accent-soft/40 hover:text-accent"
            >
              <History className="h-3.5 w-3.5 text-accent" aria-hidden />
              <span>سابقهٔ تصمیم‌ها ({toFaDigits(memory.length)})</span>
            </button>
          </div>

          {busy && (
            <div className="mt-3.5 rounded-2xl border border-accent/25 bg-accent-soft/50 px-4 py-3 text-xs text-ink" role="status">
              <div className="flex items-center gap-2 font-extrabold text-[#0B1B5C]">
                <Bot className="h-4 w-4 animate-pulse text-accent" aria-hidden />
                <span>در حال برگزاری جلسهٔ تحلیل روی {activeVisual.nameFa}…</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <span className="rounded-full bg-card px-2.5 py-0.5 font-semibold text-ink ring-1 ring-divider">۱. بررسی نمودار و شاخص‌ها</span>
                <span>←</span>
                <span className="rounded-full bg-card px-2.5 py-0.5 font-semibold text-ink ring-1 ring-divider">۲. مناظره موافق و مخالف</span>
                <span>←</span>
                <span className="rounded-full bg-card px-2.5 py-0.5 font-semibold text-ink ring-1 ring-divider">۳. تعیین قیمت ورود و حد ضرر</span>
                <span>←</span>
                <span className="rounded-full bg-card px-2.5 py-0.5 font-semibold text-ink ring-1 ring-divider">۴. جمع‌بندی نهایی</span>
              </div>
            </div>
          )}

          {error && <Notice tone="warn" className="mt-3">{error}</Notice>}
        </div>
      </Surface>

      {/* ۲) کارت خلاصهٔ وضعیت فعلی یا نتیجهٔ نهایی مناظره */}
      {candles.isLoading ? (
        <ListSkeleton rows={3} />
      ) : !technical || !committeeInput || !baseline ? (
        <Notice tone="neutral">اطلاعات قیمتی کافی برای بررسی این دارایی در لحظه در دسترس نیست.</Notice>
      ) : (
        <>
          {activeReport ? (
            <ExecutiveVerdictHero
              coin={activeCoin}
              visual={activeVisual}
              input={committeeInput}
              report={activeReport}
              maxLeverage={selectedMarket?.maxLeverage ?? 10}
              onDownloadHtml={downloadHtmlReport}
            />
          ) : (
            <LiveQuantitativePreReadCard
              visual={activeVisual}
              input={committeeInput}
              baseline={baseline}
              busy={busy}
              onRun={() => void runCommittee()}
              onOpenIndicators={() => setIndicatorsSheetOpen(true)}
            />
          )}

          {/* ۳) بخش تب‌بندی‌شدهٔ جزئیات مناظره (پس از اجرا) */}
          {activeReport && (
            <Surface className="overflow-hidden p-0">
              <div
                role="tablist"
                aria-label="بخش‌های گزارش کمیته"
                className="boros-account-tabs no-scrollbar flex items-center gap-1.5 overflow-x-auto border-b border-divider bg-[#0B1B5C]/[0.025] px-3 py-2.5 sm:px-4"
              >
                {(
                  [
                    {
                      id: 'debate',
                      label: 'مناظره موافق و مخالف',
                      badge: RATING_FA[activeReport.researchDebate.researchPlan.recommendation].short
                    },
                    {
                      id: 'risk',
                      label: 'بررسی ریسک (۳ دیدگاه)',
                      badge: RATING_FA[activeReport.riskDebate.portfolioDecision.rating].short
                    },
                    {
                      id: 'analysts',
                      label: 'گزارش ۴ بخش بازار',
                      badge: `${toFaDigits(activeReport.analysts.sentimentReport.overallScore)} از ۱۰`
                    },
                    {
                      id: 'indicators',
                      label: 'جزئیات ۱۱ شاخص',
                      badge: '۱۱ شاخص'
                    }
                  ] as const
                ).map((t) => {
                  const selected = stageView === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setStageView(t.id)}
                      className={cn(
                        'inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition',
                        selected
                          ? 'bg-[#0B1B5C] text-white shadow-xs'
                          : 'text-muted hover:bg-card hover:text-ink'
                      )}
                    >
                      <span>{t.label}</span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px]',
                          selected ? 'bg-white/15 text-white' : 'bg-surface-2 text-subtle'
                        )}
                      >
                        {t.badge}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="p-4 sm:p-5" role="tabpanel">
                {stageView === 'debate' && <ResearchDebateView report={activeReport} />}
                {stageView === 'risk' && <RiskCommitteeView report={activeReport} />}
                {stageView === 'analysts' && <AnalystsTeamView report={activeReport} />}
                {stageView === 'indicators' && <IndicatorsMatrixView rows={indicatorRows} input={committeeInput} />}
              </div>
            </Surface>
          )}
        </>
      )}

      {/* شیت ۰: انتخابگر کامل بازار */}
      <MarketPickerSheet
        open={marketPickerOpen}
        onClose={() => setMarketPickerOpen(false)}
        markets={markets.data ?? []}
        activeCoin={activeCoin}
        onSelect={(coin) => {
          onChangeMarket(coin);
          setMarketPickerOpen(false);
        }}
      />

      {/* شیت ۱: تنظیمات سرمایه و ریسک */}
      <Sheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="تنظیمات سرمایه و سقف ریسک"
        description="با وارد کردن سرمایه و حداکثر ضرر قابل‌قبول، کمیته مبلغ مناسب برای ورود را دقیق‌تر پیشنهاد می‌دهد."
        footer={
          <Button className="w-full" onClick={() => setSettingsOpen(false)}>
            ذخیره و بستن
          </Button>
        }
      >
        <div className="space-y-4 py-2">
          <Field
            label="سرمایهٔ اختصاص‌یافته به این بخش (دلار)"
            hint="مبلغ پیشنهادی ورود بر اساس این سرمایه و میزان نوسان بازار محاسبه می‌شود."
          >
            <Input
              type="number"
              inputMode="decimal"
              dir="ltr"
              min={100}
              value={cashInput}
              onChange={(e) => setCashInput(e.target.value)}
              suffix="دلار"
            />
          </Field>

          <Field
            label="حداکثر ضرر مجاز در هر معامله (درصد از سرمایه)"
            hint="برای حفظ آرامش و اصل سرمایه، معمولاً بین ۰.۵٪ تا ۲٪ پیشنهاد می‌شود."
          >
            <Input
              type="number"
              inputMode="decimal"
              dir="ltr"
              min={0.2}
              max={10}
              step={0.2}
              value={riskPctInput}
              onChange={(e) => setRiskPctInput(e.target.value)}
              suffix="٪"
            />
          </Field>

          <Field
            label="بازهٔ بررسی نتیجهٔ تصمیم‌های قبلی"
            hint="پس از این مدت، نتیجهٔ واقعی هر تحلیل با قیمت روز بازار مقایسه می‌شود."
          >
            <SegmentedControl<'5' | '14' | '30'>
              fill
              label="بازهٔ ارزیابی"
              value={holdingDaysInput}
              onChange={setHoldingDaysInput}
              options={[
                { value: '5', label: '۵ روزه' },
                { value: '14', label: '۱۴ روزه' },
                { value: '30', label: '۳۰ روزه' }
              ]}
            />
          </Field>
        </div>
      </Sheet>

      {/* شیت ۲: جزئیات ۱۱ شاخص بازار */}
      <Sheet
        open={indicatorsSheetOpen}
        onClose={() => setIndicatorsSheetOpen(false)}
        title={`جزئیات ۱۱ شاخص بازار — ${activeVisual.nameFa}`}
        description="این ۱۱ شاخص از روی حرکت‌های اخیر قیمت محاسبه شده‌اند تا تصویر دقیق‌تری از جهت، قدرت و نوسان بازار بدهند."
        size="lg"
      >
        {committeeInput ? (
          <IndicatorsMatrixView rows={indicatorRows} input={committeeInput} />
        ) : (
          <p className="py-4 text-sm text-muted">در حال دریافت اطلاعات قیمتی…</p>
        )}
      </Sheet>

      {/* شیت ۳: سابقهٔ تصمیم‌ها */}
      <Sheet
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        title="سابقهٔ تصمیم‌ها و نتیجهٔ واقعی آن‌ها"
        description="هر تحلیلی که انجام می‌دهید اینجا ذخیره می‌شود و با قیمت امروز مقایسه می‌شود تا در تصمیم‌های بعدی از تجربه‌های قبلی استفاده شود."
        size="lg"
        footer={
          memory.length > 0 ? (
            <div className="flex justify-between gap-3">
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 />}
                onClick={() => {
                  setMemory([]);
                  saveMemory([]);
                }}
              >
                پاک کردن سابقه
              </Button>
              <Button size="sm" onClick={() => setMemoryOpen(false)}>
                بستن
              </Button>
            </div>
          ) : undefined
        }
      >
        <MemoryLogList entries={memory} />
      </Sheet>
    </div>
  );
}

// ─── ۰) شیت انتخابگر بازار ────────────────────────────────────────────────────

function MarketPickerSheet({
  open,
  onClose,
  markets,
  activeCoin,
  onSelect
}: {
  open: boolean;
  onClose: () => void;
  markets: PerpMarket[];
  activeCoin: string;
  onSelect: (coin: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');

  const enriched = useMemo(
    () =>
      markets.map((m) => {
        const visual = resolveMarketVisual(m.coin);
        return { market: m, visual };
      }),
    [markets]
  );

  const counts = useMemo(() => {
    const c = { all: enriched.length, crypto: 0, commodity: 0, equity: 0, fx: 0 };
    for (const item of enriched) c[item.visual.category]++;
    return c;
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter(({ market: m, visual: v }) => {
      if (category !== 'all' && v.category !== category) return false;
      if (!q) return true;
      return (
        m.coin.toLowerCase().includes(q) ||
        v.base.toLowerCase().includes(q) ||
        v.ticker.toLowerCase().includes(q) ||
        v.nameFa.toLowerCase().includes(q) ||
        MARKET_CATEGORY_FA[v.category].label.toLowerCase().includes(q)
      );
    });
  }, [enriched, category, query]);

  const categories: { id: CategoryFilter; label: string; count: number }[] = [
    { id: 'all', label: 'همه بازارها', count: counts.all },
    { id: 'crypto', label: 'رمزارزها', count: counts.crypto },
    { id: 'commodity', label: 'طلا، نفت و کالا', count: counts.commodity },
    { id: 'equity', label: 'سهام و شاخص', count: counts.equity },
    { id: 'fx', label: 'ارزهای جهانی', count: counts.fx }
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="انتخاب دارایی برای بررسی"
      description="نام فارسی (مثلاً طلا، نفت، انویدیا، بیت‌کوین) یا نماد انگلیسی را جستجو کنید."
      size="lg"
    >
      <div className="space-y-3 py-1">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="جستجو (مثلاً: بیت‌کوین، طلا، نفت، انویدیا، تسلا…)"
          className="w-full"
        />

        <div
          role="tablist"
          aria-label="دسته‌بندی بازارها"
          className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-1"
        >
          {categories.map((cat) => {
            const selected = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setCategory(cat.id)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition',
                  selected
                    ? 'bg-[#0B1B5C] text-white shadow-2xs'
                    : 'bg-surface-2 text-muted hover:bg-surface-2/80 hover:text-ink'
                )}
              >
                <span>{cat.label}</span>
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.2 text-[10px]',
                    selected ? 'bg-white/20 text-white' : 'bg-card text-subtle'
                  )}
                >
                  {toFaDigits(cat.count)}
                </span>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">
            دارایی با عبارت «{query}» در این دسته پیدا نشد.
          </div>
        ) : (
          <div className="grid max-h-[60vh] gap-2 overflow-y-auto pe-1 sm:grid-cols-2">
            {filtered.slice(0, 120).map(({ market: m, visual: v }) => {
              const selected = m.coin.toUpperCase() === activeCoin.toUpperCase();
              const catMeta = MARKET_CATEGORY_FA[v.category];
              return (
                <button
                  key={m.coin}
                  type="button"
                  onClick={() => onSelect(m.coin)}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-2xl border p-3 text-start transition',
                    selected
                      ? 'border-accent bg-accent-soft/50 ring-1 ring-accent'
                      : 'border-divider bg-surface-2/50 hover:border-accent/40 hover:bg-surface-2'
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <MarketAssetLogo symbol={v.logoKey} size={36} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-xs font-extrabold text-ink sm:text-sm">
                          {v.nameFa}
                        </span>
                        <span
                          dir="ltr"
                          className="rounded bg-card px-1.5 py-0.5 text-[10px] font-bold text-muted ring-1 ring-divider"
                        >
                          {v.ticker}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-subtle">
                        <Badge tone={catMeta.tone} className="px-1.5 py-0 text-[9px]">
                          {catMeta.short}
                        </Badge>
                        <span>سقف اهرم {toFaDigits(m.maxLeverage)} برابر</span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 text-end">
                    <div className="text-xs font-extrabold text-ink sm:text-sm">
                      <PriceUsd value={m.markPx} unitClassName="text-[10px] font-normal text-muted" />
                    </div>
                    {m.change24h !== null && (
                      <div className="mt-0.5">
                        <SignedPct
                          value={m.change24h}
                          digits={2}
                          className={cn('text-2xs font-bold', m.change24h >= 0 ? 'text-positive' : 'text-negative')}
                        />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ─── ۱) کارت خلاصهٔ وضعیت فعلی بازار (قبل از اجرای مناظره) ──────────────────────

function LiveQuantitativePreReadCard({
  visual,
  input,
  baseline,
  busy,
  onRun,
  onOpenIndicators
}: {
  visual: ReturnType<typeof resolveMarketVisual>;
  input: CommitteeMarketInput;
  baseline: ReturnType<typeof buildDeterministicCommitteeBaseline>;
  busy: boolean;
  onRun: () => void;
  onOpenIndicators: () => void;
}) {
  const { technical: t, derivatives: d, macroRegime } = input;
  const bandMeta = SENTIMENT_BAND_FA[baseline.sentimentBand];
  const scorePct = Math.min(100, Math.max(0, baseline.sentimentScore * 10));
  const bullCount = useMemo(
    () => buildIndicatorDiagnostics(t).filter((r) => r.signal === 'bullish').length,
    [t]
  );
  const bearCount = useMemo(
    () => buildIndicatorDiagnostics(t).filter((r) => r.signal === 'bearish').length,
    [t]
  );

  const buyerStrength = describeBuyerStrength(t.rsi14);
  const macroMood = describeMacroMood(macroRegime?.state);

  const scoreToneClass =
    baseline.sentimentScore >= 5.6
      ? 'bg-gain/10 text-positive border-gain/25'
      : baseline.sentimentScore <= 4.4
        ? 'bg-negative/10 text-negative border-negative/25'
        : 'bg-[#0B1B5C]/[0.06] text-[#0B1B5C] border-[#0B1B5C]/15';

  const barColorClass =
    baseline.sentimentScore >= 5.6
      ? 'bg-gain'
      : baseline.sentimentScore <= 4.4
        ? 'bg-loss'
        : 'bg-[#2E5BFF]';

  return (
    <Surface variant="focal" className="overflow-hidden p-0">
      <div className="p-4 sm:p-5">
        {/* ردیف عنوان و امتیاز کلی */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="shrink-0 rounded-full ring-2 ring-divider">
              <MarketAssetLogo symbol={visual.logoKey} size={46} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-2xs font-bold text-accent">خلاصهٔ وضعیت فعلی بازار</span>
                <span className="text-2xs text-subtle">· برآورد زنده از ۱۱ شاخص</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-extrabold text-ink sm:text-xl">
                  {visual.nameFa} · <PriceUsd value={t.close} />
                </h3>
                <Badge tone={bandMeta.tone}>{bandMeta.label}</Badge>
                <Badge tone="neutral">{CONFIDENCE_FA[baseline.confidence]}</Badge>
              </div>
            </div>
          </div>

          <div className={cn('rounded-2xl border px-4 py-2 text-center', scoreToneClass)}>
            <span className="block text-[10px] font-bold opacity-80">امتیاز کلی بازار</span>
            <div className="mt-0.5 flex items-baseline justify-center gap-1">
              <bdi dir="ltr" className="num-ltr text-2xl font-black">
                {toFaDigits(baseline.sentimentScore.toFixed(1))}
              </bdi>
              <span className="text-xs font-semibold opacity-75">از ۱۰</span>
            </div>
          </div>
        </div>

        {/* نوار دوقطبی امتیاز با نشانگر میانه */}
        <div className="mt-5 rounded-2xl bg-surface-2/60 p-3.5">
          <div className="mb-2 flex items-center justify-between text-[11px] font-bold text-muted">
            <span>فشار فروش (۰)</span>
            <span>تعادل (۵)</span>
            <span>قدرت خرید (۱۰)</span>
          </div>
          <div dir="ltr" className="relative h-2.5 overflow-hidden rounded-full bg-card ring-1 ring-divider/80">
            {/* خط وسط تعادل */}
            <span className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-divider" aria-hidden />
            <div
              className={cn('h-full rounded-full transition-all duration-300', barColorClass)}
              style={{ width: `${scorePct}%` }}
            />
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-gain/10 px-2.5 py-0.5 text-[11px] font-bold text-positive">
                {toFaDigits(bullCount)} نشانهٔ مثبت
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-negative/10 px-2.5 py-0.5 text-[11px] font-bold text-negative">
                {toFaDigits(bearCount)} نشانهٔ منفی
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted">
              <span>فضای کلی بازارها:</span>
              <Badge tone={macroMood.tone} className="text-[10px]">
                {macroMood.label}
              </Badge>
            </div>
          </div>
        </div>

        {/* ۴ کارت خوانش ساده و قابل فهم */}
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-divider/70 bg-card p-3.5 shadow-2xs">
            <dt className="flex items-center gap-1.5 text-2xs font-bold text-muted">
              <Activity className="h-3.5 w-3.5 text-accent" aria-hidden />
              <span>جهت کلی قیمت</span>
            </dt>
            <dd className="mt-2 text-sm font-extrabold text-ink">
              {t.trendRegime === 'bullish'
                ? 'رو به بالا (صعودی)'
                : t.trendRegime === 'bearish'
                  ? 'رو به پایین (نزولی)'
                  : 'درجا و نوسانی'}
            </dd>
            <dd className="mt-1 text-2xs text-subtle">
              میانگین ۵۰ دوره:{' '}
              <PriceUsd value={t.close50Sma} className="font-semibold text-muted" unitClassName="text-2xs text-subtle" />
            </dd>
          </div>

          <div className="rounded-2xl border border-divider/70 bg-card p-3.5 shadow-2xs">
            <dt className="flex items-center gap-1.5 text-2xs font-bold text-muted">
              <Gauge className="h-3.5 w-3.5 text-accent" aria-hidden />
              <span>قدرت خریداران</span>
            </dt>
            <dd className="mt-2 text-sm font-extrabold text-ink">{buyerStrength.label}</dd>
            <dd className="mt-1 text-2xs text-subtle">
              شتاب حرکت:{' '}
              <span
                className={cn(
                  'font-semibold',
                  t.macdh !== null && t.macdh > 0
                    ? 'text-positive'
                    : t.macdh !== null && t.macdh < 0
                      ? 'text-negative'
                      : 'text-muted'
                )}
              >
                {t.macdh !== null ? (t.macdh >= 0 ? 'مثبت و رو به بالا' : 'منفی و رو به پایین') : 'نامشخص'}
              </span>
            </dd>
          </div>

          <div className="rounded-2xl border border-divider/70 bg-card p-3.5 shadow-2xs">
            <dt className="flex items-center gap-1.5 text-2xs font-bold text-muted">
              <ShieldAlert className="h-3.5 w-3.5 text-accent" aria-hidden />
              <span>نوسان و حد ضرر امن</span>
            </dt>
            <dd className="mt-2 text-sm font-extrabold text-ink">
              نوسان معمول: <PlainPct value={t.atrPct} className="text-ink" />
            </dd>
            <dd className="mt-1 text-2xs text-subtle">
              حد ضرر خرید:{' '}
              <PriceUsd value={baseline.atrStopLong} className="font-semibold text-negative" unitClassName="text-2xs text-subtle" />
            </dd>
          </div>

          <div className="rounded-2xl border border-divider/70 bg-card p-3.5 shadow-2xs">
            <dt className="flex items-center gap-1.5 text-2xs font-bold text-muted">
              <Wallet className="h-3.5 w-3.5 text-accent" aria-hidden />
              <span>مبلغ پیشنهادی ورود</span>
            </dt>
            <dd className="mt-2 text-sm font-extrabold text-ink">
              {baseline.recommendedSizeUsd ? <UsdShort value={baseline.recommendedSizeUsd} /> : '—'}
            </dd>
            <dd className="mt-1 text-2xs text-subtle">
              سقف اهرم امن: {d.safeLeverage7d ? `تا ${toFaDigits(d.safeLeverage7d)} برابر` : 'بدون اهرم'}
            </dd>
          </div>
        </dl>
      </div>

      {/* نوار دعوت به اقدام پایین کارت */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider/80 bg-[#0B1B5C]/[0.03] px-4 py-3 text-xs sm:px-5">
        <span className="text-muted">
          برای دیدن گفت‌وگوی کامل موافقان و مخالفان خرید و دریافت قیمت دقیق ورود و حد ضرر، مناظره را شروع کنید.
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={onOpenIndicators} className="font-bold text-accent hover:underline">
            جزئیات ۱۱ شاخص ←
          </button>
          <Button size="sm" loading={busy} icon={<Sparkles />} onClick={onRun}>
            شروع مناظره
          </Button>
        </div>
      </div>
    </Surface>
  );
}

// ─── ۲) کارت کانونی نتیجهٔ نهایی کمیته و نقشهٔ معامله ─────────────────────────

function ExecutiveVerdictHero({
  coin,
  visual,
  input,
  report,
  maxLeverage,
  onDownloadHtml
}: {
  coin: string;
  visual: ReturnType<typeof resolveMarketVisual>;
  input: CommitteeMarketInput;
  report: TradingAgentsReport;
  maxLeverage: number;
  onDownloadHtml: () => void;
}) {
  const pm = report.riskDebate.portfolioDecision;
  const tp = report.traderProposal;
  const meta = RATING_FA[pm.rating];
  const traderMeta = TRADER_ACTION_FA[tp.action];
  const targetPx = pm.priceTarget ?? tp.takeProfit;
  const geometry = computeTradeGeometry(tp.entryPrice ?? input.technical.close, tp.stopLoss, targetPx);
  const side = meta.direction < 0 ? 'short' : 'long';
  const safeLev = Math.min(input.derivatives.safeLeverage7d ?? 2, maxLeverage);

  const depthLabel = input.researchDepth === 1 ? 'سریع' : input.researchDepth === 2 ? 'متعادل' : 'عمیق';
  const accentBar =
    meta.tone === 'gain'
      ? 'bg-gain'
      : meta.tone === 'loss'
        ? 'bg-negative'
        : meta.tone === 'warn'
          ? 'bg-warn'
          : 'bg-[#0B1B5C]';

  return (
    <Surface variant="focal" className="overflow-hidden p-0">
      <div className={cn('h-1.5 w-full', accentBar)} aria-hidden />

      <div className="p-4 sm:p-5">
        {/* ردیف عنوان و نتیجهٔ نهایی */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <span className="shrink-0 rounded-full ring-2 ring-divider">
              <MarketAssetLogo symbol={visual.logoKey} size={46} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-2xs font-bold text-accent">نتیجهٔ نهایی کمیته</span>
                <span className="text-2xs text-subtle">· دقت بررسی: {depthLabel}</span>
              </div>
              <h3 className="mt-1 text-lg font-extrabold text-ink sm:text-xl">
                {visual.nameFa} — {meta.label}
              </h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={meta.tone} className="px-3 py-1 text-xs font-extrabold">
              {meta.short}
            </Badge>
            <Badge tone={traderMeta.tone} className="px-3 py-1 text-xs">
              اقدام پیشنهادی: {traderMeta.short}
            </Badge>
          </div>
        </div>

        {/* خلاصهٔ روان برای کاربر */}
        <p className="mt-3.5 rounded-2xl bg-surface-2/60 p-3.5 text-sm leading-7 text-ink">
          {pm.executiveSummary}
        </p>

        {/* نقشهٔ عددی معامله (ورود / حد ضرر / هدف سود / نسبت سود به زیان) */}
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-divider/70 bg-card p-3.5">
            <dt className="text-2xs font-bold text-muted">قیمت ورود پیشنهادی</dt>
            <dd className="mt-1.5 text-sm font-extrabold text-ink">
              <PriceUsd value={tp.entryPrice ?? input.technical.close} unitClassName="text-[0.75em] font-medium text-muted" />
            </dd>
            <dd className="mt-1 text-2xs text-subtle">بازهٔ زمانی: {pm.timeHorizon}</dd>
          </div>

          <div className="rounded-2xl border border-negative/25 bg-negative/[0.04] p-3.5">
            <dt className="text-2xs font-bold text-negative">حد ضرر پیشنهادی</dt>
            <dd className="mt-1.5 text-sm font-extrabold text-negative">
              <PriceUsd value={tp.stopLoss} unitClassName="text-[0.75em] font-medium text-muted" />
            </dd>
            <dd className="mt-1 text-2xs text-subtle">
              فاصله تا حد ضرر: <PlainPct value={geometry.stopDistancePct} />
            </dd>
          </div>

          <div className="rounded-2xl border border-gain/25 bg-gain/[0.04] p-3.5">
            <dt className="text-2xs font-bold text-positive">هدف سود</dt>
            <dd className="mt-1.5 text-sm font-extrabold text-positive">
              <PriceUsd value={targetPx} unitClassName="text-[0.75em] font-medium text-muted" />
            </dd>
            <dd className="mt-1 text-2xs text-subtle">
              فاصله تا هدف:{' '}
              {geometry.targetDistancePct !== null ? (
                <SignedPct value={Math.abs(geometry.targetDistancePct)} />
              ) : (
                '—'
              )}
            </dd>
          </div>

          <div className="rounded-2xl border border-divider/70 bg-card p-3.5">
            <dt className="flex items-center gap-1 text-2xs font-bold text-muted">
              <Target className="h-3.5 w-3.5 text-accent" aria-hidden />
              <span>نسبت سود به زیان</span>
            </dt>
            <dd className="mt-1.5 text-sm font-extrabold text-ink">
              {geometry.riskRewardRatio !== null ? (
                <span>
                  ۱ به <bdi dir="ltr" className="num-ltr">{toFaDigits(geometry.riskRewardRatio)}</bdi>
                </span>
              ) : (
                '—'
              )}
            </dd>
            <dd className="mt-1 truncate text-2xs text-subtle" title={tp.positionSizing}>
              {tp.positionSizing}
            </dd>
          </div>
        </dl>

        {/* نوار اقدام پایین کارت */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-3.5 text-xs">
          <span className="text-muted">
            این گزارش تحلیل آموزشی است و توصیهٔ قطعی خرید یا فروش نیست.
          </span>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" icon={<Download />} onClick={onDownloadHtml}>
              دانلود گزارش کامل
            </Button>
            {meta.direction !== 0 && (
              <Link
                to={`/journal?tab=plan&m=${encodeURIComponent(coin)}&side=${side}&lev=${safeLev}`}
                className="inline-flex min-h-[36px] items-center rounded-xl bg-[#0B1B5C] px-3.5 py-1.5 font-bold text-white transition hover:bg-[#1F47E0]"
              >
                ثبت در برنامهٔ معامله ←
              </Link>
            )}
          </div>
        </div>
      </div>
    </Surface>
  );
}

// ─── ۳) نماهای داخلی ۴ تب مناظره ─────────────────────────────────────────────

function ResearchDebateView({ report }: { report: TradingAgentsReport }) {
  const rd = report.researchDebate;
  const tp = report.traderProposal;
  const planMeta = RATING_FA[rd.researchPlan.recommendation];

  return (
    <div className="space-y-4">
      <div className="grid gap-3.5 md:grid-cols-2">
        <div className="rounded-2xl border border-gain/25 bg-gain/[0.04] p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-2 text-xs font-extrabold text-positive">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gain/15 text-positive">
                <TrendingUp className="h-4 w-4" aria-hidden />
              </span>
              <span>دیدگاه موافق خرید</span>
            </h4>
            <Badge tone="gain">دلایل رشد</Badge>
          </div>
          <p className="mt-3 text-xs leading-7 text-ink whitespace-pre-wrap">{rd.bullHistory}</p>
        </div>

        <div className="rounded-2xl border border-negative/25 bg-negative/[0.04] p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-2 text-xs font-extrabold text-negative">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-negative/15 text-negative">
                <TrendingDown className="h-4 w-4" aria-hidden />
              </span>
              <span>دیدگاه مخالف و هشدارها</span>
            </h4>
            <Badge tone="loss">ریسک‌های افت</Badge>
          </div>
          <p className="mt-3 text-xs leading-7 text-ink whitespace-pre-wrap">{rd.bearHistory}</p>
        </div>
      </div>

      {/* جمع‌بندی داور + برنامهٔ عملیاتی */}
      <div className="divide-y divide-divider rounded-2xl border border-[#0B1B5C]/15 bg-[#0B1B5C]/[0.025] p-4">
        <div className="pb-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-extrabold text-[#0B1B5C]">جمع‌بندی داور مناظره</h4>
            <Badge tone={planMeta.tone}>{planMeta.label}</Badge>
          </div>
          <p className="mt-2 text-xs leading-7 text-ink whitespace-pre-wrap">{rd.researchPlan.rationale}</p>
          <p className="mt-2 rounded-xl bg-card px-3 py-2 text-xs leading-6 text-ink ring-1 ring-divider/70">
            <strong className="text-[#0B1B5C]">قدم پیشنهادی: </strong>
            {rd.researchPlan.strategicActions}
          </p>
        </div>

        <div className="pt-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-extrabold text-ink">برنامهٔ عملیاتی ورود و خروج</h4>
            <Badge tone={TRADER_ACTION_FA[tp.action].tone}>{TRADER_ACTION_FA[tp.action].label}</Badge>
          </div>
          <p className="mt-2 text-xs leading-7 text-muted whitespace-pre-wrap">{tp.reasoning}</p>
          <p className="mt-2 text-xs font-semibold text-ink">
            مبلغ و سقف ریسک پیشنهادی: <span className="font-normal text-muted">{tp.positionSizing}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function RiskCommitteeView({ report }: { report: TradingAgentsReport }) {
  const rk = report.riskDebate;
  const pm = rk.portfolioDecision;

  return (
    <div className="space-y-4">
      <div className="grid gap-3.5 lg:grid-cols-3">
        <div className="rounded-2xl border border-gain/20 bg-card p-4 shadow-2xs">
          <h4 className="flex items-center gap-2 text-xs font-extrabold text-positive">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gain/12 text-positive">
              <TrendingUp className="h-4 w-4" aria-hidden />
            </span>
            <span>دیدگاه جسورانه</span>
          </h4>
          <p className="mt-2.5 text-xs leading-7 text-muted whitespace-pre-wrap">{rk.aggressiveArgument}</p>
        </div>

        <div className="rounded-2xl border border-warn/25 bg-card p-4 shadow-2xs">
          <h4 className="flex items-center gap-2 text-xs font-extrabold text-warn">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-warn/12 text-warn">
              <ShieldAlert className="h-4 w-4" aria-hidden />
            </span>
            <span>دیدگاه محتاطانه</span>
          </h4>
          <p className="mt-2.5 text-xs leading-7 text-muted whitespace-pre-wrap">{rk.conservativeArgument}</p>
        </div>

        <div className="rounded-2xl border border-accent/25 bg-card p-4 shadow-2xs">
          <h4 className="flex items-center gap-2 text-xs font-extrabold text-accent">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Scale className="h-4 w-4" aria-hidden />
            </span>
            <span>دیدگاه میانه و متعادل</span>
          </h4>
          <p className="mt-2.5 text-xs leading-7 text-muted whitespace-pre-wrap">{rk.neutralArgument}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#0B1B5C]/15 bg-[#0B1B5C]/[0.03] p-4">
        <h4 className="flex items-center gap-2 text-xs font-extrabold text-[#0B1B5C]">
          <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
          <span>دلیل اصلی این تصمیم و زمانِ تغییر نظر</span>
        </h4>
        <p className="mt-2 text-xs leading-7 text-ink whitespace-pre-wrap">{pm.investmentThesis}</p>
      </div>
    </div>
  );
}

function AnalystsTeamView({ report }: { report: TradingAgentsReport }) {
  const a = report.analysts;
  const sr = a.sentimentReport;
  const bandMeta = SENTIMENT_BAND_FA[sr.overallBand];

  return (
    <div className="grid gap-3.5 md:grid-cols-2">
      <div className="rounded-2xl border border-divider/70 bg-card p-4 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-extrabold text-ink">۱. وضعیت نمودار و قیمت</h4>
          <Badge tone="neutral">۱۱ شاخص</Badge>
        </div>
        <p className="mt-2.5 text-xs leading-7 text-muted whitespace-pre-wrap">{a.marketReport}</p>
      </div>

      <div className="rounded-2xl border border-divider/70 bg-card p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-extrabold text-ink">۲. جوّ بازار و رفتار معامله‌گران</h4>
          <Badge tone={bandMeta.tone}>
            {bandMeta.label} · {toFaDigits(sr.overallScore)} از ۱۰
          </Badge>
        </div>
        <p className="mt-2.5 text-xs leading-7 text-muted whitespace-pre-wrap">{sr.narrative}</p>
      </div>

      <div className="rounded-2xl border border-divider/70 bg-card p-4 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-extrabold text-ink">۳. فضای کلی بازارها</h4>
          <Badge tone="neutral">روند کلی</Badge>
        </div>
        <p className="mt-2.5 text-xs leading-7 text-muted whitespace-pre-wrap">{a.newsMacroReport}</p>
      </div>

      <div className="rounded-2xl border border-divider/70 bg-card p-4 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-extrabold text-ink">۴. حجم معاملات و نقدشوندگی</h4>
          <Badge tone="neutral">عمق بازار</Badge>
        </div>
        <p className="mt-2.5 text-xs leading-7 text-muted whitespace-pre-wrap">{a.fundamentalsReport}</p>
      </div>
    </div>
  );
}

function IndicatorsMatrixView({
  rows,
  input
}: {
  rows: IndicatorDiagnosticRow[];
  input: CommitteeMarketInput;
}) {
  const toneFor = (s: IndicatorDiagnosticRow['signal']) =>
    s === 'bullish' ? 'gain' : s === 'bearish' ? 'loss' : 'neutral';

  const categoryLabel: Record<IndicatorDiagnosticRow['category'], string> = {
    روند: 'جهت قیمت',
    مومنتوم: 'قدرت و شتاب',
    نوسان: 'محدودهٔ نوسان',
    'حجم و ساختار': 'حجم معاملات'
  };

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-2/60 px-3.5 py-2.5 text-xs text-muted">
        <span>
          قیمت فعلی: <PriceUsd value={input.technical.close} className="font-bold text-ink" /> · بررسی روی{' '}
          <strong className="text-ink">{toFaDigits(input.technical.barsCount)}</strong> بازهٔ ۴ ساعته
        </span>
        <span>
          کف و سقف اخیر:{' '}
          <PriceUsd value={input.technical.support20} className="font-bold text-ink" unitClassName="text-2xs text-muted" /> تا{' '}
          <PriceUsd value={input.technical.resistance20} className="font-bold text-ink" unitClassName="text-2xs text-muted" />
        </span>
      </div>

      {/* نمایش کارتی برای موبایل */}
      <div className="grid gap-2.5 sm:hidden">
        {rows.map((r) => (
          <div key={r.key} className="rounded-2xl border border-divider/70 bg-card p-3.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-ink">{r.nameFa}</span>
              <Badge tone={toneFor(r.signal)}>{r.signalFa}</Badge>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-2xs text-muted">{r.noteFa}</span>
              <bdi dir="ltr" className="num-ltr font-extrabold text-ink">
                {fmtPrice(r.value)}
              </bdi>
            </div>
          </div>
        ))}
      </div>

      {/* جدول خوانا برای دسکتاپ */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="data-table is-compact">
          <thead>
            <tr>
              <th scope="col">شاخص</th>
              <th scope="col">بخش</th>
              <th scope="col" className="col-num">مقدار فعلی</th>
              <th scope="col">نتیجه</th>
              <th scope="col">به زبان ساده چه می‌گوید؟</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="font-bold text-ink">
                  {r.nameFa}
                </th>
                <td className="text-xs text-muted">{categoryLabel[r.category]}</td>
                <td className="col-num num-ltr font-bold text-ink">{fmtPrice(r.value)}</td>
                <td>
                  <Badge tone={toneFor(r.signal)}>{r.signalFa}</Badge>
                </td>
                <td className="text-xs text-muted">{r.noteFa}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MemoryLogList({ entries }: { entries: TradingMemoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted">
        هنوز تحلیلی ثبت نشده است. بعد از هر بار اجرای مناظره، نتیجه و قیمت همان روز اینجا ذخیره می‌شود تا بتوانید عملکرد واقعی آن را ببینید.
      </div>
    );
  }

  return (
    <div className="space-y-2.5 py-2">
      {entries.map((e) => {
        const rMeta = RATING_FA[e.rating];
        const v = resolveMarketVisual(e.coin);
        return (
          <div key={e.id} className="space-y-2 rounded-2xl border border-divider/80 bg-surface-2/50 p-3.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MarketAssetLogo symbol={v.logoKey} size={24} />
                <span className="text-sm font-extrabold text-ink">{v.nameFa}</span>
                <Badge tone={rMeta.tone}>{rMeta.short}</Badge>
              </div>
              <bdi dir="ltr" className="num-ltr text-2xs text-subtle">
                {e.analysisDate}
              </bdi>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-2xs text-muted">
              <span>
                قیمت زمان تحلیل: <PriceUsd value={e.entryPrice} className="font-bold text-ink" unitClassName="text-2xs text-muted" />
              </span>
              {e.stopLoss && (
                <span>
                  حد ضرر: <PriceUsd value={e.stopLoss} className="font-bold text-negative" unitClassName="text-2xs text-muted" />
                </span>
              )}
              {e.priceTarget && (
                <span>
                  هدف سود: <PriceUsd value={e.priceTarget} className="font-bold text-positive" unitClassName="text-2xs text-muted" />
                </span>
              )}
              <span>
                تغییر تا امروز:{' '}
                <SignedPct
                  value={e.realizedReturnPct}
                  digits={2}
                  className={cn(
                    'font-bold',
                    e.realizedReturnPct && e.realizedReturnPct > 0
                      ? 'text-positive'
                      : e.realizedReturnPct && e.realizedReturnPct < 0
                        ? 'text-negative'
                        : 'text-ink'
                  )}
                />
              </span>
            </div>

            <p className="text-xs leading-6 text-ink">{e.executiveSummary}</p>
            {e.lesson && <p className="border-t border-divider/70 pt-1.5 text-2xs text-subtle">{e.lesson}</p>}
          </div>
        );
      })}
    </div>
  );
}
