/**
 * مقایسه بازارها (Cross Market Comparison) — همان دارایی در چند Venue
 * Expected Return / Margin / Risk / Liquidity / Net APR
 */
import { useMemo, useState } from 'react';
import { GitCompare } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { fmtPct, fmtUSD } from '@/shared/utils/formatters';
import { compareMarkets, riskLevel } from '@/features/boros/domain/calc';
import { userCapitalOpportunity, DEFAULT_SIMULATION_COLLATERAL_ETH } from '@/features/boros/domain/collateral';
import { ProvenanceBadge } from '@/shared/components/ui/ProvenanceBadge';
import type { BorosMarket } from '@/features/boros/domain/types';
import { cn } from '@/shared/lib/cn';

export function ComparisonTab({ markets }: { markets: BorosMarket[] }) {
  const [asset, setAsset] = useState('ETH');
  const [size, setSize] = useState(1000);
  /** Simulation Collateral (ETH) — مقایسه «برای سرمایه من» */
  const [simCollateral, setSimCollateral] = useState(DEFAULT_SIMULATION_COLLATERAL_ETH);

  const assets = useMemo(() => [...new Set(markets.map((m) => m.asset))], [markets]);

  const ethPrice = markets.find((m) => m.asset === 'ETH')?.assetMarkPrice ?? 0;

  const rows = useMemo(() => {
    const filtered = markets.filter((m) => m.asset === asset);
    const comps = compareMarkets(filtered, size, undefined);
    return comps.sort((a, b) => b.opportunity - a.opportunity);
  }, [markets, asset, size]);

  /** ستون «برای سرمایه شما» — ارزیابی با Simulation Collateral (Long) */
  const userRows = useMemo(() => {
    if (!(simCollateral > 0) || !(ethPrice > 0)) return new Map<number, number>();
    const map = new Map<number, number>();
    for (const m of markets.filter((x) => x.asset === asset)) {
      const o = userCapitalOpportunity({ m, direction: 'long', collateralAsset: simCollateral, collateralPriceUsd: ethPrice });
      if (o && o.netPnl !== null) map.set(m.marketId, o.netPnl);
    }
    return map;
  }, [markets, asset, simCollateral, ethPrice]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={asset}
          onChange={(e) => setAsset(e.target.value)}
          className="glass-inset h-10 rounded-2xl px-2 text-[10px] font-bold text-ink outline-none"
        >
          {assets.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[10px] font-bold text-muted">
          حجم (YU):
          <input
            type="number"
            value={size}
            onChange={(e) => setSize(Number(e.target.value) || 0)}
            className="glass-inset h-9 w-24 rounded-xl px-2 text-[10px] font-bold text-ink outline-none"
          />
        </label>
        <label className="flex items-center gap-1.5 text-[10px] font-bold text-muted">
          <ProvenanceBadge kind="simulated" /> Collateral مقایسه:
          <input
            type="number"
            step="0.001"
            min="0"
            value={simCollateral}
            onChange={(e) => setSimCollateral(Number(e.target.value) || 0)}
            className="glass-inset h-9 w-20 rounded-xl px-2 text-[10px] font-bold text-ink outline-none"
          />
          ETH
        </label>
      </div>

      <GlassCard variant="soft" className="overflow-x-auto p-2">
        <table className="w-full min-w-[560px] text-[10px]">
          <thead>
            <tr className="text-muted">
              <th className="px-2 py-1.5 text-start font-black">بازار</th>
              <th className="px-2 py-1.5 text-end font-black">بازده موردانتظار</th>
              <th className="px-2 py-1.5 text-end font-black">مارجین</th>
              <th className="px-2 py-1.5 text-end font-black">Net APR</th>
              <th className="px-2 py-1.5 text-end font-black">Net PnL برای {simCollateral.toFixed(2)} ETH</th>
              <th className="px-2 py-1.5 text-end font-black">نقدشوندگی</th>
              <th className="px-2 py-1.5 text-end font-black">ریسک</th>
              <th className="px-2 py-1.5 text-end font-black">امتیاز</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.m.marketId} className="border-t border-line/5">
                <td className="px-2 py-2">
                  <p className="font-extrabold text-ink">{r.m.venue}</p>
                  <p className="num-ltr text-[8px] text-muted">
                    {r.m.fundingRateSymbol} · {new Date(r.m.maturity * 1000).toLocaleDateString('fa-IR')}
                  </p>
                </td>
                <td className={cn('num-ltr px-2 py-2 text-end font-black', r.expectedReturn >= 0 ? 'text-positive' : 'text-negative')}>
                  {r.expectedReturn >= 0 ? '+' : ''}{fmtUSD(r.expectedReturn)}
                </td>
                <td className="num-ltr px-2 py-2 text-end font-black text-ink">{fmtUSD(r.margin)}</td>
                <td className="num-ltr px-2 py-2 text-end font-black text-ink">{fmtPct(r.netApr)}</td>
                <td className={cn('num-ltr px-2 py-2 text-end font-black', (userRows.get(r.m.marketId) ?? -1) >= 0 ? 'text-positive' : 'text-negative')}>
                  {userRows.has(r.m.marketId) ? `${(userRows.get(r.m.marketId) ?? 0) >= 0 ? '+' : ''}${fmtUSD(userRows.get(r.m.marketId) ?? 0, true)}` : '—'}
                </td>
                <td className="num-ltr px-2 py-2 text-end font-black text-ink">{Math.round(r.liquidityScore * 100)}٪</td>
                <td className={cn('px-2 py-2 text-end font-black', r.risk === 'کم' ? 'text-positive' : r.risk === 'متوسط' ? 'text-warn' : 'text-negative')}>
                  {riskLevel(r.riskScore)}
                </td>
                <td className="num-ltr px-2 py-2 text-end font-black text-accent">{Math.round(r.opportunity)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-[11px] font-bold text-muted">
                  بازاری برای {asset} یافت نشد
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </GlassCard>

      <GlassCard variant="soft" className="p-3.5">
        <p className="flex items-center gap-1.5 text-[11px] font-black text-ink">
          <GitCompare className="h-3.5 w-3.5 text-accent" /> راهنما
        </p>
        <p className="mt-1 text-[10px] font-medium leading-5 text-muted">
          مقایسه همان دارایی در چند Venue: بازده موردانتظار بر اساس (floating − mark) × حجم × زمان؛
          مارجین با فرمول رسمی Boros؛ ستون «Net PnL برای X ETH» با Simulation Collateral شما محاسبه
          می‌شود (فقط شبیه‌سازی — Liquidation APR در این سطح N/A است).
        </p>
      </GlassCard>
    </div>
  );
}
