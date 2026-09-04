/**
 * DeFi Loop Explorer — Yield → Loop
 *  - همه پول‌های DeFiLlama Yields (Data-Driven — بدون Hardcode)
 *  - فیلترها: Chain / Project / Stablecoin / TVL / APY
 *  - بهترین فرصت‌ها بر اساس Opportunity Score (نه فقط APY)
 *  - کلیک روی هر پول → Calculator
 */
import { useMemo, useState } from 'react';
import { Search, Filter, Sparkles, Wallet } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { ErrorState } from '@/shared/components/ui/StateViews';
import { useYieldPools, loadYieldPools, ensurePoolChart } from '@/features/defi-loop/data/useYieldLoops';
import type { YieldPool } from '@/features/defi-loop/data/yieldsService';
import { computeApyStats, computeTvlStats, opportunityScore, riskIndicators, type RiskIndicator } from '@/features/defi-loop/domain/yieldAnalytics';
import { fmtPct, fmtUSD, fmtInt } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

export interface LoopRow {
  pool: YieldPool;
  score: number;
  apyStats: ReturnType<typeof computeApyStats>;
  tvlStats: ReturnType<typeof computeTvlStats>;
  risks: RiskIndicator[];
  /** سهم reward از کل APY */
  rewardDependency: number;
}

/** ساخت ردیف فرصت برای یک پول (با تاریخچه lazy) */
export async function buildLoopRow(pool: YieldPool): Promise<LoopRow> {
  const chart = await ensurePoolChart(pool.pool);
  const apyStats = computeApyStats(chart ?? [], pool.apy ?? 0);
  const tvlStats = computeTvlStats(chart ?? [], pool.tvlUsd ?? 0);
  const totalApy = pool.apy ?? 0;
  const rewardDep = totalApy > 0 ? (pool.apyReward ?? 0) / totalApy : 0;
  const score = opportunityScore({
    netApy: totalApy / 100,
    stability: apyStats.volatility !== null ? Math.max(0, Math.min(1, 1 - apyStats.volatility / 0.05)) : 0.5,
    tvlUsd: pool.tvlUsd ?? 0,
    liquidityScore: Math.min(1, (pool.tvlUsd ?? 0) / 50_000_000),
    rewardDependency: rewardDep,
    auditKnown: null,
    leverageRisk: 0.3,
    borrowCostRisk: 0.3,
    spike: apyStats.spikeDetected,
    outlier: pool.outlier,
    tvlDeclining: tvlStats.change30d !== null && tvlStats.change30d < -10
  });
  const risks = riskIndicators({
    leverage: 1,
    borrowApy: null,
    rewardApy: pool.apyReward,
    totalApy: totalApy,
    tvlUsd: pool.tvlUsd ?? 0,
    tvlChange30d: tvlStats.change30d,
    volatility: apyStats.volatility,
    apySpike: apyStats.spikeDetected,
    outlier: pool.outlier
  });
  return { pool, score, apyStats, tvlStats, risks, rewardDependency: rewardDep };
}

function PoolCard({ row, onOpen }: { row: LoopRow; onOpen: () => void }) {
  const p = row.pool;
  const total = p.apy ?? 0;
  return (
    <button onClick={onOpen} className="w-full text-start">
      <GlassCard variant="soft" className="p-3 transition-all hover:bg-line/5">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-extrabold text-ink">
              {p.project} · {p.symbol}
            </p>
            <p className="truncate text-[9px] font-medium text-muted">
              {p.chain} · TVL {fmtUSD(p.tvlUsd, true)}
              {p.poolMeta ? ` · ${p.poolMeta}` : ''}
            </p>
          </div>
          <div className="shrink-0 text-end">
            <p className="num-ltr text-[15px] font-black text-accent">{Math.round(row.score)}</p>
            <p className="text-[8px] font-bold text-muted">امتیاز</p>
          </div>
        </div>

        {/* اجزای APY */}
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-[9px] font-bold">
          <div className="rounded-lg bg-line/5 px-2 py-1">
            <p className="text-muted">کل APY</p>
            <p className={cn('num-ltr', total >= 0 ? 'text-positive' : 'text-negative')}>{fmtPct(total)}</p>
          </div>
          <div className="rounded-lg bg-line/5 px-2 py-1">
            <p className="text-muted">پایه (Intrinsic)</p>
            <p className="num-ltr text-ink">{p.apyBase !== null ? fmtPct(p.apyBase) : 'N/A'}</p>
          </div>
          <div className="rounded-lg bg-line/5 px-2 py-1">
            <p className="text-muted">Reward</p>
            <p className="num-ltr text-ink">{p.apyReward !== null ? fmtPct(p.apyReward) : 'N/A'}</p>
          </div>
          <div className="rounded-lg bg-line/5 px-2 py-1">
            <p className="text-muted">میانگین ۳۰d</p>
            <p className="num-ltr text-ink">{row.apyStats.avg30d !== null ? fmtPct(row.apyStats.avg30d) : 'N/A'}</p>
          </div>
          <div className="rounded-lg bg-line/5 px-2 py-1">
            <p className="text-muted">تغییر TVL ۳۰d</p>
            <p className={cn('num-ltr', (row.tvlStats.change30d ?? 0) >= 0 ? 'text-positive' : 'text-negative')}>
              {row.tvlStats.change30d !== null ? `${row.tvlStats.change30d >= 0 ? '+' : ''}${fmtPct(row.tvlStats.change30d)}` : 'N/A'}
            </p>
          </div>
          <div className="rounded-lg bg-line/5 px-2 py-1">
            <p className="text-muted">نوسان APY</p>
            <p className="num-ltr text-ink">{row.apyStats.volatility !== null ? fmtPct(row.apyStats.volatility) : 'N/A'}</p>
          </div>
        </div>

        {/* هشدارها */}
        {row.risks.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {row.risks.slice(0, 3).map((r, i) => (
              <span
                key={i}
                className={cn(
                  'badge ring-1',
                  r.severity === 'critical'
                    ? 'bg-negative/10 text-negative ring-negative/20'
                    : r.severity === 'warning'
                      ? 'bg-warn/10 text-warn ring-warn/20'
                      : 'bg-line/5 text-muted ring-line/10'
                )}
              >
                {r.label}
              </span>
            ))}
          </div>
        )}
      </GlassCard>
    </button>
  );
}

export function LoopExplorer({ onOpenPool }: { onOpenPool: (pool: YieldPool) => void }) {
  const { pools, loading, error } = useYieldPools();
  const [q, setQ] = useState('');
  const [chain, setChain] = useState('همه');
  const [project, setProject] = useState('همه');
  const [stableOnly, setStableOnly] = useState(false);
  const [minTvl, setMinTvl] = useState(0);
  const [minApy, setMinApy] = useState(0);
  const [rows, setRows] = useState<Record<string, LoopRow>>({});

  // بارگذاری lazy تاریخچه برای پول‌های بالای لیست
  const topPools = useMemo(() => {
    const filtered = pools.filter((p) => {
      if (chain !== 'همه' && p.chain !== chain) return false;
      if (project !== 'همه' && p.project !== project) return false;
      if (stableOnly && !p.stablecoin) return false;
      if ((p.tvlUsd ?? 0) < minTvl) return false;
      if ((p.apy ?? 0) < minApy) return false;
      if (q && !(p.symbol + ' ' + p.project + ' ' + p.chain).toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    return filtered.sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0)).slice(0, 60);
  }, [pools, q, chain, project, stableOnly, minTvl, minApy]);

  // build rows (async lazy)
  const [building, setBuilding] = useState(false);
  const [builtIds, setBuiltIds] = useState<Set<string>>(new Set());
  useMemo(() => {
    void (async () => {
      setBuilding(true);
      const toBuild = topPools.filter((p) => !builtIds.has(p.pool));
      for (const p of toBuild.slice(0, 15)) {
        const row = await buildLoopRow(p);
        setRows((prev) => ({ ...prev, [p.pool]: row }));
        setBuiltIds((prev) => new Set(prev).add(p.pool));
      }
      setBuilding(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topPools.map((p) => p.pool).join(',')]);

  const chains = useMemo(() => ['همه', ...new Set(pools.map((p) => p.chain))].slice(0, 15), [pools]);
  const projects = useMemo(() => ['همه', ...new Set(pools.map((p) => p.project))].slice(0, 15), [pools]);

  const list: LoopRow[] = useMemo(
    () => topPools.map((p) => rows[p.pool]).filter((r): r is LoopRow => !!r).sort((a, b) => b.score - a.score),
    [topPools, rows]
  );

  if (loading && pools.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    );
  }
  if (error && pools.length === 0) {
    return <ErrorState message="ارتباط با DeFiLlama Yields برقرار نشد" onRetry={() => void loadYieldPools()} />;
  }

  return (
    <div className="space-y-3">
      {/* فیلترها */}
      <GlassCard className="space-y-2 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی نماد/پروتکل/زنجیره…"
            className="glass-inset h-9 w-full rounded-xl ps-9 pe-3 text-[11px] font-bold text-ink outline-none placeholder:text-muted/60 focus:ring-2 focus:ring-accent/40"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <select value={chain} onChange={(e) => setChain(e.target.value)} className="glass-inset h-8 rounded-xl px-2 text-[9px] font-bold text-ink outline-none">
            {chains.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select value={project} onChange={(e) => setProject(e.target.value)} className="glass-inset h-8 rounded-xl px-2 text-[9px] font-bold text-ink outline-none">
            {projects.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select value={minTvl} onChange={(e) => setMinTvl(Number(e.target.value))} className="glass-inset h-8 rounded-xl px-2 text-[9px] font-bold text-ink outline-none">
            <option value={0}>TVL: همه</option>
            <option value={100000}>TVL &gt; $100K</option>
            <option value={500000}>TVL &gt; $500K</option>
            <option value={1000000}>TVL &gt; $1M</option>
            <option value={2000000}>TVL &gt; $2M</option>
            <option value={5000000}>TVL &gt; $5M</option>
            <option value={10000000}>TVL &gt; $10M</option>
          </select>
          <select value={minApy} onChange={(e) => setMinApy(Number(e.target.value))} className="glass-inset h-8 rounded-xl px-2 text-[9px] font-bold text-ink outline-none">
            <option value={0}>APY: همه</option>
            <option value={5}>APY &gt; 5%</option>
            <option value={10}>APY &gt; 10%</option>
            <option value={20}>APY &gt; 20%</option>
            <option value={50}>APY &gt; 50%</option>
          </select>
          <button
            onClick={() => setStableOnly((s) => !s)}
            className={cn('flex items-center gap-1 rounded-xl px-2 py-1.5 text-[9px] font-black transition-all', stableOnly ? 'bg-emerald-400/15 text-emerald-400' : 'glass-inset text-muted')}
          >
            <Wallet className="h-3 w-3" /> استیبل‌کوین
          </button>
        </div>
      </GlassCard>

      {/* بهترین فرصت‌ها */}
      {list.length > 0 && (
        <GlassCard variant="soft" className="p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[12px] font-black text-ink">
            <Sparkles className="h-4 w-4 text-accent" /> بهترین فرصت‌ها (بر اساس امتیاز — نه فقط APY)
          </p>
          <div className="space-y-1.5">
            {list.slice(0, 3).map((r) => (
              <PoolCard key={r.pool.pool} row={r} onOpen={() => onOpenPool(r.pool)} />
            ))}
          </div>
        </GlassCard>
      )}

      {/* همه */}
      <div className="space-y-2">
        {list.map((r) => (
          <PoolCard key={r.pool.pool} row={r} onOpen={() => onOpenPool(r.pool)} />
        ))}
        {list.length === 0 && (
          <GlassCard variant="soft" className="p-6 text-center text-[11px] font-bold text-muted">
            {building ? 'در حال بارگذاری…' : 'پولی با این فیلترها یافت نشد'}
          </GlassCard>
        )}
        {!building && pools.length > 0 && (
          <p className="text-center text-[9px] font-medium text-muted/70">
            {fmtInt(pools.length)} پول از DeFiLlama Yields · امتیاز = ترکیب Net APY + پایداری + TVL + نقدینگی + کیفیت — نه احتمال موفقیت
          </p>
        )}
      </div>
    </div>
  );
}

export { Filter };
