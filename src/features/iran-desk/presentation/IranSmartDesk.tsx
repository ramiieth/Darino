/**
 * «میز تحلیل هوشمند بازار سهام و صندوق‌های ایران» در دارینو
 *
 * یکپارچه‌شده زیر بخش «بورس ایران و آتیه» در صفحهٔ بازارها:
 *   • داشبورد و تحلیل کامل End-to-End با تیم ۶ نفره
 *   • اسکنر بازار (ورود پول حقیقی ۳ روز متوالی، جهش حجم ۲×، شکست ۲۰ روزه، کدال، تخفیف/حباب NAV)
 *   • تیم ۶ نفره هوش مصنوعی (اجرای مستقل هر Agent + خروجی خلاصه و بخش بازشونده «مشاهده جزئیات») + مدیر ریسک تعاملی
 *   • بکتست واقعی با نمودار Chart.js و کد پایتون
 *   • چک‌لیست ۱۱ موردی ریسک + ژورنال معاملاتی و مرور الگوهای ماهانه
 *   • مدیریت داده‌ها (آپلود CSV / PDF کدال با پیش‌نمایش و تأیید) + مقایسه صندوق‌ها
 */
import { useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  CheckCircle2,
  Database,
  Play,
  Radar,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  XCircle
} from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Field, Input } from '@/shared/components/ui/Input';
import { SegmentedControl, Tabs } from '@/shared/components/ui/SegmentedControl';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { IRAN_MARKET_CATALOG } from '@/features/markets/data/iranMarketCatalog';
import { cn } from '@/shared/lib/cn';
import { toEnDigits, toFaDigits } from '@/shared/utils/formatters';
import { ASSET_TYPE_LABELS, DESK_AGENTS } from '../domain/agents';
import {
  FINAL_VERDICT_META,
  runFullAnalysisPipeline,
  runSingleDeskAgent
} from '../domain/orchestrator';
import { evaluateTradeRisk } from '../domain/riskManager';
import { runMarketScanner } from '../domain/scanner';
import type {
  DeskAgentId,
  DeskAssetType,
  IntegratedAnalysisReport,
  RiskManagerResult,
  ScannerResult
} from '../domain/types';
import { useIranDeskState } from '../data/store';
import { IranDeskBacktestPanel } from './IranDeskBacktestPanel';
import { IranDeskDataPanel } from './IranDeskDataPanel';
import { IranDeskJournalPanel } from './IranDeskJournalPanel';

type DeskSubTab = 'overview' | 'scanner' | 'agents' | 'backtest' | 'journal' | 'data';

const parseNum = (s: string, fallback = 0) => {
  const n = Number(toEnDigits(s).replace(/[,٬\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

function mapCatalogToAssetType(seg: string, sub?: string): DeskAssetType {
  if (seg === 'ime') return 'commodity';
  if (seg === 'pension' || sub === 'pension') return 'fund_pension';
  if (seg === 'funds') {
    if (sub === 'fixed_income') return 'fund_fixed_income';
    if (sub === 'gold') return 'fund_gold';
    if (sub === 'index') return 'fund_index';
    return 'fund_equity';
  }
  return 'stock';
}

export function IranSmartDesk() {
  const { state, updateState } = useIranDeskState();
  const [subTab, setSubTab] = useState<DeskSubTab>('overview');
  const [selectedSymbol, setSelectedSymbol] = useState<string>(
    () => state.datasets[0]?.symbol ?? IRAN_MARKET_CATALOG[0]?.symbol ?? 'فولاد'
  );
  const [useGemini, setUseGemini] = useState<boolean>(true);
  const [runningAgent, setRunningAgent] = useState<DeskAgentId | 'full' | null>(null);
  const [scannerResult, setScannerResult] = useState<ScannerResult | null>(null);

  // پارامترهای تعاملی مدیر ریسک (Agent 5)
  const [capitalStr, setCapitalStr] = useState('1000000000');
  const [maxRiskPct, setMaxRiskPct] = useState<'1' | '2'>('1');
  const [entryStr, setEntryStr] = useState('');
  const [stopStr, setStopStr] = useState('');
  const [targetStr, setTargetStr] = useState('');
  const [dailyLimitStr, setDailyLimitStr] = useState('3');
  const [existingExpStr, setExistingExpStr] = useState('0');
  const [manualRiskResult, setManualRiskResult] = useState<RiskManagerResult | null>(null);

  // فهرست یکپارچه نمادها (فایل‌های بارگذاری‌شده + کاتالوگ بازار ایران)
  const availableSymbols = useMemo(() => {
    const map = new Map<string, { symbol: string; nameFa: string; assetType: DeskAssetType; hasData: boolean }>();
    for (const ds of state.datasets) {
      map.set(ds.symbol, { symbol: ds.symbol, nameFa: ds.nameFa, assetType: ds.assetType, hasData: true });
    }
    for (const c of IRAN_MARKET_CATALOG) {
      if (!map.has(c.symbol)) {
        map.set(c.symbol, {
          symbol: c.symbol,
          nameFa: c.nameFa,
          assetType: mapCatalogToAssetType(c.segment, c.fundSubtype),
          hasData: false
        });
      }
    }
    return [...map.values()];
  }, [state.datasets]);

  const activeMeta = useMemo(
    () =>
      availableSymbols.find((s) => s.symbol === selectedSymbol) ?? {
        symbol: selectedSymbol,
        nameFa: selectedSymbol,
        assetType: 'stock' as DeskAssetType,
        hasData: false
      },
    [availableSymbols, selectedSymbol]
  );

  const activeDataset = useMemo(
    () => state.datasets.find((d) => d.symbol === selectedSymbol) ?? null,
    [state.datasets, selectedSymbol]
  );
  const activeDocs = useMemo(
    () => state.documents.filter((d) => d.symbol === selectedSymbol),
    [state.documents, selectedSymbol]
  );
  const activeRuns = state.agentRuns[selectedSymbol] ?? {};
  const latestReport: IntegratedAnalysisReport | null = useMemo(
    () => state.reports.find((r) => r.symbol === selectedSymbol) ?? null,
    [state.reports, selectedSymbol]
  );

  const buildRiskInput = () => {
    const bars = activeDataset?.bars ?? [];
    const lastClose = bars.length ? bars[bars.length - 1].close : 0;
    const prev20 = bars.slice(-21, -1);
    const avgVal20 = prev20.length ? prev20.reduce((s, b) => s + b.tradeValueRial, 0) / prev20.length : null;
    return {
      symbol: selectedSymbol,
      assetType: activeMeta.assetType,
      totalCapitalRial: parseNum(capitalStr, 1_000_000_000),
      maxRiskPct: Number(maxRiskPct),
      entryPriceRial: parseNum(entryStr, lastClose),
      stopLossRial: parseNum(stopStr, lastClose > 0 ? Math.round(lastClose * 0.94) : 0),
      targetPriceRial: parseNum(targetStr, lastClose > 0 ? Math.round(lastClose * 1.15) : 0),
      avgDailyTradeValueRial: avgVal20,
      dailyPriceLimitPct: parseNum(dailyLimitStr, activeMeta.assetType.startsWith('fund_') ? 10 : 3),
      existingPortfolioExposurePct: parseNum(existingExpStr, 0),
      sameSectorExposurePct: 0,
      bearStrongerThanBull: (activeRuns.bear?.meta?.strengthScore ?? 0) >= (activeRuns.bull?.meta?.strengthScore ?? 0)
    };
  };

  const handleRunScannerAll = () => {
    const res = runMarketScanner({ datasets: state.datasets, documents: state.documents });
    setScannerResult(res);
  };

  const handleRunSingleAgent = async (agentId: DeskAgentId) => {
    if (runningAgent) return;
    setRunningAgent(agentId);
    try {
      const scanSignals = scannerResult?.rows.filter((r) => r.symbol === selectedSymbol) ?? [];
      const out = await runSingleDeskAgent(agentId, {
        symbol: selectedSymbol,
        nameFa: activeMeta.nameFa,
        assetType: activeMeta.assetType,
        dataset: activeDataset,
        documents: activeDocs,
        scannerSignals: scanSignals,
        priorRuns: activeRuns,
        riskInput: buildRiskInput(),
        useGeminiIfAvailable: useGemini
      });
      if (agentId === 'risk_manager') {
        setManualRiskResult(evaluateTradeRisk(buildRiskInput()));
      }
      updateState((prev) => ({
        ...prev,
        agentRuns: {
          ...prev.agentRuns,
          [selectedSymbol]: { ...(prev.agentRuns[selectedSymbol] ?? {}), [agentId]: out }
        }
      }));
    } finally {
      setRunningAgent(null);
    }
  };

  const handleRunFullPipeline = async () => {
    if (runningAgent) return;
    setRunningAgent('full');
    try {
      const { report, runs, riskResult, backtestResult } = await runFullAnalysisPipeline({
        symbol: selectedSymbol,
        nameFa: activeMeta.nameFa,
        assetType: activeMeta.assetType,
        dataset: activeDataset,
        documents: activeDocs,
        scannerSignals: scannerResult?.rows.filter((r) => r.symbol === selectedSymbol) ?? [],
        priorRuns: activeRuns,
        riskInput: buildRiskInput(),
        useGeminiIfAvailable: useGemini
      });
      if (riskResult) setManualRiskResult(riskResult);
      updateState((prev) => ({
        ...prev,
        agentRuns: { ...prev.agentRuns, [selectedSymbol]: runs },
        reports: [report, ...prev.reports.filter((r) => r.id !== report.id)].slice(0, 30),
        backtests: backtestResult ? [backtestResult, ...prev.backtests].slice(0, 30) : prev.backtests
      }));
    } finally {
      setRunningAgent(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* هدر مینیمال میز تحلیل هوشمند + انتخابگر نماد + دکمه تحلیل کامل */}
      <Surface variant="focal" className="border border-accent/30 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Bot className="h-5 w-5 text-accent" aria-hidden />
              <h2 className="text-base font-extrabold text-ink">میز تحلیل هوشمند</h2>
              <Badge tone="neutral">تیم ۶ نفره · بدون معامله خودکار</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              تحلیل بازار، بررسی فرصت‌ها، مدیریت ریسک و ارزیابی استراتژی‌های معاملاتی با کمک تیم هوش مصنوعی
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="انتخاب نماد یا صندوق"
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="h-9 rounded-control border border-divider bg-card px-3 text-xs font-bold text-ink"
            >
              {availableSymbols.map((s) => (
                <option key={s.symbol} value={s.symbol}>
                  {s.symbol} — {s.nameFa} {s.hasData ? '✓' : ''}
                </option>
              ))}
            </select>

            <Button
              size="sm"
              icon={<Sparkles className="h-3.5 w-3.5" />}
              loading={runningAgent === 'full'}
              onClick={() => void handleRunFullPipeline()}
            >
              تحلیل کامل با تیم هوشمند
            </Button>
          </div>
        </div>

        {/* نوار وضعیت داده و موتور هوش مصنوعی */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider/60 pt-2.5 text-[11px] text-muted">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={activeDataset ? 'gain' : 'warn'}>
              {activeDataset
                ? `داده قیمت: ${toFaDigits(activeDataset.bars.length)} روز (${activeDataset.lastBarDate})`
                : 'بدون فایل قیمت روزانه'}
            </Badge>
            <Badge tone={activeDocs.length > 0 ? 'gain' : 'neutral'}>
              {toFaDigits(activeDocs.length)} گزارش کدال/صندوق
            </Badge>
            <span>نوع: <strong className="text-ink">{ASSET_TYPE_LABELS[activeMeta.assetType]}</strong></span>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-ink">
            <input
              type="checkbox"
              checked={useGemini}
              onChange={(e) => setUseGemini(e.target.checked)}
              className="h-3.5 w-3.5 accent-[rgb(var(--c-brand-500))]"
            />
            <span>تکمیل تحلیلی با Google Gemini (در صورت فعال بودن)</span>
          </label>
        </div>
      </Surface>

      {/* ناوبری داخلی میز تحلیل هوشمند */}
      <Tabs<DeskSubTab>
        label="بخش‌های میز تحلیل هوشمند"
        value={subTab}
        onChange={setSubTab}
        options={[
          { value: 'overview', label: 'داشبورد و گزارش کامل', icon: <Activity /> },
          { value: 'scanner', label: 'اسکنر بازار', icon: <Radar /> },
          { value: 'agents', label: 'تیم ۶ نفره و ریسک', icon: <Bot /> },
          { value: 'backtest', label: 'بکتست', icon: <TrendingUp /> },
          { value: 'journal', label: 'ژورنال و چک‌لیست', icon: <ShieldAlert /> },
          { value: 'data', label: 'داده‌ها و صندوق‌ها', icon: <Database /> }
        ]}
      />

      {/* تب ۱: داشبورد و گزارش کامل End-to-End */}
      {subTab === 'overview' && (
        <div className="space-y-4">
          {!activeDataset && activeDocs.length === 0 && (
            <Notice
              tone="info"
              title="قانون طلایی داده: هیچ عددی ساخته نمی‌شود"
              action={
                <Button size="sm" variant="secondary" onClick={() => setSubTab('data')}>
                  بارگذاری فایل قیمت / کدال
                </Button>
              }
            >
              برای دریافت اسکن واقعی، تحلیل بنیادی مستند و بکتست واقعی روی <strong>{selectedSymbol}</strong>، ابتدا فایل CSV خروجی TSETMC یا گزارش PDF کدال را در تب «داده‌ها و صندوق‌ها» بارگذاری کنید.
            </Notice>
          )}

          {latestReport ? (
            <Surface className="p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-ink">
                    گزارش نهایی یکپارچه — {latestReport.symbol} ({latestReport.nameFa})
                  </h3>
                  <p className="text-[11px] text-muted">
                    کفایت داده: {latestReport.dataSufficiencyFa} · منابع: {latestReport.dataSources.join('، ') || 'ثبت نشده'}
                  </p>
                </div>
                <Badge tone={FINAL_VERDICT_META[latestReport.finalVerdict].tone}>
                  {latestReport.finalVerdictLabelFa}
                </Badge>
              </div>

              <p className="rounded-field bg-surface-2/60 p-3 text-xs leading-6 text-ink">
                {latestReport.executiveSummaryFa}
              </p>

              <div className="grid gap-3 md:grid-cols-2">
                {latestReport.bull && (
                  <div className="rounded-field border border-gain/30 bg-gain/5 p-3 text-xs space-y-1">
                    <p className="font-extrabold text-positive flex items-center gap-1">
                      <TrendingUp className="h-3.5 w-3.5" /> دیدگاه خوشبین (Bull)
                    </p>
                    <p className="text-ink">{latestReport.bull.summaryFa}</p>
                    <Disclosure summary="مشاهده جزئیات">
                      <pre className="whitespace-pre-wrap pt-2 font-sans text-[11px] leading-6 text-muted">
                        {latestReport.bull.detailsMarkdownFa}
                      </pre>
                    </Disclosure>
                  </div>
                )}

                {latestReport.bear && (
                  <div className="rounded-field border border-negative/30 bg-negative/5 p-3 text-xs space-y-1">
                    <p className="font-extrabold text-negative flex items-center gap-1">
                      <TrendingDown className="h-3.5 w-3.5" /> دیدگاه بدبین (Bear — وکیل مدافع شیطان)
                    </p>
                    <p className="text-ink">{latestReport.bear.summaryFa}</p>
                    <Disclosure summary="مشاهده جزئیات">
                      <pre className="whitespace-pre-wrap pt-2 font-sans text-[11px] leading-6 text-muted">
                        {latestReport.bear.detailsMarkdownFa}
                      </pre>
                    </Disclosure>
                  </div>
                )}
              </div>

              {latestReport.risk && (
                <div
                  className={cn(
                    'rounded-field border p-3 text-xs space-y-1.5',
                    latestReport.risk.approved ? 'border-gain/40 bg-gain/10' : 'border-negative/40 bg-negative/10'
                  )}
                >
                  <p className="font-extrabold text-ink">{latestReport.risk.verdictTitleFa}</p>
                  <p className="text-muted">
                    نسبت ریسک به ریوارد: ۱ به {toFaDigits(latestReport.risk.riskRewardRatio)} · سهم از سبد: {toFaDigits(latestReport.risk.portfolioWeightPct)}٪
                  </p>
                  {latestReport.risk.warnings.map((w, i) => (
                    <p key={i} className="text-[11px] text-amber-700 dark:text-amber-300">⚠️ {w}</p>
                  ))}
                </div>
              )}

              {latestReport.uncertainties.length > 0 && (
                <div className="text-[11px] text-muted">
                  <strong className="text-ink">نقاط ابهام و داده‌های ناقص:</strong> {latestReport.uncertainties.join(' · ')}
                </div>
              )}
            </Surface>
          ) : (
            <EmptyState
              message="هنوز تحلیل کاملی برای این نماد اجرا نشده"
              hint="روی دکمه «تحلیل کامل با تیم هوشمند» در بالا کلیک کنید یا هر یک از ۶ Agent را به‌صورت مستقل در تب «تیم ۶ نفره و ریسک» اجرا نمایید."
            />
          )}
        </div>
      )}

      {/* تب ۲: اسکنر بازار (Agent 1) */}
      {subTab === 'scanner' && (
        <Surface className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-ink">اسکنر بازار (Market Scanner)</h3>
              <p className="text-xs text-muted">
                بررسی ورود پول حقیقی ۳ روز متوالی، جهش حجم &gt; ۲× میانگین ۲۰ روزه، شکست سقف ۲۰ روزه، اطلاعیه‌های کدال و تخفیف/حباب NAV صندوق‌ها (حداکثر ۵ نماد برتر).
              </p>
            </div>
            <Button size="sm" icon={<Radar className="h-3.5 w-3.5" />} onClick={handleRunScannerAll}>
              اجرای اسکنر روی داده‌های بارگذاری‌شده ({toFaDigits(state.datasets.length)})
            </Button>
          </div>

          {scannerResult && (
            scannerResult.emptyMessageFa ? (
              <Notice tone="neutral" title="نتیجه اسکنر">{scannerResult.emptyMessageFa}</Notice>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-divider text-muted">
                      <th className="pb-2">نماد</th>
                      <th className="pb-2">نوع دارایی</th>
                      <th className="pb-2">سیگنال</th>
                      <th className="pb-2">مقدار دقیق</th>
                      <th className="pb-2">قدرت سیگنال</th>
                      <th className="pb-2">منبع داده</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider/60">
                    {scannerResult.rows.map((r, idx) => (
                      <tr key={`${r.symbol}-${r.signalCode}-${idx}`} className="hover:bg-surface-2/40">
                        <td className="py-2 font-extrabold text-accent">
                          <button type="button" onClick={() => { setSelectedSymbol(r.symbol); setSubTab('agents'); }}>
                            {r.symbol}
                          </button>
                        </td>
                        <td className="py-2 text-muted">{ASSET_TYPE_LABELS[r.assetType]}</td>
                        <td className="py-2 font-bold text-ink">{r.signalTitleFa}</td>
                        <td className="py-2">{r.exactValueFa}</td>
                        <td className="py-2">
                          <Badge tone={r.strength === 'strong' ? 'gain' : r.strength === 'medium' ? 'warn' : 'neutral'}>
                            {r.strength === 'strong' ? 'قوی' : r.strength === 'medium' ? 'متوسط' : 'ضعیف'}
                          </Badge>
                        </td>
                        <td className="py-2 text-[11px] text-muted">{r.sourceName} ({r.dataDate})</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </Surface>
      )}

      {/* تب ۳: تیم ۶ نفره (اجرای مستقل) + ماشین‌حساب دقیق مدیر ریسک */}
      {subTab === 'agents' && (
        <div className="space-y-4">
          {/* پنل محاسبه مستقیم مدیر ریسک */}
          <Surface className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-ink">مدیر ریسک (Risk Manager) — کنترل حجم، R:R ≥ ۱:۲، صف فروش و دامنه نوسان</h3>
              <Button size="sm" onClick={() => setManualRiskResult(evaluateTradeRisk(buildRiskInput()))}>
                محاسبه حکم مدیر ریسک
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
              <Field label="سرمایه کل (ریال)">
                <Input dir="ltr" inputMode="numeric" value={capitalStr} onChange={(e) => setCapitalStr(e.target.value)} />
              </Field>
              <Field label="حداکثر ریسک">
                <SegmentedControl<'1' | '2'>
                  label="درصد ریسک"
                  fill
                  size="sm"
                  value={maxRiskPct}
                  onChange={setMaxRiskPct}
                  options={[{ value: '1', label: '۱٪' }, { value: '2', label: '۲٪' }]}
                />
              </Field>
              <Field label="قیمت ورود (ریال)">
                <Input dir="ltr" inputMode="numeric" value={entryStr} onChange={(e) => setEntryStr(e.target.value)} placeholder="مثلاً 4500" />
              </Field>
              <Field label="حد ضرر (ریال)">
                <Input dir="ltr" inputMode="numeric" value={stopStr} onChange={(e) => setStopStr(e.target.value)} placeholder="مثلاً 4200" />
              </Field>
              <Field label="هدف قیمتی (ریال)">
                <Input dir="ltr" inputMode="numeric" value={targetStr} onChange={(e) => setTargetStr(e.target.value)} placeholder="مثلاً 5200" />
              </Field>
              <Field label="دامنه نوسان (%)">
                <Input dir="ltr" inputMode="decimal" value={dailyLimitStr} onChange={(e) => setDailyLimitStr(e.target.value)} suffix="٪" />
              </Field>
              <Field label="سهم فعلی نماد (%)">
                <Input dir="ltr" inputMode="decimal" value={existingExpStr} onChange={(e) => setExistingExpStr(e.target.value)} suffix="٪" />
              </Field>
            </div>

            {manualRiskResult && (
              <div
                className={cn(
                  'rounded-field border p-3 text-xs space-y-2',
                  manualRiskResult.approved ? 'border-gain/40 bg-gain/10' : 'border-negative/40 bg-negative/10'
                )}
              >
                <div className="flex items-center gap-2 font-extrabold text-ink">
                  {manualRiskResult.approved ? (
                    <CheckCircle2 className="h-4 w-4 text-positive" />
                  ) : (
                    <XCircle className="h-4 w-4 text-negative" />
                  )}
                  <span>{manualRiskResult.verdictTitleFa}</span>
                </div>
                <ul className="list-disc space-y-0.5 ps-4 text-[11px] text-muted">
                  {manualRiskResult.formulasFa.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
                {manualRiskResult.warnings.map((w, i) => (
                  <p key={i} className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">⚠️ {w}</p>
                ))}
              </div>
            )}
          </Surface>

          {/* کارت ۶ Agent مستقل */}
          <div className="grid gap-3 md:grid-cols-2">
            {DESK_AGENTS.map((agent) => {
              const out = activeRuns[agent.id];
              return (
                <Surface key={agent.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Badge tone="neutral">{toFaDigits(agent.order)}</Badge>
                        <h4 className="text-sm font-extrabold text-ink">{agent.nameFa}</h4>
                        {out && (
                          <Badge tone={out.provider === 'gemini' ? 'info' : 'neutral'}>
                            {out.provider === 'gemini' ? 'Gemini' : 'موتور محاسباتی'}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted">{agent.descriptionFa}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Play className="h-3 w-3" />}
                      loading={runningAgent === agent.id}
                      onClick={() => void handleRunSingleAgent(agent.id)}
                    >
                      اجرا
                    </Button>
                  </div>

                  {out && (
                    <div className="space-y-1.5 rounded-field bg-surface-2/55 p-2.5 text-xs">
                      <p className="font-semibold text-ink">{out.summaryFa}</p>
                      <Disclosure summary="مشاهده جزئیات">
                        <pre className="whitespace-pre-wrap pt-2 font-sans text-[11px] leading-6 text-muted">
                          {out.detailsMarkdownFa}
                        </pre>
                      </Disclosure>
                    </div>
                  )}
                </Surface>
              );
            })}
          </div>
        </div>
      )}

      {/* تب ۴: بکتست واقعی */}
      {subTab === 'backtest' && (
        <IranDeskBacktestPanel
          dataset={activeDataset}
          savedBacktests={state.backtests}
          onSaveResult={(res) =>
            updateState((prev) => ({ ...prev, backtests: [res, ...prev.backtests].slice(0, 30) }))
          }
        />
      )}

      {/* تب ۵: ژورنال معاملاتی و چک‌لیست ۱۱ موردی */}
      {subTab === 'journal' && (
        <IranDeskJournalPanel
          activeSymbol={selectedSymbol}
          activeAssetType={activeMeta.assetType}
          checklist={state.checklists[selectedSymbol]}
          onToggleCheck={(itemId, checked) =>
            updateState((prev) => ({
              ...prev,
              checklists: {
                ...prev.checklists,
                [selectedSymbol]: {
                  symbol: selectedSymbol,
                  updatedAt: Date.now(),
                  checks: { ...(prev.checklists[selectedSymbol]?.checks ?? {}), [itemId]: checked }
                }
              }
            }))
          }
          latestRisk={manualRiskResult ?? latestReport?.risk ?? null}
          latestThesis={activeRuns.fundamental?.summaryFa ?? ''}
          latestBull={activeRuns.bull?.summaryFa ?? ''}
          latestBear={activeRuns.bear?.summaryFa ?? ''}
          journal={state.journal}
          onAddJournalEntry={(entry) =>
            updateState((prev) => ({ ...prev, journal: [entry, ...prev.journal] }))
          }
        />
      )}

      {/* تب ۶: مدیریت داده‌ها و مقایسه صندوق‌ها */}
      {subTab === 'data' && (
        <IranDeskDataPanel
          datasets={state.datasets}
          documents={state.documents}
          onAddDataset={(ds) => {
            setSelectedSymbol(ds.symbol);
            updateState((prev) => ({
              ...prev,
              datasets: [ds, ...prev.datasets.filter((x) => x.symbol !== ds.symbol)]
            }));
          }}
          onDeleteDataset={(id) =>
            updateState((prev) => ({ ...prev, datasets: prev.datasets.filter((x) => x.id !== id) }))
          }
          onAddDocument={(doc) =>
            updateState((prev) => ({ ...prev, documents: [doc, ...prev.documents] }))
          }
          onDeleteDocument={(id) =>
            updateState((prev) => ({ ...prev, documents: prev.documents.filter((x) => x.id !== id) }))
          }
        />
      )}
    </div>
  );
}
