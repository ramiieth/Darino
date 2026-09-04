/**
 * ۵) ماشین‌حساب مقایسه بازارها — چند دارایی هم‌زمان
 * ارزش فعلی، سود، درصد، CAGR، رتبه‌بندی، مرتب‌سازی، فیلتر، جستجو، CSV/PDF
 */
import { useEffect, useMemo, useState } from 'react';
import { X, TrendingUp, TrendingDown, Search } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { parseIsoToTs, formatGregorianIso } from '@/shared/utils/jalali';
import { AssetPicker } from './AssetPicker';
import { StatCard } from './StatCard';
import { LineChartCard, BarChartCard } from './CalcCharts';
import { ExportButtons } from './ExportButtons';
import { useCalculatorPrices } from '@/features/calculators/data/useCalculatorPrices';
import { getHistoricalSeries } from '@/features/calculators/data/historical';
import { calcCompare, type CompareResult } from '@/features/calculators/domain';
import type { CalculatorAsset } from '@/features/calculators/data/catalogs';
import { fmtUSD, fmtPct, pnlClass } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import { fmtFaDate } from './CalcCharts';

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
    if (a && !selected.some((x) => x.symbol === a.symbol)) {
      setSelected((s) => [...s, a]);
    }
  };
  const removeAsset = (symbol: string) => {
    setSelected((s) => s.filter((x) => x.symbol !== symbol));
    setHist((h) => {
      const n = { ...h };
      delete n[symbol];
      return n;
    });
  };

  // دریافت قیمت تاریخی شروع برای هر دارایی
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

  const results: CompareResult[] = useMemo(() => {
    return selected.map((a) => {
      const series = hist[a.symbol];
      // قیمت تاریخی = نزدیک‌ترین نقطه به تاریخ شروع
      let historical: number | null = null;
      if (series && series.length > 0) {
        let best = series[0].price;
        for (const p of series) {
          if (p.t <= startTs + 3 * 86_400_000) best = p.price;
          else break;
        }
        historical = best;
      }
      const current = prices[a.symbol] ?? null;
      return calcCompare(
        { symbol: a.symbol, nameFa: a.nameFa, investment: Number(invest) || 0, historicalPrice: historical, currentPrice: current },
        years
      );
    });
  }, [selected, hist, prices, invest, startTs, years]);

  const ranked = useMemo(() => {
    const filtered = results.filter(
      (r) =>
        filterQ === '' ||
        r.symbol.toLowerCase().includes(filterQ.toLowerCase()) ||
        r.nameFa.includes(filterQ)
    );
    const sorted = [...filtered];
    const val = (r: CompareResult) =>
      sort === 'return' ? (r.returnPct ?? -Infinity) : sort === 'value' ? (r.currentValue ?? -Infinity) : sort === 'profit' ? (r.profit ?? -Infinity) : r.nameFa.localeCompare(r.nameFa);
    sorted.sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * (dir === 'desc' ? -1 : 1);
      return String(av).localeCompare(String(bv));
    });
    return sorted;
  }, [results, sort, dir, filterQ]);

  const best = ranked.find((r) => r.returnPct !== null && r.returnPct === Math.max(...ranked.map((x) => x.returnPct ?? -Infinity)));
  const worst = ranked.find((r) => r.returnPct !== null && r.returnPct === Math.min(...ranked.map((x) => x.returnPct ?? Infinity)));

  // نمودار رشد نرمال‌شده (شروع = ۱۰۰)
  const growthChart = useMemo(() => {
    const labels: string[] = [];
    const datasets: { label: string; data: number[]; color: string }[] = [];
    const colors = ['#0d9488', '#8b5cf6', '#0ea5e9', '#f59e0b', '#ec4899', '#10b981', '#6366f1', '#ef4444'];
    selected.forEach((a, i) => {
      const series = hist[a.symbol];
      if (!series || series.length < 2) return;
      const base = series[0].price;
      if (!base) return;
      const pts = series.filter((p) => p.t >= startTs - 86_400_000 && p.t <= endTs + 86_400_000);
      const data = pts.map((p) => (p.price / base) * 100);
      datasets.push({ label: a.symbol, data, color: colors[i % colors.length] });
      if (labels.length === 0) labels.push(...pts.map((p) => fmtFaDate(p.t)));
    });
    return { labels, datasets };
  }, [selected, hist, startTs, endTs]);

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-3 p-4">
        <div className="grid grid-cols-3 gap-2.5">
          <div className="col-span-1">
            <label className="mb-1 block text-[11px] font-bold text-muted">سرمایه اولیه ($)</label>
            <Input dir="ltr" inputMode="decimal" value={invest} onChange={(e) => setInvest(e.target.value)} className="h-10 text-xs text-start" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-muted">تاریخ شروع</label>
            <SmartDateField
              value={start ? parseIsoToTs(start) : null}
              onChange={(ts) => setStart(ts ? formatGregorianIso(ts) : '')}
              className="w-full"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-muted">تاریخ پایان</label>
            <SmartDateField
              value={end ? parseIsoToTs(end) : null}
              onChange={(ts) => setEnd(ts ? formatGregorianIso(ts) : '')}
              className="w-full"
            />
          </div>
        </div>

        <AssetPicker value={null} onChange={addAsset} compact />

        {/* انتخاب‌شده‌ها */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selected.map((a) => (
              <span key={a.symbol} className="badge bg-accent/10 py-1 pe-1 ps-2.5 text-[11px] text-accent ring-1 ring-accent/25">
                {a.symbol}
                <button onClick={() => removeAsset(a.symbol)} className="ms-1 rounded-full p-0.5 hover:bg-accent/20" aria-label="حذف">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </GlassCard>

      {ranked.length > 0 && (
        <>
          {/* کارت‌های برترین/بدترین */}
          <div className="grid grid-cols-2 gap-2.5">
            {best && (
              <GlassCard className="border border-positive/25 p-3.5">
                <p className="flex items-center gap-1 text-[10px] font-bold text-positive">
                  <TrendingUp className="h-3 w-3" /> بهترین عملکرد
                </p>
                <p className="mt-1 text-[13px] font-extrabold text-ink">{best.symbol}</p>
                <p className="num-ltr text-[15px] font-black text-positive">{fmtPct(best.returnPct)}</p>
              </GlassCard>
            )}
            {worst && (
              <GlassCard className="border border-negative/25 p-3.5">
                <p className="flex items-center gap-1 text-[10px] font-bold text-negative">
                  <TrendingDown className="h-3 w-3" /> بدترین عملکرد
                </p>
                <p className="mt-1 text-[13px] font-extrabold text-ink">{worst.symbol}</p>
                <p className="num-ltr text-[15px] font-black text-negative">{fmtPct(worst.returnPct)}</p>
              </GlassCard>
            )}
          </div>

          {/* کارت‌های آماری هر دارایی */}
          <div className="grid grid-cols-2 gap-2.5">
            {ranked.map((r, i) => (
              <StatCard
                key={r.symbol}
                label={`${i + 1}. ${r.nameFa} (${r.symbol})`}
                value={fmtUSD(r.currentValue)}
                sub={`${fmtPct(r.returnPct)} · CAGR ${fmtPct(r.cagr === null ? null : r.cagr * 100)}`}
                tone={r.returnPct === null ? 'neutral' : r.returnPct >= 0 ? 'positive' : 'negative'}
                delay={Math.min(i * 0.04, 0.4)}
              />
            ))}
          </div>

          {growthChart.datasets.length > 0 && (
            <LineChartCard
              title="نمودار مقایسه رشد (شروع = ۱۰۰)"
              labels={growthChart.labels}
              datasets={growthChart.datasets}
              prefix=""
            />
          )}
          <BarChartCard
            title="نمودار بازده هر دارایی"
            labels={ranked.map((r) => r.symbol)}
            values={ranked.map((r) => r.returnPct ?? 0)}
          />

          {/* جدول رتبه‌بندی + مرتب‌سازی */}
          <GlassCard className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-line/10 px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted" />
              <input
                value={filterQ}
                onChange={(e) => setFilterQ(e.target.value)}
                placeholder="جستجو در جدول…"
                className="w-full bg-transparent text-[11px] font-bold text-ink outline-none placeholder:text-muted/60"
              />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="glass-inset rounded-lg px-2 py-1 text-[10px] font-bold text-ink outline-none"
              >
                <option value="return">بازده</option>
                <option value="value">ارزش</option>
                <option value="profit">سود</option>
                <option value="name">نام</option>
              </select>
              <button
                onClick={() => setDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                className="glass-inset rounded-lg px-2 py-1 text-[10px] font-bold text-ink"
              >
                {dir === 'desc' ? '↓' : '↑'}
              </button>
            </div>
            <div className="max-h-72 overflow-auto">
              <table className="sim-table min-w-[520px] text-start">
                <thead>
                  <tr>
                    <th className="!text-start">#</th>
                    <th className="!text-start">دارایی</th>
                    <th className="!text-start">قیمت شروع</th>
                    <th className="!text-start">قیمت فعلی</th>
                    <th className="!text-start">ارزش</th>
                    <th className="!text-start">سود</th>
                    <th className="!text-start">بازده</th>
                    <th className="!text-start">CAGR</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((r, i) => (
                    <tr key={r.symbol}>
                      <td className="num-ltr text-muted">{i + 1}</td>
                      <td>
                        <span className="tnum font-extrabold text-ink">{r.symbol}</span>
                      </td>
                      <td className="num-ltr text-muted">{fmtUSD(r.historicalPrice)}</td>
                      <td className="num-ltr text-ink">{fmtUSD(r.currentPrice)}</td>
                      <td className="num-ltr font-bold text-ink">{fmtUSD(r.currentValue)}</td>
                      <td className={cn('num-ltr font-bold', pnlClass(r.profit))}>{fmtUSD(r.profit)}</td>
                      <td className={cn('num-ltr font-bold', pnlClass(r.returnPct))}>{fmtPct(r.returnPct)}</td>
                      <td className={cn('num-ltr font-bold', pnlClass(r.cagr === null ? null : r.cagr * 100))}>{fmtPct(r.cagr === null ? null : r.cagr * 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ranked.some((r) => r.historicalPrice === null) && (
              <p className="border-t border-line/10 px-4 py-2 text-[10px] font-medium text-muted">
                دارایی‌هایی که قیمت تاریخی ندارند (داده تاریخی در دسترس نیست) با N/A نمایش داده می‌شوند.
              </p>
            )}
          </GlassCard>

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

      {selected.length === 0 && (
        <p className="glass-soft rounded-2xl px-6 py-10 text-center text-[11px] font-bold text-muted">
          ابتدا چند دارایی از لیست انتخاب کنید (امکان انتخاب هم‌زمان چند نماد)
        </p>
      )}
      <div className="h-2" />
    </div>
  );
}
