/**
 * Positions — what I own, at what cost, and how it is doing.
 * Desktop: financial table. Phones: list rows (no horizontal scrolling).
 */
import { Link } from 'react-router-dom';
import { ArrowLeft, Wallet } from 'lucide-react';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { DeltaValue, MoneyValue, PercentValue, QuantityValue } from '@/shared/components/ui/FinancialValue';
import { ListRow } from '@/shared/components/ui/ListRow';
import { EmptyState } from '@/shared/components/ui/StateViews';
import { TableSkeleton } from '@/shared/components/ui/Skeleton';
import { buttonClass } from '@/shared/components/ui/Button';
import { CASH_STABLECOIN_SYMBOL } from '@/features/accounting/domain/types';
import type { PortfolioOverview } from './usePortfolioOverview';

export function PositionsSection({ o }: { o: PortfolioOverview }) {
  const action = (
    <Link to="/accounting" className={buttonClass('ghost', 'sm')}>
      مدیریت
      <ArrowLeft className="rtl:rotate-0 ltr:rotate-180" />
    </Link>
  );

  return (
    <Section id="positions" title="دارایی‌ها" description="مقدار، هزینهٔ خرید و سود و زیان فعلی" action={action}>
      <Surface className="px-4 md:px-0">
        {o.state === 'loading' ? (
          <div className="md:px-5">
            <TableSkeleton rows={3} cols={5} />
          </div>
        ) : o.positions.length === 0 && !o.cash ? (
          <EmptyState
            className="my-4"
            message="هنوز دارایی‌ای ثبت نشده است"
            hint="با ثبت واریز یا خرید در حسابداری، دارایی‌ها اینجا نمایش داده می‌شوند."
          />
        ) : (
          <>
            {/* desktop table */}
            <div className="hidden md:block">
              <table className="data-table">
                <caption className="sr-only">دارایی‌های من</caption>
                <thead>
                  <tr>
                    <th scope="col" className="!ps-5">دارایی</th>
                    <th scope="col" className="col-num">مقدار</th>
                    <th scope="col" className="col-num">میانگین خرید</th>
                    <th scope="col" className="col-num">قیمت</th>
                    <th scope="col" className="col-num">ارزش</th>
                    <th scope="col" className="col-num">سود/زیان باز</th>
                    <th scope="col" className="col-num !pe-5">سهم</th>
                  </tr>
                </thead>
                <tbody>
                  {o.positions.map((p) => (
                    <tr key={p.symbol}>
                      <td className="!ps-5">
                        <div className="flex items-center gap-3">
                          <AssetLogo symbol={p.symbol} kind="crypto" size={32} />
                          <div className="min-w-0">
                            <p className="font-semibold text-ink">{p.nameFa}</p>
                            <p className="text-xs text-muted">

                              {p.change24hPct !== null && (
                                <>
                                  {' · '}
                                  <DeltaValue pct={p.change24hPct} className="text-xs font-normal" />
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="col-num"><QuantityValue value={p.qty} /></td>
                      <td className="col-num text-muted"><MoneyValue value={p.avgCost} /></td>
                      <td className="col-num"><MoneyValue value={p.price} /></td>
                      <td className="col-num font-semibold text-ink"><MoneyValue value={p.value} /></td>
                      <td className="col-num">
                        <MoneyValue value={p.unrealized} signed tone="auto" className="font-semibold" />
                        <span className="block text-xs">
                          <PercentValue value={p.unrealizedPct} />
                        </span>
                      </td>
                      <td className="col-num !pe-5 text-muted">
                        <PercentValue value={p.share} signed={false} tone="none" digits={1} />
                      </td>
                    </tr>
                  ))}
                  {o.cash !== null && (
                    <tr>
                      <td className="!ps-5">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-muted">
                            <Wallet className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="font-semibold text-ink">موجودی نقد</p>
                            <p className="text-xs text-muted"><bdi dir="ltr">{CASH_STABLECOIN_SYMBOL}</bdi> · معادل دلار</p>
                          </div>
                        </div>
                      </td>
                      <td className="col-num text-subtle">—</td>
                      <td className="col-num text-subtle">—</td>
                      <td className="col-num text-subtle">—</td>
                      <td className="col-num font-semibold text-ink"><MoneyValue value={o.cash} /></td>
                      <td className="col-num text-subtle">—</td>
                      <td className="col-num !pe-5 text-muted">
                        <PercentValue
                          value={o.netWorth ? (o.cash / o.netWorth) * 100 : null}
                          signed={false}
                          tone="none"
                          digits={1}
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* phones: list */}
            <div className="divide-y divide-divider md:hidden">
              {o.positions.map((p) => (
                <ListRow
                  key={p.symbol}
                  leading={<AssetLogo symbol={p.symbol} kind="crypto" size={36} />}
                  title={p.nameFa}
                  subtitle={
                    <>
                      <QuantityValue value={p.qty} unit={p.symbol} /> · میانگین <MoneyValue value={p.avgCost} />
                    </>
                  }
                  trailing={<MoneyValue value={p.value} />}
                  trailingSub={<MoneyValue value={p.unrealized} signed tone="auto" />}
                />
              ))}
              {o.cash !== null && (
                <ListRow
                  leading={
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-muted">
                      <Wallet className="h-4 w-4" />
                    </span>
                  }
                  title="موجودی نقد"
                  subtitle={<bdi dir="ltr">{CASH_STABLECOIN_SYMBOL}</bdi>}
                  trailing={<MoneyValue value={o.cash} />}
                />
              )}
            </div>
          </>
        )}
      </Surface>
    </Section>
  );
}
