/**
 * بازار — صفحه واحد Markets (Pipeline مرکزی سبک) + لینک Pendle
 */
import { Percent, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/shared/components/layout/Page';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { MarketsPage } from '@/features/markets/presentation/MarketsPage';

export function MarketsHomePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="بازار" />

      <MarketsPage />

      {/* Pendle — تحلیل بازدهی */}
      <section>
        <Link to="/pendle" className="block">
          <GlassCard className="flex items-center gap-3 p-4 transition-all hover:bg-line/[0.04] active:scale-[0.99]">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-400/15 text-teal-400">
              <Percent className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-extrabold text-ink">Pendle Markets</p>
              <p className="truncate text-[10px] font-medium text-muted">
                فرصت‌های PT / YT / LP — APY واقعی و تحلیل حرفه‌ای
              </p>
            </div>
            <ArrowLeft className="h-4 w-4 shrink-0 text-muted" />
          </GlassCard>
        </Link>
      </section>
    </div>
  );
}
