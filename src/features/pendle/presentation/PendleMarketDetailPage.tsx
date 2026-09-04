/**
 * صفحه جزئیات بازار Pendle — نمودار قیمت/APY/TVL + تفکیک APY + مشخصات کامل
 * ⚠️ فقط مشاهده؛ لینک رسمی Pendle برای هر اقدام
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, ExternalLink, RefreshCw } from 'lucide-react';
import { Chart as ChartJS, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { PageHeader } from '@/shared/components/layout/Page';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { usePendleMarkets } from '@/features/pendle/data/usePendleMarkets';
import { fetchMarketHistory, type PendleHistoryPoint } from '@/features/pendle/data/pendleService';
import { chainName, fmtExpiry, pendleMarketLink, PENDLE_SORT_LABELS, type PendleSortKey } from '@/features/pendle/domain/pendle';
import { fmtUSD, fmtPct, fmtInt } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler);

const FA_TIME = new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric' });

export function PendleMarketDetailPage() {
  const { chainId, address } = useParams<{ chainId: string; address: string }>();
  const navigate = useNavigate();
  const { markets, loading } = usePendleMarkets();
  const [history, setHistory] = useState<PendleHistoryPoint[] | null>(null);
  const [histLoading, setHistLoading] = useState(true);

  const market = useMemo(
    () => markets.find((m) => m.address.toLowerCase() === (address ?? '').toLowerCase()),
    [markets, address]
  );

  const loadHistory = async () => {
    if (!chainId || !address) return;
    setHistLoading(true);
    try {
      const h = await fetchMarketHistory(Number(chainId), address);
      setHistory(h.length > 1 ? h : null);
    } catch {
      setHistory(null);
    } finally {
      setHistLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId, address]);

  if (loading || !market) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  const m = market;
  const labels = (history ?? []).map((h) => FA_TIME.format(new Date(h.timestamp)));
  const chartData = (key: (h: PendleHistoryPoint) => number, color: string) => ({
    labels,
    datasets: [
      {
        label: 'ارزش',
        data: (history ?? []).map(key),
        borderColor: color,
        backgroundColor: color + '22',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.3,
        fill: true
      }
    ]
  });
  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { rtl: true, textDirection: 'rtl', callbacks: { label: (c: { parsed: { y: number } }) => ` ${fmtUSD(c.parsed.y, true)}` } }
    },
    scales: { x: { ticks: { maxTicksLimit: 6, font: { size: 8 } }, grid: { display: false } }, y: { grid: { color: 'rgba(148,163,184,0.1)' }, ticks: { font: { size: 8 } } } }
  } as never;

  const apyCards: { label: string; v: number | null; tone: 'pos' | 'neg' | 'accent' | 'neutral' }[] = [
    { label: 'APY ثابت (Fixed)', v: m.fixedApyPct, tone: 'accent' },
    { label: 'APY پایه (Underlying)', v: m.underlyingApyPct, tone: 'neutral' },
    { label: 'LP APY', v: m.lpApyPct, tone: 'pos' },
    { label: 'YT APY', v: m.ytApyPct, tone: 'pos' },
    { label: 'Reward APR', v: m.rewardAprPct, tone: 'pos' },
    { label: 'APY سواپ', v: m.swapFeeApyPct, tone: 'neutral' },
    { label: 'بازده کل', v: m.totalApyPct, tone: 'accent' },
    { label: 'تخفیف PT', v: m.ptDiscountPct, tone: m.ptDiscountPct !== null && m.ptDiscountPct >= 0 ? 'pos' : 'neg' }
  ];

  return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-[11px] font-bold text-accent">
        <ChevronRight className="h-3.5 w-3.5" /> بازگشت به بازارهای Pendle
      </button>

      <PageHeader title={m.name} subtitle={`${m.protocol} · ${chainName(m.chainId)} · ${fmtExpiry(m.expiry)}`} />

      {/* سربرگ */}
      <GlassCard animated className="flex items-center gap-3 p-4">
        {m.icon && <img src={m.icon} alt={m.name} className="h-12 w-12 shrink-0 rounded-full bg-card object-contain ring-1 ring-line/10" loading="lazy" referrerPolicy="no-referrer" />}
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-extrabold text-ink">{m.name}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="badge bg-info/10 text-info ring-1 ring-info/20">{m.marketType}</span>
            <span className="badge bg-line/5 text-muted ring-1 ring-line/10">{chainName(m.chainId)}</span>
            {m.daysToExpiry !== null && <span className="badge bg-accent/10 text-accent ring-1 ring-accent/20">{fmtInt(m.daysToExpiry)} روز تا سررسید</span>}
          </div>
        </div>
        <div className="shrink-0 text-end">
          <p className="num-ltr text-lg font-black text-accent">{fmtPct(m.fixedApyPct)}</p>
          <p className="text-[9px] font-bold text-muted">APY ثابت</p>
        </div>
      </GlassCard>

      {/* کارت‌های APY */}
      <div className="grid grid-cols-2 gap-2">
        {apyCards.map((c) => (
          <div key={c.label} className="glass-soft rounded-2xl p-3">
            <p className="text-[9px] font-bold text-muted">{c.label}</p>
            <p className={cn('num-ltr mt-1 text-[15px] font-black', c.tone === 'pos' ? 'text-positive' : c.tone === 'neg' ? 'text-negative' : c.tone === 'accent' ? 'text-accent' : 'text-ink')}>
              {c.v !== null ? fmtPct(c.v) : '—'}
            </p>
          </div>
        ))}
      </div>

      {/* KPI بازار */}
      <GlassCard className="grid grid-cols-3 gap-2 p-4">
        <Kpi label="TVL" value={fmtUSD(m.details.totalTvl, true)} />
        <Kpi label="نقدشوندگی" value={fmtUSD(m.details.liquidity, true)} />
        <Kpi label="حجم ۲۴h" value={fmtUSD(m.details.tradingVolume, true)} />
      </GlassCard>

      {/* نمودارهای تاریخی */}
      {histLoading && <Skeleton className="h-40 w-full rounded-2xl" />}
      {!histLoading && history && (
        <>
          <GlassCard className="p-4">
            <h4 className="mb-2 text-[11px] font-extrabold text-ink">روند TVL (۹۰ روز)</h4>
            <div className="h-36"><Line data={chartData((h) => h.tvl, '#0d9488')} options={chartOpts} /></div>
          </GlassCard>
          <GlassCard className="p-4">
            <h4 className="mb-2 text-[11px] font-extrabold text-ink">روند APY ضمنی (۹۰ روز)</h4>
            <div className="h-36"><Line data={chartData((h) => h.impliedApy * 100, '#8b5cf6')} options={chartOpts} /></div>
          </GlassCard>
        </>
      )}
      {!histLoading && !history && (
        <p className="glass-soft rounded-2xl px-4 py-3 text-center text-[10px] font-bold text-muted">
          داده تاریخی برای این بازار در دسترس نیست
        </p>
      )}

      {/* تفکیک APY */}
      {m.lpApyBreakdown?.categories?.length > 0 && (
        <GlassCard className="p-4">
          <h4 className="mb-2 text-[11px] font-extrabold text-ink">تفکیک LP APY</h4>
          <div className="space-y-1.5">
            {m.lpApyBreakdown.categories.map((c) => (
              <div key={c.label} className="flex items-center justify-between rounded-lg bg-line/[0.03] px-3 py-1.5">
                <span className="text-[10px] font-bold text-muted">{c.label}</span>
                <span className="num-ltr text-[11px] font-black text-positive">{fmtPct(c.apy * 100)}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* مشخصات کامل */}
      <GlassCard className="p-4">
        <h4 className="mb-2 text-[11px] font-extrabold text-ink">مشخصات کامل</h4>
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <Spec label="PT" value={m.pt} />
          <Spec label="YT" value={m.yt} />
          <Spec label="SY" value={m.sy} />
          <Spec label="دارایی پایه" value={m.underlyingAsset} />
          <Spec label="پروتکل" value={m.protocol} />
          <Spec label="زنجیره" value={`${chainName(m.chainId)} (${m.chainId})`} />
          <Spec label="سررسید" value={fmtExpiry(m.expiry)} />
          <Spec label="کارمزد" value={m.details.feeRate ? `${(m.details.feeRate * 100).toFixed(2)}٪` : '—'} />
        </div>
      </GlassCard>

      {/* لینک رسمی */}
      <a
        href={pendleMarketLink(m.chainId, m.address)}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-[12px] font-bold text-white shadow-glow"
      >
        <ExternalLink className="h-4 w-4" />
        مشاهده در Pendle (اقدامات رسمی)
      </a>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-[9px] font-bold text-muted">{label}</p>
      <p className="num-ltr mt-1 text-[14px] font-black text-ink">{value}</p>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-line/[0.03] px-2.5 py-1.5">
      <p className="text-[8px] font-bold text-muted">{label}</p>
      <p dir="ltr" className="tnum truncate text-[9px] font-bold text-ink">{value.slice(0, 22)}{value.length > 22 ? '…' : ''}</p>
    </div>
  );
}

export { PENDLE_SORT_LABELS as _PSL, type PendleSortKey as _SK };
