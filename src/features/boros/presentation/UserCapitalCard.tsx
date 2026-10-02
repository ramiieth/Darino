/**
 * UserCapitalCard — one opportunity evaluated with the user's simulation collateral
 * ("if I put X collateral into Boros, how does this market look?").
 * Primary: net PnL · ROI on margin · rate edge. Everything else behind «جزئیات».
 * Liquidation APR = N/A without a real Boros position (official value only).
 */
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { ProvenanceBadge } from '@/shared/components/ui/ProvenanceBadge';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { KeyValueList, Metric, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { toFaDigits } from '@/shared/utils/formatters';
import type { UserCapitalOpportunity } from '@/features/boros/domain/collateral';
import { isLiquidationAPRAvailable } from '@/features/boros/domain/liquidationApr';

export function UserCapitalCard({ o, rank }: { o: UserCapitalOpportunity; rank: number }) {
  const liqAvail = isLiquidationAPRAvailable(o.liquidationApr);
  const long = o.direction === 'long';
  return (
    <Surface className="p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="num-ltr text-sm font-bold text-subtle">#{rank}</span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 text-base font-bold text-ink">
              <bdi dir="ltr">{o.asset}</bdi>
              <span className="text-sm font-normal text-muted">· {o.venue}</span>
              <Badge tone={long ? 'gain' : 'loss'}>{long ? 'لانگ' : 'شورت'}</Badge>
              <Badge tone={o.executable ? 'neutral' : 'warn'}>{o.executable ? 'قابل اجرا' : 'غیرقابل اجرا'}</Badge>
            </p>
            <p className="text-xs text-muted">
              سررسید {new Date(o.maturity * 1000).toLocaleDateString('fa-IR')} · {toFaDigits(o.daysToMaturity)} روز
            </p>
          </div>
        </div>
        <div className="text-end">
          <p className="num-ltr text-lg font-bold text-ink">{Math.round(o.userScore)}<span className="text-xs text-muted">/100</span></p>
          <p className="text-2xs text-muted">امتیاز برای سرمایه شما</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4 border-t border-divider pt-4">
        <Metric
          size="md"
          label={<span className="inline-flex items-center gap-1">سود خالص <ProvenanceBadge kind="simulated" /></span>}
          value={<MoneyValue value={o.netPnl} signed tone="auto" />}
        />
        <Metric size="md" label="بازده روی مارجین" value={<PercentValue value={o.roiOnMargin} />} />
        <Metric size="md" label="لبه نرخ" value={<PercentValue value={o.rateEdge * 100} />} />
      </div>

      <Disclosure summary="جزئیات محاسبه" className="mt-3 border-t border-divider pt-1">
        <KeyValueList
          dense
          rows={[
            { label: 'وثیقه شبیه‌سازی', value: <span className="num-ltr">{o.simulationCollateral.toFixed(3)} ETH</span> },
            { label: 'حداکثر ارزش اسمی', value: <MoneyValue value={o.notional} compact /> },
            { label: 'مارجین', value: <span><MoneyValue value={o.marginUsd} compact /> <span className="text-muted">({toFaDigits(o.marginUtilizationPct.toFixed(0))}٪ collateral)</span></span> },
            { label: 'نرخ ثابت (سرویس)', value: <PercentValue value={o.fixedApr * 100} signed={false} tone="none" /> },
            { label: 'نرخ شناور (سرویس)', value: <PercentValue value={o.underlyingApr * 100} signed={false} tone="none" /> },
            { label: 'تسویه (محاسبه‌شده)', value: <MoneyValue value={o.settlementPnl} signed tone="auto" /> },
            { label: 'کارمزدها', value: <MoneyValue value={o.feesUsd} /> },
            { label: 'لغزش', value: <MoneyValue value={o.slippageUsd} /> },
            { label: 'لبه اقتصادی', value: <MoneyValue value={o.economicEdge} signed tone="auto" /> },
            {
              label: 'پایداری',
              value: o.robustness === 'robust' ? 'پایدار' : o.robustness === 'conditional' ? 'مشروط' : 'ناپایدار'
            },
            { label: 'ریسک / اطمینان', value: `${o.riskLevel} · ${toFaDigits(o.confidence)}٪` },
            {
              label: 'نرخ لیکوئید ضمنی',
              hint: liqAvail ? 'مقدار رسمی بوروس' : 'فقط با پوزیشن و وثیقه واقعی قابل محاسبه است',
              value: liqAvail ? <span className="num-ltr">{o.liquidationApr.value!.toFixed(2)}%</span> : <span className="text-subtle">N/A</span>
            }
          ]}
        />
      </Disclosure>
    </Surface>
  );
}
