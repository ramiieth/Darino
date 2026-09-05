/**
 * UserCapitalCard — فرصت ارزیابیشده با Collateral شبیهسازی کاربر
 * «اگر X Collateral وارد Boros کنم، این بازار چطور است؟»
 * Liquidation APR = N/A (بدون Position واقعی) — فقط در صورت مقدار رسمی Boros
 */
import { Wallet } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { ProvenanceBadge } from '@/shared/components/ui/ProvenanceBadge';
import { fmtPct, fmtUSD } from '@/shared/utils/formatters';
import type { UserCapitalOpportunity } from '@/features/boros/domain/collateral';
import { isLiquidationAPRAvailable } from '@/features/boros/domain/liquidationApr';
import { cn } from '@/shared/lib/cn';

export function UserCapitalCard({ o, rank }: { o: UserCapitalOpportunity; rank: number }) {
  const liqAvail = isLiquidationAPRAvailable(o.liquidationApr);
  return (
    <GlassCard className="p-3.5 transition-colors hover:border-accent/30">
      {/* سربرگ */}
      <div className="flex items-center gap-2.5">
        <span className="tnum w-6 shrink-0 text-center text-[14px] font-black text-muted/60">#{rank}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-extrabold text-ink">
            {o.asset} <span className="text-muted">· {o.venue}</span>{' '}
            <span className={cn('text-[10px] font-black', o.direction === 'long' ? 'text-positive' : 'text-negative')}>
              {o.direction === 'long' ? 'لانگ' : 'شورت'}
            </span>
          </p>
          <p className="num-ltr text-[9px] font-medium text-muted">
            سررسید {new Date(o.maturity * 1000).toLocaleDateString('fa-IR')} · {o.daysToMaturity} روز
          </p>
        </div>
        <div className="shrink-0 text-end">
          <p className="num-ltr text-[15px] font-black text-accent">{Math.round(o.userScore)}/100</p>
          <p className="text-[8px] font-bold text-muted">User Score</p>
        </div>
      </div>

      {/* Collateral + Notional */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface-2/60 px-2.5 py-1.5 text-[9px] font-bold">
        <span className="flex items-center gap-1 text-muted">
          <Wallet className="h-3 w-3 text-accent" /> Simulation Collateral:{' '}
          <span className="num-ltr text-ink">{o.simulationCollateral.toFixed(3)} ETH</span>
          <ProvenanceBadge kind="simulated" />
        </span>
        <span className="text-muted">
          Max Notional: <span className="num-ltr text-ink">{fmtUSD(o.notional, true)}</span>
        </span>
        <span className="text-muted">
          Margin: <span className="num-ltr text-ink">{fmtUSD(o.marginUsd, true)}</span>
          <span className="text-[8px]"> ({o.marginUtilizationPct.toFixed(0)}٪ Collateral)</span>
        </span>
        <span className={cn(o.executable ? 'text-positive' : 'text-negative')}>
          {o.executable ? 'قابل اجرا ✓' : 'غیرقابل اجرا ✗'}
        </span>
      </div>

      {/* نرخها + Edge */}
      <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-[9px] font-bold">
        <div className="rounded-lg bg-line/5 px-2 py-1">
          <p className="text-muted">Fixed <ProvenanceBadge kind="boros" label="API" /></p>
          <p className="num-ltr text-ink">{fmtPct(o.fixedApr * 100)}</p>
        </div>
        <div className="rounded-lg bg-line/5 px-2 py-1">
          <p className="text-muted">Underlying <ProvenanceBadge kind="boros" label="API" /></p>
          <p className="num-ltr text-ink">{fmtPct(o.underlyingApr * 100)}</p>
        </div>
        <div className={cn('rounded-lg px-2 py-1', o.rateEdge >= 0 ? 'bg-positive/10' : 'bg-negative/10')}>
          <p className="text-muted">Rate Edge ({o.direction === 'long' ? 'لانگ' : 'شورت'})</p>
          <p className={cn('num-ltr font-black', o.rateEdge >= 0 ? 'text-positive' : 'text-negative')}>
            {o.rateEdge >= 0 ? '+' : ''}{fmtPct(o.rateEdge * 100)}
          </p>
        </div>
      </div>

      {/* Economics */}
      <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[9px] font-bold sm:grid-cols-4">
        <div className="rounded-lg bg-line/5 px-2 py-1">
          <p className="flex items-center gap-1 text-muted">Settlement <ProvenanceBadge kind="calculated" /></p>
          <p className={cn('num-ltr', o.settlementPnl >= 0 ? 'text-positive' : 'text-negative')}>
            {o.settlementPnl >= 0 ? '+' : ''}{fmtUSD(o.settlementPnl)}
          </p>
        </div>
        <div className="rounded-lg bg-line/5 px-2 py-1">
          <p className="text-muted">Fees</p>
          <p className="num-ltr text-ink">{fmtUSD(o.feesUsd)}</p>
        </div>
        <div className="rounded-lg bg-line/5 px-2 py-1">
          <p className="text-muted">Slippage</p>
          <p className="num-ltr text-muted">{o.slippageUsd !== null ? fmtUSD(o.slippageUsd) : 'N/A'}</p>
        </div>
        <div className={cn('rounded-lg px-2 py-1', (o.netPnl ?? 0) >= 0 ? 'bg-positive/10' : 'bg-negative/10')}>
          <p className="text-muted">Net PnL <ProvenanceBadge kind="simulated" /></p>
          <p className={cn('num-ltr font-black', (o.netPnl ?? 0) >= 0 ? 'text-positive' : 'text-negative')}>
            {o.netPnl !== null ? `${o.netPnl >= 0 ? '+' : ''}${fmtUSD(o.netPnl)}` : 'N/A'}
          </p>
        </div>
        <div className="rounded-lg bg-line/5 px-2 py-1">
          <p className="text-muted">ROI Margin</p>
          <p className={cn('num-ltr', (o.roiOnMargin ?? 0) >= 0 ? 'text-positive' : 'text-negative')}>
            {o.roiOnMargin !== null ? fmtPct(o.roiOnMargin) : 'N/A'}
          </p>
        </div>
        <div className="rounded-lg bg-line/5 px-2 py-1">
          <p className="text-muted">Econ Edge</p>
          <p className={cn('num-ltr', (o.economicEdge ?? 0) >= 0 ? 'text-positive' : 'text-negative')}>
            {o.economicEdge !== null ? `${o.economicEdge >= 0 ? '+' : ''}${fmtUSD(o.economicEdge)}` : 'N/A'}
          </p>
        </div>
        <div className="rounded-lg bg-line/5 px-2 py-1">
          <p className="text-muted">Robustness</p>
          <p className={cn(o.robustness === 'robust' ? 'text-positive' : o.robustness === 'conditional' ? 'text-warn' : 'text-negative')}>
            {o.robustness === 'robust' ? 'پایدار' : o.robustness === 'conditional' ? 'مشروط' : 'ناپایدار'}
          </p>
        </div>
        <div className="rounded-lg bg-line/5 px-2 py-1">
          <p className="text-muted">ریسک / اطمینان</p>
          <p className={cn('num-ltr', o.riskLevel === 'کم' ? 'text-positive' : o.riskLevel === 'متوسط' ? 'text-warn' : 'text-negative')}>
            {o.riskLevel} · {o.confidence}٪
          </p>
        </div>
      </div>

      {/* Liquidation */}
      <div className="mt-1.5 flex items-center justify-between rounded-lg border border-line/10 bg-surface-2/50 px-2 py-1.5 text-[9px] font-bold">
        <span className="flex items-center gap-1 text-muted">
          Liquidation Implied APR
          <ProvenanceBadge kind={liqAvail ? 'boros' : 'na'} label={liqAvail ? 'BOROS' : 'POSITION REQUIRED'} />
        </span>
        <span className={cn('num-ltr', liqAvail ? 'text-accent' : 'text-muted')}>
          {liqAvail ? `${o.liquidationApr.value!.toFixed(2)}٪` : 'N/A'}
        </span>
      </div>
      <p className="mt-1 text-[9px] font-medium leading-4 text-muted/70">
        Liquidation APR فقط با Position واقعی Boros (Collateral واقعی + وضعیت Position) قابل محاسبه است — این ارزیابی بر اساس Collateral شبیهسازی است.
      </p>
    </GlassCard>
  );
}
