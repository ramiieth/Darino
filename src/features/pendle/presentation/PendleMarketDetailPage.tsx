/**
 * Pendle market detail — primary yield first, then market depth, history,
 * yield breakdown and technical specification.
 * ⚠️ View only; every action links to the official Pendle app.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, Copy, ExternalLink, Star } from 'lucide-react';
import { Chart as ChartJS, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { PageHeader, Page } from '@/shared/components/layout/Page';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { Badge } from '@/shared/components/ui/Badge';
import { Button, buttonClass } from '@/shared/components/ui/Button';
import { KeyValueList, Metric, MetricGrid, MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { usePendleMarkets } from '@/features/pendle/data/usePendleMarkets';
import { fetchMarketHistory, type PendleHistoryPoint } from '@/features/pendle/data/pendleService';
import { chainName, fmtExpiry, pendleMarketLink } from '@/features/pendle/domain/pendle';
import { useWatchlistStore } from '@/shared/store/watchlistStore';
import { axisUsd, baseChartOptions, cssColor } from '@/shared/design/chartTheme';
import { fmtUSD, toFaDigits } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler);

const FA_TIME = new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric' });

export function PendleMarketDetailPage() {
  const { chainId, address } = useParams<{ chainId: string; address: string }>();
  const { markets, loading } = usePendleMarkets();
  const [history, setHistory] = useState<PendleHistoryPoint[] | null>(null);
  const [histLoading, setHistLoading] = useState(true);
  const watch = useWatchlistStore((s) => s.items);
  const toggleWatch = useWatchlistStore((s) => s.toggle);

  const market = useMemo(
    () => markets.find((m) => m.address.toLowerCase() === (address ?? '').toLowerCase()),
    [markets, address]
  );

  useEffect(() => {
    let cancelled = false;
    if (!chainId || !address) return;
    setHistLoading(true);
    fetchMarketHistory(Number(chainId), address)
      .then((h) => !cancelled && setHistory(h.length > 1 ? h : null))
      .catch(() => !cancelled && setHistory(null))
      .finally(() => !cancelled && setHistLoading(false));
    return () => {
      cancelled = true;
    };
  }, [chainId, address]);

  if (loading) {
    return (
      <Page>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }

  if (!market) {
    return (
      <Page>
        <PageHeader back={{ label: 'بازارهای پندل', to: '/pendle' }} title="بازار یافت نشد" />
        <EmptyState
          message="این بازار در فهرست بازارهای فعال نیست"
          hint="ممکن است سررسید شده باشد یا ارزش قفل‌شده آن کمتر از حد نمایش باشد."
        />
      </Page>
    );
  }

  const m = market;
  const fav = watch[`pendle:${m.address}`] !== undefined;
  const labels = (history ?? []).map((h) => FA_TIME.format(new Date(h.timestamp)));

  const apyRows = [
    { label: 'بازده سالانه ثابت', value: m.fixedApyPct, emphasis: true },
    { label: 'بازده سالانه دارایی پایه', value: m.underlyingApyPct },
    { label: 'بازده نقدینگی', value: m.lpApyPct },
    { label: 'بازده توکن بازده', value: m.ytApyPct },
    { label: 'نرخ پاداش سالانه', value: m.rewardAprPct },
    { label: 'بازده سالانه کارمزد سواپ', value: m.swapFeeApyPct },
    { label: 'بازده کل ', value: m.totalApyPct }
  ];

  return (
    <Page>
      <PageHeader
        back={{ label: 'بازارهای پندل', to: '/pendle' }}
        eyebrow={`${m.protocol} · ${chainName(m.chainId)}`}
        title={<bdi dir="ltr">{m.name}</bdi>}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              aria-pressed={fav}
              icon={<Star className={cn(fav && 'fill-current text-gold')} />}
              onClick={() => void toggleWatch(`pendle:${m.address}`)}
            >
              {fav ? 'در لیست پیگیری' : 'پیگیری'}
            </Button>
            <a href={pendleMarketLink(m.chainId, m.address)} target="_blank" rel="noreferrer" className={buttonClass('primary', 'sm')}>
              مشاهده در Pendle
              <ExternalLink />
            </a>
          </>
        }
      />

      {/* primary yield + market depth */}
      <Surface variant="focal" className="p-5 md:p-7">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-semibold text-muted">بازده سالانه ثابت (ضمنی)</p>
            <p className="mt-1 text-4xl font-extrabold tracking-tight text-ink md:text-5xl">
              <PercentValue value={m.fixedApyPct} signed={false} tone="none" />
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
              سررسید {fmtExpiry(m.expiry)}
              {m.daysToExpiry !== null && <Badge tone="brand">{toFaDigits(m.daysToExpiry)} روز مانده</Badge>}
              <Badge tone="neutral" ltr>{m.marketType}</Badge>
            </p>
          </div>
          {m.ptDiscountPct !== null && (
            <Metric
              size="md"
              align="end"
              label="تخفیف توکن اصل نسبت به دارایی پایه"
              value={<PercentValue value={m.ptDiscountPct} signed={false} tone="none" />}
            />
          )}
        </div>
        <MetricGrid cols={3} className="mt-6 border-t border-divider pt-5">
          <Metric size="md" label="ارزش قفل‌شده" value={<MoneyValue value={m.details.totalTvl} compact />} />
          <Metric size="md" label="نقدشوندگی" value={<MoneyValue value={m.details.liquidity} compact />} />
          <Metric size="md" label="حجم ۲۴ ساعت" value={<MoneyValue value={m.details.tradingVolume} compact />} />
        </MetricGrid>
      </Surface>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* history */}
        <div className="space-y-6 lg:col-span-8">
          {histLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : history ? (
            <>
              <HistoryChart
                title="بازده سالانه ضمنی — ۹۰ روز"
                labels={labels}
                data={history.map((h) => h.impliedApy * 100)}
                format={(v) => `${toFaDigits(v.toFixed(2))}٪`}
                color="chart-1"
              />
              <HistoryChart
                title="ارزش قفل‌شده — ۹۰ روز"
                labels={labels}
                data={history.map((h) => h.tvl)}
                format={(v) => fmtUSD(v, true)}
                axis={axisUsd}
                color="chart-2"
              />
            </>
          ) : (
            <Notice tone="neutral">داده تاریخی برای این بازار در دسترس نیست.</Notice>
          )}
        </div>

        {/* yield breakdown */}
        <div className="space-y-6 lg:col-span-4">
          <Section id="yield" title="تفکیک بازده" headingLevel={2}>
            <Surface className="px-4">
              <KeyValueList
                rows={apyRows.map((r) => ({
                  label: r.label,
                  emphasis: r.emphasis,
                  value: <PercentValue value={r.value} signed={false} tone="none" />
                }))}
              />
            </Surface>
          </Section>
          {m.lpApyBreakdown?.categories?.length > 0 && (
            <Section id="lp-breakdown" title="اجزای بازده نقدینگی" headingLevel={2}>
              <Surface className="px-4">
                <KeyValueList
                  dense
                  rows={m.lpApyBreakdown.categories.map((c) => ({
                    label: c.label,
                    value: <PercentValue value={c.apy * 100} signed={false} tone="none" />
                  }))}
                />
              </Surface>
            </Section>
          )}
        </div>
      </div>

      <Section id="spec" title="مشخصات فنی">
        <Surface className="px-4 md:px-6">
          <dl className="grid divide-y divide-divider md:grid-cols-2 md:gap-x-10 md:divide-y-0">
            <Spec label="PT" value={m.pt} copy />
            <Spec label="YT" value={m.yt} copy />
            <Spec label="SY" value={m.sy} copy />
            <Spec label="دارایی پایه" value={m.underlyingAsset} copy />
            <Spec label="آدرس بازار" value={m.address} copy />
            <Spec label="زنجیره" value={`${chainName(m.chainId)} (${m.chainId})`} />
            <Spec label="پروتکل" value={m.protocol} />
            <Spec label="کارمزد" value={m.details.feeRate ? `${toFaDigits((m.details.feeRate * 100).toFixed(2))}٪` : '—'} />
          </dl>
        </Surface>
      </Section>

      <p className="text-xs text-subtle">داده‌ها از سرویس رسمی پندل. بازده اعلام‌شده یا گذشته تضمینی برای آینده نیست.</p>
    </Page>
  );
}

function HistoryChart({
  title,
  labels,
  data,
  format,
  axis,
  color
}: {
  title: string;
  labels: string[];
  data: number[];
  format: (v: number) => string;
  axis?: (v: number) => string;
  color: 'chart-1' | 'chart-2';
}) {
  const line = cssColor(color);
  const options = baseChartOptions({ formatTooltip: (v) => format(v), formatY: axis ?? format });
  return (
    <Surface className="p-4 md:p-5">
      <h3 className="mb-3 text-sm font-bold text-ink">{title}</h3>
      <div className="h-56" dir="ltr">
        <Line
          data={{
            labels,
            datasets: [
              {
                data,
                borderColor: line,
                backgroundColor: cssColor(color, 0.08),
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
                tension: 0.25,
                fill: true
              }
            ]
          }}
          options={options as never}
        />
      </div>
    </Surface>
  );
}

function shorten(v: string): string {
  // chain-prefixed ids ("1-0xabc…") and addresses keep head + tail
  return v.length > 20 ? `${v.slice(0, 10)}…${v.slice(-6)}` : v;
}

function Spec({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 py-3 md:border-b md:border-divider">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5">
        <bdi dir="ltr" title={value} className="truncate font-mono text-sm text-ink">
          {copy ? shorten(value) : value}
        </bdi>
        {copy && value && (
          <button
            type="button"
            aria-label={`کپی ${label}`}
            onClick={() => {
              void navigator.clipboard?.writeText(value).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-subtle hover:bg-surface-2 hover:text-ink"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-positive" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </dd>
    </div>
  );
}
