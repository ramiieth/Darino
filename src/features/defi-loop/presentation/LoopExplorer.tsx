/**
 * DeFi Loop Explorer — Yield → Loop
 *  - همه پول‌های DeFiLlama Yields (Data-Driven — بدون Hardcode)
 *  - فیلترها: Chain / Project / Stablecoin / TVL / APY
 *  - بهترین فرصت‌ها بر اساس Opportunity Score (نه فقط APY)
 *  - کلیک روی هر پول → Calculator
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Badge } from '@/shared/components/ui/Badge';
import { Field, SearchField, Select } from '@/shared/components/ui/Input';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import { EmptyState, ErrorState, ListSkeleton } from '@/shared/components/ui/StateViews';
import { useYieldPools, loadYieldPools, ensurePoolChart } from '@/features/defi-loop/data/useYieldLoops';
import type { YieldPool } from '@/features/defi-loop/data/yieldsService';
import { computeApyStats, computeTvlStats, opportunityScore, riskIndicators, type RiskIndicator } from '@/features/defi-loop/domain/yieldAnalytics';
import { fmtUSD, fmtInt } from '@/shared/utils/formatters';

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

function RiskBadges({ risks }: { risks: RiskIndicator[] }) {
  if (risks.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {risks.slice(0, 3).map((r, i) => (
        <Badge key={i} tone={r.severity === 'critical' ? 'loss' : r.severity === 'warning' ? 'warn' : 'neutral'}>
          {r.label}
        </Badge>
      ))}
    </span>
  );
}

const TVL_OPTS = [0, 100_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000];
const APY_OPTS = [0, 5, 10, 20, 50];

export function LoopExplorer({ onOpenPool }: { onOpenPool: (pool: YieldPool) => void }) {
  const { pools, loading, error } = useYieldPools();
  const [q, setQ] = useState('');
  const [chain, setChain] = useState('همه');
  const [project, setProject] = useState('همه');
  const [stableOnly, setStableOnly] = useState(false);
  const [minTvl, setMinTvl] = useState(0);
  const [minApy, setMinApy] = useState(0);
  const [rows, setRows] = useState<Record<string, LoopRow>>({});
  const [building, setBuilding] = useState(false);
  const builtIds = useRef<Set<string>>(new Set());

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

  // lazy history → rows for the visible pools (side effect: useEffect, not useMemo)
  const poolKey = topPools.map((p) => p.pool).join(',');
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const toBuild = topPools.filter((p) => !builtIds.current.has(p.pool)).slice(0, 15);
      if (toBuild.length === 0) return;
      setBuilding(true);
      for (const p of toBuild) {
        const row = await buildLoopRow(p);
        if (cancelled) break;
        builtIds.current.add(p.pool);
        setRows((prev) => ({ ...prev, [p.pool]: row }));
      }
      if (!cancelled) setBuilding(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolKey]);

  const chains = useMemo(() => ['همه', ...new Set(pools.map((p) => p.chain))].slice(0, 15), [pools]);
  const projects = useMemo(() => ['همه', ...new Set(pools.map((p) => p.project))].slice(0, 15), [pools]);

  const list: LoopRow[] = useMemo(
    () => topPools.map((p) => rows[p.pool]).filter((r): r is LoopRow => !!r).sort((a, b) => b.score - a.score),
    [topPools, rows]
  );

  if (loading && pools.length === 0) return <ListSkeleton rows={6} />;
  if (error && pools.length === 0) {
    return <ErrorState message="ارتباط با DeFiLlama Yields برقرار نشد" onRetry={() => void loadYieldPools()} />;
  }

  return (
    <div className="space-y-5">
      <Surface className="p-4 md:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="sm:col-span-2 lg:col-span-2">
            <p className="mb-1.5 text-xs font-semibold text-muted">جستجو</p>
            <SearchField value={q} onChange={setQ} placeholder="نماد، پروتکل یا زنجیره…" />
          </div>
          <Field label="زنجیره">
            <Select value={chain} onChange={(e) => setChain(e.target.value)}>
              {chains.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="پروتکل">
            <Select value={project} onChange={(e) => setProject(e.target.value)}>
              {projects.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:col-span-1 lg:grid-cols-1">
            <Field label="حداقل TVL">
              <Select value={minTvl} onChange={(e) => setMinTvl(Number(e.target.value))}>
                {TVL_OPTS.map((v) => (
                  <option key={v} value={v}>
                    {v === 0 ? 'همه' : `> ${fmtUSD(v, true)}`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="حداقل APY">
              <Select value={minApy} onChange={(e) => setMinApy(Number(e.target.value))}>
                {APY_OPTS.map((v) => (
                  <option key={v} value={v}>
                    {v === 0 ? 'همه' : `> ${v}%`}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
        <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={stableOnly}
            onChange={(e) => setStableOnly(e.target.checked)}
            className="h-4 w-4 rounded border-divider-strong accent-[rgb(var(--c-brand-500))]"
          />
          فقط استیبل‌کوین
        </label>
      </Surface>

      {list.length === 0 ? (
        building ? <ListSkeleton rows={5} /> : <EmptyState message="پولی با این فیلترها یافت نشد" />
      ) : (
        <Surface className="overflow-hidden">
          {/* desktop */}
          <div className="hidden lg:block">
            <table className="data-table">
              <caption className="sr-only">پول‌های بازدهی</caption>
              <thead>
                <tr>
                  <th scope="col" className="!ps-5">پول</th>
                  <th scope="col" className="col-num">APY کل</th>
                  <th scope="col" className="col-num">پایه</th>
                  <th scope="col" className="col-num">پاداش</th>
                  <th scope="col" className="col-num">میانگین ۳۰ روز</th>
                  <th scope="col" className="col-num">TVL</th>
                  <th scope="col" className="col-num">تغییر TVL ۳۰ روز</th>
                  <th scope="col" className="col-num !pe-5">امتیاز</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r, i) => {
                  const p = r.pool;
                  return (
                    <tr key={p.pool} className="cursor-pointer" onClick={() => onOpenPool(p)}>
                      <td className="!ps-5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenPool(p);
                          }}
                          className="text-start"
                        >
                          <span className="flex items-center gap-2 font-semibold text-ink hover:text-accent">
                            <bdi dir="ltr">{p.project} · {p.symbol}</bdi>
                            {i < 3 && <Badge tone="brand">برتر</Badge>}
                          </span>
                          <span className="block text-xs text-muted">
                            {p.chain}
                            {p.poolMeta ? ` · ${p.poolMeta}` : ''}
                          </span>
                        </button>
                        <div className="mt-1"><RiskBadges risks={r.risks} /></div>
                      </td>
                      <td className="col-num font-semibold text-ink"><PercentValue value={p.apy} signed={false} tone="none" /></td>
                      <td className="col-num"><PercentValue value={p.apyBase} signed={false} tone="none" /></td>
                      <td className="col-num"><PercentValue value={p.apyReward} signed={false} tone="none" /></td>
                      <td className="col-num text-muted"><PercentValue value={r.apyStats.avg30d} signed={false} tone="none" /></td>
                      <td className="col-num"><MoneyValue value={p.tvlUsd} compact /></td>
                      <td className="col-num"><PercentValue value={r.tvlStats.change30d} /></td>
                      <td className="col-num num-ltr !pe-5 font-bold text-ink">{Math.round(r.score)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* phones & tablets */}
          <ul className="divide-y divide-divider px-4 lg:hidden">
            {list.map((r, i) => {
              const p = r.pool;
              return (
                <li key={p.pool}>
                  <button type="button" onClick={() => onOpenPool(p)} className="w-full py-3 text-start">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
                          <bdi dir="ltr" className="truncate">{p.project} · {p.symbol}</bdi>
                          {i < 3 && <Badge tone="brand">برتر</Badge>}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {p.chain} · TVL <MoneyValue value={p.tvlUsd} compact />
                        </p>
                        <p className="mt-1 flex flex-wrap gap-x-3 text-2xs text-muted">
                          <span>پایه <PercentValue value={p.apyBase} signed={false} tone="none" /></span>
                          <span>پاداش <PercentValue value={p.apyReward} signed={false} tone="none" /></span>
                          <span>TVL ۳۰ر <PercentValue value={r.tvlStats.change30d} /></span>
                        </p>
                      </div>
                      <div className="shrink-0 text-end">
                        <p className="text-base font-bold text-ink"><PercentValue value={p.apy} signed={false} tone="none" /></p>
                        <p className="text-2xs text-muted">امتیاز <span className="num-ltr">{Math.round(r.score)}</span></p>
                      </div>
                    </div>
                    {r.risks.length > 0 && <div className="mt-2"><RiskBadges risks={r.risks} /></div>}
                  </button>
                </li>
              );
            })}
          </ul>
        </Surface>
      )}

      {pools.length > 0 && (
        <p className="text-xs text-muted">
          {fmtInt(pools.length)} پول از DeFiLlama Yields · امتیاز = ترکیب APY خالص، پایداری، TVL، نقدینگی و کیفیت — نه احتمال موفقیت
          {building && ' · در حال بارگذاری تاریخچه…'}
        </p>
      )}
    </div>
  );
}
