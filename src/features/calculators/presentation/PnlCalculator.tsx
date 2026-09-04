/**
 * ۱) ماشین‌حساب سود و زیان — UI فقط نمایش نتایج (محاسبات در domain)
 */
import { useEffect, useMemo, useState } from 'react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { AssetPicker } from './AssetPicker';
import { StatCard } from './StatCard';
import { LineChartCard } from './CalcCharts';
import { ExportButtons } from './ExportButtons';
import { useCalculatorPrices } from '@/features/calculators/data/useCalculatorPrices';
import { getHistoricalSeries, TIMEFRAME_LABELS, TIMEFRAME_MS } from '@/features/calculators/data/historical';
import { calcPnl, cumulativeProfitSeries, type PnlResult } from '@/features/calculators/domain';
import type { CalculatorAsset } from '@/features/calculators/data/catalogs';
import { fmtUSD, fmtPct, pnlClass } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';
import { fmtFaDate } from './CalcCharts';

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

  // قیمت فعلی → پیش‌فرض قیمت خرید (فقط اولین بار)
  useEffect(() => {
    if (asset && currentPrice !== null && buyPrice === '') {
      setBuyPrice(String(currentPrice));
    }
  }, [asset, currentPrice, buyPrice]);

  // داده تاریخی برای نمودار
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
            ? 'داده تاریخی برای دارایی توکن‌ایز در دسترس نیست'
            : 'داده تاریخی فعلاً در دسترس نیست (محدودیت API)'
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

  const profitSeries = useMemo(() => {
    if (!result || !series) return [];
    return cumulativeProfitSeries(Number(buyPrice) || 0, Number(qty) || 0, Number(buyFee) || 0, series);
  }, [result, series, buyPrice, qty, buyFee]);

  const ready = asset && result !== null;

  return (
    <div className="space-y-4">
      <GlassCard className="space-y-3 p-4">
        <AssetPicker value={asset} onChange={setAsset} />
        {asset && currentPrice === null && (
          <p className="text-[11px] font-bold text-warn">
            قیمت فعلی برای این دارایی در دسترس نیست — نتیجه N/A نمایش داده می‌شود
          </p>
        )}
        {asset && currentPrice !== null && (
          <div className="flex items-center justify-between rounded-2xl bg-line/[0.03] px-3.5 py-2.5">
            <span className="text-[11px] font-bold text-muted">قیمت فعلی (از API)</span>
            <span className="num-ltr text-[14px] font-black text-ink">{fmtUSD(currentPrice)}</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="تعداد واحد" value={qty} onChange={setQty} />
          <Field label="قیمت خرید ($)" value={buyPrice} onChange={setBuyPrice} />
          <Field label="کارمزد خرید ($)" value={buyFee} onChange={setBuyFee} />
          <Field label="کارمزد فروش ($)" value={sellFee} onChange={setSellFee} />
        </div>
        {/* بازه زمانی */}
        <div>
          <label className="mb-1.5 block text-[11px] font-bold text-muted">بازه زمانی نمودار</label>
          <div className="flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TIMEFRAME_LABELS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTf(t.key)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1 text-[10px] font-bold transition-all',
                  tf === t.key ? 'bg-accent text-white' : 'glass-inset text-muted'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </GlassCard>

      {ready && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard label="ارزش فعلی" value={fmtUSD(result.currentValue)} tone="accent" />
            <StatCard label="کل سرمایه پرداخت‌شده" value={fmtUSD(result.totalCost)} sub={`سرمایه اولیه: ${fmtUSD(result.initialInvestment)}`} />
            <StatCard
              label="سود / زیان"
              value={fmtUSD(result.profit)}
              tone={result.profit === null ? 'neutral' : result.profit >= 0 ? 'positive' : 'negative'}
              sub={`ارزش خالص فروش: ${fmtUSD(result.netValue)}`}
            />
            <StatCard
              label="درصد بازده"
              value={fmtPct(result.returnPct)}
              tone={result.returnPct === null ? 'neutral' : result.returnPct >= 0 ? 'positive' : 'negative'}
            />
          </div>

          {histLoading && <div className="skeleton h-44 rounded-2xl" />}
          {!histLoading && histMsg && !series && (
            <p className="glass-soft rounded-2xl px-4 py-3 text-center text-[11px] font-bold text-muted">{histMsg}</p>
          )}
          {!histLoading && series && (
            <>
              <LineChartCard
                title={`رشد قیمت ${asset.symbol}`}
                labels={series.map((p) => fmtFaDate(p.t))}
                datasets={[{ label: 'قیمت', data: series.map((p) => p.price), color: '#0d9488', fill: true }]}
              />
              <LineChartCard
                title="سود تجمعی"
                labels={profitSeries.map((p) => fmtFaDate(p.t))}
                datasets={[{ label: 'سود', data: profitSeries.map((p) => p.value), color: '#059669' }]}
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
                heading: `سود و زیان سرمایه‌گذاری ${asset.nameFa} (${asset.symbol})`,
                table: {
                  headers: ['موارد', 'مقدار'],
                  rows: [
                    ['قیمت خرید', fmtUSD(result.initialInvestment)],
                    ['قیمت فعلی', fmtUSD(currentPrice)],
                    ['تعداد واحد', qty],
                    ['ارزش فعلی', fmtUSD(result.currentValue)],
                    ['کل سرمایه پرداخت‌شده', fmtUSD(result.totalCost)],
                    ['سود / زیان', fmtUSD(result.profit)],
                    ['درصد بازده', fmtPct(result.returnPct)]
                  ]
                },
                note: 'محاسبات توسط موتور مالی (decimal.js) با دقت ۱۲ رقم اعشار انجام شده است.'
              }
            ]}
          />
        </>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-bold text-muted">{label}</label>
      <Input
        dir="ltr"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 text-xs text-start"
      />
    </div>
  );
}
