/**
 * پنل بکتست واقعی (Agent 6: Backtester) با نمودار Chart.js، جدول معاملات و کد Python
 */
import { useMemo, useState } from 'react';
import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { AlertTriangle, Code2, Play } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Disclosure } from '@/shared/components/ui/Disclosure';
import { Field, Input } from '@/shared/components/ui/Input';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { cn } from '@/shared/lib/cn';
import { toEnDigits, toFaDigits } from '@/shared/utils/formatters';
import { STRATEGY_META, runHistoricalBacktest } from '../domain/backtester';
import type { BacktestConfig, BacktestResult, BacktestStrategyId, UploadedPriceDataset } from '../domain/types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const parseNum = (s: string, fallback: number) => {
  const n = Number(toEnDigits(s).replace(/[,٬\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function IranDeskBacktestPanel({
  dataset,
  savedBacktests,
  onSaveResult
}: {
  dataset: UploadedPriceDataset | null;
  savedBacktests: BacktestResult[];
  onSaveResult: (res: BacktestResult) => void;
}) {
  const isFund = dataset?.assetType.startsWith('fund_') ?? false;
  const [strategyId, setStrategyId] = useState<BacktestStrategyId>('breakout_20d');
  const [capitalStr, setCapitalStr] = useState('1000000000');
  const [stopLossStr, setStopLossStr] = useState('5');
  const [takeProfitStr, setTakeProfitStr] = useState('15');
  const [commissionStr, setCommissionStr] = useState(isFund ? '0.23' : '1.25');
  const [commissionNote, setCommissionNote] = useState(
    isFund ? 'نرخ استاندارد صندوق ETF (~۰.۲۳٪)' : 'نرخ استاندارد سهام بورس (~۱.۲۵٪)'
  );
  const [result, setResult] = useState<BacktestResult | null>(
    () => savedBacktests.find((b) => b.symbol === dataset?.symbol) ?? null
  );

  const handleRun = () => {
    if (!dataset || dataset.bars.length < 30) return;
    const cfg: BacktestConfig = {
      strategyId,
      initialCapitalRial: Math.max(10_000_000, parseNum(capitalStr, 1_000_000_000)),
      stopLossPct: Math.max(0.5, parseNum(stopLossStr, 5)),
      takeProfitPct: parseNum(takeProfitStr, 0) > 0 ? parseNum(takeProfitStr, 15) : null,
      roundTripCommissionPct: parseNum(commissionStr, isFund ? 0.23 : 1.25),
      commissionAssumptionFa: commissionNote.trim() || 'کارمزد واردشده توسط کاربر'
    };
    const res = runHistoricalBacktest({
      symbol: dataset.symbol,
      fileName: dataset.fileName,
      bars: dataset.bars,
      config: cfg
    });
    setResult(res);
    onSaveResult(res);
  };

  const chartData = useMemo(() => {
    if (!result || result.equityCurve.length === 0) return null;
    // نمونه‌برداری سبک در صورت بیش از ۱۸۰ روز برای روانی نمودار
    const step = Math.max(1, Math.floor(result.equityCurve.length / 160));
    const sampled = result.equityCurve.filter((_, idx) => idx % step === 0 || idx === result.equityCurve.length - 1);
    return {
      labels: sampled.map((p) => p.date),
      datasets: [
        {
          label: 'استراتژی (ریال)',
          data: sampled.map((p) => p.equity),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          fill: true,
          tension: 0.2,
          pointRadius: 0
        },
        {
          label: 'خرید و نگهداری (Buy & Hold)',
          data: sampled.map((p) => p.buyHoldEquity),
          borderColor: '#6366f1',
          borderDash: [5, 5],
          fill: false,
          tension: 0.2,
          pointRadius: 0
        }
      ]
    };
  }, [result]);

  if (!dataset) {
    return (
      <EmptyState
        message="داده‌ای برای اجرای بکتست انتخاب نشده است"
        hint="ابتدا در تب «داده‌ها و صندوق‌ها»، فایل CSV سابقه قیمت روزانه نماد (ترجیحاً ۳ تا ۵ سال) را بارگذاری کنید. هیچ عدد تخمینی یا ساختگی تولید نمی‌شود."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Surface className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold text-ink">
              بکتستر واقعی روی {dataset.symbol} ({toFaDigits(dataset.bars.length)} روز از {dataset.fileName})
            </h3>
            <p className="text-xs text-muted">{STRATEGY_META[strategyId].entryRuleFa}</p>
          </div>
          <Button size="sm" icon={<Play className="h-3.5 w-3.5" />} disabled={dataset.bars.length < 30} onClick={handleRun}>
            اجرای واقعی بکتست
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(STRATEGY_META) as BacktestStrategyId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setStrategyId(id)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-bold transition',
                strategyId === id ? 'border-accent bg-accent text-on-accent' : 'border-divider bg-card text-muted hover:text-ink'
              )}
            >
              {STRATEGY_META[id].labelFa}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Field label="سرمایه اولیه (ریال)">
            <Input dir="ltr" inputMode="numeric" value={capitalStr} onChange={(e) => setCapitalStr(e.target.value)} />
          </Field>
          <Field label="حد ضرر (%)">
            <Input dir="ltr" inputMode="decimal" value={stopLossStr} onChange={(e) => setStopLossStr(e.target.value)} suffix="٪" />
          </Field>
          <Field label="حد سود (%) — ۰ یعنی بدون سقف">
            <Input dir="ltr" inputMode="decimal" value={takeProfitStr} onChange={(e) => setTakeProfitStr(e.target.value)} suffix="٪" />
          </Field>
          <Field label="کارمزد رفت‌وبرگشت (%)">
            <Input dir="ltr" inputMode="decimal" value={commissionStr} onChange={(e) => setCommissionStr(e.target.value)} suffix="٪" />
          </Field>
          <Field label="توضیح فرض کارمزد">
            <Input value={commissionNote} onChange={(e) => setCommissionNote(e.target.value)} />
          </Field>
        </div>

        {dataset.bars.length < 30 && (
          <Notice tone="warn" title="سابقه قیمت کوتاه است">
            فایل بارگذاری‌شده کمتر از ۳۰ روز معاملاتی دارد؛ برای بکتست معتبر حداقل ۱ تا ۵ سال سابقه قیمت روزانه بارگذاری کنید.
          </Notice>
        )}
      </Surface>

      {result && (
        <Surface className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-extrabold text-ink">گزارش واقعی بکتست ({result.strategyVersion})</h4>
              <Badge tone={result.statisticallyReliable ? 'gain' : 'warn'}>
                {toFaDigits(result.totalTrades)} معامله
              </Badge>
            </div>
            <span className="text-xs text-muted">
              بازه: {result.startDate} تا {result.endDate} ({toFaDigits(result.barsUsed)} روز)
            </span>
          </div>

          {result.reliabilityWarningFa && (
            <Notice tone="warn" icon={<AlertTriangle className="h-4 w-4" />} title="هشدار اعتبار آماری">
              {result.reliabilityWarningFa}
            </Notice>
          )}

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-field bg-surface-2/60 p-2.5">
              <span className="text-[11px] text-muted">بازده کل استراتژی</span>
              <p className={cn('mt-0.5 text-base font-extrabold', result.totalReturnPct >= 0 ? 'text-positive' : 'text-negative')}>
                {result.totalReturnPct > 0 ? '+' : ''}{toFaDigits(result.totalReturnPct)}٪
              </p>
              <span className="text-[10px] text-subtle">
                خرید و نگهداری: {result.buyAndHoldReturnPct > 0 ? '+' : ''}{toFaDigits(result.buyAndHoldReturnPct)}٪
              </span>
            </div>

            <div className="rounded-field bg-surface-2/60 p-2.5">
              <span className="text-[11px] text-muted">نرخ برد (Win Rate)</span>
              <p className="mt-0.5 text-base font-extrabold text-ink">{toFaDigits(result.winRatePct)}٪</p>
              <span className="text-[10px] text-subtle">
                میانگین سود +{toFaDigits(result.avgWinPct)}٪ / زیان {toFaDigits(result.avgLossPct)}٪
              </span>
            </div>

            <div className="rounded-field bg-surface-2/60 p-2.5">
              <span className="text-[11px] text-muted">بیشترین افت سرمایه (Max DD)</span>
              <p className="mt-0.5 text-base font-extrabold text-negative">-{toFaDigits(result.maxDrawdownPct)}٪</p>
              <span className="text-[10px] text-subtle">حداکثر افت از سقف سرمایه</span>
            </div>

            <div className="rounded-field bg-surface-2/60 p-2.5">
              <span className="text-[11px] text-muted">تأثیر کل کارمزدها</span>
              <p className="mt-0.5 text-sm font-extrabold text-ink">
                {toFaDigits(result.totalCommissionRial.toLocaleString('en-US'))} ریال
              </p>
              <span className="text-[10px] text-subtle">نرخ {toFaDigits(result.config.roundTripCommissionPct)}٪</span>
            </div>
          </div>

          {chartData && (
            <div className="h-60 w-full rounded-card border border-divider/70 bg-card p-2.5">
              <Line
                data={chartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { position: 'top', rtl: true } },
                  scales: { x: { ticks: { maxTicksLimit: 8 } } }
                }}
              />
            </div>
          )}

          <Disclosure summary={`فهرست معاملات انجام‌شده (${toFaDigits(result.trades.length)} معامله)`}>
            <div className="overflow-x-auto pt-2">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-divider text-muted">
                    <th className="pb-1.5">#</th>
                    <th className="pb-1.5">ورود</th>
                    <th className="pb-1.5">خروج</th>
                    <th className="pb-1.5">دلیل خروج</th>
                    <th className="pb-1.5">بازده خالص</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider/60">
                  {result.trades.slice(0, 60).map((t) => (
                    <tr key={t.index}>
                      <td className="py-1.5">{toFaDigits(t.index)}</td>
                      <td className="py-1.5">{t.entryDate} ({toFaDigits(Math.round(t.entryPrice).toLocaleString('en-US'))})</td>
                      <td className="py-1.5">{t.exitDate} ({toFaDigits(Math.round(t.exitPrice).toLocaleString('en-US'))})</td>
                      <td className="py-1.5 text-muted">{t.exitReasonFa}</td>
                      <td className={cn('py-1.5 font-bold', t.netReturnPct >= 0 ? 'text-positive' : 'text-negative')}>
                        {t.netReturnPct > 0 ? '+' : ''}{toFaDigits(t.netReturnPct)}٪
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Disclosure>

          <Disclosure summary="فرضیات اجرا و کد پایتون قابل بازتولید">
            <div className="space-y-2 pt-2 text-xs">
              <ul className="list-disc space-y-1 ps-4 text-muted">
                {result.assumptionsFa.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
              <pre dir="ltr" className="overflow-x-auto rounded-field bg-surface-2 p-3 text-[11px] text-ink">
                <span className="mb-1 flex items-center gap-1 font-sans text-xs font-bold text-accent">
                  <Code2 className="h-3.5 w-3.5" /> Python Script
                </span>
                {result.pythonCode}
              </pre>
            </div>
          </Disclosure>

          <p className="rounded-field bg-amber-500/10 px-3 py-2 text-xs font-bold text-ink">
            ⚠️ {result.disclaimerFa}
          </p>
        </Surface>
      )}
    </div>
  );
}
