/**
 * تب «کمیته ایجنت‌ها» (TradingAgents) در میز معامله دارینو — بازطراحی مینیمال برای وب و PWA
 *
 * معماری ۴ مرحله‌ای مخزن TauricResearch/TradingAgents:
 *   ۱) نوار کنترل مینیمال + شیت تنظیمات سایزینگ (سازگار با هدف لمسی ۴۴ پیکسل و safe-area در PWA)
 *   ۲) کارت کانونی پیش‌خوانش کمی + نوار دوقطبی امتیاز (۰ تا ۱۰) و هندسه استاپ/هدف مبتنی بر ATR
 *   ۳) محیط تعاملی و تب‌بندی‌شده برای ۴ مرحله کمیته (مناظره Bull/Bear · کمیته ریسک ۳ نفره · ۴ تحلیلگر · جدول ۱۱ اندیکاتور)
 *   ۴) شیت «حافظه تصمیم‌ها و تسویه خودکار» (Memory Log) و خروجی گزارش تک‌صفحه‌ای HTML
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  Download,
  History,
  Scale,
  Settings2,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Layers
} from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge, StatusDot } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Sheet } from '@/shared/components/ui/Sheet';
import { ErrorState, ListSkeleton, Notice } from '@/shared/components/ui/StateViews';
import { fetchJson } from '@/repositories/remoteClient';
import { cn } from '@/shared/lib/cn';
import { toFaDigits } from '@/shared/utils/formatters';
import { usePerpMarkets, useRiskCandles, useFundingStats, useSwing } from '../data/intelApi';
import { assess, buildRiskModel } from '../domain/survival';
import {
  CONFIDENCE_FA,
  RATING_FA,
  SENTIMENT_BAND_FA,
  TRADER_ACTION_FA,
  buildDeterministicCommitteeBaseline,
  buildIndicatorDiagnostics,
  buildPastLessonsContext,
  computeTechnicalSnapshot,
  computeTradeGeometry,
  renderCompleteReportHtml,
  settleMemoryEntries,
  type CommitteeMarketInput,
  type IndicatorDiagnosticRow,
  type TradingAgentsReport,
  type TradingMemoryEntry
} from '../domain/tradingAgents';
import { fmtPrice, UsdShort } from './parts';

const MEMORY_STORAGE_KEY = 'darino:trading-agents:memory:v1';
const MARKETS_LIMIT = 40;

type StageView = 'debate' | 'risk' | 'analysts' | 'indicators';

const pct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '—'
    : `${v > 0 ? '+' : ''}${toFaDigits(v.toLocaleString('en-US', { maximumFractionDigits: digits }))}٪`;

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

export function TradingAgentsTab({
  market,
  onChangeMarket,
  onSelectCoin
}: {
  market: string;
  onChangeMarket: (coin: string) => void;
  onSelectCoin: (coin: string) => void;
}) {
  const markets = usePerpMarkets();
  const selectedMarket = markets.data?.find((x) => x.coin === market) ?? markets.data?.[0] ?? null;
  const activeCoin = selectedMarket?.coin ?? market;

  const candles = useRiskCandles(selectedMarket ? activeCoin : null);
  const funding = useFundingStats(selectedMarket ? activeCoin : null, selectedMarket?.fundingHourly ?? null);
  const swing = useSwing();

  const [depth, setDepth] = useState<1 | 2 | 3>(1);
  const [cashInput, setCashInput] = useState('10000');
  const [riskPctInput, setRiskPctInput] = useState('1');
  const [holdingDaysInput, setHoldingDaysInput] = useState<'5' | '14' | '30'>('14');
  const [stageView, setStageView] = useState<StageView>('debate');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [indicatorsSheetOpen, setIndicatorsSheetOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<TradingAgentsReport | null>(null);
  const [reportCoin, setReportCoin] = useState<string | null>(null);
  const [memory, setMemory] = useState<TradingMemoryEntry[]>(loadMemory);

  const marketOptions = useMemo(() => {
    const top = (markets.data ?? []).slice(0, MARKETS_LIMIT);
    return selectedMarket && !top.includes(selectedMarket) ? [selectedMarket, ...top] : top;
  }, [markets.data, selectedMarket]);

  // تسویه خودکار تصمیم‌های قبلی در Memory Log با قیمت‌های زنده بازار
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
      pastLessons: buildPastLessonsContext(memory, activeCoin, 4)
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
    try {
      const res = await fetchJson<{ report: TradingAgentsReport; generatedAt: number }>(
        '/api/integrations?op=analyze-trading-agents',
        {
          method: 'POST',
          body: committeeInput,
          timeoutMs: 115_000
        }
      );
      setReport(res.report);
      setReportCoin(activeCoin);
      setStageView('debate');

      const pm = res.report.riskDebate.portfolioDecision;
      const tp = res.report.traderProposal;
      const newEntry: TradingMemoryEntry = {
        id: `${activeCoin}-${Date.now()}`,
        coin: activeCoin,
        analysisDate: committeeInput.analysisDate,
        createdAt: res.generatedAt || Date.now(),
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'اجرای کمیته ایجنت‌ها با خطا روبه‌رو شد');
    } finally {
      setBusy(false);
    }
  }

  function downloadHtmlReport() {
    if (!committeeInput || !report) return;
    const html = renderCompleteReportHtml(committeeInput, report);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tradingagents_${activeCoin}_${committeeInput.analysisDate}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (markets.isLoading) return <ListSkeleton rows={4} />;
  if (markets.isError) return <ErrorState message="بازارهای هایپرلیکوئید دریافت نشد" onRetry={() => void markets.refetch()} />;

  const activeReport = report && reportCoin === activeCoin ? report : null;

  return (
    <div className="space-y-4">
      {/* ۱) نوار کنترل مینیمال — وب و PWA */}
      <Surface className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-12 sm:items-end">
          <div className="sm:col-span-5">
            <Field label="بازار مورد بررسی">
              <Select value={activeCoin} onChange={(e) => onChangeMarket(e.target.value)}>
                {marketOptions.map((o) => (
                  <option key={o.coin} value={o.coin}>
                    {o.coin} · {fmtPrice(o.markPx)} دلار ({o.change24h !== null ? (o.change24h >= 0 ? '+' : '') + o.change24h.toFixed(1) + '%' : '—'})
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="sm:col-span-4">
            <Field label="عمق مناظره ایجنت‌ها">
              <SegmentedControl<string>
                fill
                label="عمق مناظره"
                value={String(depth)}
                onChange={(v) => setDepth((Number(v) as 1 | 2 | 3) || 1)}
                options={[
                  { value: '1', label: '۱ دور' },
                  { value: '2', label: '۲ دور' },
                  { value: '3', label: '۳ دور' }
                ]}
              />
            </Field>
          </div>

          <div className="sm:col-span-3">
            <Button
              className="w-full"
              loading={busy}
              icon={<Sparkles />}
              disabled={!committeeInput || busy}
              onClick={() => void runCommittee()}
            >
              {busy ? 'در حال مناظره…' : 'اجرای کمیته'}
            </Button>
          </div>
        </div>

        {/* نوار وضعیت و دکمه‌های سریع دسترسی (سایزینگ، اندیکاتورها، حافظه) */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-control bg-surface-2 px-3 py-1.5 font-semibold text-ink transition hover:bg-accent-soft hover:text-accent"
            >
              <Settings2 className="h-3.5 w-3.5 text-muted" aria-hidden />
              <span>
                سایزینگ: <bdi dir="ltr">{toFaDigits(Number(cashInput || 0).toLocaleString('en-US'))}</bdi> دلار · ریسک{' '}
                <bdi dir="ltr">{toFaDigits(riskPctInput)}٪</bdi>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIndicatorsSheetOpen(true)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-control bg-surface-2 px-3 py-1.5 font-semibold text-ink transition hover:bg-accent-soft hover:text-accent"
            >
              <Layers className="h-3.5 w-3.5 text-muted" aria-hidden />
              <span>ماتریس ۱۱ اندیکاتور</span>
            </button>

            <button
              type="button"
              onClick={() => setMemoryOpen(true)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-control bg-surface-2 px-3 py-1.5 font-semibold text-ink transition hover:bg-accent-soft hover:text-accent"
            >
              <History className="h-3.5 w-3.5 text-muted" aria-hidden />
              <span>حافظه تصمیم‌ها ({toFaDigits(memory.length)})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => onSelectCoin(activeCoin)}
            className="font-semibold text-accent hover:underline"
          >
            پوزیشن برترها روی <bdi dir="ltr">{activeCoin}</bdi> ←
          </button>
        </div>

        {busy && (
          <div className="mt-3 rounded-field bg-accent-soft/60 px-3.5 py-2.5 text-xs text-ink" role="status">
            <div className="flex items-center gap-2 font-bold text-accent">
              <Bot className="h-4 w-4 animate-pulse" aria-hidden />
              <span>در حال اجرای زنجیره ۴ مرحله‌ای TradingAgents روی {activeCoin}…</span>
            </div>
            <p className="mt-1 text-muted">
              ۱. تحلیل ۱۱ اندیکاتور و فاندینگ ← ۲. مناظره پژوهشگر صعودی و نزولی ← ۳. تعیین استاپ ATR معامله‌گر ← ۴. کمیته ریسک و حکم مدیر پرتفولیو
            </p>
          </div>
        )}

        {error && <Notice tone="warn" className="mt-3">{error}</Notice>}
      </Surface>

      {/* ۲) کارت کانونی پیش‌خوانش کمی یا حکم نهایی کمیته */}
      {candles.isLoading ? (
        <ListSkeleton rows={3} />
      ) : !technical || !committeeInput || !baseline ? (
        <Notice tone="neutral">داده کندل کافی برای محاسبه اندیکاتورهای تکنیکال این نماد در دسترس نیست.</Notice>
      ) : (
        <>
          {activeReport ? (
            <ExecutiveVerdictHero
              coin={activeCoin}
              input={committeeInput}
              report={activeReport}
              maxLeverage={selectedMarket?.maxLeverage ?? 10}
              onDownloadHtml={downloadHtmlReport}
            />
          ) : (
            <LiveQuantitativePreReadCard
              coin={activeCoin}
              input={committeeInput}
              baseline={baseline}
              onOpenIndicators={() => setIndicatorsSheetOpen(true)}
            />
          )}

          {/* ۳) محیط تب‌بندی‌شده ۴ مرحله کمیته (وقتی گزارش آماده است) */}
          {activeReport && (
            <Surface className="overflow-hidden p-0">
              {/* نوار تب‌های لمسی با پشتیبانی از اسکرول افقی نرم در PWA */}
              <div
                role="tablist"
                aria-label="مراحل کمیته ایجنت‌ها"
                className="boros-account-tabs no-scrollbar flex items-center gap-1 overflow-x-auto border-b border-divider bg-surface-2/50 px-3 py-2"
              >
                {(
                  [
                    { id: 'debate', label: '۱. مناظره صعودی و نزولی', badge: RATING_FA[activeReport.researchDebate.researchPlan.recommendation].short },
                    { id: 'risk', label: '۲. کمیته ریسک (۳ دیدگاه)', badge: RATING_FA[activeReport.riskDebate.portfolioDecision.rating].short },
                    { id: 'analysts', label: '۳. گزارش ۴ تحلیلگر', badge: `${toFaDigits(activeReport.analysts.sentimentReport.overallScore)}/۱۰` },
                    { id: 'indicators', label: '۴. ماتریس ۱۱ اندیکاتور', badge: '۱۱ شاخص' }
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
                        'inline-flex shrink-0 items-center gap-2 rounded-control px-3.5 py-2 text-xs font-bold transition',
                        selected
                          ? 'bg-card text-accent shadow-sm ring-1 ring-divider'
                          : 'text-muted hover:bg-card/60 hover:text-ink'
                      )}
                    >
                      <span>{t.label}</span>
                      <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', selected ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-subtle')}>
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
                {stageView === 'indicators' && (
                  <IndicatorsMatrixView rows={indicatorRows} input={committeeInput} />
                )}
              </div>
            </Surface>
          )}
        </>
      )}

      {/* شیت ۱: تنظیمات سایزینگ، ریسک و افق ارزیابی (موبایل/PWA و دسکتاپ) */}
      <Sheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="تنظیمات سرمایه و مدیریت ریسک کمیته"
        description="این مقادیر به ایجنت معامله‌گر و مدیر پرتفولیو داده می‌شوند تا حجم پوزیشن و فاصله حد ضرر را متناسب با سرمایه شما تنظیم کنند."
        footer={
          <Button className="w-full" onClick={() => setSettingsOpen(false)}>
            ذخیره و بستن
          </Button>
        }
      >
        <div className="space-y-4 py-2">
          <Field label="سرمایه مبنای سایزینگ (دلار)" hint="حداکثر حجم پوزیشن بر اساس این عدد و فاصله ۲×ATR محاسبه می‌شود.">
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

          <Field label="حداکثر ریسک مجاز در هر معامله (درصد کل سرمایه)" hint="استاندارد مدیریت ریسک حرفه‌ای بین ۰.۵٪ تا ۲٪ در هر معامله است.">
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

          <Field label="افق زمانی ارزیابی در حافظه تصمیم‌ها (Memory Log)">
            <SegmentedControl<'5' | '14' | '30'>
              fill
              label="افق ارزیابی"
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

      {/* شیت ۲: ماتریس کامل ۱۱ اندیکاتور تکنیکال */}
      <Sheet
        open={indicatorsSheetOpen}
        onClose={() => setIndicatorsSheetOpen(false)}
        title={`ماتریس ۱۱ اندیکاتور تکنیکال — ${activeCoin}`}
        description="محاسبه‌شده روی کندل‌های ۴ ساعته طبق استاندارد ماژول market_analyst در مخزن TradingAgents."
        size="lg"
      >
        {committeeInput ? (
          <IndicatorsMatrixView rows={indicatorRows} input={committeeInput} />
        ) : (
          <p className="py-4 text-sm text-muted">داده کندل در حال بارگذاری است…</p>
        )}
      </Sheet>

      {/* شیت ۳: حافظه تصمیم‌ها و تسویه خودکار (Memory Log) */}
      <Sheet
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        title="حافظه تصمیم‌ها و تسویه خودکار (Memory Log)"
        description="هر حکم کمیته ذخیره می‌شود و با قیمت زنده بازار تسویه می‌گردد تا درس‌های قبلی به تصمیم بعدی مدیر پرتفولیو منتقل شوند."
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
                پاک کردن حافظه
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

// ─── ۱) کارت پیش‌خوانش کمی زنده (قبل از اجرای هوش مصنوعی) ──────────────────────

function LiveQuantitativePreReadCard({
  coin,
  input,
  baseline,
  onOpenIndicators
}: {
  coin: string;
  input: CommitteeMarketInput;
  baseline: ReturnType<typeof buildDeterministicCommitteeBaseline>;
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

  return (
    <Surface variant="focal" className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-2xs font-semibold text-muted">پیش‌خوانش کمی زنده (محاسبه مستقیم از ۱۱ اندیکاتور و فاندینگ)</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-extrabold text-ink">
              <bdi dir="ltr">{coin}</bdi> · <span className="num-ltr">{fmtPrice(t.close)}</span> دلار
            </h3>
            <Badge tone={bandMeta.tone}>{bandMeta.label}</Badge>
            <Badge tone="neutral">اطمینان: {CONFIDENCE_FA[baseline.confidence]}</Badge>
          </div>
        </div>

        <div className="text-end">
          <span className="text-2xs text-muted">امتیاز ترکیبی (۰ تا ۱۰)</span>
          <div className="mt-0.5 text-xl font-extrabold text-ink">
            <bdi dir="ltr">{toFaDigits(baseline.sentimentScore.toFixed(1))}</bdi>
            <span className="text-xs font-normal text-muted"> / ۱۰</span>
          </div>
        </div>
      </div>

      {/* نوار دوقطبی امتیاز کمی */}
      <div className="mt-3">
        <div dir="ltr" className="relative h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              baseline.sentimentScore >= 5.6
                ? 'bg-gain'
                : baseline.sentimentScore <= 4.4
                  ? 'bg-loss'
                  : 'bg-accent'
            )}
            style={{ width: `${scorePct}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-2xs text-subtle">
          <span>تراز ۱۱ اندیکاتور: {toFaDigits(bullCount)} صعودی در برابر {toFaDigits(bearCount)} نزولی</span>
          <span>
            رژیم کلان: {macroRegime?.state === 'on' ? 'صعودی (Risk-On)' : macroRegime?.state === 'off' ? 'محتاط (Risk-Off)' : 'در حال سنجش'}
          </span>
        </div>
      </div>

      {/* ۴ متریک کلیدی در یک نگاه */}
      <dl className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-field bg-surface-2/70 p-3">
          <dt className="text-2xs text-muted">روند و میانگین‌ها</dt>
          <dd className="mt-1 text-xs font-extrabold text-ink">
            {t.trendRegime === 'bullish' ? 'صعودی (بالای SMA50/200)' : t.trendRegime === 'bearish' ? 'نزولی (زیر SMA50/200)' : 'نوسانی / خنثی'}
          </dd>
          <dd className="mt-0.5 text-2xs text-subtle" dir="ltr">
            SMA50: {fmtPrice(t.close50Sma)}
          </dd>
        </div>

        <div className="rounded-field bg-surface-2/70 p-3">
          <dt className="text-2xs text-muted">مومنتوم (RSI 14 و MACD)</dt>
          <dd className="mt-1 text-xs font-extrabold text-ink">
            RSI: <bdi dir="ltr">{t.rsi14 !== null ? toFaDigits(t.rsi14.toFixed(1)) : '—'}</bdi>
          </dd>
          <dd className="mt-0.5 text-2xs text-subtle">
            مکدی: {t.macdh !== null ? (t.macdh >= 0 ? 'شتاب مثبت (+)' : 'شتاب منفی (−)') : '—'}
          </dd>
        </div>

        <div className="rounded-field bg-surface-2/70 p-3">
          <dt className="text-2xs text-muted">نوسان ATR و حد ضرر ۲×ATR</dt>
          <dd className="mt-1 text-xs font-extrabold text-ink">
            ATR: <bdi dir="ltr">{fmtPrice(t.atr14)}</bdi> ({pct(t.atrPct)})
          </dd>
          <dd className="mt-0.5 text-2xs text-subtle">
            استاپ لانگ: <bdi dir="ltr">{fmtPrice(baseline.atrStopLong)}</bdi>
          </dd>
        </div>

        <div className="rounded-field bg-surface-2/70 p-3">
          <dt className="text-2xs text-muted">حجم پیشنهادی و اهرم امن</dt>
          <dd className="mt-1 text-xs font-extrabold text-ink">
            {baseline.recommendedSizeUsd ? <UsdShort value={baseline.recommendedSizeUsd} /> : '—'}
          </dd>
          <dd className="mt-0.5 text-2xs text-subtle">
            اهرم امن ۷ روزه: {d.safeLeverage7d ? `تا ${toFaDigits(d.safeLeverage7d)}x` : 'بدون اهرم'}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-3 text-xs text-muted">
        <span>برای برگزاری مناظره کامل بین پژوهشگر صعودی، نزولی، معامله‌گر و کمیته ریسک دکمه «اجرای کمیته» را بزنید.</span>
        <button type="button" onClick={onOpenIndicators} className="font-semibold text-accent hover:underline">
          مشاهده جدول ۱۱ اندیکاتور ←
        </button>
      </div>
    </Surface>
  );
}

// ─── ۲) کارت کانونی حکم نهایی مدیر پرتفولیو و هندسه معامله ─────────────────────

function ExecutiveVerdictHero({
  coin,
  input,
  report,
  maxLeverage,
  onDownloadHtml
}: {
  coin: string;
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

  return (
    <Surface
      variant="focal"
      className={cn(
        'border-2 p-4 sm:p-5',
        meta.tone === 'gain'
          ? 'border-gain/50'
          : meta.tone === 'loss'
            ? 'border-negative/50'
            : meta.tone === 'warn'
              ? 'border-warn/50'
              : 'border-divider'
      )}
    >
      {/* ردیف عنوان و بج حکم نهایی */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusDot tone={meta.tone} label="حکم نهایی مدیر پرتفولیو (Portfolio Manager)" />
            <span className="text-2xs text-subtle">· عمق مناظره: {toFaDigits(input.researchDepth)} دور</span>
          </div>
          <h3 className="mt-1 text-lg font-extrabold text-ink sm:text-xl">
            <bdi dir="ltr">{coin}</bdi> — {meta.label}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={meta.tone} className="text-xs px-2.5 py-1">
            {meta.short} ({pm.rating})
          </Badge>
          <Badge tone={traderMeta.tone} className="text-xs px-2.5 py-1">
            تریدر: {traderMeta.short}
          </Badge>
        </div>
      </div>

      {/* خلاصه مدیریتی */}
      <p className="mt-3 text-sm leading-7 text-ink">{pm.executiveSummary}</p>

      {/* نوار هندسه معامله (ورود / حد ضرر / هدف / R:R) */}
      <dl className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-field bg-surface-2/70 p-3">
          <dt className="text-2xs text-muted">نقطه ورود مرجع</dt>
          <dd className="mt-1 text-sm font-extrabold text-ink" dir="ltr">
            {fmtPrice(tp.entryPrice ?? input.technical.close)}
          </dd>
          <dd className="mt-0.5 text-2xs text-subtle">افق: {pm.timeHorizon}</dd>
        </div>

        <div className="rounded-field bg-negative/5 border border-negative/20 p-3">
          <dt className="text-2xs text-muted">حد ضرر (مبتنی بر ATR)</dt>
          <dd className="mt-1 text-sm font-extrabold text-negative" dir="ltr">
            {fmtPrice(tp.stopLoss)}
          </dd>
          <dd className="mt-0.5 text-2xs text-subtle">
            فاصله: {geometry.stopDistancePct !== null ? `${toFaDigits(geometry.stopDistancePct.toFixed(1))}٪` : '—'}
          </dd>
        </div>

        <div className="rounded-field bg-gain/5 border border-gain/20 p-3">
          <dt className="text-2xs text-muted">هدف قیمتی کمیته</dt>
          <dd className="mt-1 text-sm font-extrabold text-positive" dir="ltr">
            {fmtPrice(targetPx)}
          </dd>
          <dd className="mt-0.5 text-2xs text-subtle">
            فاصله: {geometry.targetDistancePct !== null ? `+${toFaDigits(geometry.targetDistancePct.toFixed(1))}٪` : '—'}
          </dd>
        </div>

        <div className="rounded-field bg-surface-2/70 p-3">
          <dt className="text-2xs text-muted">نسبت ریسک به ریوارد (R:R)</dt>
          <dd className="mt-1 text-sm font-extrabold text-ink" dir="ltr">
            {geometry.riskRewardRatio !== null ? `1 : ${toFaDigits(geometry.riskRewardRatio)}` : '—'}
          </dd>
          <dd className="mt-0.5 truncate text-2xs text-subtle" title={tp.positionSizing}>
            {tp.positionSizing}
          </dd>
        </div>
      </dl>

      {/* نوار اقدام پایین کارت */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-3 text-xs">
        <span className="text-muted">
          این خروجی شبیه‌سازی پژوهشی کمیته ایجنت‌هاست و توصیه مالی قطعی نیست.
        </span>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" icon={<Download />} onClick={onDownloadHtml}>
            گزارش HTML
          </Button>
          {meta.direction !== 0 && (
            <Link
              to={`/journal?tab=plan&m=${encodeURIComponent(coin)}&side=${side}&lev=${safeLev}`}
              className="inline-flex min-h-[36px] items-center rounded-control bg-accent px-3.5 py-1.5 font-bold text-on-accent transition hover:bg-brand-600"
            >
              ثبت در برنامه معامله ژورنال ←
            </Link>
          )}
        </div>
      </div>
    </Surface>
  );
}

// ─── ۳) نماهای داخلی ۴ تب کمیته ──────────────────────────────────────────────

function ResearchDebateView({ report }: { report: TradingAgentsReport }) {
  const rd = report.researchDebate;
  const tp = report.traderProposal;
  const planMeta = RATING_FA[rd.researchPlan.recommendation];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-card border border-gain/25 bg-gain/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-extrabold text-positive">
              <TrendingUp className="h-4 w-4" aria-hidden />
              پژوهشگر صعودی (Bull Researcher)
            </h4>
            <Badge tone="gain">دفاع از صعود</Badge>
          </div>
          <p className="mt-2.5 text-xs leading-7 text-ink whitespace-pre-wrap">{rd.bullHistory}</p>
        </div>

        <div className="rounded-card border border-negative/25 bg-negative/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-xs font-extrabold text-negative">
              <TrendingDown className="h-4 w-4" aria-hidden />
              پژوهشگر نزولی (Bear Researcher)
            </h4>
            <Badge tone="loss">نقد و ریسک نزولی</Badge>
          </div>
          <p className="mt-2.5 text-xs leading-7 text-ink whitespace-pre-wrap">{rd.bearHistory}</p>
        </div>
      </div>

      {/* داوری مدیر پژوهش + طرح معامله‌گر */}
      <div className="divide-y divide-divider rounded-card bg-surface-2/70 p-4">
        <div className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-extrabold text-ink">داوری مدیر پژوهش (Research Manager)</h4>
            <Badge tone={planMeta.tone}>{planMeta.label}</Badge>
          </div>
          <p className="mt-2 text-xs leading-7 text-muted whitespace-pre-wrap">{rd.researchPlan.rationale}</p>
          <p className="mt-1.5 text-xs leading-6 text-ink">
            <strong>گام‌های راهبردی ابلاغی به تریدر:</strong> {rd.researchPlan.strategicActions}
          </p>
        </div>

        <div className="pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-extrabold text-ink">پیشنهاد اجرایی ایجنت معامله‌گر (Trader Agent)</h4>
            <Badge tone={TRADER_ACTION_FA[tp.action].tone}>{TRADER_ACTION_FA[tp.action].label}</Badge>
          </div>
          <p className="mt-1.5 text-xs leading-7 text-muted whitespace-pre-wrap">{tp.reasoning}</p>
          <p className="mt-1 text-xs font-semibold text-ink">مدیریت حجم و سایزینگ: {tp.positionSizing}</p>
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
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-card bg-surface-2/70 p-4">
          <h4 className="flex items-center gap-1.5 text-xs font-extrabold text-positive">
            <TrendingUp className="h-4 w-4" aria-hidden />
            تحلیلگر ریسک تهاجمی (Aggressive)
          </h4>
          <p className="mt-2 text-xs leading-7 text-muted whitespace-pre-wrap">{rk.aggressiveArgument}</p>
        </div>

        <div className="rounded-card bg-surface-2/70 p-4">
          <h4 className="flex items-center gap-1.5 text-xs font-extrabold text-warn">
            <ShieldAlert className="h-4 w-4" aria-hidden />
            تحلیلگر ریسک محافظه‌کار (Conservative)
          </h4>
          <p className="mt-2 text-xs leading-7 text-muted whitespace-pre-wrap">{rk.conservativeArgument}</p>
        </div>

        <div className="rounded-card bg-surface-2/70 p-4">
          <h4 className="flex items-center gap-1.5 text-xs font-extrabold text-accent">
            <Scale className="h-4 w-4" aria-hidden />
            تحلیلگر ریسک متوازن (Neutral)
          </h4>
          <p className="mt-2 text-xs leading-7 text-muted whitespace-pre-wrap">{rk.neutralArgument}</p>
        </div>
      </div>

      <div className="rounded-card border border-divider bg-surface-2/40 p-4">
        <h4 className="text-xs font-extrabold text-ink">تز کامل سرمایه‌گذاری و شرط ابطال (Portfolio Manager Thesis)</h4>
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
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-card bg-surface-2/70 p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-extrabold text-ink">۱. تحلیلگر تکنیکال بازار (Market Analyst)</h4>
          <Badge tone="neutral">۱۱ اندیکاتور</Badge>
        </div>
        <p className="mt-2 text-xs leading-7 text-muted whitespace-pre-wrap">{a.marketReport}</p>
      </div>

      <div className="rounded-card bg-surface-2/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-extrabold text-ink">۲. تحلیلگر احساسات و فاندینگ (Sentiment)</h4>
          <Badge tone={bandMeta.tone}>
            {bandMeta.label} · {toFaDigits(sr.overallScore)}/۱۰
          </Badge>
        </div>
        <p className="mt-2 text-xs leading-7 text-muted whitespace-pre-wrap">{sr.narrative}</p>
      </div>

      <div className="rounded-card bg-surface-2/70 p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-extrabold text-ink">۳. تحلیلگر رژیم بازار و اقتصاد کلان</h4>
          <Badge tone="neutral">پهنای بازار</Badge>
        </div>
        <p className="mt-2 text-xs leading-7 text-muted whitespace-pre-wrap">{a.newsMacroReport}</p>
      </div>

      <div className="rounded-card bg-surface-2/70 p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-extrabold text-ink">۴. تحلیلگر بنیادی و نقدشوندگی</h4>
          <Badge tone="neutral">OI و حجم</Badge>
        </div>
        <p className="mt-2 text-xs leading-7 text-muted whitespace-pre-wrap">{a.fundamentalsReport}</p>
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          تعداد کندل‌های بررسی‌شده: <strong>{toFaDigits(input.technical.barsCount)}</strong> کندل ۴ ساعته · قیمت مرجع:{' '}
          <strong className="num-ltr text-ink">{fmtPrice(input.technical.close)}</strong> دلار
        </span>
        <span>
          حمایت/مقاومت ۲۰ کندل: <strong className="num-ltr text-ink">{fmtPrice(input.technical.support20)}</strong> /{' '}
          <strong className="num-ltr text-ink">{fmtPrice(input.technical.resistance20)}</strong>
        </span>
      </div>

      {/* نمایش کارتی برای موبایل/PWA و جدول فشرده برای دسکتاپ */}
      <div className="grid gap-2 sm:hidden">
        {rows.map((r) => (
          <div key={r.key} className="rounded-field bg-surface-2/70 p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-ink">
                {r.nameFa} <span className="text-2xs text-subtle" dir="ltr">({r.code})</span>
              </span>
              <Badge tone={toneFor(r.signal)}>{r.signalFa}</Badge>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="text-2xs text-muted">{r.noteFa}</span>
              <span className="num-ltr font-extrabold text-ink">{fmtPrice(r.value)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto sm:block">
        <table className="data-table is-compact">
          <thead>
            <tr>
              <th scope="col">اندیکاتور</th>
              <th scope="col">دسته</th>
              <th scope="col" className="col-num">مقدار محاسبه‌شده</th>
              <th scope="col">وضعیت</th>
              <th scope="col">نقش در کمیته</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <th scope="row" className="font-bold text-ink">
                  {r.nameFa} <span className="ms-1 text-2xs font-normal text-subtle" dir="ltr">({r.code})</span>
                </th>
                <td className="text-xs text-muted">{r.category}</td>
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
      <div className="py-8 text-center text-sm text-muted">
        هنوز تصمیمی در حافظه کمیته ثبت نشده است. با هر بار اجرای کمیته، حکم صادرشده و قیمت لحظه تصمیم در اینجا ثبت و در بازدیدهای بعدی با قیمت روز تسویه می‌شود.
      </div>
    );
  }

  return (
    <div className="space-y-2.5 py-2">
      {entries.map((e) => {
        const rMeta = RATING_FA[e.rating];
        return (
          <div key={e.id} className="rounded-card border border-divider bg-surface-2/60 p-3.5 text-xs space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-ink" dir="ltr">
                  {e.coin}
                </span>
                <Badge tone={rMeta.tone}>
                  {rMeta.short} ({e.rating})
                </Badge>
              </div>
              <span className="text-2xs text-subtle">{e.analysisDate}</span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-2xs text-muted">
              <span>
                ورود: <strong className="num-ltr text-ink">{fmtPrice(e.entryPrice)}</strong>
              </span>
              {e.stopLoss && (
                <span>
                  حد ضرر: <strong className="num-ltr text-negative">{fmtPrice(e.stopLoss)}</strong>
                </span>
              )}
              {e.priceTarget && (
                <span>
                  هدف: <strong className="num-ltr text-positive">{fmtPrice(e.priceTarget)}</strong>
                </span>
              )}
              <span>
                تغییر قیمت تا امروز:{' '}
                <strong
                  className={cn(
                    'num-ltr',
                    e.realizedReturnPct && e.realizedReturnPct > 0
                      ? 'text-positive'
                      : e.realizedReturnPct && e.realizedReturnPct < 0
                        ? 'text-negative'
                        : 'text-ink'
                  )}
                >
                  {pct(e.realizedReturnPct, 2)}
                </strong>
              </span>
            </div>

            <p className="text-xs leading-6 text-ink">{e.executiveSummary}</p>
            {e.lesson && <p className="text-2xs text-subtle border-t border-divider pt-1.5">{e.lesson}</p>}
          </div>
        );
      })}
    </div>
  );
}
