/**
 * Dashboard module — fixed-yield opportunities on Pendle.
 * Shows quoted fixed APY vs an after-cost estimate for three distinct picks
 * (best fixed · best stablecoin · lowest risk).
 *
 * The after-cost estimate uses the market's own PT price ratio: from the quoted
 * PT discount when prices are available, otherwise derived exactly from the
 * market's implied APY (PT = (1 + APY)^−t). Unknown inputs show "—".
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Section, Surface } from '@/shared/components/ui/GlassCard';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { Badge, type Tone } from '@/shared/components/ui/Badge';
import { PercentValue } from '@/shared/components/ui/FinancialValue';
import { buttonClass } from '@/shared/components/ui/Button';
import { usePendleMarkets } from '@/features/pendle/data/usePendleMarkets';
import { calcPt, findOpportunities, type OpportunityKind } from '@/features/pendle/engine/analytics';
import { chainName, fmtExpiry, type PendleMarketView } from '@/features/pendle/domain/pendle';
import { toFaDigits } from '@/shared/utils/formatters';

/** PT price in underlying units (1 = par at maturity) */
function ptPriceRatio(m: PendleMarketView): number | null {
  if (m.ptDiscountPct !== null) return 1 - m.ptDiscountPct / 100;
  if (m.fixedApyPct !== null && m.daysToExpiry !== null && m.daysToExpiry > 0) {
    return Math.pow(1 + m.fixedApyPct / 100, -m.daysToExpiry / 365);
  }
  return null;
}

const PICKS: { kind: OpportunityKind; label: string; tone: Tone }[] = [
  { kind: 'pt', label: 'بالاترین بازده ثابت', tone: 'brand' },
  { kind: 'stable', label: 'استیبل‌کوین', tone: 'neutral' },
  { kind: 'lowRisk', label: 'کم‌ریسک‌ترین', tone: 'gain' }
];

export function PendleRealApyCard() {
  const { markets, loading } = usePendleMarkets();

  const picks = useMemo(() => {
    const opps = findOpportunities(markets, 10_000);
    const seen = new Set<string>();
    const out: { label: string; tone: Tone; market: (typeof opps)[number]['market'] }[] = [];
    for (const p of PICKS) {
      const o = opps.find((x) => x.kind === p.kind && !seen.has(x.market.address));
      if (!o) continue;
      seen.add(o.market.address);
      out.push({ label: p.label, tone: p.tone, market: o.market });
    }
    return out;
  }, [markets]);

  if (!loading && picks.length === 0) return null;

  return (
    <Section
      id="pendle-picks"
      title="بازده ثابت پندل"
      description="بازده سالانه اعلام‌شده در برابر برآورد پس از هزینه‌ها"
      action={
        <Link to="/pendle" className={buttonClass('ghost', 'sm')}>
          همه بازارها
          <ArrowLeft className="rtl:rotate-0 ltr:rotate-180" />
        </Link>
      }
    >
      <Surface className="px-4">
        {loading && picks.length === 0 ? (
          <div className="space-y-3 py-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-divider">
            {picks.map(({ label, tone, market: m }) => {
              const ratio = ptPriceRatio(m);
              const real =
                ratio !== null && ratio > 0 && ratio < 1.5
                  ? calcPt({ investment: 10_000, ptPrice: ratio, maturityIso: m.expiry, gas: 5, swapFeePct: 0.1, slippagePct: 0.1 }).realApyPct
                  : null;
              const quoted = m.fixedApyPct ?? m.totalApyPct ?? null;
              return (
                <li key={m.address}>
                  <Link
                    to={`/pendle/${m.chainId}/${m.address}`}
                    className="-mx-2 flex items-center gap-3 rounded-field px-2 py-3 hover:bg-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <Badge tone={tone}>{label}</Badge>
                      <p className="mt-1 truncate text-sm font-semibold text-ink">
                        <bdi dir="ltr">{m.name}</bdi>
                      </p>
                      <p className="text-xs text-muted">
                        {chainName(m.chainId)} · سررسید {fmtExpiry(m.expiry)}
                        {m.daysToExpiry !== null && ` (${toFaDigits(m.daysToExpiry)} روز)`}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className="text-lg font-bold text-ink">
                        <PercentValue value={quoted} signed={false} tone="none" />
                      </p>
                      <p className="text-xs text-muted">
                        پس از هزینه: <PercentValue value={real} signed={false} tone="none" className="font-semibold text-ink" />
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Surface>
      <p className="mt-2 text-xs text-subtle">
        برآورد برای ۱۰٬۰۰۰ دلار با کارمزد سواپ و لغزش ۰٫۱٪ و گس ۵ دلار؛ قیمت PT از APY ضمنی بازار. بازده اعلام‌شده تضمینی برای آینده نیست.
      </p>
    </Section>
  );
}
