/**
 * Order preview (MODE C) — "I intend to open a real position"
 *  input: available collateral · direction · size (YU) · fixed APR
 *  output: margin / sensitivity / fees / slippage / expected PnL / ROI
 *  Liquidation APR = N/A (needs a real position) unless Boros returns an official preview value
 */
import { useMemo, useState } from 'react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Field, Input } from '@/shared/components/ui/Input';
import { Badge } from '@/shared/components/ui/Badge';
import { ProvenanceBadge } from '@/shared/components/ui/ProvenanceBadge';
import { KeyValueList, Metric, MetricGrid, MoneyValue, PercentValue, QuantityValue } from '@/shared/components/ui/FinancialValue';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { orderPreview } from '@/features/boros/domain/preview';
import { isLiquidationAPRAvailable, LIQUIDATION_SOURCE_FA } from '@/features/boros/domain/liquidationApr';
import type { BorosDirection, BorosMarket } from '@/features/boros/domain/types';

export function OrderPreviewPanel({
  market,
  direction,
  fixedRate,
  underlyingApr,
  collateralPriceUsd
}: {
  market: BorosMarket;
  direction: BorosDirection;
  fixedRate: number | null;
  underlyingApr: number;
  collateralPriceUsd: number;
}) {
  const [notional, setNotional] = useState(2); // YU
  const [collateral, setCollateral] = useState('0.102'); // ETH

  const preview = useMemo(() => {
    const collN = Number(collateral);
    return orderPreview({
      m: market,
      availableCollateral: Number.isFinite(collN) && collN > 0 ? collN : null,
      collateralPriceUsd,
      direction,
      notional: Number(notional) || 0,
      fixedApr: fixedRate ?? market.markApr,
      underlyingApr,
      gasUsd: 0,
      slippageRate: null, // no public order book → N/A (not a fake zero)
      maxSlippageRate: null
    });
  }, [market, direction, fixedRate, underlyingApr, collateralPriceUsd, notional, collateral]);

  const inputs = (
    <Surface className="p-4 md:p-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="حجم">
          <Input dir="ltr" type="number" value={notional} onChange={(e) => setNotional(Number(e.target.value) || 0)} suffix="YU" />
        </Field>
        <Field label="وثیقه موجود">
          <Input dir="ltr" value={collateral} onChange={(e) => setCollateral(e.target.value)} suffix="ETH" />
        </Field>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted">جهت</p>
          <Badge tone={direction === 'long' ? 'gain' : 'loss'} className="h-10 px-3 text-sm">
            {direction === 'long' ? 'لانگ' : 'شورت'}
          </Badge>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted">نرخ ثابت سالانه</p>
          <p className="flex h-10 items-center text-sm font-semibold text-ink">
            <PercentValue value={(fixedRate ?? market.markApr) * 100} signed={false} tone="none" />
          </p>
        </div>
      </div>
    </Surface>
  );

  if (!preview) {
    return (
      <div className="space-y-5">
        {inputs}
        <EmptyState message="برای پیش‌نمایش، حجم معتبر (واحد بازده) وارد کنید." />
      </div>
    );
  }

  const liqAvail = isLiquidationAPRAvailable(preview.liquidationApr);

  return (
    <div className="space-y-5">
      <Notice tone="info">پیش‌نمایش سفارش — هنوز پوزیشن واقعی در بوروس ایجاد نشده و هیچ مقداری «پوزیشن واقعی» نیست.</Notice>
      {inputs}

      <Surface variant="focal" className="p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-muted">سود خالص موردانتظار</p>
            <p className="mt-1 text-4xl font-extrabold tracking-tight">
              <MoneyValue value={preview.expectedNetPnl} signed tone="auto" />
            </p>
            <p className="mt-1 text-sm text-muted">
              بازده روی مارجین <PercentValue value={preview.roiOnMargin} className="font-semibold" />
            </p>
          </div>
          <ProvenanceBadge kind="simulated" />
        </div>
        <MetricGrid cols={3} className="mt-6 border-t border-divider pt-5">
          <Metric
            label="مارجین موردنیاز"
            value={<MoneyValue value={preview.marginRequiredUsd} />}
            sub={<QuantityValue value={preview.marginRequiredAsset} unit="ETH" />}
          />
          <Metric
            label="حساسیت به ۱٪ نرخ"
            value={<MoneyValue value={preview.rateSensitivityUsd} />}
            sub={<QuantityValue value={preview.rateSensitivityAsset} unit="ETH" />}
          />
          <Metric label="ارزش اسمی / وثیقه" value={<span className="num-ltr">{preview.effectiveExposure.toFixed(1)}x</span>} sub="لوریج متعارف نیست" />
        </MetricGrid>
      </Surface>

      <Surface className="px-4 md:px-5">
        <KeyValueList
          rows={[
            {
              label: 'مارجین در دسترس',
              value: <QuantityValue value={preview.availableMarginAsset} unit="ETH" className={(preview.availableMarginAsset ?? -1) >= 0 ? '' : 'text-negative'} />
            },
            { label: 'کارمزدها (مستندات بوروس)', value: <MoneyValue value={preview.fees.total} /> },
            { label: 'لغزش', hint: 'بدون دفتر سفارش عمومی → نامشخص', value: <MoneyValue value={preview.slippageUsd} /> },
            { label: 'سود تسویه', value: <MoneyValue value={preview.expectedSettlementPnl} signed tone="auto" /> },
            { label: 'ارزش روز (مارک در برابر ورود)', value: <MoneyValue value={preview.expectedMtm} signed tone="auto" /> },
            {
              label: (
                <span className="inline-flex items-center gap-1.5">
                  نرخ لیکوئید ضمنی <ProvenanceBadge kind={liqAvail ? 'boros' : 'na'} label={liqAvail ? 'پیش‌نمایش بوروس' : 'نیازمند پوزیشن'} />
                </span>
              ),
              hint: liqAvail
                ? `${LIQUIDATION_SOURCE_FA[preview.liquidationApr.source]} — مخصوص همین پوزیشن`
                : 'فقط با پوزیشن فعال، وثیقه واقعی و وضعیت پوزیشن قابل محاسبه است',
              value: liqAvail ? <span className="num-ltr">{preview.liquidationApr.value!.toFixed(2)}%</span> : <span className="text-subtle">N/A</span>
            },
            ...(preview.liquidationBufferPct !== null
              ? [{ label: 'حاشیه لیکوییدیشن', value: <span className="num-ltr">{preview.liquidationBufferPct.toFixed(2)} pp</span> }]
              : [])
          ]}
        />
      </Surface>

      {preview.collateralSufficient === null ? (
        <Notice tone="neutral">کفایت وثیقه: نامشخص — وثیقه یا قیمت وارد نشده است.</Notice>
      ) : preview.collateralSufficient ? (
        <Notice tone="success">وثیقه واردشده از مارجین موردنیاز بیشتر است (بررسی ریاضی — نه تضمین).</Notice>
      ) : (
        <Notice tone="warn">وثیقه واردشده کمتر از مارجین موردنیاز است.</Notice>
      )}
    </div>
  );
}
