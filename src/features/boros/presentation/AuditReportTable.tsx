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
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { Badge, type Tone } from '@/shared/components/ui/Badge';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { toFaDigits } from '@/shared/utils/formatters';
import { projectCapital } from '@/features/boros/domain/engine/projection';
import { BorosCalculationEngine } from '@/features/boros/domain/engine';
import type { BorosMarket } from '@/features/boros/domain/types';
import {
  isLiquidationAPRAvailable,
  LIQUIDATION_NA_REASON,
  NA_LIQUIDATION_APR,
  type LiquidationAPRData
} from '@/features/boros/domain/liquidationApr';

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

const STATUS_BADGE: Record<string, { label: string; tone: Tone }> = {
  potential: { label: 'فرصت', tone: 'gain' },
  conditional: { label: 'مشروط', tone: 'info' },
  'anomaly-detected': { label: 'ناهنجاری', tone: 'loss' },
  'not-attractive': { label: 'جذاب نیست', tone: 'warn' }
};

const ANOMALY_FA: Record<string, string> = {
  'extreme-dislocation': 'انحراف شدید',
  'thin-liquidity': 'نقدشوندگی کم',
  'stale-data': 'داده کهنه'
};

export function AuditReportTable({ markets }: { markets: BorosMarket[] }) {
  const rows = useMemo(() => buildAuditReport(markets), [markets]);

  return (
    <Section
      id="audit-report"
      title="گزارش بررسی محاسبات"
      description={`${toFaDigits(rows.length)} بازار · سرمایه ۱٬۰۰۰ دلار (لانگ) · ارزش اسمی/مارجین · سالانه‌شده فقط نظری · نرخ لیکوئید بدون پوزیشن واقعی نامشخص`}
    >
      <Surface className="overflow-hidden">
        <div className="max-h-[70dvh] overflow-auto">
          <table className="data-table is-compact min-w-[1180px]">
            <caption className="sr-only">گزارش بررسی محاسبات بازارهای بوروس</caption>
            <thead>
              <tr>
                <th scope="col" className="!ps-5">#</th>
                <th scope="col" className="sticky start-0 z-20">بازار</th>
                <th scope="col" className="col-num">روز</th>
                <th scope="col" className="col-num">ثابت</th>
                <th scope="col" className="col-num">شناور</th>
                <th scope="col" className="col-num">لبه</th>
                <th scope="col" className="col-num">ارزش اسمی</th>
                <th scope="col" className="col-num">مارجین</th>
                <th scope="col" className="col-num">تسویه</th>
                <th scope="col" className="col-num">ارزش روز</th>
                <th scope="col" className="col-num">هزینه</th>
                <th scope="col" className="col-num">خالص</th>
                <th scope="col" className="col-num">لبه اقتصادی</th>
                <th scope="col" className="col-num">بازده م</th>
                <th scope="col" className="col-num">بازده N</th>
                <th scope="col" className="col-num">سالانه*</th>
                <th scope="col" className="col-num">نرخ لیکوئید</th>
                <th scope="col" className="col-num">نقدشوندگی</th>
                <th scope="col">ریسک</th>
                <th scope="col" className="col-num">اطمینان</th>
                <th scope="col">ناهنجاری</th>
                <th scope="col" className="!pe-5">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const st = STATUS_BADGE[r.status] ?? { label: 'ناکافی', tone: 'neutral' as Tone };
                return (
                  <tr key={i}>
                    <td className="num-ltr !ps-5 text-xs text-subtle">{r.rank || '—'}</td>
                    <td className="sticky start-0 z-10 bg-card">
                      <p className="font-semibold text-ink"><bdi dir="ltr">{r.market}</bdi></p>
                      <p className="text-xs text-muted">{r.venue}</p>
                    </td>
                    <td className="col-num num-ltr text-muted">{r.maturityDays}</td>
                    <td className="col-num"><PercentValue value={r.fixedApr * 100} signed={false} tone="none" /></td>
                    <td className="col-num"><PercentValue value={r.floatingApr * 100} signed={false} tone="none" /></td>
                    <td className="col-num"><PercentValue value={r.edge * 100} /></td>
                    <td className="col-num"><MoneyValue value={r.notional} compact /></td>
                    <td className="col-num"><MoneyValue value={r.margin} /></td>
                    <td className="col-num"><MoneyValue value={r.settlementPnl} signed tone="auto" /></td>
                    <td className="col-num text-muted"><MoneyValue value={r.mtmPnl} signed /></td>
                    <td className="col-num text-muted"><MoneyValue value={r.costs} /></td>
                    <td className="col-num font-semibold"><MoneyValue value={r.netPnl} signed tone="auto" /></td>
                    <td className="col-num"><MoneyValue value={r.economicEdge} signed tone="auto" /></td>
                    <td className="col-num"><PercentValue value={r.roiMargin} /></td>
                    <td className="col-num"><PercentValue value={r.roiNotional} /></td>
                    <td className="col-num"><PercentValue value={r.annualized} /></td>
                    <td className="col-num" title={LIQUIDATION_NA_REASON}>
                      {isLiquidationAPRAvailable(r.liquidationApr) ? (
                        <span className="num-ltr">{r.liquidationApr.value!.toFixed(2)}%</span>
                      ) : (
                        <span className="text-subtle">N/A</span>
                      )}
                    </td>
                    <td className="col-num"><PercentValue value={r.liquidity * 100} signed={false} tone="none" digits={0} /></td>
                    <td><Badge tone={r.risk === 'کم' ? 'gain' : r.risk === 'متوسط' ? 'warn' : 'loss'}>{r.risk}</Badge></td>
                    <td className="col-num num-ltr text-muted">{r.confidence}%</td>
                    <td>{r.anomaly !== 'none' ? <Badge tone="loss">{ANOMALY_FA[r.anomaly] ?? r.anomaly}</Badge> : <span className="text-subtle">—</span>}</td>
                    <td className="!pe-5"><Badge tone={st.tone}>{st.label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Surface>
      <p className="mt-2 text-xs text-muted">
        *سالانه‌شده فقط برون‌یابی ریاضی است و پیش‌بینی بازده آینده نیست. حداقل لبه اقتصادی معیار داخلی دارینو است (نه رسمی Boros).
      </p>
    </Section>
  );
}
