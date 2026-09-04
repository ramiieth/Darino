/**
 * ۳) ماشین‌حساب CAGR — نرخ رشد سالانه مرکب + مقایسه با سایر دارایی‌ها
 */
import { useEffect, useMemo, useState } from 'react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { parseIsoToTs, formatGregorianIso } from '@/shared/utils/jalali';
import { StatCard } from './StatCard';
import { BarChartCard, LineChartCard } from './CalcCharts';
import { ExportButtons } from './ExportButtons';
import { useCalculatorPrices } from '@/features/calculators/data/useCalculatorPrices';
import { calcCagrFull } from '@/features/calculators/domain';
import { fmtUSD, fmtPct } from '@/shared/utils/formatters';

export function CagrCalculator() {
  const { prices } = useCalculatorPrices();
  const [initial, setInitial] = useState('10000');
  const [final, setFinal] = useState('');
  const [start, setStart] = useState('2023-01-01');
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [autoFinal, setAutoFinal] = useState(true);

  const startTs = useMemo(() => new Date(start + 'T00:00:00').getTime(), [start]);
  const endTs = useMemo(() => new Date(end + 'T00:00:00').getTime(), [end]);
  const years = Math.max((endTs - startTs) / (365.25 * 86_400_000), 0);

  const result = useMemo(() => {
    const fin = autoFinal ? Number(final) || 0 : Number(final) || 0;
    return calcCagrFull({
      initialValue: Number(initial) || 0,
      finalValue: fin,
      startDate: startTs,
      endDate: endTs
    });
  }, [initial, final, startTs, endTs, autoFinal]);

  // مقایسه: CAGR سایر دارایی‌ها (نمونه: بیت‌کوین، اتریوم، طلا، SPY)
  const benchmarks = useMemo(() => {
    const out: { label: string; cagr: number | null; price: number }[] = [];
    const entries: { symbol: string; label: string }[] = [
      { symbol: 'BTC', label: 'بیت‌کوین' },
      { symbol: 'ETH', label: 'اتریوم' },
      { symbol: 'GLD', label: 'طلا' },
      { symbol: 'SPY', label: 'S&P 500' }
    ];
    for (const e of entries) {
      const p = prices[e.symbol];
      out.push({ label: e.label, cagr: null, price: p ?? 0 });
    }
    return out;
  }, [prices]);

  const growthCurve = useMemo(() => {
    // منحنی رشد نمایی با CAGR محاسبه‌شده
    if (!result.cagr || years <= 0) return [];
    const points = 40;
    const arr: number[] = [];
    for (let i = 0; i <= points; i++) {
      const y = (i / points) * years;
      arr.push(Number(initial) * Math.pow(1 + result.cagr, y));
    }
    return arr;
  }, [result.cagr, years, initial]);

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="mb-1 block text-[11px] font-bold text-muted">سرمایه اولیه ($)</label>
            <Input dir="ltr" inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} className="h-10 text-xs text-start" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold text-muted">ارزش نهایی ($)</label>
            <Input dir="ltr" inputMode="decimal" value={final} onChange={(e) => setFinal(e.target.value)} className="h-10 text-xs text-start" />
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
        <p className="text-[10px] font-medium text-muted">
          مدت سرمایه‌گذاری: <span className="num-ltr font-bold text-ink">{years.toFixed(2)} سال</span> · فرمول: (ارزش نهایی ÷ اولیه)^(۱÷سال) − ۱
        </p>
      </GlassCard>

      <div className="grid grid-cols-2 gap-2.5">
        <StatCard
          label="نرخ رشد سالانه (CAGR)"
          value={fmtPct(result.cagr === null ? null : result.cagr * 100)}
          tone={result.cagr === null ? 'neutral' : result.cagr >= 0 ? 'positive' : 'negative'}
          delay={0}
        />
        <StatCard label="سود کل" value={fmtUSD(result.totalProfit)} tone={result.totalProfit !== null && result.totalProfit >= 0 ? 'positive' : 'negative'} delay={0.05} />
        <StatCard label="درصد رشد کل" value={fmtPct(result.totalGrowthPct)} tone={result.totalGrowthPct !== null && result.totalGrowthPct >= 0 ? 'positive' : 'negative'} delay={0.1} />
        <StatCard label="مدت سرمایه‌گذاری" value={`${result.days.toLocaleString('en-US')} روز`} delay={0.15} />
      </div>

      {growthCurve.length > 1 && (
        <LineChartCard
          title="نمودار رشد (منحنی CAGR)"
          labels={Array.from({ length: growthCurve.length }, (_, i) => `${Math.round((i / (growthCurve.length - 1)) * years * 12)} ماه`)}
          datasets={[{ label: 'ارزش', data: growthCurve, color: '#0d9488', fill: true }]}
        />
      )}

      {/* مقایسه با سایر دارایی‌ها */}
      <GlassCard className="p-4">
        <h4 className="mb-3 text-[12px] font-extrabold text-ink">قیمت فعلی دارایی‌های مرجع</h4>
        <div className="space-y-2">
          {benchmarks.map((b) => (
            <div key={b.label} className="flex items-center justify-between rounded-xl bg-line/[0.03] px-3.5 py-2.5">
              <span className="text-[11px] font-bold text-ink">{b.label}</span>
              <span className="num-ltr text-[12px] font-black text-muted">{b.price ? fmtUSD(b.price) : 'N/A'}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      <ExportButtons
        filename="cagr.csv"
        headers={['سرمایه اولیه', 'ارزش نهایی', 'سال', 'CAGR', 'سود کل', 'رشد کل']}
        rows={[[initial, final, years.toFixed(2), result.cagr === null ? 'N/A' : (result.cagr * 100).toFixed(2) + '%', result.totalProfit ?? 'N/A', result.totalGrowthPct ?? 'N/A']]}
        pdfTitle="گزارش CAGR"
        pdfSections={[
          {
            heading: 'نرخ رشد سالانه مرکب',
            table: {
              headers: ['موارد', 'مقدار'],
              rows: [
                ['سرمایه اولیه', fmtUSD(Number(initial) || 0)],
                ['ارزش نهایی', fmtUSD(Number(final) || 0)],
                ['مدت (سال)', years.toFixed(2)],
                ['CAGR', fmtPct(result.cagr === null ? null : result.cagr * 100)],
                ['سود کل', fmtUSD(result.totalProfit)],
                ['درصد رشد کل', fmtPct(result.totalGrowthPct)]
              ]
            }
          }
        ]}
      />
      <div className="h-2" />
    </div>
  );
}
