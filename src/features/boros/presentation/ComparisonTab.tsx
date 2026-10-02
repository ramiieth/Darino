/**
 * Cross-market comparison — the same asset across venues:
 * expected return · margin · net APR · PnL for your collateral · liquidity · risk · score
 */
import { useMemo, useState } from 'react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Field, Input, Select } from '@/shared/components/ui/Input';
import { Badge } from '@/shared/components/ui/Badge';
import { ProvenanceBadge } from '@/shared/components/ui/ProvenanceBadge';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { compareMarkets, riskLevel } from '@/features/boros/domain/calc';
import { userCapitalOpportunity, DEFAULT_SIMULATION_COLLATERAL_ETH } from '@/features/boros/domain/collateral';
import type { BorosMarket } from '@/features/boros/domain/types';

export function ComparisonTab({ markets }: { markets: BorosMarket[] }) {
  const [asset, setAsset] = useState('ETH');
  const [size, setSize] = useState(1000);
  const [simCollateral, setSimCollateral] = useState(DEFAULT_SIMULATION_COLLATERAL_ETH);

  const assets = useMemo(() => [...new Set(markets.map((m) => m.asset))], [markets]);
  const ethPrice = markets.find((m) => m.asset === 'ETH')?.assetMarkPrice ?? 0;

  const rows = useMemo(() => {
    const filtered = markets.filter((m) => m.asset === asset);
    return compareMarkets(filtered, size, undefined).sort((a, b) => b.opportunity - a.opportunity);
  }, [markets, asset, size]);

  /** "for your capital" column — simulation collateral, long side */
  const userRows = useMemo(() => {
    const map = new Map<number, number>();
    if (!(simCollateral > 0) || !(ethPrice > 0)) return map;
    for (const m of markets.filter((x) => x.asset === asset)) {
      const o = userCapitalOpportunity({ m, direction: 'long', collateralAsset: simCollateral, collateralPriceUsd: ethPrice });
      if (o && o.netPnl !== null) map.set(m.marketId, o.netPnl);
    }
    return map;
  }, [markets, asset, simCollateral, ethPrice]);

  return (
    <div className="space-y-5">
      <Surface className="p-4 md:p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="دارایی">
            <Select value={asset} onChange={(e) => setAsset(e.target.value)}>
              {assets.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </Select>
          </Field>
          <Field label="حجم" hint="بر حسب واحد بازده">
            <Input dir="ltr" type="number" value={size} onChange={(e) => setSize(Number(e.target.value) || 0)} suffix="YU" />
          </Field>
          <Field label={<span className="inline-flex items-center gap-1.5">وثیقه مقایسه <ProvenanceBadge kind="simulated" /></span>}>
            <Input
              dir="ltr"
              type="number"
              step="0.001"
              min="0"
              value={simCollateral}
              onChange={(e) => setSimCollateral(Number(e.target.value) || 0)}
              suffix="ETH"
            />
          </Field>
        </div>
      </Surface>

      {rows.length === 0 ? (
        <EmptyState message={`بازاری برای ${asset} یافت نشد`} />
      ) : (
        <Surface className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[720px]">
              <caption className="sr-only">مقایسه بازارهای {asset}</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky start-0 z-20 !ps-5">بازار</th>
                  <th scope="col" className="col-num">بازده موردانتظار</th>
                  <th scope="col" className="col-num">مارجین</th>
                  <th scope="col" className="col-num">نرخ خالص سالانه</th>
                  <th scope="col" className="col-num">PnL برای {simCollateral.toFixed(2)} ETH</th>
                  <th scope="col" className="col-num">نقدشوندگی</th>
                  <th scope="col">ریسک</th>
                  <th scope="col" className="col-num !pe-5">امتیاز</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.m.marketId}>
                    <td className="sticky start-0 z-10 bg-card !ps-5">
                      <p className="font-semibold text-ink">{r.m.venue}</p>
                      <p className="text-xs text-muted">
                        <bdi dir="ltr">{r.m.fundingRateSymbol}</bdi> · {new Date(r.m.maturity * 1000).toLocaleDateString('fa-IR')}
                      </p>
                    </td>
                    <td className="col-num"><MoneyValue value={r.expectedReturn} signed tone="auto" /></td>
                    <td className="col-num"><MoneyValue value={r.margin} /></td>
                    <td className="col-num"><PercentValue value={r.netApr} /></td>
                    <td className="col-num"><MoneyValue value={userRows.get(r.m.marketId) ?? null} signed tone="auto" compact /></td>
                    <td className="col-num"><PercentValue value={r.liquidityScore * 100} signed={false} tone="none" digits={0} /></td>
                    <td>
                      <Badge tone={r.risk === 'کم' ? 'gain' : r.risk === 'متوسط' ? 'warn' : 'loss'}>{riskLevel(r.riskScore)}</Badge>
                    </td>
                    <td className="col-num num-ltr !pe-5 font-bold text-ink">{Math.round(r.opportunity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      )}

      <Notice tone="neutral" title="روش محاسبه">
        بازده موردانتظار = (نرخ شناور − نرخ mark) × حجم × زمان؛ مارجین با فرمول رسمی Boros؛ ستون PnL با Collateral شبیه‌سازی
        شما محاسبه می‌شود و Liquidation APR در این سطح N/A است.
      </Notice>
    </div>
  );
}
