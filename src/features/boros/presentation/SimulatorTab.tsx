/**
 * شبیه‌ساز Boros — فقط Input → BorosCalculationEngine → Output
 *
 * WORLD A (Preview/Simulation):
 *  - Projected Margin / Notional / Settlement / Fees / Net PnL / Scenarios
 *  - Rate Sensitivity · Theoretical APR Risk Buffer (متریک شبیه‌ساز)
 *  - Liquidation Implied APR = N/A (Live Boros position required) — هرگز حدس زده نمی‌شود
 *  - MTM سناریو = N/A (Mark سناریو در دسترس نیست — Underlying هرگز Mark نمی‌شود)
 */
import { useMemo, useState } from 'react';
import { Calculator, FileCheck2 } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { Input } from '@/shared/components/ui/Input';
import { ProvenanceBadge } from '@/shared/components/ui/ProvenanceBadge';
import { fmtPct, fmtUSD } from '@/shared/utils/formatters';
import { OrderPreviewPanel } from './OrderPreviewPanel';
import { BorosCalculationEngine, calcRateSensitivity, daysToMaturity, projectCapital } from '@/features/boros/domain/calc';
import type { BorosDirection, BorosMarket } from '@/features/boros/domain/types';
import {
  isLiquidationAPRAvailable,
  LIQUIDATION_SOURCE_FA
} from '@/features/boros/domain/liquidationApr';
import { cn } from '@/shared/lib/cn';

const LIVE_POSITION_NA_REASON =
  'Live Boros position required — بدون Position و Collateral واقعی در Boros، Liquidation Implied APR قابل محاسبه نیست (N/A).';

export function SimulatorTab({ markets }: { markets: BorosMarket[] }) {
  const [marketId, setMarketId] = useState(markets[0]?.marketId ?? 0);
  const [direction, setDirection] = useState<BorosDirection>('long');
  const [size, setSize] = useState(222);
  const [fixedRate, setFixedRate] = useState<number | null>(null);
  const [gasUsd, setGasUsd] = useState(0);
  const [capitalUsd, setCapitalUsd] = useState(1000);
  /** MODE B = شبیه‌سازی (سرمایه فرضی) · MODE C = پیش‌نمایش سفارش */
  const [previewMode, setPreviewMode] = useState<'sim' | 'preview'>('sim');

  const market = markets.find((m) => m.marketId === marketId) ?? markets[0];
  const days = market ? daysToMaturity(market) : 0;
  const rate = fixedRate ?? market?.markApr ?? 0;

  const sim = useMemo(() => {
    if (!market || size <= 0) return null;
    const sizeN = Number(size) || 0;
    const analysis = BorosCalculationEngine.analyze({
      m: market,
      size: sizeN,
      gasUsd,
      slippageRate: null // بدون Order Book عمومی → N/A (هرگز حدس نمی‌زنیم)
    });
    const sensitivity = calcRateSensitivity(sizeN, days);
    // PnL جهت انتخابی (از موتور — Long/Short جدا)
    const isLong = direction === 'long';
    const currentPnl = isLong ? analysis.grossLongPnl : analysis.grossShortPnl;
    const netCurrent = isLong ? analysis.totalLongPnl : analysis.totalShortPnl;
    const mtm = isLong ? analysis.mtmLongPnl : analysis.mtmShortPnl;
    // پروجکشن سرمایه: «اگر X دلار سرمایه وارد کنم» (initial-margin-only)
    const proj = projectCapital({
      m: market,
      capitalUsd: Number(capitalUsd) || 0,
      direction,
      gasUsd
    });
    return { analysis, sensitivity, currentPnl, netCurrent, mtm, isLong, proj };
  }, [market, size, fixedRate, days, gasUsd, direction, capitalUsd]);

  if (!market) {
    return (
      <GlassCard variant="soft" className="p-6 text-center text-[11px] font-bold text-muted">
        بازار فعالی موجود نیست
      </GlassCard>
    );
  }

  const a = sim?.analysis;
  const fees = a?.fees;
  const proj = sim?.proj;

  return (
    <div className="space-y-3">
      {/* ورودی‌ها */}
      <GlassCard className="p-3.5">
        <h4 className="mb-2.5 flex items-center gap-1.5 text-[12px] font-black text-ink">
          <Calculator className="h-4 w-4 text-accent" /> ورودی‌های شبیه‌سازی
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className="mb-1 block text-[11px] font-bold text-muted">بازار</label>
            <select
              value={market.marketId}
              onChange={(e) => setMarketId(Number(e.target.value))}
              className="glass-inset h-10 w-full rounded-2xl px-3 text-[10px] font-bold text-ink outline-none"
            >
              {markets.map((m) => (
                <option key={m.marketId} value={m.marketId}>
                  {m.name} — {fmtPct(m.markApr * 100)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-muted">جهت</label>
            <div className="flex gap-1.5">
              {(['long', 'short'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDirection(d)}
                  className={cn(
                    'flex-1 rounded-xl px-2 py-2 text-[10px] font-black transition-all',
                    direction === d
                      ? d === 'long'
                        ? 'bg-positive text-white'
                        : 'bg-negative text-white'
                      : 'glass-inset text-muted'
                  )}
                >
                  {d === 'long' ? 'لانگ' : 'شورت'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-muted">حجم (YU)</label>
            <Input dir="ltr" type="number" value={size} onChange={(e) => setSize(Number(e.target.value) || 0)} className="h-10 text-xs text-start" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-muted">نرخ ثابت (٪)</label>
            <Input
              dir="ltr"
              type="number"
              step="0.01"
              value={fixedRate === null ? '' : fixedRate * 100}
              onChange={(e) => setFixedRate(e.target.value === '' ? null : Number(e.target.value) / 100)}
              placeholder={fmtPct(market.markApr * 100)}
              className="h-10 text-xs text-start"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-muted">گس ($)</label>
            <Input dir="ltr" type="number" value={gasUsd} onChange={(e) => setGasUsd(Number(e.target.value) || 0)} className="h-10 text-xs text-start" />
          </div>
        </div>
        <p className="mt-2 text-[9px] font-medium text-muted/70">
          {market.name} · {days} روز تا سررسید · Mark APR: {fmtPct(market.markApr * 100)} ·
          نرخ شناور (Underlying): {fmtPct(market.floatingApr * 100)} ·
          ۷d میانگین: {a && a.avg7d !== null ? fmtPct(a.avg7d * 100) : '—'}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[8px] font-bold text-muted">
          <span className="flex items-center gap-1">Fixed/Implied: <span className="num-ltr text-ink">{fmtPct(rate * 100)}</span> <ProvenanceBadge kind="boros" label="BOROS • LIVE" /></span>
          <span className="flex items-center gap-1">Mark: <span className="num-ltr text-ink">{fmtPct(market.markApr * 100)}</span> <ProvenanceBadge kind="boros" label="BOROS • LIVE" /></span>
          <span className="flex items-center gap-1">Underlying: <span className="num-ltr text-ink">{fmtPct(market.floatingApr * 100)}</span> <ProvenanceBadge kind="boros" label="BOROS • LIVE" /></span>
        </div>
        <p className="mt-1 text-[8px] font-medium text-muted/60">
          ⚠ Implied/Fixed ≠ Mark ≠ Underlying — Fixed (نرخ ورود YU) · Mark (TWAP برای MTM/ریسک) · Underlying (Funding واقعی برای Settlement)
        </p>
      </GlassCard>

      {/* سوییچ MODE */}
      <GlassCard className="p-2.5">
        <div className="flex items-center gap-1 rounded-xl bg-surface-2/70 p-1">
          <button
            onClick={() => setPreviewMode('sim')}
            className={cn(
              'flex-1 rounded-lg px-2 py-1.5 text-[10px] font-black transition-colors',
              previewMode === 'sim' ? 'bg-card text-accent shadow-card' : 'text-muted hover:text-ink'
            )}
          >
            MODE B — شبیه‌سازی (سرمایه فرضی)
          </button>
          <button
            onClick={() => setPreviewMode('preview')}
            className={cn(
              'flex-1 rounded-lg px-2 py-1.5 text-[10px] font-black transition-colors',
              previewMode === 'preview' ? 'bg-card text-accent shadow-card' : 'text-muted hover:text-ink'
            )}
          >
            MODE C — پیش‌نمایش سفارش
          </button>
        </div>
        <p className="mt-1.5 text-[8px] font-medium leading-4 text-muted">
          {previewMode === 'sim'
            ? 'شبیه‌سازی — نه Position اجراشدهٔ Boros. Liquidation APR = N/A (بدون Position واقعی).'
            : 'پیش‌نمایش قبل از اجرا — با Collateral موجود. Liquidation APR فقط اگر Boros مقدار رسمی Preview بدهد.'}
        </p>
      </GlassCard>

      {previewMode === 'preview' && (
        <OrderPreviewPanel
          market={market}
          direction={direction}
          fixedRate={fixedRate}
          underlyingApr={market.floatingApr}
          collateralPriceUsd={market.assetMarkPrice > 0 ? market.assetMarkPrice : 0}
        />
      )}

      {previewMode === 'sim' && sim && a && fees && (
        <>
          {/* مارجین + حساسیت */}
          <div className="grid grid-cols-2 gap-2">
            <GlassCard variant="soft" className="p-3.5">
              <p className="text-[10px] font-bold text-muted">مارجین موردنیاز (فرمول رسمی)</p>
              <p className="num-ltr mt-0.5 text-lg font-black text-ink">{fmtUSD(a.marginRequired)}</p>
              <p className="num-ltr text-[8px] font-medium text-muted">
                {size} × max({fmtPct(rate * 100)}, کف {fmtPct(market.marginFloor * 100)}) × YTM × IM ({fmtPct(market.kIM * 100)})
              </p>
            </GlassCard>
            <GlassCard variant="soft" className="p-3.5">
              <p className="text-[10px] font-bold text-muted">حساسیت نرخ (۱٪)</p>
              <p className="num-ltr mt-0.5 text-lg font-black text-ink">{fmtUSD(sim.sensitivity)}</p>
              <p className="text-[8px] font-medium text-muted">تغییر PnL به ازای +۱٪ APR (Notional × Days/365 × 1%)</p>
            </GlassCard>
          </div>

          {/* ===== پروجکشن سرمایه: اگر X دلار وارد کنم ===== */}
          {proj && (
            <GlassCard className="border-accent/30 p-3.5">
              <h4 className="mb-2 flex items-center gap-1.5 text-[12px] font-black text-ink">
                <Calculator className="h-4 w-4 text-accent" /> پروجکشن سرمایه — «اگر {fmtUSD(proj.capital)} وارد کنم»
              </h4>
              <div className="mb-2 flex items-center gap-2">
                <label className="text-[10px] font-bold text-muted">سرمایه ($):</label>
                <input
                  type="number"
                  value={capitalUsd}
                  onChange={(e) => setCapitalUsd(Number(e.target.value) || 0)}
                  className="glass-inset h-8 w-28 rounded-xl px-2 text-[10px] font-bold text-ink outline-none"
                />
                <span className="text-[9px] font-medium text-muted">حالت: فقط Initial Margin (هزینه‌ها جدا)</span>
              </div>

              {/* ⚠️ هشدار لوریج متعارف */}
              <p className="mb-2 flex items-start gap-1 rounded-lg border border-warn/20 bg-warn/8 px-2 py-1.5 text-[8px] font-medium leading-4 text-warn/90">
                ⚠ {proj.effectiveExposure.toFixed(1)}x = Notional/Capital — این لوریج متعارف دارایی (Collateral Leverage) نیست؛
                در Boros ریسک عمدتاً با Rate Sensitivity و حاشیه امنیت (Margin Buffer) تعیین می‌شود.
              </p>

              <div className="grid grid-cols-2 gap-1.5 text-[9px] font-bold sm:grid-cols-3">
                <div className="rounded-lg bg-line/5 px-2 py-1.5"><p className="text-muted">Margin Capital</p><p className="num-ltr text-ink">{fmtUSD(proj.initialMargin)}</p></div>
                <div className="rounded-lg bg-line/5 px-2 py-1.5"><p className="text-muted">Projected Notional</p><p className="num-ltr text-ink">{fmtUSD(proj.notional)}</p></div>
                <div className="rounded-lg bg-accent/10 px-2 py-1.5"><p className="text-muted">Notional / Capital</p><p className="num-ltr font-black text-accent">{proj.effectiveExposure.toFixed(2)}x</p></div>
                <div className="rounded-lg bg-line/5 px-2 py-1.5"><p className="text-muted">Round Trip Margin</p><p className="num-ltr text-ink">{fmtUSD(proj.recalculatedMargin)}</p></div>
                <div className="rounded-lg bg-line/5 px-2 py-1.5"><p className="text-muted">Rate Sensitivity / 1%</p><p className="num-ltr text-ink">{fmtUSD(proj.rateSensitivity)}</p></div>
                <div className="rounded-lg bg-line/5 px-2 py-1.5"><p className="text-muted">Entry Cost</p><p className="num-ltr text-ink">{fmtUSD(proj.entryCost)}</p></div>
                <div className="rounded-lg bg-line/5 px-2 py-1.5"><p className="flex items-center gap-1 text-muted">Settlement PnL <ProvenanceBadge kind="calculated" /></p><p className={cn('num-ltr', proj.expectedSettlementPnl >= 0 ? 'text-positive' : 'text-negative')}>{proj.expectedSettlementPnl >= 0 ? '+' : ''}{fmtUSD(proj.expectedSettlementPnl)}</p></div>
                <div className="rounded-lg bg-line/5 px-2 py-1.5"><p className="text-muted">MTM (تحقق‌نیافته)</p><p className={cn('num-ltr', proj.expectedMtm >= 0 ? 'text-positive' : 'text-negative')}>{proj.expectedMtm >= 0 ? '+' : ''}{fmtUSD(proj.expectedMtm)}</p></div>
                <div className="rounded-lg bg-line/5 px-2 py-1.5"><p className="text-muted">Total Cost</p><p className="num-ltr text-negative">{fmtUSD(proj.totalCost)}</p></div>
                <div className="rounded-lg bg-positive/10 px-2 py-1.5"><p className="text-muted">Expected Net PnL</p><p className={cn('num-ltr font-black', proj.expectedNetPnl >= 0 ? 'text-positive' : 'text-negative')}>{proj.expectedNetPnl >= 0 ? '+' : ''}{fmtUSD(proj.expectedNetPnl)}</p></div>
                <div className="rounded-lg bg-line/5 px-2 py-1.5"><p className="text-muted">ROI on Margin</p><p className={cn('num-ltr', proj.roiOnMargin >= 0 ? 'text-positive' : 'text-negative')}>{fmtPct(proj.roiOnMargin)}</p></div>
                <div className="rounded-lg bg-warn/10 px-2 py-1.5">
                  <p className="text-muted">Theoretical Annualized ROI* ({proj.daysToMaturity} روز)</p>
                  <p className={cn('num-ltr', proj.theoreticalAnnualizedRoi >= 0 ? 'text-positive' : 'text-negative')}>{fmtPct(proj.theoreticalAnnualizedRoi)}</p>
                </div>
              </div>
              <p className="mt-1 text-[8px] font-medium text-muted/70">
                *Annualized فقط extrapolation ریاضی است — پیش‌بینی بازده آینده نیست. MTM پایه: ورود در Mark فعلی → Entry = Mark → MTM شروع صفر است.
              </p>

              {/* ===== Liquidation (WORLD A — همیشه N/A) ===== */}
              <div className="mt-2 rounded-lg border border-line/10 bg-surface-2/50 p-2">
                <p className="flex items-center justify-between text-[9px] font-black text-ink">
                  <span>Liquidation Implied APR</span>
                  <span className="flex items-center gap-1.5">
                    <ProvenanceBadge kind={isLiquidationAPRAvailable(proj.liquidation.liquidationApr) ? 'boros' : 'na'} label="REQUIRES ACTIVE POSITION" />
                    <span className="num-ltr">
                      {isLiquidationAPRAvailable(proj.liquidation.liquidationApr)
                        ? `${proj.liquidation.liquidationApr.value!.toFixed(2)}٪`
                        : 'N/A'}
                    </span>
                  </span>
                </p>
                <p className="mt-1 text-[8px] font-medium leading-4 text-muted">
                  {isLiquidationAPRAvailable(proj.liquidation.liquidationApr)
                    ? LIQUIDATION_SOURCE_FA[proj.liquidation.liquidationApr.source]
                    : LIVE_POSITION_NA_REASON}
                </p>
                {/* Risk Proxy جدا — هرگز با Liquidation APR واقعی یکی نیست */}
                <p className="mt-1.5 flex items-center justify-between border-t border-line/8 pt-1.5 text-[9px] font-black text-ink">
                  <span>Theoretical APR Risk Buffer (متریک شبیه‌ساز)</span>
                  <span className="num-ltr text-accent">
                    {proj.theoreticalAprRiskBufferPct !== null
                      ? `${proj.theoreticalAprRiskBufferPct.toFixed(1)} pp`
                      : 'N/A'}
                  </span>
                </p>
                <p className="mt-0.5 text-[8px] font-medium leading-4 text-muted">
                  = Margin ÷ Rate Sensitivity — تقریب چند واحد درصد-point حرکت APR می‌تواند مارجین فرضی را مصرف کند.
                  ⚠ این Liquidation Implied APR واقعی بوروس نیست؛ لیکوییدیشن واقعی به Position زنده، Collateral، Net Balance و Maintenance Margin بستگی دارد.
                </p>
              </div>

              {/* سه سناریو — نقش اقتصادی + جهت */}
              <p className="mt-2.5 text-[10px] font-black text-ink">
                سناریوهای نرخ ({direction === 'long' ? 'برای لانگ' : 'برای شورت'})
                {proj.scenarios.base === null && <span className="text-muted"> — داده تاریخی کافی نیست (N/A)</span>}
              </p>
              {proj.scenarios.base !== null && (
                <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-[9px] font-bold">
                  {[proj.scenarios.bear, proj.scenarios.base, proj.scenarios.bull].map((sc) => (
                    <div key={sc!.label} className="rounded-lg bg-line/5 px-2 py-1.5">
                      <p className="text-muted">{sc!.label}</p>
                      <p className="num-ltr text-[8px] text-muted">فرضی: Floating {fmtPct(sc!.assumedFloatingRate * 100)}</p>
                      <p className="num-ltr text-[8px] text-muted">MTM: {sc!.mtmPnl === null ? 'N/A' : fmtUSD(sc!.mtmPnl)}</p>
                      <p className="num-ltr text-[8px] text-muted">Settlement: {sc!.settlementPnl >= 0 ? '+' : ''}{fmtUSD(sc!.settlementPnl)}</p>
                      <p className="num-ltr text-[8px] text-muted">Costs: {fmtUSD(sc!.totalCosts)}</p>
                      <p className={cn('num-ltr', (sc!.netPnl ?? 0) >= 0 ? 'text-positive' : 'text-negative')}>
                        {sc!.netPnl !== null ? `${sc!.netPnl >= 0 ? '+' : ''}${fmtUSD(sc!.netPnl)}` : 'N/A'}
                      </p>
                      <p className={cn('num-ltr text-[8px]', (sc!.roiOnMargin ?? 0) >= 0 ? 'text-positive' : 'text-negative')}>
                        ROI {sc!.roiOnMargin !== null ? fmtPct(sc!.roiOnMargin) : 'N/A'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-1 text-[8px] font-medium text-muted/70">
                Ordering اقتصادی تضمین‌شده: برای لانگ Adverse ≤ Base ≤ Favorable (برای شورت برعکس).
                MTM سناریو = N/A چون Mark سناریو در دسترس نیست — Underlying هرگز به‌جای Mark استفاده نمی‌شود.
              </p>
            </GlassCard>
          )}

          {/* ===== Audit Breakdown ===== */}
          {proj && (
            <GlassCard variant="soft" className="p-3.5">
              <h4 className="mb-2 text-[12px] font-black text-ink">Audit Breakdown (قابل ممیزی)</h4>
              <div className="space-y-2 text-[9px] font-bold">
                <div className="rounded-lg bg-line/5 p-2">
                  <p className="mb-1 text-[9px] font-black text-muted">INPUTS</p>
                  <p className="text-muted">بازار: <span className="text-ink">{market.asset} · {market.venue}</span></p>
                  <p className="text-muted">سررسید: <span className="num-ltr text-ink">{new Date(market.maturity * 1000).toLocaleDateString('fa-IR')}</span> · روز: <span className="num-ltr text-ink">{proj.daysToMaturity}</span></p>
                  <p className="text-muted">جهت: <span className="text-ink">{direction === 'long' ? 'لانگ' : 'شورت'}</span> · سرمایه: <span className="num-ltr text-ink">{fmtUSD(proj.capital)}</span> ({proj.capitalMode})</p>
                  <p className="text-muted">Fixed/Implied APR: <span className="num-ltr text-ink">{fmtPct(rate * 100)}</span> · Mark APR: <span className="num-ltr text-ink">{fmtPct(market.markApr * 100)}</span> · Underlying: <span className="num-ltr text-ink">{fmtPct(market.floatingApr * 100)}</span></p>
                </div>
                <div className="rounded-lg bg-line/5 p-2">
                  <p className="mb-1 text-[9px] font-black text-muted">MARGIN (فرمول رسمی Boros)</p>
                  <p className="text-muted">{proj.marginBreakdown.formula}</p>
                  <p className="text-muted">Rate Floor: <span className="num-ltr text-ink">{fmtPct(proj.marginBreakdown.rateFloor * 100)}</span> → Effective Rate: <span className="num-ltr text-ink">{fmtPct(proj.marginBreakdown.effectiveRate * 100)}</span></p>
                  <p className="text-muted">Time: <span className="num-ltr text-ink">{proj.marginBreakdown.yearsToMaturity.toFixed(4)} سال</span> · Time Floor: <span className="num-ltr text-ink">{fmtPct(proj.marginBreakdown.timeFloor * 100)}</span> → Effective: <span className="num-ltr text-ink">{proj.marginBreakdown.effectiveTime.toFixed(4)}</span></p>
                  <p className="text-muted">IM Factor: <span className="num-ltr text-ink">{fmtPct(proj.marginBreakdown.imFactor * 100)}</span> → Initial Margin: <span className="num-ltr text-ink">{fmtUSD(proj.initialMargin)}</span> (Round Trip: {fmtUSD(proj.recalculatedMargin)})</p>
                </div>
                <div className="rounded-lg bg-line/5 p-2">
                  <p className="mb-1 text-[9px] font-black text-muted">PNL</p>
                  <p className="text-muted">Settlement = {direction === 'long' ? 'Notional × (Underlying − Fixed) × Days/365' : 'Notional × (Fixed − Underlying) × Days/365'} = <span className={cn('num-ltr', proj.expectedSettlementPnl >= 0 ? 'text-positive' : 'text-negative')}>{proj.expectedSettlementPnl >= 0 ? '+' : ''}{fmtUSD(proj.expectedSettlementPnl)}</span></p>
                  <p className="text-muted">MTM (پایه) = Sensitivity × (Mark − Entry)/1% = <span className="num-ltr">{fmtUSD(proj.expectedMtm)}</span> — {proj.mtmReason}</p>
                </div>
                <div className="rounded-lg bg-line/5 p-2">
                  <p className="mb-1 text-[9px] font-black text-muted">COSTS (مستندات رسمی Boros)</p>
                  <p className="text-muted">Entry Fee = |Size| × FeeRate × YTM: <span className="num-ltr text-ink">{fmtUSD(fees.entryFee)}</span></p>
                  <p className="text-muted">Settlement Fee = |Size| × SettleRate × Period × Count: <span className="num-ltr text-ink">{fmtUSD(fees.settlementCost)}</span></p>
                  <p className="text-muted">Entrance Fee (از API در دسترس نیست): <span className="num-ltr text-ink">{fees.entranceFee > 0 ? fmtUSD(fees.entranceFee) : 'N/A'}</span> · Slippage: <span className="num-ltr text-ink">{fees.slippageCost > 0 ? fmtUSD(fees.slippageCost) : 'N/A'}</span> · Gas: <span className="num-ltr text-ink">{fmtUSD(fees.gasFee)}</span></p>
                  <p className="text-muted">Total Cost: <span className="num-ltr text-negative">{fmtUSD(fees.total)}</span></p>
                </div>
                <div className="rounded-lg bg-line/5 p-2">
                  <p className="mb-1 text-[9px] font-black text-muted">NET</p>
                  <p className="text-muted">Net PnL = Settlement + MTM − Costs = <span className={cn('num-ltr font-black', proj.expectedNetPnl >= 0 ? 'text-positive' : 'text-negative')}>{proj.expectedNetPnl >= 0 ? '+' : ''}{fmtUSD(proj.expectedNetPnl)}</span></p>
                  <p className="text-muted">ROI Margin: <span className="num-ltr">{fmtPct(proj.roiOnMargin)}</span> · ROI Notional: <span className="num-ltr">{fmtPct(proj.roiOnNotional)}</span> · Annualized: <span className="num-ltr">{fmtPct(proj.theoreticalAnnualizedRoi)}</span> (فقط نظری)</p>
                </div>
                <div className="rounded-lg bg-line/5 p-2">
                  <p className="mb-1 text-[9px] font-black text-muted">LIQUIDATION</p>
                  <p className="text-muted">Live Position: <span className="text-negative">NO</span> · Liquidation Implied APR: <span className="text-negative">N/A</span> · Health Factor: N/A · Maintenance Margin: N/A</p>
                  <p className="text-muted">Risk Proxy: Theoretical APR Buffer = <span className="num-ltr text-accent">{proj.theoreticalAprRiskBufferPct !== null ? `${proj.theoreticalAprRiskBufferPct.toFixed(1)} pp` : 'N/A'}</span></p>
                  <p className="text-warn/90">⚠ محاسبه لیکوییدیشن زنده بوروس نیست — فقط تحلیل فرضی شبیه‌ساز.</p>
                </div>
              </div>
            </GlassCard>
          )}

          {/* ===== سه مدل سناریو (Master §3-5) ===== */}
          <GlassCard variant="soft" className="p-3.5">
            <h4 className="mb-2 text-[12px] font-black text-ink">مدل‌های سناریو نرخ (فرضیات صریح — نه پیش‌بینی)</h4>
            <div className="space-y-2">
              {/* A) Constant */}
              <div className="rounded-2xl bg-line/5 p-2.5">
                <p className="text-[10px] font-black text-ink">
                  {a.constantRateScenario.label}
                  <span className="num-ltr ms-1 text-[8px] font-bold text-muted">(Floating ثابت {fmtPct(a.constantRateScenario.floatingRate * 100)})</span>
                </p>
                <div className="mt-1 grid grid-cols-3 gap-1.5 text-[8px] font-bold">
                  <span className="text-muted">Settlement: <span className={cn('num-ltr', a.constantRateScenario.settlementPnl >= 0 ? 'text-positive' : 'text-negative')}>{a.constantRateScenario.settlementPnl >= 0 ? '+' : ''}{fmtUSD(a.constantRateScenario.settlementPnl)}</span></span>
                  <span className="text-muted">Net: <span className={cn('num-ltr', a.constantRateScenario.netPnl >= 0 ? 'text-positive' : 'text-negative')}>{a.constantRateScenario.netPnl >= 0 ? '+' : ''}{fmtUSD(a.constantRateScenario.netPnl)}</span></span>
                  <span className="text-muted">ROI: <span className={cn('num-ltr', a.constantRateScenario.roiOnMargin >= 0 ? 'text-positive' : 'text-negative')}>{fmtPct(a.constantRateScenario.roiOnMargin)}</span></span>
                </div>
              </div>
              {/* B) Mean Reversion */}
              <div className="rounded-2xl bg-line/5 p-2.5">
                <p className="text-[10px] font-black text-ink">بازگشت به میانگین</p>
                {a.meanReversion.available ? (
                  <>
                    <p className="text-[8px] font-medium text-muted">
                      {a.meanReversion.note}
                      {a.meanReversion.targetRate !== null && (
                        <span className="num-ltr ms-1">هدف: {fmtPct(a.meanReversion.targetRate * 100)}</span>
                      )}
                    </p>
                    <p className="mt-1 text-[9px] font-black">
                      Net: <span className={cn('num-ltr', (a.meanReversion.netPnl ?? 0) >= 0 ? 'text-positive' : 'text-negative')}>
                        {a.meanReversion.netPnl !== null ? `${a.meanReversion.netPnl >= 0 ? '+' : ''}${fmtUSD(a.meanReversion.netPnl)}` : 'N/A'}
                      </span>
                    </p>
                  </>
                ) : (
                  <p className="text-[8px] font-medium text-muted">{a.meanReversion.note}</p>
                )}
              </div>
              {/* C) Stress */}
              <div className="rounded-2xl bg-line/5 p-2.5">
                <p className="text-[10px] font-black text-ink">Stress Scenario</p>
                {a.stress.available ? (
                  <>
                    <p className="text-[8px] font-medium text-muted">
                      Stress: <span className="num-ltr">{fmtPct((a.stress.stressAmount ?? 0) * 100)}</span> — {a.stress.stressSource}
                    </p>
                    <div className="mt-1 grid grid-cols-3 gap-1.5 text-[8px] font-bold">
                      {[
                        { l: 'Bear', v: a.stress.bearNet },
                        { l: 'Base', v: a.stress.baseNet },
                        { l: 'Bull', v: a.stress.bullNet }
                      ].map((x) => (
                        <div key={x.l} className="rounded-lg bg-line/5 px-1.5 py-1 text-center">
                          <p className="text-muted">{x.l}</p>
                          <p className={cn('num-ltr', (x.v ?? 0) >= 0 ? 'text-positive' : 'text-negative')}>
                            {x.v !== null ? `${x.v >= 0 ? '+' : ''}${fmtUSD(x.v)}` : 'N/A'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-[8px] font-medium text-muted">داده تاریخی کافی برای Stress در دسترس نیست (N/A)</p>
                )}
              </div>
            </div>
          </GlassCard>

          {/* هزینه تفکیکی */}
          <GlassCard variant="soft" className="p-3.5">
            <h4 className="mb-2 text-[12px] font-black text-ink">جزئیات هزینه (مستندات رسمی Boros)</h4>
            <div className="space-y-1 text-[10px] font-bold">
              <div className="flex justify-between text-muted"><span>کارمزد ورود (|Size| × FeeRate × YTM)</span><span className="num-ltr text-ink">{fmtUSD(fees.entryFee)}</span></div>
              <div className="flex justify-between text-muted"><span>کارمزد خروج</span><span className="num-ltr text-ink">{fmtUSD(fees.exitFee)}</span></div>
              <div className="flex justify-between text-muted"><span>هزینه تسویه (|Size| × SettleRate × Period × Count)</span><span className="num-ltr text-ink">{fmtUSD(fees.settlementCost)}</span></div>
              <div className="flex justify-between text-muted"><span>هزینه ورود به بازار (Entrance — از API در دسترس نیست)</span><span className="num-ltr text-ink">{fees.entranceFee > 0 ? fmtUSD(fees.entranceFee) : 'N/A'}</span></div>
              <div className="flex justify-between text-muted"><span>اسلیپج (بدون داده = N/A)</span><span className="num-ltr text-ink">{fees.slippageCost > 0 ? fmtUSD(fees.slippageCost) : 'N/A'}</span></div>
              <div className="flex justify-between text-muted"><span>گس (ورودی کاربر)</span><span className="num-ltr text-ink">{fmtUSD(fees.gasFee)}</span></div>
              <div className="my-1 border-t border-line/10" />
              <div className="flex justify-between"><span className="text-ink">مجموع هزینه‌ها</span><span className="num-ltr text-negative">{fmtUSD(fees.total)}</span></div>
            </div>
            <p className="mt-1 text-[8px] font-medium text-muted/70">
              Taker/Settlement/Entrance هرگز double-count نمی‌شوند؛ مقدار N/A یعنی «داده در دسترس نیست» — نه «صفر».
            </p>
          </GlassCard>

          {/* خروجی نهایی — Realized/Unrealized/Total جدا */}
          <GlassCard className="border-accent/30 p-3.5">
            <p className="mb-2 text-[11px] font-black text-ink">خلاصه نهایی (جهت {direction === 'long' ? 'لانگ' : 'شورت'})</p>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-bold sm:grid-cols-3">
              <div className="rounded-xl bg-line/5 p-2.5"><p className="text-muted">سود تسویه‌ای (Realized)</p><p className={cn('num-ltr', sim.currentPnl >= 0 ? 'text-positive' : 'text-negative')}>{sim.currentPnl >= 0 ? '+' : ''}{fmtUSD(sim.currentPnl)}</p></div>
              <div className="rounded-xl bg-line/5 p-2.5"><p className="text-muted">MTM (تحقق‌نیافته)</p><p className={cn('num-ltr', sim.mtm >= 0 ? 'text-positive' : 'text-negative')}>{sim.mtm >= 0 ? '+' : ''}{fmtUSD(sim.mtm)}</p></div>
              <div className="rounded-xl bg-line/5 p-2.5"><p className="text-muted">سود خالص کل (پایه)</p><p className={cn('num-ltr', sim.netCurrent >= 0 ? 'text-positive' : 'text-negative')}>{sim.netCurrent >= 0 ? '+' : ''}{fmtUSD(sim.netCurrent)}</p></div>
              <div className="rounded-xl bg-line/5 p-2.5"><p className="text-muted">ROI روی مارجین</p><p className={cn('num-ltr', (sim.isLong ? a.roiLongMargin : a.roiShortMargin) ?? 0 >= 0 ? 'text-positive' : 'text-negative')}>{fmtPct(sim.isLong ? a.roiLongMargin : a.roiShortMargin)}</p></div>
              <div className="rounded-xl bg-line/5 p-2.5"><p className="text-muted">ROI روی نotional</p><p className={cn('num-ltr', (sim.isLong ? a.roiLongNotional : a.roiShortNotional) ?? 0 >= 0 ? 'text-positive' : 'text-negative')}>{fmtPct(sim.isLong ? a.roiLongNotional : a.roiShortNotional)}</p></div>
              <div className="rounded-xl bg-line/5 p-2.5">
                <p className="text-muted">نقطه سر به سر ({direction === 'long' ? 'لانگ' : 'شورت'})</p>
                <p className="num-ltr text-ink">
                  {(sim.isLong ? a.breakEvenLong : a.breakEvenShort) !== null
                    ? fmtPct((sim.isLong ? a.breakEvenLong : a.breakEvenShort) as number * 100)
                    : 'N/A'}
                </p>
              </div>
            </div>
            <p className="mt-2 flex items-start gap-1 text-[8px] font-medium leading-4 text-muted/70">
              ⚠ «مارجین کافی به نظر می‌رسد» ≠ «بدون ریسک لیکوییدیشن» — حرکت نامطلوب Mark APR یا زیان تسویه می‌تواند Position را به Maintenance Margin نزدیک کند؛
              وضعیت واقعی بدون Position زنده Boros در دسترس نیست.
            </p>
          </GlassCard>
        </>
      )}
    </div>
  );
}
