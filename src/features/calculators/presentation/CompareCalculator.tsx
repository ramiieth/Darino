import { persianAssetName } from '@/shared/i18n/assetDisplayName';
/**
 * ⑤ Market comparison — the same capital in several assets over one period.
 * Value, profit, return, CAGR, ranking, sort, filter, CSV/PDF.
 * Calculations in domain (calcCompare).
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, X } from 'lucide-react';
import { Field, Input, SearchField } from '@/shared/components/ui/Input';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { Surface } from '@/shared/components/ui/GlassCard';
import { MetricGrid, Metric, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { parseIsoToTs, formatGregorianIso } from '@/shared/utils/jalali';
import { AssetPicker } from './AssetPicker';
import { CalcShell, ResultHero, ResultPlaceholder } from './StatCard';
import { LineChartCard, BarChartCard, fmtFaDate } from './CalcCharts';
import { ExportButtons } from './ExportButtons';
import { useCalculatorPrices } from '@/features/calculators/data/useCalculatorPrices';
import { getHistoricalSeries } from '@/features/calculators/data/historical';
import { calcCompare, type CompareResult } from '@/features/calculators/domain';
import type { CalculatorAsset } from '@/features/calculators/data/catalogs';
import { SERIES } from '@/shared/design/chartTheme';
import { fmtUSD, fmtPct, toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

type SortKey = 'return' | 'value' | 'profit' | 'name';
type SortDir = 'asc' | 'desc';

export function CompareCalculator() {
  const { prices } = useCalculatorPrices();
  const [selected, setSelected] = useState<CalculatorAsset[]>([]);
  const [invest, setInvest] = useState('1000');
  const [start, setStart] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [hist, setHist] = useState<Record<string, { t: number; price: number }[] | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [sort, setSort] = useState<SortKey>('return');
  const [dir, setDir] = useState<SortDir>('desc');
  const [filterQ, setFilterQ] = useState('');

  const startTs = useMemo(() => new Date(start + 'T00:00:00').getTime(), [start]);
  const endTs = useMemo(() => new Date(end + 'T00:00:00').getTime(), [end]);
  const years = Math.max((endTs - startTs) / (365.25 * 86_400_000), 0);

  const addAsset = (a: CalculatorAsset | null) => {
    if (a && !selected.some((x) => x.symbol === a.symbol)) setSelected((s) => [...s, a]);
  };
  const removeAsset = (symbol: string) => {
    setSelected((s) => s.filter((x) => x.symbol !== symbol));
    setHist((h) => {
      const n = { ...h };
      delete n[symbol];
      return n;
    });
  };

  // historical series per asset (start price)
  useEffect(() => {
    for (const a of selected) {
      if (hist[a.symbol] !== undefined || loading[a.symbol]) continue;
      setLoading((l) => ({ ...l, [a.symbol]: true }));
      getHistoricalSeries(a.kind, a.symbol, startTs, endTs).then((s) => {
        setHist((h) => ({ ...h, [a.symbol]: s }));
        setLoading((l) => ({ ...l, [a.symbol]: false }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, startTs, endTs]);

  const results: CompareResult[] = useMemo(
    () =>
      selected.map((a) => {
        const series = hist[a.symbol];
        let historical: number | null = null;
        if (series && series.length > 0) {
          let best = series[0].price;
          for (const p of series) {
            if (p.t <= startTs + 3 * 86_400_000) best = p.price;
            else break;
          }
          historical = best;
        }
        return calcCompare(
          { symbol: a.symbol, nameFa: a.nameFa, investment: Number(invest) || 0, historicalPrice: historical, currentPrice: prices[a.symbol] ?? null },
          years
        );
      }),
    [selected, hist, prices, invest, startTs, years]
  );

  const ranked = useMemo(() => {
    const q = filterQ.trim().toLowerCase();
    const filtered = results.filter((r) => !q || r.symbol.toLowerCase().includes(q) || r.nameFa.includes(filterQ));
    const sign = dir === 'desc' ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (sort === 'name') return sign * a.nameFa.localeCompare(b.nameFa, 'fa');
      const val = (r: CompareResult) =>
        sort === 'return' ? r.returnPct : sort === 'value' ? r.currentValue : r.profit;
      const av = val(a);
      const bv = val(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1; // unavailable last
      if (bv === null) return -1;
      return sign * (av - bv);
    });
  }, [results, sort, dir, filterQ]);

  const withReturn = ranked.filter((r) => r.returnPct !== null);
  const best = withReturn.length ? withReturn.reduce((a, b) => ((b.returnPct as number) > (a.returnPct as number) ? b : a)) : null;
  const worst = withReturn.length ? withReturn.reduce((a, b) => ((b.returnPct as number) < (a.returnPct as number) ? b : a)) : null;

  const growthChart = useMemo(() => {
    const labels: string[] = [];
    const datasets: { label: string; data: number[]; color: (typeof SERIES)[number] }[] = [];
    selected.forEach((a, i) => {
      const series = hist[a.symbol];
      if (!series || series.length < 2 || !series[0].price) return;
      const base = series[0].price;
      const pts = series.filter((p) => p.t >= startTs - 86_400_000 && p.t <= endTs + 86_400_000);
      datasets.push({ label: a.symbol, data: pts.map((p) => (p.price / base) * 100), color: SERIES[i % SERIES.length] });
      if (labels.length === 0) labels.push(...pts.map((p) => fmtFaDate(p.t)));
    });
    return { labels, datasets };
  }, [selected, hist, startTs, endTs]);

  const onSort = (k: SortKey) => {
    if (sort === k) setDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSort(k);
      setDir(k === 'name' ? 'asc' : 'desc');
    }
  };
  const SortIcon = ({ k }: { k: SortKey }) => {
    const I = sort !== k ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
    return <I aria-hidden className={cn('h-3 w-3', sort !== k && 'opacity-40')} />;
  };
  const th = (k: SortKey, label: string, num = true) => (
    <th scope="col" className={cn(num && 'col-num')} aria-sort={sort === k ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} className={cn('inline-flex items-center gap-1 hover:text-ink', sort === k && 'text-ink')}>
        {label}
        <SortIcon k={k} />
      </button>
    </th>
  );

  const inputs = (
    <>
      <Field label="سرمایه برای هر دارایی">
        <Input dir="ltr" inputMode="decimal" value={invest} onChange={(e) => setInvest(e.target.value)} suffix="دلار" />
      </Field>
      <SmartDateField label="تاریخ شروع" value={start ? parseIsoToTs(start) : null} onChange={(ts) => setStart(ts ? formatGregorianIso(ts) : '')} />
      <SmartDateField label="تاریخ پایان" value={end ? parseIsoToTs(end) : null} onChange={(ts) => setEnd(ts ? formatGregorianIso(ts) : '')} />
      <AssetPicker value={null} onChange={addAsset} compact label="افزودن دارایی" />
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="دارایی‌های انتخاب‌شده">
          {selected.map((a) => (
            <li key={a.symbol} className="inline-flex h-8 items-center gap-1 rounded-control bg-surface-2 pe-1 ps-2.5 text-xs font-semibold text-ink">
              <bdi dir="rtl">{persianAssetName(a.symbol,a.nameFa)}</bdi>
              <button
                type="button"
                onClick={() => removeAsset(a.symbol)}
                className="flex h-6 w-6 items-center justify-center rounded-control text-muted hover:bg-card hover:text-ink"
                aria-label={`حذف ${a.symbol}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <CalcShell inputs={inputs}>
      {selected.length === 0 ? (
        <ResultPlaceholder>چند دارایی از فهرست اضافه کنید تا با سرمایه و بازه یکسان مقایسه شوند.</ResultPlaceholder>
      ) : (
        <>
          <ResultHero
            label="بهترین عملکرد"
            value={best ? <PercentValue value={best.returnPct} tone="auto" /> : <span className="text-subtle">—</span>}
            sub={best ? `${best.nameFa} · ارزش ${fmtUSD(best.currentValue)}` : 'داده تاریخی هنوز دریافت نشده است'}
          >
            <MetricGrid cols={3}>
              <Metric label="بدترین عملکرد" value={worst ? <PercentValue value={worst.returnPct} /> : '—'} sub={worst ? worst.symbol : undefined} />
              <Metric label="تعداد دارایی" value={<span>{toFaDigits(selected.length)}</span>} />
              <Metric label="مدت" value={<span className="num-ltr">{years.toFixed(2)}</span>} sub="سال" />
            </MetricGrid>
          </ResultHero>

          {growthChart.datasets.length > 0 && (
            <LineChartCard
              title="رشد نسبی (شروع = ۱۰۰)"
              labels={growthChart.labels}
              datasets={growthChart.datasets}
              prefix=""
            />
          )}
          <BarChartCard title="بازده هر دارایی" labels={ranked.map((r) => r.symbol)} values={ranked.map((r) => r.returnPct ?? 0)} unit="%" />

          <Surface className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-divider p-3 md:px-5">
              <SearchField value={filterQ} onChange={setFilterQ} placeholder="جستجو در جدول…" className="flex-1 md:max-w-xs" />
            </div>
            <div className="max-h-96 overflow-auto">
              <table className="data-table min-w-[640px]">
                <caption className="sr-only">رتبه‌بندی دارایی‌ها</caption>
                <thead>
                  <tr>
                    <th scope="col" className="w-10 !ps-4 md:!ps-5">#</th>
                    {th('name', 'دارایی', false)}
                    <th scope="col" className="col-num">قیمت شروع</th>
                    <th scope="col" className="col-num">قیمت فعلی</th>
                    {th('value', 'ارزش')}
                    {th('profit', 'سود')}
                    {th('return', 'بازده')}
                    <th scope="col" className="col-num !pe-4 md:!pe-5">رشد سالانهٔ مرکب</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((r, i) => (
                    <tr key={r.symbol}>
                      <td className="num-ltr !ps-4 text-xs text-subtle md:!ps-5">{i + 1}</td>
                      <td>
                        <p className="font-semibold text-ink">{r.nameFa}</p>

                      </td>
                      <td className="col-num text-muted"><MoneyValue value={r.historicalPrice} /></td>
                      <td className="col-num"><MoneyValue value={r.currentPrice} /></td>
                      <td className="col-num font-semibold text-ink"><MoneyValue value={r.currentValue} /></td>
                      <td className="col-num"><MoneyValue value={r.profit} signed tone="auto" /></td>
                      <td className="col-num font-semibold"><PercentValue value={r.returnPct} /></td>
                      <td className="col-num !pe-4 md:!pe-5"><PercentValue value={r.cagr === null ? null : r.cagr * 100} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ranked.some((r) => r.historicalPrice === null) && (
              <Notice tone="neutral" className="m-3">
                دارایی‌های بدون داده تاریخی «—» نمایش داده می‌شوند و در انتهای رتبه‌بندی قرار می‌گیرند.
              </Notice>
            )}
          </Surface>

          <ExportButtons
            filename="compare-markets.csv"
            headers={['رتبه', 'دارایی', 'نام', 'قیمت شروع', 'قیمت فعلی', 'ارزش', 'سود', 'بازده %', 'CAGR %']}
            rows={ranked.map((r, i) => [i + 1, r.symbol, r.nameFa, r.historicalPrice ?? 'N/A', r.currentPrice ?? 'N/A', r.currentValue ?? 'N/A', r.profit ?? 'N/A', r.returnPct ?? 'N/A', r.cagr === null ? 'N/A' : (r.cagr * 100).toFixed(2)])}
            pdfTitle="گزارش مقایسه بازارها"
            pdfSections={[
              {
                heading: `مقایسه ${selected.length} دارایی (سرمایه ${fmtUSD(Number(invest) || 0)})`,
                table: {
                  headers: ['دارایی', 'بازده', 'ارزش', 'سود'],
                  rows: ranked.map((r) => [r.symbol, fmtPct(r.returnPct), fmtUSD(r.currentValue), fmtUSD(r.profit)])
                }
              }
            ]}
          />
        </>
      )}
    </CalcShell>
  );
}
