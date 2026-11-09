/**
 * تب «کمیته ایجنت‌ها» (TradingAgents) در میز معامله دارینو
 *
 * پیاده‌سازی ۱۰۰٪ بومی معماری چندایجنتی مخزن TauricResearch/TradingAgents:
 *   ۱) Snapshot تأییدشده ۱۱ اندیکاتور تکنیکال (SMA50/200, EMA10, MACD/Signal/Hist, RSI14, Bollinger Bands, ATR14, VWMA20)
 *   ۲) اجرای ۴ تیم تخصصی (تحلیلگران ← مناظره Bull/Bear و مدیر پژوهش ← تریدر ← کمیته ریسک ۳ نفره و مدیر پرتفولیو)
 *   ۳) حافظه تصمیم‌ها (Memory Log) با تسویه خودکار (Point-in-Time Settlement) و انتقال درس‌های قبلی به اجرای بعدی
 *   ۴) خروجی گزارش تک‌صفحه‌ای خودکفا (complete_report.html) و اتصال به برنامه معامله ژورنال
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Download, Sparkles, ShieldAlert, TrendingUp, TrendingDown, Scale, History, Trash2 } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { KeyValueList } from '@/shared/components/ui/FinancialValue';
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
  buildPastLessonsContext,
  computeTechnicalSnapshot,
  renderCompleteReportHtml,
  settleMemoryEntries,
  type CommitteeMarketInput,
  type TradingAgentsReport,
  type TradingMemoryEntry
} from '../domain/tradingAgents';
import { fmtPrice, UsdShort } from './parts';

const MEMORY_STORAGE_KEY = 'darino:trading-agents:memory:v1';
const MARKETS_LIMIT = 40;

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
    /* نادیده گرفتن خطای Quota در حالت Private */
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<TradingAgentsReport | null>(null);
  const [reportCoin, setReportCoin] = useState<string | null>(null);
  const [memory, setMemory] = useState<TradingMemoryEntry[]>(loadMemory);

  const marketOptions = useMemo(() => {
    const top = (markets.data ?? []).slice(0, MARKETS_LIMIT);
    return selectedMarket && !top.includes(selectedMarket) ? [selectedMarket, ...top] : top;
  }, [markets.data, selectedMarket]);

  // تسویه خودکار تصمیم‌های قبلی در Memory Log به محض دریافت قیمت‌های زنده بازار (معادل settle_all_pending در TradingAgents)
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

  // محاسبه ۱۱ اندیکاتور تکنیکال روی کندل‌های ۴ ساعته
  const technical = useMemo(() => (candles.data ? computeTechnicalSnapshot(candles.data, 6) : null), [candles.data]);

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

      // ثبت تصمیم در Memory Log محلی (معادل ~/.tradingagents/memory/trading_memory.md)
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
    <div className="space-y-5">
      {/* ۱) انتخاب نماد، عمق مناظره و سرمایه پایه */}
      <Surface className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-base font-extrabold text-ink">
              <Bot className="h-5 w-5 text-accent" aria-hidden />
              کمیته چندایجنتی معامله (TradingAgents)
            </h3>
            <p className="mt-1 text-xs leading-6 text-muted">
              چهار تحلیلگر تخصصی داده و ۱۱ اندیکاتور را می‌خوانند، پژوهشگر صعودی (Bull) و نزولی (Bear) مناظره می‌کنند، معامله‌گر سطح ورود و استاپ مبتنی بر ATR می‌دهد و کمیته ریسک ۳ نفره همراه با مدیر پرتفولیو حکم نهایی را صادر می‌کنند.
            </p>
          </div>
          <Badge tone="neutral">معماری ۴ مرحله‌ای</Badge>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="نماد بازار">
            <Select value={activeCoin} onChange={(e) => onChangeMarket(e.target.value)}>
              {marketOptions.map((o) => (
                <option key={o.coin} value={o.coin}>
                  {o.coin} · {fmtPrice(o.markPx)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="عمق پژوهش و مناظره">
            <SegmentedControl<string>
              fill
              label="عمق پژوهش"
              value={String(depth)}
              onChange={(v) => setDepth((Number(v) as 1 | 2 | 3) || 1)}
              options={[
                { value: '1', label: 'سریع (۱ دور)' },
                { value: '2', label: 'متوسط (۲ دور)' },
                { value: '3', label: 'عمیق (۳ دور)' }
              ]}
            />
          </Field>

          <Field label="سرمایه مبنای سایزینگ (دلار)">
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

          <Field label="حداکثر ریسک در معامله">
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
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>افق ارزیابی در حافظه تصمیم‌ها:</span>
            <SegmentedControl<'5' | '14' | '30'>
              label="افق ارزیابی"
              value={holdingDaysInput}
              onChange={setHoldingDaysInput}
              options={[
                { value: '5', label: '۵ روز' },
                { value: '14', label: '۱۴ روز' },
                { value: '30', label: '۳۰ روز' }
              ]}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeReport && (
              <Button variant="outline" size="sm" icon={<Download />} onClick={downloadHtmlReport}>
                دانلود گزارش کامل HTML
              </Button>
            )}
            <Button
              loading={busy}
              icon={<Sparkles />}
              disabled={!committeeInput || busy}
              onClick={() => void runCommittee()}
            >
              {busy ? 'در حال برگزاری مناظره ایجنت‌ها…' : `اجرای کمیته ایجنت‌ها برای ${activeCoin}`}
            </Button>
          </div>
        </div>

        {error && <Notice tone="warn">{error}</Notice>}
      </Surface>

      {/* ۲) پیش‌خوانش کمی و ۱۱ اندیکاتور تکنیکال تأییدشده (Verified Market Snapshot) */}
      {candles.isLoading ? (
        <ListSkeleton rows={3} />
      ) : !technical || !committeeInput || !baseline ? (
        <Notice tone="neutral">داده کندل کافی برای محاسبه ۱۱ اندیکاتور تکنیکال این نماد در دسترس نیست.</Notice>
      ) : (
        <>
          <Surface className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-2xs font-semibold text-muted">ورودی تأییدشده تیم تحلیلگران (Verified Snapshot)</p>
                <h4 className="mt-0.5 text-sm font-extrabold text-ink">
                  ۱۱ اندیکاتور تکنیکال، سطوح ATR و وضعیت فاندینگ <bdi dir="ltr">{activeCoin}</bdi>
                </h4>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={SENTIMENT_BAND_FA[baseline.sentimentBand].tone}>
                  پیش‌خوانش کمی: {SENTIMENT_BAND_FA[baseline.sentimentBand].label} ({toFaDigits(baseline.sentimentScore)} از ۱۰)
                </Badge>
                <Badge tone="neutral">اطمینان داده: {CONFIDENCE_FA[baseline.confidence]}</Badge>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-field bg-surface-2/70 p-3">
                <dt className="text-2xs text-muted">قیمت و تغییرات (۲۴س / ۷ر)</dt>
                <dd className="mt-1 text-sm font-extrabold text-ink">
                  <bdi dir="ltr">{fmtPrice(technical.close)}</bdi> دلار
                </dd>
                <dd className="text-2xs text-subtle">
                  ۲۴ ساعت: <bdi dir="ltr">{pct(technical.change24hPct)}</bdi> · ۷ روز: <bdi dir="ltr">{pct(technical.change7dPct)}</bdi>
                </dd>
              </div>

              <div className="rounded-field bg-surface-2/70 p-3">
                <dt className="text-2xs text-muted">میانگین‌ها (EMA10 / SMA50 / SMA200)</dt>
                <dd className="mt-1 text-xs font-bold text-ink" dir="ltr">
                  {fmtPrice(technical.close10Ema)} / {fmtPrice(technical.close50Sma)} / {fmtPrice(technical.close200Sma)}
                </dd>
                <dd className="text-2xs text-subtle">
                  روند تکنیکال: {technical.trendRegime === 'bullish' ? 'صعودی (بالای میانگین‌ها)' : technical.trendRegime === 'bearish' ? 'نزولی (زیر میانگین‌ها)' : 'خنثی / نوسانی'}
                </dd>
              </div>

              <div className="rounded-field bg-surface-2/70 p-3">
                <dt className="text-2xs text-muted">مومنتوم (RSI 14 و MACD Hist)</dt>
                <dd className="mt-1 text-sm font-extrabold text-ink">
                  RSI: <bdi dir="ltr">{technical.rsi14 !== null ? toFaDigits(technical.rsi14.toFixed(1)) : '—'}</bdi>
                </dd>
                <dd className="text-2xs text-subtle">
                  هیستوگرام MACD: <bdi dir="ltr">{technical.macdh !== null ? (technical.macdh >= 0 ? '+' : '') + technical.macdh.toPrecision(3) : '—'}</bdi>
                </dd>
              </div>

              <div className="rounded-field bg-surface-2/70 p-3">
                <dt className="text-2xs text-muted">نوسان ATR (14) و حد ضرر ۲×ATR</dt>
                <dd className="mt-1 text-sm font-extrabold text-ink">
                  <bdi dir="ltr">{fmtPrice(technical.atr14)}</bdi> ({pct(technical.atrPct)})
                </dd>
                <dd className="text-2xs text-subtle">
                  استاپ لانگ: <bdi dir="ltr">{fmtPrice(baseline.atrStopLong)}</bdi> · شورت: <bdi dir="ltr">{fmtPrice(baseline.atrStopShort)}</bdi>
                </dd>
              </div>
            </dl>

            <Disclosure summary="مشاهده جدول کامل ۱۱ اندیکاتور تکنیکال و آمار مشتقات">
              <KeyValueList
                dense
                rows={[
                  { label: 'باندهای بولینگر (۲۰، ۲σ)', value: `پایین: ${fmtPrice(technical.bollLower)} · میانه: ${fmtPrice(technical.bollMid)} · بالا: ${fmtPrice(technical.bollUpper)}` },
                  { label: 'میانگین وزنی فعالیت (VWMA 20)', value: fmtPrice(technical.vwma20) },
                  { label: 'حمایت و مقاومت ۲۰ کندل اخیر', value: `حمایت: ${fmtPrice(technical.support20)} · مقاومت: ${fmtPrice(technical.resistance20)}` },
                  { label: 'حمایت و مقاومت ۵۰ کندل اخیر', value: `حمایت: ${fmtPrice(technical.support50)} · مقاومت: ${fmtPrice(technical.resistance50)}` },
                  { label: 'نرخ فاندینگ فعلی (APR سالانه)', value: pct(committeeInput.derivatives.fundingAprNow), hint: `صدک ۳۰ روزه: ${committeeInput.derivatives.fundingPercentile30d !== null ? toFaDigits(Math.round(committeeInput.derivatives.fundingPercentile30d)) + '٪' : '—'}` },
                  { label: 'قراردادهای باز (OI) و حجم ۲۴ ساعته', value: <span className="inline-flex gap-2"><span>OI: <UsdShort value={committeeInput.derivatives.openInterestUsd} /></span><span>· حجم: <UsdShort value={committeeInput.derivatives.volume24hUsd} /></span></span> },
                  { label: 'حداکثر حجم پیشنهادی بر اساس ۲×ATR', value: baseline.recommendedSizeUsd ? <UsdShort value={baseline.recommendedSizeUsd} /> : '—', hint: `با ریسک ${toFaDigits(committeeInput.portfolio?.maxRiskPct ?? 1)}٪ سرمایه` }
                ]}
              />
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <button type="button" onClick={() => onSelectCoin(activeCoin)} className="font-semibold text-accent hover:underline">
                  مشاهده پوزیشن تریدرهای برتر روی {activeCoin} ←
                </button>
              </div>
            </Disclosure>
          </Surface>

          {/* ۳) نمایش خروجی کامل ۴ مرحله‌ای پس از اجرای کمیته */}
          {activeReport && (
            <div className="space-y-4">
              {/* حکم نهایی مدیر پرتفولیو */}
              <PortfolioManagerCard
                coin={activeCoin}
                report={activeReport}
                maxLeverage={selectedMarket?.maxLeverage ?? 10}
              />

              {/* پیشنهاد ایجنت معامله‌گر (Trader Agent) */}
              <TraderProposalCard report={activeReport} />

              {/* مناظره پژوهشگر صعودی و نزولی + حکم مدیر پژوهش */}
              <ResearchDebateCard report={activeReport} />

              {/* مناظره ۳ تحلیلگر ریسک (تهاجمی، محافظه‌کار، خنثی) */}
              <RiskCommitteeCard report={activeReport} />

              {/* گزارش ۴ تحلیلگر تخصصی */}
              <AnalystsTeamCard report={activeReport} />
            </div>
          )}
        </>
      )}

      {/* ۴) حافظه تصمیم‌ها و تسویه خودکار (Memory Log & Settlement) */}
      <MemoryLogSection
        entries={memory}
        onClear={() => {
          setMemory([]);
          saveMemory([]);
        }}
      />
    </div>
  );
}

// ─── اجزای نمایشی ۴ مرحله کمیته ──────────────────────────────────────────────

function PortfolioManagerCard({
  coin,
  report,
  maxLeverage
}: {
  coin: string;
  report: TradingAgentsReport;
  maxLeverage: number;
}) {
  const pm = report.riskDebate.portfolioDecision;
  const tp = report.traderProposal;
  const meta = RATING_FA[pm.rating];
  const side = meta.direction < 0 ? 'short' : 'long';

  return (
    <Surface
      variant="focal"
      className={cn(
        'border-2 p-5',
        meta.tone === 'gain'
          ? 'border-gain/50'
          : meta.tone === 'loss'
            ? 'border-negative/50'
            : meta.tone === 'warn'
              ? 'border-warn/50'
              : 'border-divider'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-2xs font-semibold text-muted">مرحله ۴ (نهایی) · حکم مدیر پرتفولیو (Portfolio Manager)</p>
          <h3 className="mt-1 text-lg font-extrabold text-ink">
            <bdi dir="ltr">{coin}</bdi> — {meta.label}
          </h3>
        </div>
        <Badge tone={meta.tone}>{meta.short}</Badge>
      </div>

      <p className="mt-2 text-xs font-medium text-subtle">{meta.actionHint}</p>
      <p className="mt-3 text-sm leading-7 text-ink">{pm.executiveSummary}</p>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-divider pt-4 sm:grid-cols-4">
        <div>
          <dt className="text-2xs text-muted">پیشنهاد معامله‌گر</dt>
          <dd className="mt-0.5 text-sm font-extrabold text-ink">{TRADER_ACTION_FA[tp.action].label}</dd>
        </div>
        <div>
          <dt className="text-2xs text-muted">نقطه ورود / حد ضرر (ATR)</dt>
          <dd className="mt-0.5 text-sm font-extrabold text-ink" dir="ltr">
            {fmtPrice(tp.entryPrice)} / <span className="text-negative">{fmtPrice(tp.stopLoss)}</span>
          </dd>
        </div>
        <div>
          <dt className="text-2xs text-muted">هدف قیمتی</dt>
          <dd className="mt-0.5 text-sm font-extrabold text-positive" dir="ltr">
            {fmtPrice(pm.priceTarget ?? tp.takeProfit)}
          </dd>
        </div>
        <div>
          <dt className="text-2xs text-muted">افق زمانی پیشنهادی</dt>
          <dd className="mt-0.5 text-sm font-extrabold text-ink">{pm.timeHorizon}</dd>
        </div>
      </dl>

      <Disclosure summary="تز کامل سرمایه‌گذاری و شواهد تصمیم مدیر پرتفولیو" className="mt-3">
        <p className="text-xs leading-7 text-muted whitespace-pre-wrap">{pm.investmentThesis}</p>
      </Disclosure>

      {meta.direction !== 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-3 text-xs">
          <span className="text-muted">این خروجی پژوهشی است و سفارش خودکار ارسال نمی‌کند.</span>
          <Link
            to={`/journal?tab=plan&m=${encodeURIComponent(coin)}&side=${side}&lev=${Math.min(3, maxLeverage)}`}
            className="font-semibold text-accent underline"
          >
            انتقال به برنامه معامله در ژورنال ←
          </Link>
        </div>
      )}
    </Surface>
  );
}

function TraderProposalCard({ report }: { report: TradingAgentsReport }) {
  const tp = report.traderProposal;
  const meta = TRADER_ACTION_FA[tp.action];
  return (
    <Surface className="space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-2xs font-semibold text-muted">مرحله ۳ · پیشنهاد اجرایی ایجنت معامله‌گر (Trader Agent)</p>
          <h4 className="mt-0.5 text-base font-bold text-ink">{meta.label}</h4>
        </div>
        <Badge tone={meta.tone}>{tp.action}</Badge>
      </div>
      <p className="text-sm leading-7 text-muted whitespace-pre-wrap">{tp.reasoning}</p>
      <div className="rounded-field bg-surface-2/70 px-3 py-2 text-xs leading-6 text-ink">
        <strong>اندازه پوزیشن و مدیریت سرمایه:</strong> {tp.positionSizing}
      </div>
    </Surface>
  );
}

function ResearchDebateCard({ report }: { report: TradingAgentsReport }) {
  const rd = report.researchDebate;
  const planMeta = RATING_FA[rd.researchPlan.recommendation];
  return (
    <Surface className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-2xs font-semibold text-muted">مرحله ۲ · مناظره تیم پژوهشگران (Bull vs. Bear) و داوری مدیر پژوهش</p>
          <h4 className="mt-0.5 text-base font-bold text-ink">حکم مدیر پژوهش: {planMeta.label}</h4>
        </div>
        <Badge tone={planMeta.tone}>{planMeta.short}</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-card border border-gain/30 bg-gain/5 p-3.5">
          <h5 className="flex items-center gap-1.5 text-xs font-extrabold text-positive">
            <TrendingUp className="h-4 w-4" aria-hidden />
            پژوهشگر صعودی (Bull Researcher)
          </h5>
          <p className="mt-2 text-xs leading-6 text-ink whitespace-pre-wrap">{rd.bullHistory}</p>
        </div>

        <div className="rounded-card border border-negative/30 bg-negative/5 p-3.5">
          <h5 className="flex items-center gap-1.5 text-xs font-extrabold text-negative">
            <TrendingDown className="h-4 w-4" aria-hidden />
            پژوهشگر نزولی (Bear Researcher)
          </h5>
          <p className="mt-2 text-xs leading-6 text-ink whitespace-pre-wrap">{rd.bearHistory}</p>
        </div>
      </div>

      <div className="rounded-field border border-divider bg-surface-2/60 p-3.5 space-y-2">
        <p className="text-xs font-bold text-ink">داوری مدیر پژوهش (Research Manager):</p>
        <p className="text-xs leading-6 text-muted whitespace-pre-wrap">{rd.researchPlan.rationale}</p>
        <p className="text-xs leading-6 text-ink">
          <strong>دستورالعمل راهبردی برای معامله‌گر:</strong> {rd.researchPlan.strategicActions}
        </p>
      </div>
    </Surface>
  );
}

function RiskCommitteeCard({ report }: { report: TradingAgentsReport }) {
  const rk = report.riskDebate;
  return (
    <Surface className="space-y-4 p-4 sm:p-5">
      <div>
        <p className="text-2xs font-semibold text-muted">مرحله ۳.۵ · مناظره سه دیدگاه کمیته مدیریت ریسک (Risk Management Team)</p>
        <h4 className="mt-0.5 text-base font-bold text-ink">نقد پیشنهاد معامله‌گر از سه زاویه تهاجمی، محافظه‌کار و متوازن</h4>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-field border border-divider bg-surface-2/50 p-3">
          <h5 className="flex items-center gap-1.5 text-xs font-extrabold text-positive">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            تحلیلگر ریسک تهاجمی (Aggressive)
          </h5>
          <p className="mt-1.5 text-xs leading-6 text-muted whitespace-pre-wrap">{rk.aggressiveArgument}</p>
        </div>

        <div className="rounded-field border border-divider bg-surface-2/50 p-3">
          <h5 className="flex items-center gap-1.5 text-xs font-extrabold text-warn">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
            تحلیلگر ریسک محافظه‌کار (Conservative)
          </h5>
          <p className="mt-1.5 text-xs leading-6 text-muted whitespace-pre-wrap">{rk.conservativeArgument}</p>
        </div>

        <div className="rounded-field border border-divider bg-surface-2/50 p-3">
          <h5 className="flex items-center gap-1.5 text-xs font-extrabold text-accent">
            <Scale className="h-3.5 w-3.5" aria-hidden />
            تحلیلگر ریسک متوازن (Neutral)
          </h5>
          <p className="mt-1.5 text-xs leading-6 text-muted whitespace-pre-wrap">{rk.neutralArgument}</p>
        </div>
      </div>
    </Surface>
  );
}

function AnalystsTeamCard({ report }: { report: TradingAgentsReport }) {
  const a = report.analysts;
  const sr = a.sentimentReport;
  const bandMeta = SENTIMENT_BAND_FA[sr.overallBand];
  return (
    <Surface className="space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-2xs font-semibold text-muted">مرحله ۱ · گزارش‌های ۴ تحلیلگر تخصصی (Analyst Team)</p>
          <h4 className="mt-0.5 text-base font-bold text-ink">تکنیکال، احساسات و فاندینگ، رژیم کلان و نقدشوندگی</h4>
        </div>
        <Badge tone={bandMeta.tone}>
          احساسات: {bandMeta.label} ({toFaDigits(sr.overallScore)}/۱۰)
        </Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-field bg-surface-2/60 p-3">
          <h5 className="text-xs font-extrabold text-ink">۱. تحلیلگر تکنیکال بازار (۱۱ اندیکاتور)</h5>
          <p className="mt-1.5 text-xs leading-6 text-muted whitespace-pre-wrap">{a.marketReport}</p>
        </div>

        <div className="rounded-field bg-surface-2/60 p-3">
          <h5 className="text-xs font-extrabold text-ink">
            ۲. تحلیلگر احساسات و فاندینگ (اطمینان: {CONFIDENCE_FA[sr.confidence]})
          </h5>
          <p className="mt-1.5 text-xs leading-6 text-muted whitespace-pre-wrap">{sr.narrative}</p>
        </div>

        <div className="rounded-field bg-surface-2/60 p-3">
          <h5 className="text-xs font-extrabold text-ink">۳. تحلیلگر رژیم بازار و اقتصاد کلان</h5>
          <p className="mt-1.5 text-xs leading-6 text-muted whitespace-pre-wrap">{a.newsMacroReport}</p>
        </div>

        <div className="rounded-field bg-surface-2/60 p-3">
          <h5 className="text-xs font-extrabold text-ink">۴. تحلیلگر بنیادی و ساختار نقدشوندگی</h5>
          <p className="mt-1.5 text-xs leading-6 text-muted whitespace-pre-wrap">{a.fundamentalsReport}</p>
        </div>
      </div>
    </Surface>
  );
}

function MemoryLogSection({
  entries,
  onClear
}: {
  entries: TradingMemoryEntry[];
  onClear: () => void;
}) {
  return (
    <Disclosure
      summary={`حافظه تصمیم‌ها و تسویه خودکار (Memory Log)${entries.length ? ` · ${toFaDigits(entries.length)} ثبت` : ''}`}
    >
      <div className="space-y-3 pt-2">
        <p className="text-xs leading-6 text-muted">
          مشابه فایل <code dir="ltr">trading_memory.md</code> در مخزن اصلی TradingAgents، هر بار که کمیته اجرا می‌شود تصمیم آن همراه با قیمت لحظه تصمیم ذخیره می‌شود و در بازدیدهای بعدی، بازده واقعی آن نسبت به قیمت روز محاسبه و به‌عنوان «درس‌های قبلی» به مدیر پرتفولیو داده می‌شود.
        </p>

        {entries.length === 0 ? (
          <p className="text-xs text-subtle">هنوز تصمیمی در حافظه ثبت نشده است.</p>
        ) : (
          <>
            <div className="space-y-2">
              {entries.slice(0, 10).map((e) => {
                const rMeta = RATING_FA[e.rating];
                return (
                  <div key={e.id} className="rounded-field border border-divider bg-surface-2/50 p-3 text-xs space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-extrabold text-ink">
                        <History className="inline h-3.5 w-3.5 me-1 text-accent" aria-hidden />
                        <bdi dir="ltr">{e.coin}</bdi> · {rMeta.short} (<bdi dir="ltr">{e.rating}</bdi>)
                      </span>
                      <span className="text-subtle">
                        {e.analysisDate} · ورود: <bdi dir="ltr">{fmtPrice(e.entryPrice)}</bdi> · تغییر تا امروز:{' '}
                        <strong className={cn(e.realizedReturnPct && e.realizedReturnPct > 0 ? 'text-positive' : e.realizedReturnPct && e.realizedReturnPct < 0 ? 'text-negative' : 'text-ink')}>
                          <bdi dir="ltr">{pct(e.realizedReturnPct, 2)}</bdi>
                        </strong>
                      </span>
                    </div>
                    <p className="text-muted line-clamp-2">{e.executiveSummary}</p>
                    {e.lesson && <p className="text-2xs text-subtle">{e.lesson}</p>}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" icon={<Trash2 />} onClick={onClear}>
                پاک کردن حافظه تصمیم‌ها
              </Button>
            </div>
          </>
        )}
      </div>
    </Disclosure>
  );
}
