import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Plus, ShieldAlert, ShieldCheck, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { Button, IconButton } from '@/shared/components/ui/Button';
import { Surface } from '@/shared/components/ui/GlassCard';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Metric, MetricGrid, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { CalcShell, ResultHero, ResultPlaceholder } from './StatCard';
import { ExportButtons } from './ExportButtons';
import {
  calculateMt5Risk,
  MT5_INSTRUMENTS,
  sumDailyTradesPnl,
  type DailyClosedTrade,
  type InstrumentId,
  type PartialCloseStepInput,
  type RiskMode,
  type TradeSide
} from '@/features/calculators/domain';
import { fmtUSD, fmtPct } from '@/shared/utils/formatters';

function todayTradesStorageKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `darino_mt5_daily_trades_${y}-${m}-${day}`;
}

function fmtPrice(val: number | null | undefined, decimals: number): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '—';
  return val.toLocaleString('en-US', {
    minimumFractionDigits: Math.min(decimals, 2),
    maximumFractionDigits: decimals
  });
}

function fmtLots(val: number): string {
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface LevelLine {
  id: string;
  label: string;
  price: number;
  tone: 'entry' | 'sl' | 'tp' | 'be';
  sub: string;
}

function TradeLevelsPreview({
  levels,
  decimals
}: {
  levels: LevelLine[];
  decimals: number;
}) {
  if (levels.length < 2) return null;
  const prices = levels.map((l) => l.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const span = maxP - minP || 1;
  const padTop = 24;
  const padBot = 24;
  const height = 240;
  const usable = height - padTop - padBot;

  const yOf = (p: number) => padTop + ((maxP - p) / span) * usable;

  const toneColors: Record<LevelLine['tone'], { stroke: string; badge: string; text: string }> = {
    tp: { stroke: '#10b981', badge: 'bg-positive/15 text-positive border-positive/30', text: 'text-positive' },
    be: { stroke: '#6366f1', badge: 'bg-accent-soft text-accent border-accent/30', text: 'text-accent' },
    entry: { stroke: '#0f172a', badge: 'bg-surface-2 text-ink border-divider-strong', text: 'text-ink' },
    sl: { stroke: '#ef4444', badge: 'bg-negative/15 text-negative border-negative/30', text: 'text-negative' }
  };

  const sorted = [...levels].sort((a, b) => b.price - a.price);

  return (
    <Surface className="p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-ink">پیش‌نمایش زنده خطوط معامله روی چارت</h3>
          <p className="mt-0.5 text-xs text-muted">نسبت مکانی حد ضرر، ورود، سربه‌سر و پله‌های حد سود</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-12 md:items-center">
        <div className="md:col-span-6">
          <svg
            viewBox={`0 0 360 ${height}`}
            className="w-full rounded-field border border-divider bg-surface-2/60"
            role="img"
            aria-label="پیش‌نمایش خطوط معامله"
          >
            {sorted.map((lvl) => {
              const y = yOf(lvl.price);
              const c = toneColors[lvl.tone];
              return (
                <g key={lvl.id}>
                  <line
                    x1={16}
                    x2={230}
                    y1={y}
                    y2={y}
                    stroke={c.stroke}
                    strokeWidth={lvl.tone === 'entry' ? 2 : 1.5}
                    strokeDasharray={lvl.tone === 'be' ? '4 4' : lvl.tone === 'tp' ? '6 3' : undefined}
                  />
                  <circle cx={16} cy={y} r={3.5} fill={c.stroke} />
                  <text
                    x={238}
                    y={y + 3.5}
                    fontSize={11}
                    fontWeight={600}
                    fill={c.stroke}
                    style={{ fontFamily: 'ui-monospace, monospace' }}
                  >
                    {lvl.label}: {fmtPrice(lvl.price, decimals)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="space-y-2 md:col-span-6">
          {sorted.map((lvl) => {
            const c = toneColors[lvl.tone];
            return (
              <div
                key={lvl.id}
                className="flex items-center justify-between gap-2 rounded-control border border-divider bg-card px-3 py-2 text-xs"
              >
                <span className={`rounded-pill border px-2 py-0.5 font-semibold ${c.badge}`}>
                  {lvl.label}
                </span>
                <span className="num-ltr font-bold text-ink">{fmtPrice(lvl.price, decimals)}</span>
                <span className={`num-ltr font-medium ${c.text}`}>{lvl.sub}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Surface>
  );
}

export function Mt5RiskManagerCalculator() {
  const [instrumentId, setInstrumentId] = useState<InstrumentId>('XAUUSD');
  const preset = useMemo(
    () => MT5_INSTRUMENTS.find((x) => x.id === instrumentId) ?? MT5_INSTRUMENTS[0],
    [instrumentId]
  );

  const [side, setSide] = useState<TradeSide>('buy');
  const [equity, setEquity] = useState('10000');
  const [riskMode, setRiskMode] = useState<RiskMode>('percent');
  const [riskPct, setRiskPct] = useState('1');
  const [fixedRisk, setFixedRisk] = useState('100');
  const [leverage, setLeverage] = useState(String(preset.defaultLeverage));

  const [entryPrice, setEntryPrice] = useState(String(preset.defaultEntry));
  const [slPrice, setSlPrice] = useState(String(preset.defaultSl));
  const [tpPrice, setTpPrice] = useState(String(preset.defaultTp));

  const [contractSize, setContractSize] = useState(String(preset.contractSize));
  const [pipSize, setPipSize] = useState(String(preset.pipSize));
  const [lotStep, setLotStep] = useState(String(preset.lotStep));
  const [pipValOverride, setPipValOverride] = useState('');
  const [showSpecs, setShowSpecs] = useState(false);

  const [maxDailyLossPct, setMaxDailyLossPct] = useState('3');
  const [dailyTrades, setDailyTrades] = useState<DailyClosedTrade[]>(() => {
    try {
      const raw = localStorage.getItem(todayTradesStorageKey());
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [newTradeSymbol, setNewTradeSymbol] = useState(preset.symbol);
  const [newTradePnl, setNewTradePnl] = useState('');
  const [newTradeNote, setNewTradeNote] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(todayTradesStorageKey(), JSON.stringify(dailyTrades));
    } catch {
      // ignore storage errors
    }
  }, [dailyTrades]);

  const todayRealizedPnlUsd = useMemo(() => sumDailyTradesPnl(dailyTrades), [dailyTrades]);

  const [beEnabled, setBeEnabled] = useState(true);
  const [beTriggerR, setBeTriggerR] = useState('1');
  const [beOffsetPips, setBeOffsetPips] = useState('2');

  const [trailEnabled, setTrailEnabled] = useState(true);
  const [trailStartR, setTrailStartR] = useState('1.5');
  const [trailDistPips, setTrailDistPips] = useState('50');

  const [partialSteps, setPartialSteps] = useState<PartialCloseStepInput[]>([
    { id: 'tp1', label: 'پله ۱', closePct: 50, rMultiple: 1 },
    { id: 'tp2', label: 'پله ۲', closePct: 30, rMultiple: 2 },
    { id: 'tp3', label: 'پله ۳', closePct: 20, rMultiple: 3 }
  ]);

  // Pre-trade discipline / news guard checklist (manual)
  const [checkNoNews, setCheckNoNews] = useState(true);
  const [checkSpreadOk, setCheckSpreadOk] = useState(true);
  const [checkPlanAligned, setCheckPlanAligned] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleInstrumentChange = (nextId: InstrumentId) => {
    setInstrumentId(nextId);
    const p = MT5_INSTRUMENTS.find((x) => x.id === nextId);
    if (!p) return;
    setContractSize(String(p.contractSize));
    setPipSize(String(p.pipSize));
    setLotStep(String(p.lotStep));
    setLeverage(String(p.defaultLeverage));
    setNewTradeSymbol(p.symbol);
    setPipValOverride('');
    setEntryPrice(String(p.defaultEntry));
    if (side === 'buy') {
      setSlPrice(String(p.defaultSl));
      setTpPrice(String(p.defaultTp));
    } else {
      const slDist = Math.abs(p.defaultEntry - p.defaultSl);
      const tpDist = Math.abs(p.defaultTp - p.defaultEntry);
      setSlPrice(String(Number((p.defaultEntry + slDist).toFixed(p.priceDecimals))));
      setTpPrice(String(Number((p.defaultEntry - tpDist).toFixed(p.priceDecimals))));
    }
  };

  const handleSideChange = (nextSide: TradeSide) => {
    if (nextSide === side) return;
    setSide(nextSide);
    const e = Number(entryPrice) || 0;
    const s = Number(slPrice) || 0;
    const t = Number(tpPrice) || 0;
    if (e > 0 && s > 0) {
      const dist = Math.abs(e - s);
      setSlPrice(String(Number((nextSide === 'buy' ? e - dist : e + dist).toFixed(preset.priceDecimals))));
    }
    if (e > 0 && t > 0) {
      const dist = Math.abs(t - e);
      setTpPrice(String(Number((nextSide === 'buy' ? e + dist : e - dist).toFixed(preset.priceDecimals))));
    }
  };

  const applyTpRatio = (r: number) => {
    const e = Number(entryPrice) || 0;
    const s = Number(slPrice) || 0;
    if (!(e > 0) || !(s > 0)) return;
    const dist = Math.abs(e - s);
    const nextTp = side === 'buy' ? e + dist * r : e - dist * r;
    setTpPrice(String(Number(nextTp.toFixed(preset.priceDecimals))));
  };

  const result = useMemo(
    () =>
      calculateMt5Risk({
        side,
        equityUsd: Number(equity) || 0,
        riskMode,
        riskPercent: Number(riskPct) || 0,
        fixedRiskUsd: Number(fixedRisk) || 0,
        entryPrice: Number(entryPrice) || 0,
        stopLossPrice: Number(slPrice) || 0,
        takeProfitPrice: Number(tpPrice) || 0,
        contractSize: Number(contractSize) || 0,
        pipSize: Number(pipSize) || 0,
        lotStep: Number(lotStep) || 0.01,
        minLot: preset.minLot,
        maxLot: preset.maxLot,
        quoteCurrency: preset.quoteCurrency,
        pipValuePerLotOverride: Number(pipValOverride) > 0 ? Number(pipValOverride) : null,
        leverage: Number(leverage) || 0,
        maxDailyLossPct: Number(maxDailyLossPct) || 0,
        todayRealizedPnlUsd,
        partialSteps,
        breakeven: {
          enabled: beEnabled,
          triggerR: Number(beTriggerR) || 0,
          offsetPips: Number(beOffsetPips) || 0
        },
        trailing: {
          enabled: trailEnabled,
          startR: Number(trailStartR) || 0,
          distancePips: Number(trailDistPips) || 0
        }
      }),
    [
      side,
      equity,
      riskMode,
      riskPct,
      fixedRisk,
      entryPrice,
      slPrice,
      tpPrice,
      contractSize,
      pipSize,
      lotStep,
      preset.minLot,
      preset.maxLot,
      preset.quoteCurrency,
      pipValOverride,
      leverage,
      maxDailyLossPct,
      todayRealizedPnlUsd,
      partialSteps,
      beEnabled,
      beTriggerR,
      beOffsetPips,
      trailEnabled,
      trailStartR,
      trailDistPips
    ]
  );

  const previewLevels = useMemo<LevelLine[]>(() => {
    if (!result.valid) return [];
    const e = Number(entryPrice) || 0;
    const s = Number(slPrice) || 0;
    const t = Number(tpPrice) || 0;
    const list: LevelLine[] = [
      { id: 'entry', label: 'ورود', price: e, tone: 'entry', sub: `${fmtLots(result.recommendedLots)} لات` },
      {
        id: 'sl',
        label: 'حد ضرر (SL)',
        price: s,
        tone: 'sl',
        sub: `-${fmtUSD(result.actualRiskUsd)} (${Math.round(result.slPips)} پیپ)`
      }
    ];
    if (result.breakevenTriggerPrice !== null) {
      list.push({
        id: 'be',
        label: 'فعال‌سازی BE',
        price: result.breakevenTriggerPrice,
        tone: 'be',
        sub: `انتقال SL به ${fmtPrice(result.breakevenStopPrice, preset.priceDecimals)}`
      });
    }
    if (result.partialPlan.length > 0) {
      for (const p of result.partialPlan) {
        list.push({
          id: p.id,
          label: `${p.label} (${p.rMultiple}R)`,
          price: p.targetPrice,
          tone: 'tp',
          sub: `+${fmtUSD(p.profitUsd)} (${fmtLots(p.lotsToClose)} لات)`
        });
      }
    } else if (t > 0 && result.rewardRiskRatio !== null) {
      list.push({
        id: 'tp',
        label: `حد سود (${result.rewardRiskRatio.toFixed(1)}R)`,
        price: t,
        tone: 'tp',
        sub: `+${fmtUSD(result.targetProfitUsd)}`
      });
    }
    return list;
  }, [result, entryPrice, slPrice, tpPrice, preset.priceDecimals]);

  const handleCopyTicket = () => {
    const summary = [
      `نماد: ${preset.symbol} (${side === 'buy' ? 'BUY' : 'SELL'})`,
      `حجم: ${fmtLots(result.recommendedLots)} Lot`,
      `ورود: ${entryPrice}`,
      `SL: ${slPrice} (${Math.round(result.slPips)} pips | -${fmtUSD(result.actualRiskUsd)})`,
      `TP: ${tpPrice || '—'}`,
      result.partialPlan.length
        ? `خروج پله‌ای: ${result.partialPlan.map((p) => `${p.label}: ${fmtPrice(p.targetPrice, preset.priceDecimals)} (${fmtLots(p.lotsToClose)}L)`).join(' | ')}`
        : ''
    ]
      .filter(Boolean)
      .join('\n');
    navigator.clipboard?.writeText(summary).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const allDisciplineOk =
    checkNoNews && checkSpreadOk && checkPlanAligned && result.dailyStatus !== 'breached' && result.valid;

  const handleAddDailyTrade = () => {
    const pnl = Number(newTradePnl);
    if (!Number.isFinite(pnl) || newTradePnl.trim() === '') return;
    setDailyTrades((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        symbol: newTradeSymbol.trim() || preset.symbol,
        pnlUsd: pnl,
        note: newTradeNote.trim() || undefined,
        createdAt: Date.now()
      },
      ...prev
    ]);
    setNewTradePnl('');
    setNewTradeNote('');
  };

  const inputs = (
    <div className="space-y-4">
      <Field label="نماد معاملاتی (پیش‌فرض بایبیت MT5)">
        <Select value={instrumentId} onChange={(e) => handleInstrumentChange(e.target.value as InstrumentId)}>
          {MT5_INSTRUMENTS.map((ins) => (
            <option key={ins.id} value={ins.id}>
              {ins.nameFa}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-[11px] text-muted">{preset.brokerNote}</p>
      </Field>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted">جهت معامله</p>
        <SegmentedControl<TradeSide>
          label="جهت معامله"
          fill
          size="sm"
          value={side}
          onChange={handleSideChange}
          options={[
            { value: 'buy', label: 'خرید (Buy)' },
            { value: 'sell', label: 'فروش (Sell)' }
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="موجودی / اکوئیتی">
          <Input dir="ltr" inputMode="decimal" value={equity} onChange={(e) => setEquity(e.target.value)} suffix="$" />
        </Field>
        <Field label="اهرم حساب">
          <Input dir="ltr" inputMode="decimal" value={leverage} onChange={(e) => setLeverage(e.target.value)} suffix="1:X" />
        </Field>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted">مبنای ریسک معامله</span>
        </div>
        <SegmentedControl<RiskMode>
          label="مبنای ریسک"
          fill
          size="sm"
          value={riskMode}
          onChange={setRiskMode}
          options={[
            { value: 'percent', label: 'درصد از اکوئیتی (٪)' },
            { value: 'fixed', label: 'مبلغ ثابت ($)' }
          ]}
        />
        <div className="mt-3">
          {riskMode === 'percent' ? (
            <Field label="درصد ریسک مجاز">
              <Input dir="ltr" inputMode="decimal" value={riskPct} onChange={(e) => setRiskPct(e.target.value)} suffix="%" />
            </Field>
          ) : (
            <Field label="مبلغ ریسک ثابت">
              <Input dir="ltr" inputMode="decimal" value={fixedRisk} onChange={(e) => setFixedRisk(e.target.value)} suffix="$" />
            </Field>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="قیمت ورود (Entry)">
          <Input dir="ltr" inputMode="decimal" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} />
        </Field>
        <Field label="حد ضرر (Stop Loss)">
          <Input dir="ltr" inputMode="decimal" value={slPrice} onChange={(e) => setSlPrice(e.target.value)} />
        </Field>
      </div>

      <Field
        label="حد سود اصلی (Take Profit)"
        labelAside={
          <div className="flex items-center gap-1">
            {[1.5, 2, 3].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => applyTpRatio(r)}
                className="rounded-control border border-divider-strong px-1.5 py-0.5 text-[11px] font-semibold text-muted hover:bg-surface-2 hover:text-ink"
              >
                {r}R
              </button>
            ))}
          </div>
        }
      >
        <Input dir="ltr" inputMode="decimal" value={tpPrice} onChange={(e) => setTpPrice(e.target.value)} />
      </Field>

      <div className="border-t border-divider pt-3">
        <p className="mb-2 text-xs font-bold text-ink">سقف مجاز افت روزانه (Daily Drawdown)</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="سقف افت روزانه">
            <Input dir="ltr" inputMode="decimal" value={maxDailyLossPct} onChange={(e) => setMaxDailyLossPct(e.target.value)} suffix="%" />
          </Field>
          <div className="flex flex-col justify-end rounded-field border border-divider bg-surface-2/60 px-3 py-2">
            <span className="text-[11px] text-muted">جمع خودکار امروز</span>
            <MoneyValue value={todayRealizedPnlUsd} signed tone="auto" className="text-sm font-bold" />
          </div>
        </div>
      </div>

      <div className="border-t border-divider pt-3">
        <button
          type="button"
          onClick={() => setShowSpecs((v) => !v)}
          className="flex w-full items-center justify-between text-xs font-semibold text-accent hover:underline"
        >
          <span className="inline-flex items-center gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            مشخصات قرارداد نماد ({preset.symbol})
          </span>
          <span>{showSpecs ? 'بستن' : 'ویرایش'}</span>
        </button>
        {showSpecs && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="اندازه قرارداد (Contract)">
              <Input dir="ltr" inputMode="decimal" value={contractSize} onChange={(e) => setContractSize(e.target.value)} />
            </Field>
            <Field label="اندازه پیپ (Pip Size)">
              <Input dir="ltr" inputMode="decimal" value={pipSize} onChange={(e) => setPipSize(e.target.value)} />
            </Field>
            <Field label="گام لات (Lot Step)">
              <Input dir="ltr" inputMode="decimal" value={lotStep} onChange={(e) => setLotStep(e.target.value)} />
            </Field>
            <Field label="ارزش پیپ دستی (اختیاری)">
              <Input dir="ltr" inputMode="decimal" placeholder="خودکار" value={pipValOverride} onChange={(e) => setPipValOverride(e.target.value)} suffix="$" />
            </Field>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <Notice tone="info">
        این پنل <strong>کاملاً آفلاین و دستی</strong> است؛ هیچ کلید یا دسترسی به حساب متاتریدر ۵ دریافت نمی‌شود. اعداد را اینجا محاسبه و در متاتریدر وارد کنید.
      </Notice>

      <CalcShell inputs={inputs} inputTitle="تنظیمات معامله و ریسک">
        {!result.valid ? (
          <ResultPlaceholder>
            {result.warnings.includes('invalidSlSide')
              ? side === 'buy'
                ? 'در معامله خرید (Buy)، حد ضرر باید کمتر از قیمت ورود باشد.'
                : 'در معامله فروش (Sell)، حد ضرر باید بیشتر از قیمت ورود باشد.'
              : 'موجودی، قیمت ورود و حد ضرر معتبر را وارد کنید تا حجم دقیق معامله محاسبه شود.'}
          </ResultPlaceholder>
        ) : (
          <>
            {result.dailyStatus === 'breached' && (
              <Notice tone="error">
                <strong>هشدار سقف افت روزانه:</strong> ریسک این معامله به همراه زیان امروز از سقف مجاز روزانه (
                {fmtUSD(result.maxDailyLossUsd)}) عبور می‌کند! بیشترین ریسک مجاز باقی‌مانده امروز:{' '}
                <strong>{fmtUSD(result.remainingDailyRiskUsd)}</strong>.
              </Notice>
            )}
            {result.dailyStatus === 'caution' && (
              <Notice tone="warn">
                با ثبت این معامله، <strong>{result.projectedDailyLossPct.toFixed(0)}٪</strong> از سقف افت روزانه شما مصرف می‌شود. باقیمانده ایمن امروز: {fmtUSD(result.remainingDailyRiskUsd)}.
              </Notice>
            )}
            {result.warnings.includes('belowMinLot') && (
              <Notice tone="warn">
                حجم محاسبه‌شده ({result.rawLots.toFixed(3)}) کمتر از حداقل لات مجاز ({preset.minLot}) است. فاصله حد ضرر را کمتر یا مبلغ ریسک را بیشتر کنید.
              </Notice>
            )}

            <ResultHero
              label="حجم دقیق ورود (Lot Size)"
              value={<span className="num-ltr">{fmtLots(result.recommendedLots)} Lot</span>}
              sub={
                <>
                  ریسک واقعی: <MoneyValue value={result.actualRiskUsd} className="font-semibold text-negative" /> (
                  <PercentValue value={result.actualRiskPct} className="font-semibold" />)
                  {result.rewardRiskRatio !== null && (
                    <>
                      {' '}
                      · نسبت R:R: <span className="num-ltr font-bold text-ink">1 : {result.rewardRiskRatio.toFixed(2)}</span>
                    </>
                  )}
                </>
              }
              aside={
                <Button
                  variant="outline"
                  size="sm"
                  icon={copied ? <Check /> : <Copy />}
                  onClick={handleCopyTicket}
                >
                  {copied ? 'کپی شد' : 'کپی مشخصات'}
                </Button>
              }
            >
              <MetricGrid cols={3}>
                <Metric
                  label="فاصله حد ضرر"
                  value={<span className="num-ltr">{result.slPips.toFixed(1)} پیپ</span>}
                  sub={`ارزش هر پیپ: ${fmtUSD(result.pipValuePerLotUsd)}`}
                />
                <Metric
                  label="سود حد سود اصلی"
                  value={<MoneyValue value={result.targetProfitUsd} tone="gain" />}
                  sub={result.tpPips > 0 ? `${result.tpPips.toFixed(1)} پیپ` : 'بدون TP'}
                />
                <Metric
                  label="مارجین تقریبی"
                  value={<MoneyValue value={result.estimatedMarginUsd} />}
                  sub={`ارزش اسمی: ${fmtUSD(result.notionalUsd)}`}
                />
              </MetricGrid>
            </ResultHero>

            {/* Daily Drawdown Meter + Manual Today Trades Log */}
            <Surface className="space-y-4 p-4 md:p-5">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {result.dailyStatus === 'breached' ? (
                      <ShieldAlert className="h-4 w-4 text-negative" />
                    ) : (
                      <ShieldCheck className="h-4 w-4 text-positive" />
                    )}
                    <h3 className="text-sm font-bold text-ink">پایش سقف افت روزانه و دفترچه امروز</h3>
                  </div>
                  <span className="num-ltr text-xs font-semibold text-muted">
                    مصرفی با این معامله: {fmtUSD(result.projectedDailyLossUsd)} / {fmtUSD(result.maxDailyLossUsd)}
                  </span>
                </div>
                <div className="mt-3 h-2.5 w-full overflow-hidden rounded-pill bg-surface-2">
                  <div
                    className={`h-full transition-all ${
                      result.dailyStatus === 'breached'
                        ? 'bg-negative'
                        : result.dailyStatus === 'caution'
                          ? 'bg-amber-500'
                          : 'bg-positive'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, result.projectedDailyLossPct))}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted">
                  ظرفیت ریسک باقی‌مانده امروز پیش از این معامله: <strong className="text-ink">{fmtUSD(result.remainingDailyRiskUsd)}</strong>
                </p>
              </div>

              <div className="border-t border-divider pt-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-ink">ثبت دستی معاملات بسته‌شده امروز</span>
                  {dailyTrades.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDailyTrades([])}
                      className="text-[11px] font-semibold text-negative hover:underline"
                    >
                      پاک کردن لیست امروز
                    </button>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-12">
                  <div className="sm:col-span-3">
                    <Input
                      dir="ltr"
                      placeholder="نماد"
                      aria-label="نماد معامله"
                      value={newTradeSymbol}
                      onChange={(e) => setNewTradeSymbol(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Input
                      dir="ltr"
                      inputMode="decimal"
                      placeholder="مثلاً -45 یا 120"
                      aria-label="سود یا زیان دلاری"
                      value={newTradePnl}
                      onChange={(e) => setNewTradePnl(e.target.value)}
                      suffix="$"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <Input
                      placeholder="یادداشت (اختیاری)"
                      aria-label="یادداشت معامله"
                      value={newTradeNote}
                      onChange={(e) => setNewTradeNote(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Button
                      variant="secondary"
                      size="md"
                      className="w-full"
                      icon={<Plus />}
                      onClick={handleAddDailyTrade}
                    >
                      ثبت
                    </Button>
                  </div>
                </div>

                {dailyTrades.length > 0 && (
                  <div className="divide-y divide-divider rounded-control border border-divider bg-surface-2/40">
                    {dailyTrades.map((tr) => (
                      <div key={tr.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="num-ltr font-bold text-ink">{tr.symbol}</span>
                          {tr.note && <span className="truncate text-muted">· {tr.note}</span>}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <MoneyValue value={tr.pnlUsd} signed tone="auto" className="font-bold" />
                          <IconButton
                            size="sm"
                            aria-label="حذف معامله"
                            onClick={() => setDailyTrades((prev) => prev.filter((x) => x.id !== tr.id))}
                          >
                            <Trash2 />
                          </IconButton>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Surface>

            {/* Live Trade Levels Preview */}
            <TradeLevelsPreview levels={previewLevels} decimals={preset.priceDecimals} />

            {/* Partial Close & Trailing Stop */}
            <Surface className="space-y-4 p-4 md:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-ink">برنامه خروج پله‌ای (Partial Close)</h3>
                  <p className="mt-0.5 text-xs text-muted">
                    سود کل پله‌ها:{' '}
                    <strong className="text-positive">{fmtUSD(result.totalPartialProfitUsd)}</strong>
                    {result.blendedRewardRisk !== null && (
                      <> · میانگین R:R ترکیبی: <span className="num-ltr font-semibold text-ink">1 : {result.blendedRewardRisk.toFixed(2)}</span></>
                    )}
                  </p>
                </div>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-3">
                {partialSteps.map((step, idx) => (
                  <div key={step.id} className="rounded-control border border-divider bg-surface-2/50 p-2.5 space-y-2">
                    <span className="text-xs font-bold text-ink">{step.label}</span>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="درصد حجم">
                        <Input
                          dir="ltr"
                          inputMode="decimal"
                          value={String(step.closePct)}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setPartialSteps((prev) => prev.map((x, i) => (i === idx ? { ...x, closePct: val } : x)));
                          }}
                          suffix="%"
                        />
                      </Field>
                      <Field label="نسبت R">
                        <Input
                          dir="ltr"
                          inputMode="decimal"
                          value={String(step.rMultiple)}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setPartialSteps((prev) => prev.map((x, i) => (i === idx ? { ...x, rMultiple: val } : x)));
                          }}
                          suffix="R"
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>

              {result.partialPlan.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="data-table is-compact">
                    <thead>
                      <tr>
                        <th scope="col">پله</th>
                        <th scope="col" className="col-num">نسبت</th>
                        <th scope="col" className="col-num">قیمت هدف</th>
                        <th scope="col" className="col-num">حجم بستن</th>
                        <th scope="col" className="col-num">سود پله</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.partialPlan.map((p) => (
                        <tr key={p.id}>
                          <td className="font-semibold">{p.label}</td>
                          <td className="col-num num-ltr">{p.rMultiple}R</td>
                          <td className="col-num num-ltr">{fmtPrice(p.targetPrice, preset.priceDecimals)}</td>
                          <td className="col-num num-ltr">{fmtLots(p.lotsToClose)} لات</td>
                          <td className="col-num"><MoneyValue value={p.profitUsd} signed tone="gain" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Surface>

            {/* Breakeven & Trailing Stop */}
            <Surface className="space-y-4 p-4 md:p-5">
              <h3 className="text-sm font-bold text-ink">سربه‌سر (Breakeven) و تریلینگ استاپ</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2.5 rounded-control border border-divider p-3">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-ink">
                    <input
                      type="checkbox"
                      checked={beEnabled}
                      onChange={(e) => setBeEnabled(e.target.checked)}
                      className="h-4 w-4 accent-accent"
                    />
                    انتقال خودکار به سربه‌سر (برنامه‌ریزی)
                  </label>
                  {beEnabled && (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="در سود (R)">
                        <Input dir="ltr" inputMode="decimal" value={beTriggerR} onChange={(e) => setBeTriggerR(e.target.value)} suffix="R" />
                      </Field>
                      <Field label="افست (+پیپ)">
                        <Input dir="ltr" inputMode="decimal" value={beOffsetPips} onChange={(e) => setBeOffsetPips(e.target.value)} />
                      </Field>
                    </div>
                  )}
                </div>

                <div className="space-y-2.5 rounded-control border border-divider p-3">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-ink">
                    <input
                      type="checkbox"
                      checked={trailEnabled}
                      onChange={(e) => setTrailEnabled(e.target.checked)}
                      className="h-4 w-4 accent-accent"
                    />
                    تریلینگ استاپ (Trailing Stop)
                  </label>
                  {trailEnabled && (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="شروع از (R)">
                        <Input dir="ltr" inputMode="decimal" value={trailStartR} onChange={(e) => setTrailStartR(e.target.value)} suffix="R" />
                      </Field>
                      <Field label="فاصله (پیپ)">
                        <Input dir="ltr" inputMode="decimal" value={trailDistPips} onChange={(e) => setTrailDistPips(e.target.value)} />
                      </Field>
                    </div>
                  )}
                </div>
              </div>

              {result.trailingCheckpoints.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="data-table is-compact">
                    <thead>
                      <tr>
                        <th scope="col">نقطه رشد قیمت</th>
                        <th scope="col" className="col-num">قیمت بازار</th>
                        <th scope="col" className="col-num">SL جدید (تریل‌شده)</th>
                        <th scope="col" className="col-num">سود قفل‌شده</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.trailingCheckpoints.map((cp) => (
                        <tr key={cp.rMultiple}>
                          <td className="num-ltr font-semibold">+{cp.rMultiple}R</td>
                          <td className="col-num num-ltr">{fmtPrice(cp.marketPrice, preset.priceDecimals)}</td>
                          <td className="col-num num-ltr">{fmtPrice(cp.trailedSlPrice, preset.priceDecimals)}</td>
                          <td className="col-num">
                            <MoneyValue value={cp.lockedProfitUsd} signed tone="auto" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Surface>

            {/* Pre-Trade News & Discipline Guard */}
            <Surface className="space-y-3 p-4 md:p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-ink">چک‌لیست فیلتر اخبار و انضباط پیش از ورود</h3>
                <span
                  className={`rounded-pill px-2.5 py-0.5 text-xs font-bold ${
                    allDisciplineOk ? 'bg-positive/15 text-positive' : 'bg-negative/15 text-negative'
                  }`}
                >
                  {allDisciplineOk ? 'آماده ثبت دستی در MT5' : 'نیاز به بررسی'}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 text-xs">
                <label className="flex cursor-pointer items-center gap-2 rounded-control border border-divider p-2.5">
                  <input type="checkbox" checked={checkNoNews} onChange={(e) => setCheckNoNews(e.target.checked)} className="h-4 w-4 accent-accent" />
                  <span>عدم خبر قرمز تا ۳۰ دقیقه آینده</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-control border border-divider p-2.5">
                  <input type="checkbox" checked={checkSpreadOk} onChange={(e) => setCheckSpreadOk(e.target.checked)} className="h-4 w-4 accent-accent" />
                  <span>اسپرد بروکر در محدوده عادی است</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-control border border-divider p-2.5">
                  <input type="checkbox" checked={checkPlanAligned} onChange={(e) => setCheckPlanAligned(e.target.checked)} className="h-4 w-4 accent-accent" />
                  <span>مطابق ستاپ و R:R مجاز است</span>
                </label>
              </div>
            </Surface>

            <ExportButtons
              filename={`mt5-risk-${preset.symbol}.csv`}
              headers={['نماد', 'جهت', 'اکوئیتی', 'حجم (لات)', 'ورود', 'SL', 'TP', 'ریسک ($)', 'ریسک (%)', 'R:R']}
              rows={[
                [
                  preset.symbol,
                  side.toUpperCase(),
                  Number(equity) || 0,
                  result.recommendedLots,
                  Number(entryPrice) || 0,
                  Number(slPrice) || 0,
                  Number(tpPrice) || 0,
                  result.actualRiskUsd,
                  result.actualRiskPct,
                  result.rewardRiskRatio ?? 'N/A'
                ]
              ]}
              pdfTitle={`برگه مدیریت ریسک MT5 — ${preset.symbol}`}
              pdfSections={[
                {
                  heading: `مشخصات معامله ${preset.nameFa} (${side === 'buy' ? 'خرید' : 'فروش'})`,
                  table: {
                    headers: ['شاخص', 'مقدار'],
                    rows: [
                      ['موجودی حساب', fmtUSD(Number(equity) || 0)],
                      ['حجم پیشنهادی', `${fmtLots(result.recommendedLots)} Lot`],
                      ['قیمت ورود', fmtPrice(Number(entryPrice), preset.priceDecimals)],
                      ['حد ضرر (SL)', `${fmtPrice(Number(slPrice), preset.priceDecimals)} (${result.slPips.toFixed(1)} پیپ)`],
                      ['حد سود (TP)', tpPrice ? fmtPrice(Number(tpPrice), preset.priceDecimals) : '—'],
                      ['ریسک واقعی', `${fmtUSD(result.actualRiskUsd)} (${fmtPct(result.actualRiskPct)})`],
                      ['نسبت R:R', result.rewardRiskRatio ? `1 : ${result.rewardRiskRatio.toFixed(2)}` : '—'],
                      ['سقف افت روزانه', `${fmtUSD(result.projectedDailyLossUsd)} / ${fmtUSD(result.maxDailyLossUsd)}`]
                    ]
                  },
                  note: 'محاسبه کاملاً دستی و بدون اتصال به کلید حساب متاتریدر ۵.'
                }
              ]}
            />
          </>
        )}
      </CalcShell>
    </div>
  );
}
