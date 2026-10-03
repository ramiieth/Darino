/**
 * ② DCA — periodic investing.
 * INPUT (asset · amount · frequency · dates · fee) → RESULT (profit) → SECONDARY →
 * CHARTS → PURCHASES → EXPORT. Calculations in domain (calcDca, dcaValueSeries).
 */
import { useEffect, useMemo, useState } from 'react';
import { Field, Input } from '@/shared/components/ui/Input';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Surface } from '@/shared/components/ui/GlassCard';
import { MetricGrid, Metric, MoneyValue, PercentValue, QuantityValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { parseIsoToTs, formatGregorianIso } from '@/shared/utils/jalali';
import { AssetPicker } from './AssetPicker';
import { CalcShell, ResultHero, ResultPlaceholder } from './StatCard';
import { LineChartCard, fmtFaDate } from './CalcCharts';
import { ExportButtons } from './ExportButtons';
import { useCalculatorPrices } from '@/features/calculators/data/useCalculatorPrices';
import { getHistoricalSeries } from '@/features/calculators/data/historical';
import { calcDca, dcaValueSeries, FREQUENCY_DAYS, type DcaFrequency, type DcaResult } from '@/features/calculators/domain';
import type { CalculatorAsset } from '@/features/calculators/data/catalogs';
import { fmtUSD, fmtPct, toFaDigits } from '@/shared/utils/formatters';

const FREQS: { value: DcaFrequency; label: string }[] = [
  { value: 'daily', label: 'روزانه' },
  { value: 'weekly', label: 'هفتگی' },
  { value: 'monthly', label: 'ماهانه' },
  { value: 'quarterly', label: 'سه‌ماهه' }
];

export function DcaCalculator() {
  const { prices } = useCalculatorPrices();
  const [asset, setAsset] = useState<CalculatorAsset | null>(null);
  const [amount, setAmount] = useState('1000');
  const [freq, setFreq] = useState<DcaFrequency>('monthly');
  const [start, setStart] = useState('2024-01-01');
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [fee, setFee] = useState('0');
  const [pricesForChart, setPricesForChart] = useState<{ t: number; price: number }[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  const currentPrice = asset ? (prices[asset.symbol] ?? null) : null;
  const startTs = useMemo(() => new Date(start + 'T00:00:00').getTime(), [start]);
  const endTs = useMemo(() => new Date(end + 'T00:00:00').getTime(), [end]);
  const badRange = endTs <= startTs;

  // history → purchase prices + charts
  useEffect(() => {
    if (!asset || badRange) return;
    let cancelled = false;
    const from = startTs - 5 * 86_400_000;
    const to = Math.max(endTs, Date.now());
    getHistoricalSeries(asset.kind, asset.symbol, from, to).then((s) => {
      if (!cancelled) setPricesForChart(s && s.length > 1 ? s : null);
    });
    return () => {
      cancelled = true;
    };
  }, [asset, startTs, endTs, badRange]);

  const result: DcaResult | null = useMemo(() => {
    if (!asset || badRange) return null;
    // each purchase uses the nearest historical price; without history → current price
    const series = pricesForChart;
    const priceAt = (t: number): number => {
      if (series && series.length > 0) {
        let best = series[0].price;
        for (const p of series) {
          if (p.t <= t) best = p.price;
          else break;
        }
        return best;
      }
      return currentPrice ?? 0;
    };
    const day = 86_400_000;
    const dates: number[] = [];
    for (let t = startTs; t <= endTs; t += FREQUENCY_DAYS[freq] * day) dates.push(t);
    return calcDca({
      amount: Number(amount) || 0,
      startDate: startTs,
      endDate: endTs,
      frequencyDays: FREQUENCY_DAYS[freq],
      purchasePrices: dates.map(priceAt),
      currentPrice,
      feePerPurchase: Number(fee) || 0
    });
  }, [asset, amount, freq, startTs, endTs, pricesForChart, currentPrice, fee, badRange]);

  const valueSeries = useMemo(() => {
    if (!asset || !result || !pricesForChart || badRange) return null;
    return dcaValueSeries(
      {
        amount: Number(amount) || 0,
        startDate: startTs,
        endDate: endTs,
        frequencyDays: FREQUENCY_DAYS[freq],
        purchasePrices: [1],
        currentPrice,
        feePerPurchase: Number(fee) || 0
      },
      pricesForChart
    );
  }, [asset, result, pricesForChart, startTs, endTs, amount, freq, currentPrice, fee, badRange]);

  const inputs = (
    <>
      <AssetPicker value={asset} onChange={setAsset} />
      <div className="grid grid-cols-2 gap-4">
        <Field label="مبلغ هر خرید">
          <Input dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} suffix="دلار" />
        </Field>
        <Field label="کارمزد هر خرید">
          <Input dir="ltr" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} suffix="دلار" />
        </Field>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted">دوره خرید</p>
        <SegmentedControl label="دوره خرید" options={FREQS} value={freq} onChange={setFreq} fill />
      </div>
      <SmartDateField label="تاریخ شروع" value={start ? parseIsoToTs(start) : null} onChange={(ts) => setStart(ts ? formatGregorianIso(ts) : '')} />
      <SmartDateField label="تاریخ پایان" value={end ? parseIsoToTs(end) : null} onChange={(ts) => setEnd(ts ? formatGregorianIso(ts) : '')} />
      {badRange && <Notice tone="warn">تاریخ پایان باید بعد از تاریخ شروع باشد.</Notice>}
    </>
  );

  return (
    <CalcShell inputs={inputs}>
      {!asset || !result ? (
        <ResultPlaceholder>برای شبیه‌سازی خرید دوره‌ای، یک دارایی و بازه معتبر انتخاب کنید.</ResultPlaceholder>
      ) : (
        <>
          {!pricesForChart && (
            <Notice tone="warn" title="قیمت خریدها تقریبی است">
              {asset.kind === 'tokenized'
                ? 'داده تاریخی دارایی توکن‌ایز موجود نیست؛ همه خریدها با قیمت فعلی تقریب زده شده‌اند.'
                : 'داده تاریخی فعلاً در دسترس نیست (محدودیت سرویس)؛ همه خریدها با قیمت فعلی تقریب زده شده‌اند.'}
            </Notice>
          )}
          <ResultHero
            label="سود / زیان"
            value={<MoneyValue value={result.profit} signed tone="auto" />}
            sub={
              <>
                بازده <PercentValue value={result.returnPct} className="font-semibold" /> · بازده سالانه (CAGR){' '}
                <PercentValue value={result.cagr} className="font-semibold" />
              </>
            }
          >
            <MetricGrid cols={3}>
              <Metric label="ارزش فعلی" value={<MoneyValue value={result.currentValue} />} />
              <Metric label="کل سرمایه پرداخت‌شده" value={<MoneyValue value={result.totalInvested} />} />
              <Metric label="میانگین قیمت خرید" value={<MoneyValue value={result.averageCost} />} />
              <Metric label="تعداد خرید" value={<span className="num-ltr">{result.purchaseCount.toLocaleString('en-US')}</span>} />
              <Metric label="واحد خریداری‌شده" value={<QuantityValue value={result.totalUnits} unit={asset.symbol} digits={4} />} />
              <Metric label="قیمت فعلی" value={<MoneyValue value={currentPrice} />} />
            </MetricGrid>
          </ResultHero>

          {valueSeries && pricesForChart && (
            <>
              <LineChartCard
                title="ارزش سبد در برابر سرمایه پرداخت‌شده"
                labels={valueSeries.map((p) => fmtFaDate(p.t))}
                datasets={[
                  { label: 'ارزش سبد', data: valueSeries.map((p) => p.value), color: 'chart-1', fill: true },
                  { label: 'سرمایه پرداخت‌شده', data: valueSeries.map((p) => p.invested), color: 'chart-4', dashed: true }
                ]}
              />
              <LineChartCard
                title="میانگین قیمت خرید در برابر قیمت بازار"
                labels={valueSeries.map((p) => fmtFaDate(p.t))}
                datasets={[
                  { label: 'میانگین قیمت خرید', data: valueSeries.map((p) => p.avgCost), color: 'chart-2' },
                  { label: 'قیمت', data: valueSeries.map((p) => pricesForChart.find((x) => x.t === p.t)?.price ?? 0), color: 'chart-3' }
                ]}
              />
            </>
          )}

          <Surface className="overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 md:px-5">
              <h3 className="text-sm font-bold text-ink">خریدها</h3>
              <span className="text-xs text-muted">{toFaDigits(result.purchases.length)} خرید</span>
            </div>
            <div className="max-h-80 overflow-auto">
              <table className="data-table is-compact">
                <caption className="sr-only">جدول خریدهای دوره‌ای</caption>
                <thead>
                  <tr>
                    <th scope="col" className="!ps-4 md:!ps-5">#</th>
                    <th scope="col">تاریخ</th>
                    <th scope="col" className="col-num">قیمت</th>
                    <th scope="col" className="col-num !pe-4 md:!pe-5">واحد</th>
                  </tr>
                </thead>
                <tbody>
                  {result.purchases.slice(0, showAll ? 500 : 24).map((p) => (
                    <tr key={p.index}>
                      <td className="num-ltr !ps-4 text-xs text-subtle md:!ps-5">{p.index}</td>
                      <td className="text-muted">{fmtFaDate(p.date)}</td>
                      <td className="col-num"><MoneyValue value={p.price} /></td>
                      <td className="col-num !pe-4 md:!pe-5"><QuantityValue value={p.units} digits={4} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.purchases.length > 24 && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="w-full border-t border-divider py-2.5 text-sm font-semibold text-accent hover:bg-surface-2"
              >
                {showAll ? 'نمایش کمتر' : `نمایش همه (${toFaDigits(result.purchases.length)})`}
              </button>
            )}
          </Surface>

          <ExportButtons
            filename={`dca-${asset.symbol}.csv`}
            headers={['#', 'تاریخ', 'مبلغ', 'قیمت', 'واحد']}
            rows={result.purchases.map((p) => [p.index, new Date(p.date).toISOString().slice(0, 10), p.amount, p.price, p.units])}
            pdfTitle={`گزارش خرید دوره‌ای — ${asset.symbol}`}
            pdfSections={[
              {
                heading: `سرمایه‌گذاری دوره‌ای ${asset.nameFa}`,
                table: {
                  headers: ['موارد', 'مقدار'],
                  rows: [
                    ['کل سرمایه', fmtUSD(result.totalInvested)],
                    ['تعداد خرید', String(result.purchaseCount)],
                    ['تعداد واحد', String(result.totalUnits)],
                    ['میانگین قیمت', fmtUSD(result.averageCost)],
                    ['ارزش فعلی', fmtUSD(result.currentValue)],
                    ['سود / زیان', fmtUSD(result.profit)],
                    ['بازده', fmtPct(result.returnPct)],
                    ['CAGR', fmtPct(result.cagr)]
                  ]
                }
              },
              {
                heading: 'جدول خریدها',
                table: {
                  headers: ['#', 'تاریخ', 'مبلغ', 'قیمت', 'واحد'],
                  rows: result.purchases.map((p) => [p.index, new Date(p.date).toISOString().slice(0, 10), p.amount, p.price, p.units])
                }
              }
            ]}
          />
        </>
      )}
    </CalcShell>
  );
}
