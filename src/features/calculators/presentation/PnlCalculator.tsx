import { usePublishInsight } from '@/shared/assistant/insights';
import { persianAssetName } from '@/shared/i18n/assetDisplayName';
/**
 * ① Profit & loss — what is my position worth now vs what I paid?
 * INPUT (asset · qty · buy price · fees) → RESULT (P/L) → SECONDARY → CHARTS → EXPORT
 * All calculations in domain (calcPnl, cumulativeProfitSeries).
 */
import { useEffect, useMemo, useState } from 'react';
import { Field, Input } from '@/shared/components/ui/Input';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { MetricGrid, Metric, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { AssetPicker } from './AssetPicker';
import { CalcShell, ResultHero, ResultPlaceholder } from './StatCard';
import { LineChartCard, fmtFaDate } from './CalcCharts';
import { ExportButtons } from './ExportButtons';
import { useCalculatorPrices } from '@/features/calculators/data/useCalculatorPrices';
import { getHistoricalSeries, TIMEFRAME_LABELS, TIMEFRAME_MS } from '@/features/calculators/data/historical';
import { calcPnl, cumulativeProfitSeries, type PnlResult } from '@/features/calculators/domain';
import type { CalculatorAsset } from '@/features/calculators/data/catalogs';
import { fmtUSD, fmtPct } from '@/shared/utils/formatters';

export function PnlCalculator() {
  const { prices } = useCalculatorPrices();
  const [asset, setAsset] = useState<CalculatorAsset | null>(null);
  const [qty, setQty] = useState('1');
  const [buyPrice, setBuyPrice] = useState('');
  const [buyFee, setBuyFee] = useState('0');
  const [sellFee, setSellFee] = useState('0');
  const [tf, setTf] = useState('month');
  const [series, setSeries] = useState<{ t: number; price: number }[] | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [histMsg, setHistMsg] = useState<string | null>(null);

  const currentPrice = asset ? (prices[asset.symbol] ?? null) : null;

  // current price → default buy price (first time only)
  useEffect(() => {
    if (asset && currentPrice !== null && buyPrice === '') setBuyPrice(String(currentPrice));
  }, [asset, currentPrice, buyPrice]);

  // history for the charts
  useEffect(() => {
    if (!asset) return;
    let cancelled = false;
    setHistLoading(true);
    setHistMsg(null);
    const from = Date.now() - (TIMEFRAME_MS[tf] ?? TIMEFRAME_MS.month);
    getHistoricalSeries(asset.kind, asset.symbol, from, Date.now()).then((s) => {
      if (cancelled) return;
      setSeries(s && s.length > 1 ? s : null);
      if (!s || s.length < 2) {
        setHistMsg(
          asset.kind === 'tokenized'
            ? 'داده تاریخی برای دارایی توکن‌ایز در دسترس نیست.'
            : 'داده تاریخی فعلاً در دسترس نیست (محدودیت سرویس).'
        );
      }
      setHistLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [asset, tf]);

  const result: PnlResult | null = useMemo(() => {
    if (!asset) return null;
    return calcPnl({
      quantity: Number(qty) || 0,
      buyPrice: Number(buyPrice) || 0,
      currentPrice,
      buyFee: Number(buyFee) || 0,
      sellFee: Number(sellFee) || 0
    });
  }, [asset, qty, buyPrice, buyFee, sellFee, currentPrice]);

  usePublishInsight('calculatorPnl', asset ? `سود و زیان ${persianAssetName(asset.symbol)}` : 'سود و زیان', result ? { ...result, quantity: Number(qty), buyPrice: Number(buyPrice), currentPrice } : null);

  const profitSeries = useMemo(() => {
    if (!result || !series) return [];
    return cumulativeProfitSeries(Number(buyPrice) || 0, Number(qty) || 0, Number(buyFee) || 0, series);
  }, [result, series, buyPrice, qty, buyFee]);

  const inputs = (
    <>
      <AssetPicker value={asset} onChange={setAsset} />
      {asset && (
        <p className="text-sm text-muted">
          قیمت فعلی: <MoneyValue value={currentPrice} className="font-semibold text-ink" />
        </p>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Field label="تعداد واحد">
          <Input dir="ltr" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} suffix={asset?persianAssetName(asset.symbol):undefined} />
        </Field>
        <Field label="قیمت خرید">
          <Input dir="ltr" inputMode="decimal" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} suffix="دلار" />
        </Field>
        <Field label="کارمزد خرید">
          <Input dir="ltr" inputMode="decimal" value={buyFee} onChange={(e) => setBuyFee(e.target.value)} suffix="دلار" />
        </Field>
        <Field label="کارمزد فروش">
          <Input dir="ltr" inputMode="decimal" value={sellFee} onChange={(e) => setSellFee(e.target.value)} suffix="دلار" />
        </Field>
      </div>
    </>
  );

  return (
    <CalcShell inputs={inputs}>
      {!asset || !result ? (
        <ResultPlaceholder>برای محاسبه سود و زیان، یک دارایی انتخاب کنید.</ResultPlaceholder>
      ) : (
        <>
          {currentPrice === null && (
            <Notice tone="warn">قیمت فعلی این دارایی در دسترس نیست؛ ارزش و سود «—» نمایش داده می‌شود.</Notice>
          )}
          <ResultHero
            label="سود / زیان"
            value={<MoneyValue value={result.profit} signed tone="auto" />}
            sub={
              <>
                بازده <PercentValue value={result.returnPct} className="font-semibold" /> · ارزش خالص فروش{' '}
                <MoneyValue value={result.netValue} className="font-semibold text-ink" />
              </>
            }
          >
            <MetricGrid cols={3}>
              <Metric label="ارزش فعلی" value={<MoneyValue value={result.currentValue} />} />
              <Metric label="کل هزینه پرداخت‌شده" value={<MoneyValue value={result.totalCost} />} />
              <Metric label="سرمایه اولیه" value={<MoneyValue value={result.initialInvestment} />} />
            </MetricGrid>
          </ResultHero>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-ink">نمودار</h3>
            <SegmentedControl
              label="بازه نمودار"
              size="sm"
              value={tf}
              onChange={setTf}
              options={TIMEFRAME_LABELS.map((t) => ({ value: t.key, label: t.label }))}
            />
          </div>
          {histLoading && <Skeleton className="h-60 w-full" />}
          {!histLoading && histMsg && !series && <Notice tone="neutral">{histMsg}</Notice>}
          {!histLoading && series && (
            <>
              <LineChartCard
                title={`قیمت ${persianAssetName(asset.symbol)}`}
                labels={series.map((p) => fmtFaDate(p.t))}
                datasets={[{ label: 'قیمت', data: series.map((p) => p.price), color: 'chart-1', fill: true }]}
              />
              <LineChartCard
                title="سود تجمعی"
                description="اگر در هر نقطه از بازه فروخته می‌شد"
                labels={profitSeries.map((p) => fmtFaDate(p.t))}
                datasets={[{ label: 'سود', data: profitSeries.map((p) => p.value), color: 'chart-2' }]}
              />
            </>
          )}

          <ExportButtons
            filename={`pnl-${asset.symbol}.csv`}
            headers={['دارایی', 'قیمت خرید', 'قیمت فعلی', 'تعداد', 'ارزش فعلی', 'سرمایه', 'سود', 'درصد']}
            rows={[[asset.symbol, Number(buyPrice) || 0, currentPrice ?? 'N/A', Number(qty) || 0, result.currentValue ?? 'N/A', result.totalCost, result.profit ?? 'N/A', result.returnPct ?? 'N/A']]}
            pdfTitle={`گزارش سود و زیان — ${asset.symbol}`}
            pdfSections={[
              {
                heading: `سود و زیان سرمایه‌گذاری ${asset.nameFa}`,
                table: {
                  headers: ['موارد', 'مقدار'],
                  rows: [
                    ['قیمت خرید', fmtUSD(Number(buyPrice) || 0)],
                    ['قیمت فعلی', fmtUSD(currentPrice)],
                    ['تعداد واحد', qty],
                    ['ارزش فعلی', fmtUSD(result.currentValue)],
                    ['کل سرمایه پرداخت‌شده', fmtUSD(result.totalCost)],
                    ['سود / زیان', fmtUSD(result.profit)],
                    ['درصد بازده', fmtPct(result.returnPct)]
                  ]
                },
                note: 'محاسبات با موتور مالی و دقت ۱۲ رقم اعشار انجام شده است.'
              }
            ]}
          />
        </>
      )}
    </CalcShell>
  );
}
