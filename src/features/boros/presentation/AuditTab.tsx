/**
 * Boros audit — full per-market breakdown (complete transparency)
 *  - PnL split: gross settlement / unrealized MTM / total gross / net
 *  - costs line by line with their source (API / market data / user input / N/A)
 *  - independent margin with its inputs
 *  - four separate return measures
 * Each market is a collapsed row; open it to audit.
 */
import { useMemo, useState } from 'react';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { Badge, type Tone } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { KeyValueList, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { auditMarkets, type MarketAuditBreakdown } from '@/features/boros/domain/engine/audit';
import { AuditReportTable } from './AuditReportTable';
import type { BorosMarket } from '@/features/boros/domain/types';
import { fmtPct, toFaDigits } from '@/shared/utils/formatters';

const SOURCE: Record<string, { label: string; tone: Tone }> = {
  api: { label: 'API', tone: 'brand' },
  'market-data': { label: 'داده بازار', tone: 'info' },
  'user-input': { label: 'ورودی کاربر', tone: 'neutral' },
  na: { label: 'نامشخص', tone: 'neutral' }
};

function AuditRow({ b }: { b: MarketAuditBreakdown }) {
  return (
    <li className="px-4 md:px-5">
      <Disclosure
        summary={
          <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-ink">
            <span className="font-semibold">
              <bdi dir="ltr">{b.asset}</bdi> · {b.venue}{' '}
              <span className="text-xs font-normal text-muted">({toFaDigits(b.daysToMaturity)} روز)</span>
            </span>
            <span className="flex items-center gap-3 text-xs font-normal text-muted">
              <span>خالص لانگ <MoneyValue value={b.netLong} signed tone="auto" className="font-semibold" /></span>
              <span>خالص شورت <MoneyValue value={b.netShort} signed tone="auto" className="font-semibold" /></span>
            </span>
          </span>
        }
      >
        <div className="grid gap-6 pb-4 lg:grid-cols-3">
          <div>
            <h4 className="text-xs font-semibold text-muted">سود و زیان تفکیکی</h4>
            <KeyValueList
              dense
              rows={[
                { label: 'تسویه ناخالص لانگ', value: <MoneyValue value={b.grossSettlementLong} signed tone="auto" /> },
                { label: 'تسویه ناخالص شورت', value: <MoneyValue value={b.grossSettlementShort} signed tone="auto" /> },
                { label: 'ارزش روز لانگ (هنوز بسته نشده)', value: <MoneyValue value={b.unrealizedMtmLong} signed /> },
                { label: 'ارزش روز شورت (هنوز بسته نشده)', value: <MoneyValue value={b.unrealizedMtmShort} signed /> },
                { label: 'ناخالص کل لانگ', value: <MoneyValue value={b.totalGrossLong} signed tone="auto" /> },
                { label: 'ناخالص کل شورت', value: <MoneyValue value={b.totalGrossShort} signed tone="auto" /> },
                { label: 'خالص لانگ', emphasis: true, value: <MoneyValue value={b.netLong} signed tone="auto" /> },
                { label: 'خالص شورت', emphasis: true, value: <MoneyValue value={b.netShort} signed tone="auto" /> }
              ]}
            />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-muted">هزینه‌ها و منبع</h4>
            <KeyValueList
              dense
              rows={[
                ...b.feeLines.map((l) => ({
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      {l.label} <Badge tone={SOURCE[l.source]?.tone ?? 'neutral'}>{SOURCE[l.source]?.label ?? l.source}</Badge>
                    </span>
                  ),
                  value: l.amount === 0 && l.source === 'na' ? <span className="text-subtle">N/A</span> : <MoneyValue value={l.amount} />
                })),
                { label: 'مجموع هزینه‌ها', emphasis: true, value: <MoneyValue value={b.totalCostsLong} /> }
              ]}
            />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-muted">مارجین و بازده</h4>
            <KeyValueList
              dense
              rows={[
                { label: 'Notional', value: <span className="num-ltr">{b.marginParams.size}</span> },
                { label: 'نرخ / کف', value: <span className="num-ltr">{fmtPct(b.marginParams.rate * 100)} / {fmtPct(b.marginParams.rateFloor * 100)}</span> },
                { label: 'زمان تا سررسید / کف', value: <span className="num-ltr">{b.marginParams.ytm.toFixed(3)} / {b.marginParams.ytmFloor}</span> },
                { label: 'IM', value: <PercentValue value={b.marginParams.imRatio * 100} signed={false} tone="none" /> },
                { label: 'مارجین', emphasis: true, value: <MoneyValue value={b.marginRequired} /> },
                { label: 'بازده مارجین لانگ', value: <PercentValue value={b.roiLongMargin} /> },
                { label: 'بازده ارزش اسمی لانگ', value: <PercentValue value={b.roiLongNotional} /> },
                { label: 'سالانه‌شده لانگ', value: <PercentValue value={b.annualizedLong} /> },
                { label: 'بازده مارجین شورت', value: <PercentValue value={b.roiShortMargin} /> }
              ]}
            />
          </div>
        </div>
      </Disclosure>
    </li>
  );
}

export function AuditTab({ markets }: { markets: BorosMarket[] }) {
  const [limit, setLimit] = useState(10);
  const audits = useMemo(() => auditMarkets(markets, 1000), [markets]);

  return (
    <div className="space-y-8">
      <AuditReportTable markets={markets} />

      <Section
        id="engine-audit"
        title="بررسی محاسبات موتور"
        description="سود و زیان، مارجین و هزینه‌ها"
      >
        <Surface>
          <ul className="divide-y divide-divider">
            {audits.slice(0, limit).map((b) => (
              <AuditRow key={b.marketId} b={b} />
            ))}
          </ul>
        </Surface>
        {audits.length > limit && (
          <Button variant="ghost" size="sm" className="mt-2 w-full text-accent" onClick={() => setLimit((l) => l + 10)}>
            نمایش بیشتر ({toFaDigits(audits.length - limit)} باقی‌مانده)
          </Button>
        )}
      </Section>
    </div>
  );
}
