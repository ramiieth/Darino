/**
 * TVL Flow Analytics Dashboard — تحلیل جریان سرمایه دیفای
 *
 *  - خلاصه مدیریتی: بیشترین ورود/خروج سرمایه در هر بازه
 *  - تحلیل زنجیره‌ها: TVL فعلی + تغییر ۷/۳۰/۹۰/۱۸۰/۳۶۵ روزه (دلاری + درصدی + روند + نمودار)
 *  - Heatmap زنجیره‌ها (سبز=ورود، قرمز=خروج، خاکستری=بدون تغییر)
 *  - تحلیل پروتکل‌ها: TVL + تغییر ۱/۷ روزه + رتبه + مرتب‌سازی
 *  - Smart Money Flow: محل ورود/خروج سرمایه هوشمند
 * داده فقط از DefiLlama API — بدون Hardcode
 */
import { useMemo, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Flame,
  Snowflake,
  Grid3X3,
  Layers,
  Search
} from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { ErrorState } from '@/shared/components/ui/StateViews';
import { useTvlFlow, loadTvlFlow, ensureChainHistory, resetTvlFlowLoad } from '@/features/defi/data/useTvlFlow';
import { FreshnessBar } from '@/shared/components/ui/FreshnessBar';
import { Sparkline } from './Sparkline';
import {
  FLOW_PERIODS,
  FLOW_COLORS,
  FLOW_LABEL,
  flowLevel,
  rankByUsd,
  downsample,
  type FlowPeriod,
  type PeriodChange
} from '@/features/defi/domain/tvlFlow';
import { fmtUSD, fmtPct, fmtInt } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

type PeriodKey = '7' | '30' | '90' | '180' | '365';

const PERIOD_LABEL: Record<PeriodKey, string> = {
  '7': '۷ روزه',
  '30': '۳۰ روزه',
  '90': '۹۰ روزه',
  '180': '۱۸۰ روزه',
  '365': '۳۶۵ روزه'
};

const PERIOD_OPTS = (Object.keys(PERIOD_LABEL) as PeriodKey[]).map((p) => ({
  value: p,
  label: PERIOD_LABEL[p]
}));

const periodNum = (k: PeriodKey): FlowPeriod => Number(k) as FlowPeriod;

function ChangeBadge({ c }: { c: PeriodChange | null | undefined }) {
  if (!c) return <span className="text-[10px] font-bold text-muted/60">—</span>;
  return (
    <span
      className={cn(
        'num-ltr text-[10px] font-black',
        c.trend === 'up' ? 'text-positive' : c.trend === 'down' ? 'text-negative' : 'text-muted'
      )}
    >
      {c.trend === 'up' ? '▲' : c.trend === 'down' ? '▼' : '•'} {fmtPct(c.pct)}
      <span className="text-[8px] font-bold text-muted"> {fmtUSD(Math.abs(c.usd), true)}</span>
    </span>
  );
}

/** سلول خلاصه مدیریتی */
function SummaryCard({
  period,
  inflow,
  outflow
}: {
  period: FlowPeriod;
  inflow: { name: string; c: PeriodChange } | null;
  outflow: { name: string; c: PeriodChange } | null;
}) {
  return (
    <GlassCard variant="soft" className="p-2.5">
      <p className="text-[9px] font-black text-muted">{PERIOD_LABEL[period]}</p>
      <div className="mt-1 flex items-center gap-1 text-[10px] font-bold">
        <TrendingUp className="h-3 w-3 text-positive" />
        <span className="text-muted">ورود:</span>
        {inflow ? (
          <span className="num-ltr truncate text-positive">
            {inflow.name} {fmtUSD(inflow.c.usd, true)}
          </span>
        ) : (
          <span className="text-muted/60">—</span>
        )}
      </div>
      <div className="mt-0.5 flex items-center gap-1 text-[10px] font-bold">
        <TrendingDown className="h-3 w-3 text-negative" />
        <span className="text-muted">خروج:</span>
        {outflow ? (
          <span className="num-ltr truncate text-negative">
            {outflow.name} {fmtUSD(Math.abs(outflow.c.usd), true)}
          </span>
        ) : (
          <span className="text-muted/60">—</span>
        )}
      </div>
    </GlassCard>
  );
}

export function TvlFlowDashboard() {
  const { chains, protocols, loading, error, syncProgress, loadedAt } = useTvlFlow();
  const [tab, setTab] = useState<'summary' | 'chains' | 'heatmap' | 'protocols' | 'smart'>('summary');
  const [period, setPeriod] = useState<PeriodKey>('7');
  const [chainQuery, setChainQuery] = useState('');
  const [protoQuery, setProtoQuery] = useState('');
  const [protoSort, setProtoSort] = useState<'tvl' | 'grow7' | 'drop7' | 'grow1' | 'drop1'>('tvl');

  /* ---------- خلاصه مدیریتی ---------- */
  const summaries = useMemo(() => {
    const withHist = chains.filter((c) => c.history);
    return FLOW_PERIODS.map((p) => {
      const { inflow, outflow } = rankByUsd(withHist, (c) => c.changes[p]);
      const top = inflow[0];
      const bot = outflow[0];
      return {
        period: p,
        inflow: top ? { name: top.name, c: top.changes[p] as PeriodChange } : null,
        outflow: bot ? { name: bot.name, c: bot.changes[p] as PeriodChange } : null
      };
    });
  }, [chains]);

  /* ---------- زنجیره‌ها ---------- */
  const chainRows = useMemo(() => {
    const q = chainQuery.trim().toLowerCase();
    const list = chains.filter((c) => !q || c.name.toLowerCase().includes(q));
    // مرتب‌سازی بر اساس بازه انتخابی (بیشترین تغییر دلاری)
    const pn = periodNum(period);
    const sorted = [...list].sort((a, b) => {
      const ca = a.changes[pn];
      const cb = b.changes[pn];
      const va = ca ? ca.usd : -Infinity;
      const vb = cb ? cb.usd : -Infinity;
      return vb - va;
    });
    return sorted.slice(0, 60);
  }, [chains, period, chainQuery]);

  /* ---------- Heatmap ---------- */
  const heatChains = useMemo(
    () => chains.filter((c) => c.history && c.tvl > 1_000_000).slice(0, 80),
    [chains]
  );

  /* ---------- پروتکل‌ها ---------- */
  const protoRows = useMemo(() => {
    const q = protoQuery.trim().toLowerCase();
    let list = protocols.filter((p) => p.t > 0 && (!q || p.n.toLowerCase().includes(q) || p.s.includes(q)));
    list = [...list].sort((a, b) => {
      switch (protoSort) {
        case 'grow7':
          return (b.c7 ?? -Infinity) - (a.c7 ?? -Infinity);
        case 'drop7':
          return (a.c7 ?? Infinity) - (b.c7 ?? Infinity);
        case 'grow1':
          return (b.c1 ?? -Infinity) - (a.c1 ?? -Infinity);
        case 'drop1':
          return (a.c1 ?? Infinity) - (b.c1 ?? Infinity);
        default:
          return b.t - a.t;
      }
    });
    return list.slice(0, 60);
  }, [protocols, protoSort, protoQuery]);

  /* ---------- Smart Money ---------- */
  const smart = useMemo(() => {
    const withHist = chains.filter((c) => c.history && c.tvl > 5_000_000);
    const { inflow, outflow } = rankByUsd(withHist, (c) => c.changes[7]);
    const protos = protocols.filter((p) => p.t > 10_000_000 && p.c7 !== null);
    const protoIn = [...protos].sort((a, b) => (b.c7 ?? 0) - (a.c7 ?? 0)).slice(0, 5);
    const protoOut = [...protos].sort((a, b) => (a.c7 ?? 0) - (b.c7 ?? 0)).slice(0, 5);
    return {
      chainIn: inflow.slice(0, 5),
      chainOut: outflow.slice(0, 5),
      protoIn,
      protoOut
    };
  }, [chains, protocols]);

  if (loading && chains.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-2xl" />
        ))}
      </div>
    );
  }
  if (error && chains.length === 0) {
    return <ErrorState message="ارتباط با DefiLlama برقرار نشد" onRetry={() => void loadTvlFlow()} />;
  }

  return (
    <div className="space-y-3">
      <FreshnessBar
        loadedAt={loadedAt}
        error={error}
        syncing={syncProgress !== null}
        sourceLabel="DefiLlama API"
        autoMs={5 * 60_000}
        onRefresh={() => {
          resetTvlFlowLoad();
          void loadTvlFlow();
        }}
      />

      {/* نوار پیشرفت همگام‌سازی تاریخچه */}
      {syncProgress && (
        <div className="glass-soft flex items-center gap-2 rounded-2xl px-3.5 py-2">
          <Activity className="h-3.5 w-3.5 animate-pulse text-accent" />
          <p className="flex-1 text-[10px] font-bold text-muted">
            همگام‌سازی تاریخچه زنجیره‌ها: {syncProgress.done}/{syncProgress.total}
          </p>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line/10">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${(syncProgress.done / Math.max(1, syncProgress.total)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* سوییچ بخش‌ها */}
      <SegmentedControl
        options={[
          { value: 'summary' as const, label: 'خلاصه', icon: <Activity className="h-3.5 w-3.5" /> },
          { value: 'chains' as const, label: 'زنجیره‌ها', icon: <Layers className="h-3.5 w-3.5" /> },
          { value: 'heatmap' as const, label: 'نقشه حرارتی', icon: <Grid3X3 className="h-3.5 w-3.5" /> },
          { value: 'protocols' as const, label: 'پروتکل‌ها', icon: <Flame className="h-3.5 w-3.5" /> },
          { value: 'smart' as const, label: 'جریان هوشمند', icon: <Snowflake className="h-3.5 w-3.5" /> }
        ]}
        value={tab}
        onChange={setTab}
      />

      {/* ================= خلاصه مدیریتی ================= */}
      {tab === 'summary' && (
        <>
          <p className="text-[11px] font-bold text-muted">
            بیشترین ورود و خروج سرمایه در هر بازه (بر اساس تغییر دلاری TVL)
          </p>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {summaries.map((s) => (
              <SummaryCard key={s.period} period={s.period} inflow={s.inflow} outflow={s.outflow} />
            ))}
          </div>
          <GlassCard variant="soft" className="p-3.5">
            <p className="text-[11px] font-bold leading-5 text-muted">
              <span className="font-black text-ink">جریان سرمایه (Capital Rotation):</span> با مقایسه
              تغییر TVL در بازه‌های مختلف، می‌توان تشخیص داد سرمایه به کدام زنجیره/پروتکل وارد و از
              کدام خارج می‌شود. ورود مداوم در ۷/۳۰/۹۰ روز = روند صعودی پایدار؛ خروج همزمان در چند
              بازه = خروج واقعی سرمایه (نه نوسان قیمت).
            </p>
          </GlassCard>
        </>
      )}

      {/* ================= زنجیره‌ها ================= */}
      {tab === 'chains' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                value={chainQuery}
                onChange={(e) => setChainQuery(e.target.value)}
                placeholder="جستجوی زنجیره…"
                className="glass-inset h-10 w-full rounded-2xl ps-9 pe-3 text-[11px] font-bold text-ink outline-none placeholder:text-muted/60 focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <SegmentedControl options={PERIOD_OPTS} value={period} onChange={setPeriod} className="max-w-sm" />
          </div>

          <GlassCard variant="soft" className="p-2">
            <div className="space-y-0.5">
              {chainRows.map((c) => {
                const ch = c.changes[period];
                const positive = ch ? ch.trend === 'up' : true;
                return (
                  <button
                    key={c.name}
                    onClick={() => void ensureChainHistory(c.name)}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-start transition-colors hover:bg-line/5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-extrabold text-ink">{c.name}</p>
                      <p className="num-ltr text-[9px] font-bold text-muted">
                        TVL {fmtUSD(c.tvl, true)}
                      </p>
                    </div>
                    {c.history ? (
                      <span className="w-20 shrink-0 sm:w-24">
                        <Sparkline points={downsample(c.history, 40)} positive={positive} />
                      </span>
                    ) : (
                      <span className="w-20 text-center text-[9px] text-muted/60 sm:w-24">
                        {c.loadingHist ? '…' : 'تاریخچه'}
                      </span>
                    )}
                    <div className="w-[92px] shrink-0 text-end sm:w-28">
                      <ChangeBadge c={ch} />
                    </div>
                  </button>
                );
              })}
              {chainRows.length === 0 && (
                <p className="py-6 text-center text-[11px] font-medium text-muted">زنجیره‌ای یافت نشد</p>
              )}
            </div>
          </GlassCard>
          <p className="text-center text-[9px] font-medium text-muted/70">
            کلیک روی هر زنجیره = بارگذاری تاریخچه (در صورت نبود) · {fmtInt(chains.length)} زنجیره فعال
          </p>
        </>
      )}

      {/* ================= Heatmap ================= */}
      {tab === 'heatmap' && (
        <>
          <SegmentedControl options={PERIOD_OPTS} value={period} onChange={setPeriod} />
          <GlassCard variant="soft" className="p-3.5">
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              {([4, 3, 0, 2, 1] as const).map((l) => (
                <span key={l} className="flex items-center gap-1 text-[9px] font-bold text-muted">
                  <span className={cn('h-3 w-3 rounded', FLOW_COLORS[l])} /> {FLOW_LABEL[l]}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5">
              {heatChains.map((c) => {
                const ch = c.changes[periodNum(period)];
                const level = flowLevel(ch?.pct ?? null);
                return (
                  <div
                    key={c.name}
                    className={cn('flex flex-col items-center gap-0.5 rounded-xl px-1.5 py-2', FLOW_COLORS[level])}
                    title={`${c.name} — ${ch ? fmtPct(ch.pct) : 'ناموجود'}`}
                  >
                    <span className="w-full truncate text-center text-[9px] font-black">{c.name}</span>
                    <span className="num-ltr text-[8px] font-bold opacity-90">
                      {ch ? fmtPct(ch.pct) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        </>
      )}

      {/* ================= پروتکل‌ها ================= */}
      {tab === 'protocols' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                value={protoQuery}
                onChange={(e) => setProtoQuery(e.target.value)}
                placeholder="جستجوی پروتکل…"
                className="glass-inset h-10 w-full rounded-2xl ps-9 pe-3 text-[11px] font-bold text-ink outline-none placeholder:text-muted/60 focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <select
              value={protoSort}
              onChange={(e) => setProtoSort(e.target.value as typeof protoSort)}
              className="glass-inset h-10 rounded-2xl px-2 text-[10px] font-bold text-ink outline-none"
            >
              <option value="tvl">بیشترین TVL</option>
              <option value="grow7">بیشترین رشد (۷ روزه)</option>
              <option value="drop7">بیشترین افت (۷ روزه)</option>
              <option value="grow1">سریع‌ترین ورود (۱ روزه)</option>
              <option value="drop1">سریع‌ترین خروج (۱ روزه)</option>
            </select>
          </div>

          <GlassCard variant="soft" className="p-2">
            <div className="space-y-0.5">
              {protoRows.map((p) => {
                const up = (p.c7 ?? 0) >= 0;
                return (
                  <div key={p.s} className="flex items-center gap-2 rounded-xl px-2.5 py-2 hover:bg-line/5">
                    {p.lg ? (
                      <img
                        src={p.lg}
                        alt={p.n}
                        loading="lazy"
                        className="h-6 w-6 shrink-0 rounded-full bg-card object-contain ring-1 ring-line/10"
                        onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                      />
                    ) : (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-line/10 text-[9px] font-black text-muted">
                        {p.n.slice(0, 1)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-extrabold text-ink">{p.n}</p>
                      <p className="truncate text-[8px] font-medium text-muted">
                        {p.cat} · {p.ch} · TVL {fmtUSD(p.t, true)}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className={cn('num-ltr text-[10px] font-black', up ? 'text-positive' : 'text-negative')}>
                        {p.c7 !== null ? `${up ? '+' : ''}${fmtPct(p.c7)}` : '—'}
                      </p>
                      <p className="num-ltr text-[8px] font-bold text-muted">
                        ۱ روزه: {p.c1 !== null ? fmtPct(p.c1) : '—'}
                      </p>
                    </div>
                  </div>
                );
              })}
              {protoRows.length === 0 && (
                <p className="py-6 text-center text-[11px] font-medium text-muted">پروتکلی یافت نشد</p>
              )}
            </div>
          </GlassCard>
          <p className="text-center text-[9px] font-medium text-muted/70">
            داده‌های بلندمدت پروتکل‌ها در API عمومی DefiLlama در دسترس نیست (فقط ۱/۷ روز) — برای
            بازه‌های بلندتر، تحلیل زنجیره‌ها را ببینید
          </p>
        </>
      )}

      {/* ================= Smart Money ================= */}
      {tab === 'smart' && (
        <>
          <GlassCard variant="soft" className="p-3.5">
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-black text-ink">
              <Snowflake className="h-4 w-4 text-accent" /> سرمایه هوشمند به کجا می‌رود؟
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="rounded-2xl bg-positive/5 p-3">
                <p className="mb-1.5 flex items-center gap-1 text-[10px] font-black text-positive">
                  <TrendingUp className="h-3.5 w-3.5" /> ورود سرمایه — زنجیره‌ها (۷ روزه)
                </p>
                {smart.chainIn.map((c, i) => {
                  const ch = c.changes[7] as PeriodChange;
                  return (
                    <div key={c.name} className="flex items-center justify-between py-1 text-[10px] font-bold">
                      <span className="text-ink">{i + 1}. {c.name}</span>
                      <span className="num-ltr text-positive">+{fmtUSD(ch.usd, true)} ({fmtPct(ch.pct)})</span>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-2xl bg-negative/5 p-3">
                <p className="mb-1.5 flex items-center gap-1 text-[10px] font-black text-negative">
                  <TrendingDown className="h-3.5 w-3.5" /> خروج سرمایه — زنجیره‌ها (۷ روزه)
                </p>
                {smart.chainOut.map((c, i) => {
                  const ch = c.changes[7] as PeriodChange;
                  return (
                    <div key={c.name} className="flex items-center justify-between py-1 text-[10px] font-bold">
                      <span className="text-ink">{i + 1}. {c.name}</span>
                      <span className="num-ltr text-negative">−{fmtUSD(Math.abs(ch.usd), true)} ({fmtPct(ch.pct)})</span>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-2xl bg-positive/5 p-3">
                <p className="mb-1.5 flex items-center gap-1 text-[10px] font-black text-positive">
                  <Flame className="h-3.5 w-3.5" /> ورود سرمایه — پروتکل‌ها (۷ روزه)
                </p>
                {smart.protoIn.map((p, i) => (
                  <div key={p.s} className="flex items-center justify-between py-1 text-[10px] font-bold">
                    <span className="truncate text-ink">{i + 1}. {p.n}</span>
                    <span className="num-ltr shrink-0 text-positive">+{fmtPct(p.c7 ?? 0)}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl bg-negative/5 p-3">
                <p className="mb-1.5 flex items-center gap-1 text-[10px] font-black text-negative">
                  <Snowflake className="h-3.5 w-3.5" /> خروج سرمایه — پروتکل‌ها (۷ روزه)
                </p>
                {smart.protoOut.map((p, i) => (
                  <div key={p.s} className="flex items-center justify-between py-1 text-[10px] font-bold">
                    <span className="truncate text-ink">{i + 1}. {p.n}</span>
                    <span className="num-ltr shrink-0 text-negative">{fmtPct(p.c7 ?? 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>
          <p className="text-center text-[9px] font-medium text-muted/70">
            «سرمایه هوشمند» = بزرگ‌ترین تغییرات مطلق TVL (ورود/خروج واقعی سرمایه، نه نوسان قیمت)
          </p>
        </>
      )}
    </div>
  );
}
