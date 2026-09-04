/**
 * مانیتور ریسک (Risk Monitor) — هشدارها
 *  - Funding Extreme (انحراف APR شدید)
 *  - Low Liquidity (OI/حجم کم)
 *  - High Volatility (نوسان بالا)
 */
import { useMemo } from 'react';
import { ShieldAlert, AlertTriangle, Droplets, Activity } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { fmtPct, fmtUSD } from '@/shared/utils/formatters';
import { BorosCalculationEngine } from '@/features/boros/domain/calc';
import type { BorosMarket } from '@/features/boros/domain/types';
import { cn } from '@/shared/lib/cn';

interface AlertRow {
  m: BorosMarket;
  type: 'extreme' | 'liquidity' | 'volatility';
  message: string;
  severity: 'high' | 'medium' | 'low';
}

export function RiskMonitorTab({ markets }: { markets: BorosMarket[] }) {
  const alerts = useMemo<AlertRow[]>(() => {
    const out: AlertRow[] = [];
    for (const m of markets) {
      const a = BorosCalculationEngine.analyze({ m, size: 1000 });
      const dev = a.relDev7d; // انحراف نسبی از میانگین ۷ روزه
      const liq = a.liquidityScore;
      const vol = a.volatility;
      // ۱) Funding Extreme — Z-Score یا انحراف نسبی
      if (a.extreme === 'high' || a.extreme === 'low') {
        out.push({
          m,
          type: 'extreme',
          message: `Z-Score ${a.zScore?.toFixed(1)} — APR ${a.extreme === 'high' ? 'بسیار بالاتر' : 'بسیار پایین‌تر'} از میانگین تاریخی (تأمین‌مالی افراطی)`,
          severity: Math.abs(a.zScore ?? 0) > 3 ? 'high' : 'medium'
        });
      } else if (dev !== null && Math.abs(dev) > 25) {
        out.push({
          m,
          type: 'extreme',
          message: `انحراف نسبی ${dev > 0 ? '+' : ''}${fmtPct(dev)} از میانگین ۷ روزه`,
          severity: Math.abs(dev) > 50 ? 'high' : 'medium'
        });
      }
      // ۲) Low Liquidity
      if (liq < 0.3) {
        out.push({
          m,
          type: 'liquidity',
          message: `نقدشوندگی پایین (OI: ${fmtUSD(m.notionalOI)} · حجم: ${fmtUSD(m.volume24h)})`,
          severity: liq < 0.15 ? 'high' : 'medium'
        });
      }
      // ۳) High Volatility
      if (vol !== null && vol > 0.015) {
        out.push({
          m,
          type: 'volatility',
          message: `نوسان روزانه ${fmtPct(vol * 100)} — بالاتر از حد طبیعی`,
          severity: vol > 0.03 ? 'high' : 'low'
        });
      }
    }
    return out.sort((a, b) => (a.severity === 'high' ? -1 : 1) - (b.severity === 'high' ? -1 : 1));
  }, [markets]);

  const severityStyle = (s: AlertRow['severity']) =>
    s === 'high'
      ? 'border-negative/30 bg-negative/10'
      : s === 'medium'
        ? 'border-warn/30 bg-warn/10'
        : 'border-line/10 bg-line/5';

  return (
    <div className="space-y-3">
      {/* ===== Position Layer (WORLD B) — بدون Position واقعی = N/A ===== */}
      <GlassCard className="p-3.5">
        <p className="mb-2 flex items-center gap-1.5 text-[12px] font-black text-ink">
          <ShieldAlert className="h-4 w-4 text-warn" /> Position Layer — ریسک Position واقعی
        </p>
        <div className="grid grid-cols-2 gap-1.5 text-[9px] font-bold sm:grid-cols-3">
          <div className="rounded-lg bg-line/5 px-2 py-1.5"><p className="text-muted">Live Position</p><p className="text-negative">NO</p></div>
          <div className="rounded-lg bg-line/5 px-2 py-1.5"><p className="text-muted">Actual Collateral</p><p className="text-muted">N/A</p></div>
          <div className="rounded-lg bg-line/5 px-2 py-1.5"><p className="text-muted">Actual Notional</p><p className="text-muted">N/A</p></div>
          <div className="rounded-lg bg-line/5 px-2 py-1.5"><p className="text-muted">Liquidation Implied APR</p><p className="text-muted">N/A</p></div>
          <div className="rounded-lg bg-line/5 px-2 py-1.5"><p className="text-muted">Health Factor</p><p className="text-muted">N/A</p></div>
          <div className="rounded-lg bg-line/5 px-2 py-1.5"><p className="text-muted">Maintenance Margin</p><p className="text-muted">N/A</p></div>
        </div>
        <p className="mt-1.5 text-[8px] font-medium leading-4 text-muted">
          ⚠ Liquidation APR و Health Factor فقط با Position واقعی Boros (Collateral واقعی + وضعیت Position) در دسترس‌اند — از داده بازار حدس زده نمی‌شوند.
          هشدارهای زیر «ریسک بازار» هستند، نه «ریسک لیکوییدیشن Position».
        </p>
      </GlassCard>

      <GlassCard variant="soft" className="p-3.5">
        <p className="flex items-center gap-1.5 text-[12px] font-black text-ink">
          <ShieldAlert className="h-4 w-4 text-warn" /> هشدارهای بازار ({alerts.length})
        </p>
        <p className="mt-1 text-[10px] font-medium text-muted">
          تشخیص خودکار: تأمین‌مالی افراطی (انحراف از میانگین ۷ روزه)، نقدشوندگی پایین، نوسان بالا
        </p>
      </GlassCard>

      {alerts.length === 0 && (
        <GlassCard variant="soft" className="p-6 text-center text-[11px] font-bold text-muted">
          هشدار فعالی وجود ندارد ✓
        </GlassCard>
      )}

      {alerts.slice(0, 40).map((a, i) => (
        <div key={i} className={cn('rounded-2xl border p-3', severityStyle(a.severity))}>
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                a.type === 'extreme'
                  ? 'bg-warn/20 text-warn'
                  : a.type === 'liquidity'
                    ? 'bg-rose-500/15 text-rose-400'
                    : 'bg-info/15 text-info'
              )}
            >
              {a.type === 'extreme' ? (
                <AlertTriangle className="h-4 w-4" />
              ) : a.type === 'liquidity' ? (
                <Droplets className="h-4 w-4" />
              ) : (
                <Activity className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-extrabold text-ink">{a.m.name}</p>
              <p className="text-[9px] font-medium leading-4 text-muted">{a.message}</p>
            </div>
            <span
              className={cn(
                'badge shrink-0 ring-1',
                a.severity === 'high'
                  ? 'bg-negative/10 text-negative ring-negative/20'
                  : a.severity === 'medium'
                    ? 'bg-warn/10 text-warn ring-warn/20'
                    : 'bg-line/5 text-muted ring-line/10'
              )}
            >
              {a.severity === 'high' ? 'شدید' : a.severity === 'medium' ? 'متوسط' : 'خفیف'}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[8px] font-bold">
            <span className="badge bg-line/5 text-muted ring-1 ring-line/10">
              ریسک: {BorosCalculationEngine.analyze({ m: a.m, size: 1000 }).riskLevel} ({Math.round(BorosCalculationEngine.analyze({ m: a.m, size: 1000 }).riskScore)}/100)
            </span>
            <span className="badge bg-line/5 text-muted ring-1 ring-line/10">
              APR: {fmtPct(a.m.markApr * 100)} · شناور: {fmtPct(a.m.floatingApr * 100)}
            </span>
          </div>
        </div>
      ))}

      <p className="text-center text-[9px] font-medium text-muted/70">
        فقط هشدار تحلیلی — هیچ اقدامی خودکار انجام نمی‌شود (Read Only)
      </p>
    </div>
  );
}
