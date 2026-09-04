/**
 * کارت داشبورد — تحلیل APY واقعی Pendle
 * مقایسه APY تبلیغاتی (تئوری) با Real APY (پس از هزینه‌ها) برای ۳ فرصت برتر
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Percent, ArrowLeft, TrendingUp } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { usePendleMarkets } from '@/features/pendle/data/usePendleMarkets';
import { calcPt } from '@/features/pendle/engine/analytics';
import { findOpportunities } from '@/features/pendle/engine/analytics';
import { fmtExpiry, chainName } from '@/features/pendle/domain/pendle';
import { fmtPct, fmtUSD } from '@/shared/utils/formatters';
import { cn } from '@/shared/lib/cn';

export function PendleRealApyCard() {
  const { markets, loading } = usePendleMarkets();

  // ۳ فرصت برتر (PT و Real APY)
  const top = useMemo(() => {
    const opps = findOpportunities(markets, 10_000);
    const pt = opps.find((o) => o.kind === 'pt');
    const real = opps.find((o) => o.kind === 'realApy');
    const lowRisk = opps.find((o) => o.kind === 'lowRisk');
    return [pt, real, lowRisk].filter((x): x is NonNullable<typeof x> => !!x).slice(0, 3);
  }, [markets]);

  if (loading && top.length === 0) {
    return (
      <GlassCard className="p-5">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-xl" />
          <Skeleton className="h-4 w-40 rounded" />
        </div>
        <div className="mt-3 space-y-2">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      </GlassCard>
    );
  }

  if (top.length === 0) return null;

  return (
    <GlassCard animated className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-extrabold text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-400/15 text-teal-400">
            <Percent className="h-4 w-4" />
          </span>
          Pendle
        </h2>
        <Link to="/pendle" className="flex items-center gap-1 text-[11px] font-bold text-accent hover:opacity-80">
          Pendle <ArrowLeft className="h-3 w-3" />
        </Link>
      </div>

      <div className="space-y-2">
        {top.map((o, i) => {
          const m = o.market;
          // Real APY با هزینه‌های پیش‌فرض
          const r = calcPt({
            investment: 10_000,
            ptPrice: 0.948,
            maturityIso: m.expiry,
            gas: 5,
            swapFeePct: 0.1,
            slippagePct: 0.1
          });
          const theoretical = m.fixedApyPct ?? m.totalApyPct ?? null;
          return (
            <motion.div key={o.kind} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
              <Link to={`/pendle/${m.chainId}/${m.address}`} className="block">
                <GlassCard variant="soft" className="p-3 transition-all hover:bg-line/[0.04]">
                  <div className="flex items-center gap-2">
                    <span className={cn('badge', i === 0 ? 'bg-positive/10 text-positive' : i === 1 ? 'bg-accent/10 text-accent' : 'bg-info/10 text-info')}>
                      {i === 0 ? 'بهترین PT' : i === 1 ? 'بیشترین Real APY' : 'کم‌ریسک'}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-[11px] font-bold text-ink">{m.name}</p>
                  </div>
                  <div className="mt-2 flex items-center justify-between ps-1">
                    <div className="flex items-center gap-2 text-[9px] font-bold text-muted">
                      <span>تئوری: <span className="num-ltr text-ink">{theoretical !== null ? fmtPct(theoretical) : '—'}</span></span>
                      <span>Real: <span className="num-ltr font-black text-positive">{fmtPct(r.realApyPct)}</span></span>
                      <span className="hidden sm:inline">{fmtExpiry(m.expiry)} · {chainName(m.chainId)}</span>
                    </div>
                    <span className="num-ltr text-[9px] font-bold text-muted">TVL {fmtUSD(m.details.totalTvl, true)}</span>
                  </div>
                </GlassCard>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </GlassCard>
  );
}

export { TrendingUp as _TU };
