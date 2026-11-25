import { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler,
  type ChartOptions,
  type ScriptableContext
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Select } from '@/shared/components/ui/Input';
import { Notice } from '@/shared/components/ui/StateViews';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { fmtUSD } from '@/shared/utils/formatters';
import { baseChartOptions, cssColor } from '@/shared/design/chartTheme';
import { fetchJson } from '@/repositories/remoteClient';
import { visiblePositions } from '../domain/visibility';
import type { ChartPeriod, WalletChart } from '../domain/chart';
import type { ConnectedPortfolio } from '../data/useConnectedPortfolio';
import { providerError } from './ConnectedPage';

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler);

const periods: [ChartPeriod, string][] = [
  ['hour', '۱ ساعت'],
  ['day', '۱ روز'],
  ['week', '۱ هفته'],
  ['month', '۱ ماه'],
  ['year', '۱ سال'],
  ['max', 'همه']
];

const memory = new Map<string, WalletChart>();

export function WalletBalanceChart({ portfolio, network }: { portfolio: ConnectedPortfolio; network: string }) {
  const [period, setPeriod] = useState<ChartPeriod>('day');
  const [walletId, setWalletId] = useState('');
  const [data, setData] = useState<WalletChart | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wallet = portfolio.wallets.find((w) => w.holding.id === walletId) ?? portfolio.wallets[0];
  const tokens = visiblePositions(wallet?.state?.data?.positions ?? []).filter(
    (p) => p.type === 'wallet' && p.chain !== 'bitcoin' && (network === 'all' || p.chain === network)
  );
  const ids = [...new Set(tokens.map((p) => p.tokenId).filter(Boolean))].sort();
  const supported = ids.length > 0 && ids.length <= 25 && tokens.every((p) => p.tokenId);
  const key = wallet && supported ? wallet.holding.address + '|' + period + '|' + network + '|' + ids.join(',') : '';

  useEffect(() => {
    let stopped = false;
    setError(null);
    setData(null);
    setBusy(false);
    if (!key) return;
    const hit = memory.get(key);
    if (hit && Date.now() - hit.fetchedAt < 1800000) {
      setData(hit);
      return;
    }
    setBusy(true);
    void fetchJson<WalletChart>(
      '/api/integrations?op=chart&address=' +
        encodeURIComponent(wallet!.holding.address!) +
        '&period=' +
        period +
        '&ids=' +
        encodeURIComponent(ids.join(',')) +
        (network === 'all' ? '' : '&chain=' + encodeURIComponent(network))
    )
      .then((value) => {
        if (!stopped) {
          if (memory.size >= 100) memory.delete(memory.keys().next().value!);
          memory.set(key, value);
          setData(value);
        }
      })
      .catch((e) => {
        if (!stopped) setError(providerError(e));
      })
      .finally(() => {
        if (!stopped) setBusy(false);
      });
    return () => {
      stopped = true;
    };
    // The immutable request key owns lifecycle, not response or hook object references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, wallet?.state?.data?.fetchedAt]);

  if (!wallet) return null;

  const points = data?.points ?? [];
  const delta = points.length > 1 ? points[points.length - 1][1] - points[0][1] : null;
  const percent = delta !== null && points[0][1] > 0 ? (delta / points[0][1]) * 100 : null;
  const isLoss = delta !== null && delta < 0;
  const color = cssColor(isLoss ? 'loss' : 'gain');
  const labels = points.map(([at]) =>
    new Date(at).toLocaleString(
      'fa-IR',
      period === 'hour' || period === 'day' ? { hour: '2-digit', minute: '2-digit' } : { month: 'short', day: 'numeric' }
    )
  );
  const base = baseChartOptions() as ChartOptions<'line'>;

  const areaFill = (ctx: ScriptableContext<'line'>) => {
    const chart = ctx.chart;
    const { ctx: canvasCtx, chartArea } = chart;
    if (!chartArea) return 'transparent';
    const gradient = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    const rgb = isLoss ? '200, 41, 63' : '15, 157, 107';
    gradient.addColorStop(0, `rgba(${rgb}, 0.20)`);
    gradient.addColorStop(0.7, `rgba(${rgb}, 0.04)`);
    gradient.addColorStop(1, `rgba(${rgb}, 0.0)`);
    return gradient;
  };

  return (
    <div className="mb-5 space-y-3.5 border-b border-divider/80 pb-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="text-sm font-semibold text-ink">روند کیف پول</p>
          {(percent !== null || delta !== null) && (
            <div
              className={`inline-flex flex-wrap items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${
                isLoss ? 'bg-loss/10' : 'bg-gain/10'
              }`}
            >
              <PercentValue value={percent} className="text-xs" />
              <span className="text-divider-strong" aria-hidden>
                ·
              </span>
              <MoneyValue value={delta} signed tone="auto" className="text-xs" />
            </div>
          )}
        </div>
        {portfolio.wallets.length > 1 ? (
          <div className="max-w-full">
            <Select aria-label="کیف پول نمودار" value={wallet.holding.id} onChange={(e) => setWalletId(e.target.value)}>
              {portfolio.wallets.map((w) => (
                <option key={w.holding.id} value={w.holding.id}>
                  {w.holding.label}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <span className="rounded-full bg-surface-2/80 px-2.5 py-1 text-xs font-medium text-muted">
            {wallet.holding.label}
          </span>
        )}
      </div>

      {error && <Notice tone="warn">{error}</Notice>}
      {!supported && <p className="py-4 text-xs text-muted">نمودار برای این مجموعهٔ دارایی در دسترس نیست.</p>}
      {busy && <div className="skeleton h-48 rounded-2xl" aria-label="دریافت نمودار" />}
      {!busy && data && points.length < 2 && <p className="py-6 text-xs text-muted">دادهٔ کافی برای نمودار دریافت نشد.</p>}
      {!busy && points.length > 1 && (
        <div
          className="relative h-48 min-w-0 w-full overflow-hidden rounded-2xl bg-gradient-to-b from-surface-2/30 to-transparent px-1 pt-2 md:h-60"
          role="img"
          aria-label={`نمودار ارزش کیف پول ${wallet.holding.label}؛ ${periods.find((p) => p[0] === period)?.[1]}`}
        >
          <Line
            style={{ maxWidth: '100%' }}
            data={{
              labels,
              datasets: [
                {
                  label: 'ارزش کیف پول',
                  data: points.map((p) => p[1]),
                  borderColor: color,
                  backgroundColor: areaFill,
                  borderWidth: 2.25,
                  pointRadius: 0,
                  pointHoverRadius: 5,
                  pointHoverBackgroundColor: color,
                  pointHoverBorderWidth: 2,
                  tension: 0.25,
                  fill: true
                }
              ]
            }}
            options={{
              ...base,
              animation: false,
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: {
                ...base.plugins,
                legend: { display: false },
                tooltip: {
                  ...base.plugins?.tooltip,
                  callbacks: { label: (ctx) => fmtUSD(ctx.parsed.y) }
                }
              },
              scales: { x: { display: false }, y: { display: false } }
            }}
          />
        </div>
      )}

      <div
        className="inline-flex flex-wrap gap-1 rounded-xl bg-surface-2/75 p-1"
        role="group"
        aria-label="بازهٔ نمودار"
      >
        {periods.map(([id, label]) => {
          const active = period === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => setPeriod(id)}
              className={`min-h-8 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all duration-150 ${
                active
                  ? 'bg-card text-accent shadow-sm ring-1 ring-divider/80'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
