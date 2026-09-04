/**
 * Audit Report نهایی — جدول کامل برای N بازار (Part 9 اسپک)
 * ستون‌ها: Market / Venue / Maturity / Capital / Notional / Exposure / Margin /
 *          Fixed / Floating / Mark / Settlement / MTM / Fees / Slippage / Costs /
 *          Net / ROI M / ROI N / Annualized / Liq APR / Liqty / Risk / Confidence / Status
 *
 * ⚠️ Liquidation Implied APR ویژگی Position است نه Market — در این Scanner (بدون
 * Position واقعی) همیشه N/A نمایش داده می‌شود؛ نقدشوندگی (Liquidity) ستون جدا دارد.
 */
import { useMemo } from 'react';
import { FileCheck2 } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { fmtPct, fmtUSD } from '@/shared/utils/formatters';
import { projectCapital } from '@/features/boros/domain/engine/projection';
import { BorosCalculationEngine } from '@/features/boros/domain/engine';
import type { BorosMarket } from '@/features/boros/domain/types';
import {
  isLiquidationAPRAvailable,
  LIQUIDATION_NA_REASON,
  NA_LIQUIDATION_APR,
  type LiquidationAPRData
} from '@/features/boros/domain/liquidationApr';
import { cn } from '@/shared/lib/cn';

export interface AuditReportRow {
  market: string;
  venue: string;
  maturityDays: number;
  capital: number;
  notional: number;
  exposure: number;
  margin: number;
  fixedApr: number;
  floatingApr: number;
  markApr: number;
  edge: number; // Long Rate Edge
  settlementPnl: number;
  mtmPnl: number;
  fees: number;
  slippage: number;
  costs: number;
  netPnl: number;
  economicEdge: number; // Net − Min Edge
  minEdge: number;
  roiMargin: number;
  roiNotional: number;
  annualized: number;
  /** Liquidation Implied APR — مدل صریح (در Scanner بدون Position واقعی = N/A) */
  liquidationApr: LiquidationAPRData;
  /** نقدشوندگی ۰..۱ — مفهوم جدا از Liquidation */
  liquidity: number;
  risk: string;
  confidence: number;
  anomaly: string;
  robustness: string;
  status: string;
  rank: number;
}

export function buildAuditReport(markets: BorosMarket[], capital = 1000): AuditReportRow[] {
  const now = Math.floor(Date.now() / 1000);
  const rows = markets.map((m) => {
    const p = projectCapital({ m, capitalUsd: capital, direction: 'long', nowSec: now, gasUsd: 0 });
    const a = BorosCalculationEngine.analyze({ m, size: capital, nowSec: now, gasUsd: 0 });
    const net = p?.expectedNetPnl ?? 0;
    const minEdge = a.minEconomicEdge;
    return {
      market: m.asset,
      venue: m.venue,
      maturityDays: p?.daysToMaturity ?? 0,
      capital,
      notional: p?.notional ?? 0,
      exposure: p?.effectiveExposure ?? 0,
      margin: p?.initialMargin ?? 0,
      fixedApr: m.markApr,
      floatingApr: m.floatingApr,
      markApr: m.markApr,
      edge: a.longSpread,
      settlementPnl: p?.expectedSettlementPnl ?? 0,
      mtmPnl: p?.expectedMtm ?? 0,
      fees: p?.fees.total ?? 0,
      slippage: p?.slippage ?? 0,
      costs: p?.totalCost ?? 0,
      netPnl: net,
      economicEdge: net - minEdge,
      minEdge,
      roiMargin: p?.roiOnMargin ?? 0,
      roiNotional: p?.roiOnNotional ?? 0,
      annualized: p?.theoreticalAnnualizedRoi ?? 0,
      liquidationApr: p?.liquidation.liquidationApr ?? NA_LIQUIDATION_APR,
      risk: a.riskLevel,
      liquidity: a.liquidityScore,
      confidence: a.confidence,
      anomaly: a.anomaly.detected ? a.anomaly.kind : 'none',
      robustness: a.robustness,
      status: a.statusLong,
      rank: 0
    };
  });
  // Ranking: بر اساس Validated Economics (فقط validها) — نه Spread
  const ranked = rows
    .filter((r) => r.status !== 'insufficient-data')
    .sort((x, y) => {
      const sx = statusRank(x.status);
      const sy = statusRank(y.status);
      if (sx !== sy) return sx - sy;
      return y.economicEdge - x.economicEdge;
    });
  ranked.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

/** اولویت وضعیت برای رتبه‌بندی */
function statusRank(s: string): number {
  switch (s) {
    case 'potential': return 0;
    case 'conditional': return 1;
    case 'anomaly-detected': return 2;
    case 'not-attractive': return 3;
    default: return 4;
  }
}

export function AuditReportTable({ markets }: { markets: BorosMarket[] }) {
  const rows = useMemo(() => buildAuditReport(markets), [markets]);

  return (
    <div className="space-y-3">
      <GlassCard variant="soft" className="p-3.5">
        <p className="flex items-center gap-1.5 text-[12px] font-black text-ink">
          <FileCheck2 className="h-4 w-4 text-positive" /> Audit Report نهایی ({rows.length} بازار)
        </p>
        <p className="mt-1 text-[9px] font-medium leading-4 text-muted">
          Capital: $1,000 (لانگ) · Round Trip تضمین‌شده · Exposure = Notional/Margin ·
          Annualized = نظری (extrapolation) · Liquidation APR = N/A (ویژگی Position است؛ بدون
          Position واقعی محاسبه نمی‌شود) · Status از Minimum Economic Edge (App-defined) عبور می‌کند.
        </p>
      </GlassCard>

      <GlassCard variant="soft" className="overflow-x-auto p-2">
        <table className="w-full min-w-[1100px] text-[8px]">
          <thead>
            <tr className="text-muted">
              {['#', 'بازار', 'Venue', 'روز', 'Fixed', 'Under', 'Edge', 'Notional', 'Margin', 'Gross', 'MTM', 'Costs', 'Net', 'Econ Edge', 'ROI M', 'ROI N', 'Ann.*', 'Liq APR', 'Liqty', 'ریسک', 'Conf', 'Anomaly', 'Robust', 'Status'].map((h) => (
                <th key={h} className="px-1 py-1 text-end font-black first:text-start">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line/5">
                <td className="num-ltr px-1 py-1 text-end font-black text-muted">{r.rank || '—'}</td>
                <td className="px-1 py-1 text-start font-extrabold text-ink">{r.market}</td>
                <td className="px-1 py-1 text-end text-muted">{r.venue}</td>
                <td className="num-ltr px-1 py-1 text-end text-muted">{r.maturityDays}d</td>
                <td className="num-ltr px-1 py-1 text-end text-ink">{fmtPct(r.fixedApr * 100)}</td>
                <td className="num-ltr px-1 py-1 text-end text-ink">{fmtPct(r.floatingApr * 100)}</td>
                <td className={cn('num-ltr px-1 py-1 text-end font-black', r.edge >= 0 ? 'text-positive' : 'text-negative')}>{fmtPct(r.edge * 100)}</td>
                <td className="num-ltr px-1 py-1 text-end text-ink">{fmtUSD(r.notional, true)}</td>
                <td className="num-ltr px-1 py-1 text-end text-ink">${r.margin}</td>
                <td className={cn('num-ltr px-1 py-1 text-end', r.settlementPnl >= 0 ? 'text-positive' : 'text-negative')}>{fmtUSD(r.settlementPnl)}</td>
                <td className="num-ltr px-1 py-1 text-end text-muted">{fmtUSD(r.mtmPnl)}</td>
                <td className="num-ltr px-1 py-1 text-end text-negative">{fmtUSD(r.costs)}</td>
                <td className={cn('num-ltr px-1 py-1 text-end font-black', r.netPnl >= 0 ? 'text-positive' : 'text-negative')}>{fmtUSD(r.netPnl)}</td>
                <td className={cn('num-ltr px-1 py-1 text-end font-black', r.economicEdge >= 0 ? 'text-positive' : 'text-negative')}>{fmtUSD(r.economicEdge)}</td>
                <td className={cn('num-ltr px-1 py-1 text-end', r.roiMargin >= 0 ? 'text-positive' : 'text-negative')}>{fmtPct(r.roiMargin)}</td>
                <td className={cn('num-ltr px-1 py-1 text-end', r.roiNotional >= 0 ? 'text-positive' : 'text-negative')}>{fmtPct(r.roiNotional)}</td>
                <td className={cn('num-ltr px-1 py-1 text-end', r.annualized >= 0 ? 'text-positive' : 'text-negative')}>{fmtPct(r.annualized)}</td>
                {/* Liquidation Implied APR — بدون Position واقعی همیشه N/A */}
                <td className="px-1 py-1 text-end">
                  <span
                    title={LIQUIDATION_NA_REASON}
                    className={cn(
                      'badge',
                      isLiquidationAPRAvailable(r.liquidationApr)
                        ? 'bg-accent/10 text-accent ring-1 ring-accent/20'
                        : 'bg-line/5 text-muted ring-1 ring-line/10'
                    )}
                  >
                    {isLiquidationAPRAvailable(r.liquidationApr)
                      ? `${r.liquidationApr.value!.toFixed(2)}٪`
                      : 'N/A'}
                  </span>
                </td>
                <td className="num-ltr px-1 py-1 text-end text-muted">{Math.round(r.liquidity * 100)}٪</td>
                <td className={cn('px-1 py-1 text-end font-black', r.risk === 'کم' ? 'text-positive' : r.risk === 'متوسط' ? 'text-warn' : 'text-negative')}>{r.risk}</td>
                <td className="num-ltr px-1 py-1 text-end text-muted">{r.confidence}%</td>
                <td className="px-1 py-1 text-end">
                  {r.anomaly !== 'none' ? (
                    <span className="badge bg-negative/10 text-negative ring-1 ring-negative/20">
                      {r.anomaly === 'extreme-dislocation' ? 'انحراف شدید' : r.anomaly === 'thin-liquidity' ? 'نقدشوندگی کم' : r.anomaly === 'stale-data' ? 'داده کهنه' : r.anomaly}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-1 py-1 text-end text-muted">
                  {r.robustness === 'robust' ? 'پایدار' : r.robustness === 'conditional' ? 'مشروط' : r.robustness === 'not-attractive' ? 'ناپایدار' : 'N/A'}
                </td>
                <td className="px-1 py-1 text-end">
                  <span className={cn('badge ring-1', r.status === 'potential' ? 'bg-positive/10 text-positive ring-positive/20' : r.status === 'conditional' ? 'bg-info/10 text-info ring-info/20' : r.status === 'anomaly-detected' ? 'bg-negative/10 text-negative ring-negative/20' : r.status === 'not-attractive' ? 'bg-warn/10 text-warn ring-warn/20' : 'bg-line/5 text-muted ring-line/10')}>
                    {r.status === 'potential' ? 'فرصت' : r.status === 'conditional' ? 'مشروط' : r.status === 'anomaly-detected' ? 'ناهنجاری' : r.status === 'not-attractive' ? 'جذاب نیست' : 'ناکافی'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>

      <p className="text-center text-[8px] font-medium text-muted/70">
        *Annualized فقط نظری است (extrapolation ریاضی) — پیش‌بینی بازده آینده نیست.
        Min Economic Edge معیار داخلی اپ است (نه رسمی Boros).
      </p>
    </div>
  );
}
