/**
 * DeFi Yield Loop Analytics — صفحه کامل
 *  - Explorer (فیلترها + بهترین فرصت‌ها)
 *  - Calculator (با کلیک روی پول)
 *  - مستقل از Accounting Core
 */
import { useState } from 'react';
import { Repeat, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/shared/components/layout/Page';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { FreshnessBar } from '@/shared/components/ui/FreshnessBar';
import { LoopExplorer } from './LoopExplorer';
import { LoopCalculator } from './LoopCalculator';
import {
  useYieldPools,
  loadYieldPools,
  resetYieldLoad
} from '@/features/defi-loop/data/useYieldLoops';
import type { YieldPool } from '@/features/defi-loop/data/yieldsService';

export default function LoopAnalysisPage() {
  const [selected, setSelected] = useState<YieldPool | null>(null);
  const yieldData = useYieldPools();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Yield Loop"
        subtitle="DeFiLlama Yields → Loop — کشف، مقایسه و تحلیل سود واقعی Loop/Leveraged Yield (فقط تحلیل)"
      />

      <FreshnessBar
        loadedAt={yieldData.loadedAt}
        error={yieldData.error}
        syncing={yieldData.loading}
        sourceLabel="DeFiLlama Yields API"
        autoMs={5 * 60_000}
        onRefresh={() => {
          resetYieldLoad();
          void loadYieldPools();
        }}
      />

      <GlassCard variant="soft" className="flex items-center gap-2.5 p-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <Repeat className="h-4 w-4" />
        </span>
        <p className="text-[10px] font-medium leading-4 text-muted">
          همه داده‌ها از <span className="font-bold text-ink">DeFiLlama Yields API</span> — Supply APY، Reward APY و TVL واقعی.
          Borrow APY / LTV / Liquidation Threshold از API عمومی در دسترس نیست → در Calculator ورودی کاربر است (برآورد).
          این بخش مستقل از حسابداری است و هیچ توصیه معاملاتی ارائه نمی‌دهد.
        </p>
      </GlassCard>

      {selected ? (
        <div className="space-y-3">
          <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-[10px] font-black text-accent">
            <ArrowRight className="h-3 w-3" /> بازگشت به Explorer
          </button>
          <LoopCalculator pool={selected} onClose={() => setSelected(null)} />
        </div>
      ) : (
        <LoopExplorer onOpenPool={setSelected} />
      )}
    </div>
  );
}
