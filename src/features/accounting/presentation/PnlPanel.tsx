/**
 * Profit & loss — realized (booked) vs unrealized (open lots at live prices)
 * and the FIFO lot register (cost basis).
 */
import { assetDisplayName } from '@/shared/i18n/assetDisplayName';
import { useMemo } from 'react';
import { Surface, Section } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Metric, MetricGrid, MoneyValue, PercentValue, QuantityValue } from '@/shared/components/ui/FinancialValue';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { useAccountingData } from './AccountingContext';
import { formatJalali } from '@/shared/utils/jalali';
import { usePortfolioOverview } from '@/features/eth-summary/presentation/usePortfolioOverview';
import { cn } from '@/shared/lib/cn';

export function PnlPanel() {
  const acc = useAccountingData();
  const { lots } = acc;
  const o = usePortfolioOverview(acc);
  const lotsSorted = useMemo(() => [...lots].sort((a, b) => b.openedAt - a.openedAt), [lots]);
  const unrealizedPct =
    o.unrealizedTotal !== null && o.costBasisTotal > 0 ? (o.unrealizedTotal / o.costBasisTotal) * 100 : null;

  return (
    <div className="space-y-8">
      <Surface className="p-4 md:p-6">
        <MetricGrid cols={4}>
          <Metric
            size="lg"
            label="سود و زیان فروش‌ها"
            value={<MoneyValue value={o.realizedPnl} signed tone="auto" state={o.state === 'loading' ? 'loading' : 'ready'} />}
            sub="از فروش‌های ثبت‌شده"
          />
          <Metric
            size="lg"
            label="سود/زیان باز"
            value={<MoneyValue value={o.unrealizedTotal} signed tone="auto" state={o.state === 'loading' ? 'loading' : 'ready'} />}
            sub={<PercentValue value={unrealizedPct} />}
          />
          <Metric size="md" label="هزینهٔ خرید دارایی‌ها" value={<MoneyValue value={o.state === 'ready' ? o.costBasisTotal : null} />} />
          <Metric size="md" label="ارزش روز دارایی‌ها" value={<MoneyValue value={o.holdingsValue} />} />
        </MetricGrid>
        {o.unpriced.length > 0 && (
          <Notice tone="warn" className="mt-5">
            قیمت {o.unpriced.join('، ')} در دسترس نیست؛ سود/زیان باز و ارزش روز بدون این دارایی‌ها محاسبه شده است.
          </Notice>
        )}
      </Surface>

      <Section id="lots" title="دسته‌های خرید" description="هر خرید یک دسته با قیمت خرید خودش می‌سازد؛ هنگام فروش، اول از قدیمی‌ترین خرید کم می‌شود.">
        {lotsSorted.length === 0 ? (
          <EmptyState message="هنوز خریدی ثبت نشده است" hint="با خرید یا واریز رمزارز، اینجا نمایش داده می‌شود." />
        ) : (
          <Surface className="overflow-hidden">
            <table className="data-table">
              <caption className="sr-only">دسته‌های خرید</caption>
              <thead>
                <tr>
                  <th scope="col" className="!ps-4 md:!ps-5">خرید</th>
                  <th scope="col" className="col-num">مقدار</th>
                  <th scope="col" className="col-num hidden sm:table-cell">قیمت واحد</th>
                  <th scope="col" className="col-num">هزینهٔ خرید</th>
                  <th scope="col" className="!pe-4 md:!pe-5"><span className="sr-only">وضعیت</span></th>
                </tr>
              </thead>
              <tbody>
                {lotsSorted.map((l) => (
                  <tr key={l.id} className={cn(l.closedAt && 'text-muted')}>
                    <td className="!ps-4 md:!ps-5">
                      <p className="font-semibold text-ink">
                        {assetDisplayName(l.asset).name}
                      </p>
                      <p className="text-xs text-muted">{formatJalali(l.openedAt)}</p>
                    </td>
                    <td className="col-num"><QuantityValue value={l.qty} /></td>
                    <td className="col-num hidden sm:table-cell"><MoneyValue value={l.unitCost} /></td>
                    <td className="col-num font-semibold"><MoneyValue value={l.qty * l.unitCost} /></td>
                    <td className="!pe-4 text-end md:!pe-5">
                      <Badge tone={l.closedAt ? 'neutral' : 'gain'}>{l.closedAt ? 'بسته' : 'باز'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
        )}
      </Section>
    </div>
  );
}
