/**
 * ۲) ماشین‌حساب DCA — سرمایه‌گذاری دوره‌ای
 */
import { useEffect, useMemo, useState } from 'react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { Input } from '@/shared/components/ui/Input';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { parseIsoToTs, formatGregorianIso } from '@/shared/utils/jalali';
import { AssetPicker } from './AssetPicker';
import { StatCard } from './StatCard';
import { LineChartCard } from './CalcCharts';
import { ExportButtons } from './ExportButtons';
import { useCalculatorPrices } from '@/features/calculators/data/useCalculatorPrices';
import { getHistoricalSeries } from '@/features/calculators/data/historical';
import {
  calcDca,
  dcaValueSeries,
  FREQUENCY_DAYS,
  type DcaFrequency,
  type DcaResult
} from '@/features/calculators/domain';
import type { CalculatorAsset } from '@/features/calculators/data/catalogs';
import { fmtUSD, fmtPct, fmtInt } from '@/shared/utils/formatters';
import { fmtFaDate } from './CalcCharts';
import { cn } from '@/shared/lib/cn';

const FREQS: { key: DcaFrequency; label: string }[] = [
  { key: 'daily', label: 'روزانه' },
  { key: 'weekly', label: 'هفتگی' },
  { key: 'monthly', label: 'ماهانه' },
  { key: 'quarterly', label: 'سه‌ماهه' }
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

  const currentPrice = asset ? (prices[asset.symbol] ?? null) : null;

  const { startTs, endTs, purchasePriceSeries } = useMemo(() => {
    const s = new Date(start + 'T00:00:00').getTime();
    const e = new Date(end + 'T00:00:00').getTime();
    return { startTs: s, endTs: e, purchasePriceSeries: null as number[] | null };
  }, [start, end]);

  // داده تاریخی برای قیمت‌های خرید + نمودار
  useEffect(() => {
    if (!asset || endTs <= startTs) return;
    let cancelled = false;
    const from = startTs - 5 * 86_400_000;
    const to = Math.max(endTs, Date.now());
    getHistoricalSeries(asset.kind, asset.symbol, from, to).then((s) => {
      if (cancelled) return;
      if (s && s.length > 1) {
        // قیمت خرید هر تاریخ = نزدیک‌ترین نقطه سری
        setPricesForChart(s);
      } else {
        setPricesForChart(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [asset, startTs, endTs]);

  const buyPrices: number[] | null = useMemo(() => {
    if (!pricesForChart || !asset) return null;
    return null; // در محاسبه پایین با تابع purchaseDates ساخته می‌شود
  }, [pricesForChart, asset]);

  const result: DcaResult | null = useMemo(() => {
    if (!asset || endTs <= startTs) return null;
    // قیمت هر خرید از سری تاریخی (اگر موجود) — وگرنه اسنپ‌شات
    let series = pricesForChart;
    let priceAt = (t: number): number => {
      if (series && series.length > 0) {
        let best = series[0].price;
        for (const p of series) {
          if (p.t <= t) best = p.price;
          else break;
        }
        return best;
      }
      // فالبک: قیمت فعلی (بدون تاریخچه)
      return currentPrice ?? 0;
    };

    // ساخت تاریخ‌های خرید و قیمت‌ها
    const day = 86_400_000;
    const dates: number[] = [];
    let t = startTs;
    while (t <= endTs) {
      dates.push(t);
      t += FREQUENCY_DAYS[freq] * day;
    }
    const pricesArr = dates.map(priceAt);

    return calcDca({
      amount: Number(amount) || 0,
      startDate: startTs,
      endDate: endTs,
      frequencyDays: FREQUENCY_DAYS[freq],
      purchasePrices: pricesArr,
      currentPrice,
      feePerPurchase: Number(fee) || 0
    });
  }, [asset, amount, freq, startTs, endTs, pricesForChart, currentPrice, fee]);

  const valueSeries = useMemo(() => {
    if (!asset || !result || !pricesForChart || endTs <= startTs) return null;
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
  }, [asset, result, pricesForChart, startTs, endTs, amount, freq, currentPrice, fee]);

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-3 p-4">
        <AssetPicker value={asset} onChange={setAsset} />
        {asset && currentPrice !== null && (
          <div className="flex items-center justify-between rounded-2xl bg-line/[0.03] px-3.5 py-2.5">
            <span className="text-[11px] font-bold text-muted">قیمت فعلی (از API)</span>
            <span className="num-ltr text-[14px] font-black text-ink">{fmtUSD(currentPrice)}</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="mb-1 block text-[11px] font-bold text-muted">مبلغ هر دوره ($)</label>
            <Input dir="ltr" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 text-xs text-start" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-muted">کارمزد هر خرید ($)</label>
            <Input dir="ltr" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} className="h-10 text-xs text-start" />
          </div>
          <SmartDateField
            label="تاریخ شروع"
            value={start ? parseIsoToTs(start) : null}
            onChange={(ts) => setStart(ts ? formatGregorianIso(ts) : '')}
          />
          <SmartDateField
            label="تاریخ پایان"
            value={end ? parseIsoToTs(end) : null}
            onChange={(ts) => setEnd(ts ? formatGregorianIso(ts) : '')}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-bold text-muted">نوع سرمایه‌گذاری</label>
          <div className="flex gap-1.5">
            {FREQS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFreq(f.key)}
                className={cn(
                  'flex-1 rounded-xl px-2 py-2 text-[11px] font-bold transition-all',
                  freq === f.key ? 'bg-accent text-white shadow-glow' : 'glass-inset text-muted'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {!pricesForChart && asset && (
          <p className="text-[10px] font-medium leading-5 text-muted">
            {asset.kind === 'tokenized'
              ? 'داده تاریخی توکن‌ایز موجود نیست — قیمت خرید از قیمت فعلی تقریب زده می‌شود.'
              : 'داده تاریخی فعلاً در دسترس نیست (محدودیت API) — قیمت خرید تقریبی است.'}
          </p>
        )}
      </GlassCard>

      {result && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard label="کل سرمایه پرداخت‌شده" value={fmtUSD(result.totalInvested)} />
            <StatCard label="تعداد کل خریدها" value={fmtInt(result.purchaseCount)} />
            <StatCard label="تعداد واحد خریداری‌شده" value={fmtUSD(result.totalUnits).replace('$', '')} />
            <StatCard label="میانگین قیمت خرید" value={fmtUSD(result.averageCost)} />
            <StatCard label="ارزش فعلی" value={fmtUSD(result.currentValue)} tone="accent" />
            <StatCard
              label="سود / زیان"
              value={fmtUSD(result.profit)}
              tone={result.profit === null ? 'neutral' : result.profit >= 0 ? 'positive' : 'negative'}
            />
            <StatCard
              label="درصد بازده"
              value={fmtPct(result.returnPct)}
              tone={result.returnPct === null ? 'neutral' : result.returnPct >= 0 ? 'positive' : 'negative'}
            />
            <StatCard
              label="بازده سالانه (CAGR)"
              value={fmtPct(result.cagr)}
              tone={result.cagr === null ? 'neutral' : result.cagr >= 0 ? 'positive' : 'negative'}
            />
          </div>

          {valueSeries && pricesForChart && (
            <>
              <LineChartCard
                title="رشد سرمایه (ارزش پرتفوی vs سرمایه پرداخت‌شده)"
                labels={valueSeries.map((p) => fmtFaDate(p.t))}
                datasets={[
                  { label: 'ارزش پرتفوی', data: valueSeries.map((p) => p.value), color: '#0d9488', fill: true },
                  { label: 'سرمایه پرداخت‌شده', data: valueSeries.map((p) => p.invested), color: '#94a3b8' }
                ]}
              />
              <LineChartCard
                title="میانگین قیمت خرید vs قیمت"
                labels={valueSeries.map((p) => fmtFaDate(p.t))}
                datasets={[
                  { label: 'میانگین قیمت خرید', data: valueSeries.map((p) => p.avgCost), color: '#f59e0b' },
                  { label: 'قیمت', data: valueSeries.map((p) => pricesForChart.find((x) => x.t === p.t)?.price ?? 0), color: '#0ea5e9' }
                ]}
              />
            </>
          )}

          {/* جدول خریدها */}
          <GlassCard className="overflow-hidden">
            <div className="max-h-64 overflow-auto">
              <table className="sim-table min-w-[420px] text-start">
                <thead>
                  <tr>
                    <th className="!text-start">#</th>
                    <th className="!text-start">تاریخ</th>
                    <th className="!text-start">مبلغ</th>
                    <th className="!text-start">قیمت</th>
                    <th className="!text-start">واحد</th>
                  </tr>
                </thead>
                <tbody>
                  {result.purchases.slice(0, 200).map((p) => (
                    <tr key={p.index}>
                      <td className="num-ltr text-muted">{p.index}</td>
                      <td>{fmtFaDate(p.date)}</td>
                      <td className="num-ltr">{fmtUSD(p.amount)}</td>
                      <td className="num-ltr">{fmtUSD(p.price)}</td>
                      <td className="num-ltr">{p.units.toLocaleString('en-US', { maximumFractionDigits: 4 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.purchases.length > 200 && (
              <p className="border-t border-line/10 py-2 text-center text-[10px] font-bold text-muted">
                … و {result.purchases.length - 200} خرید دیگر
              </p>
            )}
          </GlassCard>

          <ExportButtons
            filename={`dca-${asset?.symbol ?? 'x'}.csv`}
            headers={['#', 'تاریخ', 'مبلغ', 'قیمت', 'واحد']}
            rows={result.purchases.map((p) => [p.index, new Date(p.date).toISOString().slice(0, 10), p.amount, p.price, p.units])}
            pdfTitle={`گزارش DCA — ${asset?.symbol ?? ''}`}
            pdfSections={[
              {
                heading: `سرمایه‌گذاری دوره‌ای ${asset?.nameFa} (${asset?.symbol})`,
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
    </div>
  );
}
