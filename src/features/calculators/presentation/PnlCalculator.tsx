import { usePublishInsight } from '@/shared/assistant/insights';
import { persianAssetName } from '@/shared/i18n/assetDisplayName';
/**
 * ① Profit & loss — what is my position worth now vs what I paid?
 * INPUT (asset · qty · buy price · fees · valuation: live or forecast target)
 * → RESULT (P/L) → SECONDARY → SCENARIOS → CHARTS → EXPORT
 * All calculations in domain (calcPnl, cumulativeProfitSeries).
 */
import { useEffect, useMemo, useState } from 'react';
import { Field, Input } from '@/shared/components/ui/Input';
import { Surface } from '@/shared/components/ui/GlassCard';
import { parseNum, priceInput } from './parse';
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
  const [priceMode, setPriceMode] = useState<'live' | 'target'>('live');
  const [target, setTarget] = useState('');
  const [tf, setTf] = useState('month');
  const [series, setSeries] = useState<{ t: number; price: number }[] | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [histMsg, setHistMsg] = useState<string | null>(null);

  const livePrice = asset ? (prices[asset.symbol] ?? null) : null;
  const targetNum = parseNum(target);
  // valuation price: live market price, or the user's forecast / sell target
  const currentPrice = priceMode === 'live' ? livePrice : targetNum > 0 ? targetNum : null;

  // current price → default buy price (first time only)
  useEffect(() => {
    if (asset && livePrice !== null && buyPrice === '') setBuyPrice(priceInput(livePrice));
  }, [asset, livePrice, buyPrice]);

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

  const scenarios = useMemo(() => {
    if (!result || !(Number(buyPrice) > 0)) return [];
    const ref = currentPrice ?? Number(buyPrice);
    return [-50, -25, -10, 0, 10, 25, 50, 100, 200].map((m) => {
      const price = ref * (1 + m / 100);
      const r = calcPnl({ quantity: Number(qty) || 0, buyPrice: Number(buyPrice) || 0, currentPrice: price, buyFee: Number(buyFee) || 0, sellFee: Number(sellFee) || 0 });
      return { m, price, profit: r.profit, returnPct: r.returnPct };
    });
  }, [result, currentPrice, qty, buyPrice, buyFee, sellFee]);

  const profitSeries = useMemo(() => {
    if (!result || !series) return [];
    return cumulativeProfitSeries(Number(buyPrice) || 0, Number(qty) || 0, Number(buyFee) || 0, series);
  }, [result, series, buyPrice, qty, buyFee]);

  const inputs = (
    <>
      <AssetPicker value={asset} onChange={setAsset} />
      {asset && (
        <p className="text-sm text-muted">
          قیمت فعلی: <MoneyValue value={livePrice} className="font-semibold text-ink" />
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
      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted">ارزش‌گذاری با</p>
        <SegmentedControl<'live' | 'target'>
          label="قیمت ارزش‌گذاری"
          fill
          size="sm"
          value={priceMode}
          onChange={setPriceMode}
          options={[
            { value: 'live', label: 'قیمت لحظه‌ای' },
            { value: 'target', label: 'قیمت هدف (پیش‌بینی)' }
          ]}
        />
        {priceMode === 'target' && (
          <Field label="قیمت فروش / هدف" className="mt-3">
            <Input dir="ltr" inputMode="decimal" value={target} placeholder={priceInput(livePrice)} onChange={(e) => setTarget(e.target.value)} suffix="دلار" />
          </Field>
        )}
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
            <Notice tone="warn">
              {priceMode === 'target' ? 'قیمت هدف را وارد کنید.' : 'قیمت فعلی این دارایی در دسترس نیست؛ ارزش و سود «—» نمایش داده می‌شود.'}
            </Notice>
          )}
          <ResultHero
            label={priceMode === 'target' ? 'سود / زیان در قیمت هدف' : 'سود / زیان'}
            value={<MoneyValue value={result.profit} signed tone="auto" />}
            sub={
              <>
                بازده <PercentValue value={result.returnPct} className="font-semibold" /> · ارزش خالص فروش{' '}
                <MoneyValue value={result.netValue} className="font-semibold text-ink" />
              </>
            }
          >
            <MetricGrid cols={3}>
              <Metric label={priceMode === 'target' ? 'ارزش در قیمت هدف' : 'ارزش فعلی'} value={<MoneyValue value={result.currentValue} />} />
              <Metric label="کل هزینه پرداخت‌شده" value={<MoneyValue value={result.totalCost} />} sub="خرید + کارمزد" />
              <Metric
                label="قیمت سربه‌سر"
                value={<MoneyValue value={Number(qty) > 0 ? (result.totalCost + (Number(sellFee) || 0)) / Number(qty) : null} />}
                sub="با کارمزد خرید و فروش"
              />
            </MetricGrid>
          </ResultHero>

          {scenarios.length > 0 && (
            <Surface className="overflow-hidden">
              <div className="px-4 pt-4 md:px-5">
                <h3 className="text-sm font-bold text-ink">سناریوهای قیمت</h3>
                <p className="mt-0.5 text-xs text-muted">نسبت به {priceMode === 'target' ? 'قیمت هدف' : 'قیمت فعلی'}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table is-compact mt-2">
                  <caption className="sr-only">سناریوهای قیمت</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="!ps-4 md:!ps-5">تغییر</th>
                      <th scope="col" className="col-num">قیمت</th>
                      <th scope="col" className="col-num">سود / زیان</th>
                      <th scope="col" className="col-num !pe-4 md:!pe-5">بازده</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((sc) => (
                      <tr key={sc.m} className={sc.m === 0 ? 'bg-surface-2' : undefined}>
                        <td className="!ps-4 md:!ps-5"><PercentValue value={sc.m} digits={0} /></td>
                        <td className="col-num"><MoneyValue value={sc.price} /></td>
                        <td className="col-num"><MoneyValue value={sc.profit} signed tone="auto" /></td>
                        <td className="col-num !pe-4 md:!pe-5"><PercentValue value={sc.returnPct} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Surface>
          )}

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
