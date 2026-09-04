/**
 * Order Preview (MODE C) — «قصد باز کردن Position واقعی دارم»
 *  ورودی: Collateral موجود · جهت · حجم (YU) · Fixed APR
 *  خروجی: Margin / Sensitivity / Fees / Slippage / Expected PnL / ROI
 *  Liquidation APR = N/A (نیازمند Position واقعی) — مگر Boros مقدار رسمی Preview بدهد
 */
import { useMemo, useState } from 'react';
import { FileCheck2 } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { Input } from '@/shared/components/ui/Input';
import { ProvenanceBadge } from '@/shared/components/ui/ProvenanceBadge';
import { fmtPct, fmtUSD } from '@/shared/utils/formatters';
import { orderPreview } from '@/features/boros/domain/preview';
import { isLiquidationAPRAvailable, LIQUIDATION_SOURCE_FA } from '@/features/boros/domain/liquidationApr';
import type { BorosDirection, BorosMarket } from '@/features/boros/domain/types';
import { cn } from '@/shared/lib/cn';

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
      slippageRate: null, // بدون Order Book عمومی → N/A (نه صفر جعلی)
      maxSlippageRate: null
    });
  }, [market, direction, fixedRate, underlyingApr, collateralPriceUsd, notional, collateral]);

  if (!preview) {
    return (
      <GlassCard variant="soft" className="p-4 text-center text-[10px] font-bold text-muted">
        برای پیش‌نمایش، حجم معتبر (YU) وارد کنید.
      </GlassCard>
    );
  }

  const liqAvail = isLiquidationAPRAvailable(preview.liquidationApr);

  return (
    <GlassCard className="border-info/30 p-3.5">
      <h4 className="mb-2 flex items-center gap-1.5 text-[12px] font-black text-ink">
        <FileCheck2 className="h-4 w-4 text-info" /> Order Preview (MODE C) — قصد باز کردن Position
      </h4>
      <p className="mb-2 text-[8px] font-medium leading-4 text-muted">
        ⚠ پیش‌نمایش سفارش — هنوز Position واقعی در Boros ایجاد نشده است. هیچ مقداری به‌عنوان «Position واقعی» نمایش داده نمی‌شود.
      </p>

      {/* ورودی‌ها */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-[9px] font-bold text-muted">حجم (YU)</label>
          <Input dir="ltr" type="number" value={notional} onChange={(e) => setNotional(Number(e.target.value) || 0)} className="h-8 text-[10px] text-start" />
        </div>
        <div>
          <label className="mb-1 block text-[9px] font-bold text-muted">Collateral موجود (ETH)</label>
          <Input dir="ltr" value={collateral} onChange={(e) => setCollateral(e.target.value)} className="h-8 text-[10px] text-start" />
        </div>
        <div>
          <label className="mb-1 block text-[9px] font-bold text-muted">جهت</label>
          <p className={cn('h-8 rounded-lg px-2 py-1.5 text-[10px] font-black', direction === 'long' ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative')}>
            {direction === 'long' ? 'لانگ' : 'شورت'}
          </p>
        </div>
        <div>
          <label className="mb-1 block text-[9px] font-bold text-muted">Fixed APR</label>
          <p className="num-ltr h-8 rounded-lg bg-surface-2 px-2 py-1.5 text-[10px] font-black text-ink">
            {fmtPct((fixedRate ?? market.markApr) * 100)}
          </p>
        </div>
      </div>

      {/* نتایج */}
      <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[9px] font-bold sm:grid-cols-3">
        <div className="rounded-lg bg-line/5 px-2 py-1.5">
          <p className="flex items-center gap-1 text-muted">Margin Required <ProvenanceBadge kind="calculated" /></p>
          <p className="num-ltr text-ink">{fmtUSD(preview.marginRequiredUsd)}</p>
          <p className="num-ltr text-[8px] text-muted">{preview.marginRequiredAsset !== null ? `${preview.marginRequiredAsset.toFixed(6)} ETH` : 'N/A'}</p>
        </div>
        <div className="rounded-lg bg-line/5 px-2 py-1.5">
          <p className="flex items-center gap-1 text-muted">Rate Sensitivity/1% <ProvenanceBadge kind="calculated" /></p>
          <p className="num-ltr text-ink">{fmtUSD(preview.rateSensitivityUsd)}</p>
          <p className="num-ltr text-[8px] text-muted">{preview.rateSensitivityAsset !== null ? `${preview.rateSensitivityAsset.toFixed(6)} ETH` : 'N/A'}</p>
        </div>
        <div className="rounded-lg bg-line/5 px-2 py-1.5">
          <p className="text-muted">Effective Exposure</p>
          <p className="num-ltr text-ink">{preview.effectiveExposure.toFixed(1)}x</p>
          <p className="text-[8px] text-muted">⚠ لوریج متعارف نیست</p>
        </div>
        <div className="rounded-lg bg-line/5 px-2 py-1.5">
          <p className="flex items-center gap-1 text-muted">Available Margin <ProvenanceBadge kind="calculated" /></p>
          <p className={cn('num-ltr', (preview.availableMarginAsset ?? -1) >= 0 ? 'text-positive' : 'text-negative')}>
            {preview.availableMarginAsset !== null ? `${preview.availableMarginAsset.toFixed(6)} ETH` : 'N/A'}
          </p>
        </div>
        <div className="rounded-lg bg-line/5 px-2 py-1.5">
          <p className="flex items-center gap-1 text-muted">Fees <ProvenanceBadge kind="boros" label="BOROS DOC" /></p>
          <p className="num-ltr text-ink">{fmtUSD(preview.fees.total)}</p>
        </div>
        <div className="rounded-lg bg-line/5 px-2 py-1.5">
          <p className="flex items-center gap-1 text-muted">Slippage (تخمینی) <ProvenanceBadge kind="na" /></p>
          <p className="num-ltr text-ink">{preview.slippageUsd !== null ? fmtUSD(preview.slippageUsd) : 'N/A'}</p>
          <p className="text-[8px] text-muted">بدون Order Book → N/A</p>
        </div>
        <div className="rounded-lg bg-line/5 px-2 py-1.5">
          <p className="flex items-center gap-1 text-muted">Settlement PnL <ProvenanceBadge kind="calculated" /></p>
          <p className={cn('num-ltr', preview.expectedSettlementPnl >= 0 ? 'text-positive' : 'text-negative')}>
            {preview.expectedSettlementPnl >= 0 ? '+' : ''}{fmtUSD(preview.expectedSettlementPnl)}
          </p>
        </div>
        <div className="rounded-lg bg-line/5 px-2 py-1.5">
          <p className="flex items-center gap-1 text-muted">MTM (Mark vs Entry) <ProvenanceBadge kind="calculated" /></p>
          <p className={cn('num-ltr', preview.expectedMtm >= 0 ? 'text-positive' : 'text-negative')}>
            {preview.expectedMtm >= 0 ? '+' : ''}{fmtUSD(preview.expectedMtm)}
          </p>
        </div>
        <div className="rounded-lg bg-positive/10 px-2 py-1.5">
          <p className="flex items-center gap-1 text-muted">Expected Net PnL <ProvenanceBadge kind="simulated" /></p>
          <p className={cn('num-ltr font-black', (preview.expectedNetPnl ?? 0) >= 0 ? 'text-positive' : 'text-negative')}>
            {preview.expectedNetPnl !== null ? `${preview.expectedNetPnl >= 0 ? '+' : ''}${fmtUSD(preview.expectedNetPnl)}` : 'N/A'}
          </p>
          <p className={cn('num-ltr text-[8px]', (preview.roiOnMargin ?? 0) >= 0 ? 'text-positive' : 'text-negative')}>
            ROI {preview.roiOnMargin !== null ? fmtPct(preview.roiOnMargin) : 'N/A'}
          </p>
        </div>
      </div>

      {/* Liquidation — MODE C */}
      <div className="mt-2 rounded-lg border border-line/10 bg-surface-2/50 p-2">
        <p className="flex items-center justify-between text-[9px] font-black text-ink">
          <span>Liquidation Implied APR</span>
          <span className="flex items-center gap-1.5">
            <ProvenanceBadge kind={liqAvail ? 'boros' : 'na'} label={liqAvail ? 'BOROS PREVIEW' : 'REQUIRES ACTIVE POSITION'} />
            <span className={cn('num-ltr', liqAvail ? 'text-accent' : 'text-muted')}>
              {liqAvail ? `${preview.liquidationApr.value!.toFixed(2)}٪` : 'N/A'}
            </span>
          </span>
        </p>
        <p className="mt-1 text-[8px] font-medium leading-4 text-muted">
          {liqAvail
            ? `${LIQUIDATION_SOURCE_FA[preview.liquidationApr.source]} — Position-Specific`
            : 'Liquidation APR requires an active Boros position with actual collateral and position state. این مقدار از داده بازار حدس زده نمی‌شود.'}
        </p>
        {preview.liquidationBufferPct !== null && (
          <p className="mt-1 text-[8px] font-bold text-ink">
            Liquidation Buffer: <span className="num-ltr text-accent">{preview.liquidationBufferPct.toFixed(2)} pp</span>
          </p>
        )}
        <p className={cn('mt-1 text-[8px] font-bold', preview.collateralSufficient ? 'text-positive' : 'text-warn')}>
          {preview.collateralSufficient === null
            ? 'کفایت Collateral: N/A (Collateral یا قیمت وارد نشده)'
            : preview.collateralSufficient
              ? 'Collateral واردشده از مارجین موردنیاز بیشتر است (بررسی ریاضی — نه تضمین)'
              : '⚠ Collateral واردشده کمتر از مارجین موردنیاز است'}
        </p>
      </div>
    </GlassCard>
  );
}
