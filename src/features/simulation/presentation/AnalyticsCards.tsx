/**
 * Timeline insights — four narrative findings:
 *  largest gain / largest loss / smallest gain / smallest loss
 *
 * «If you had bought [asset] on [date], it would be worth [+$value] today — [+$profit] profit.»
 * Hypothetical and backward-looking; not a forecast.
 */
import { TrendingUp, TrendingDown, ChevronsUp, ChevronsDown } from 'lucide-react';
import { Surface } from '@/shared/components/ui/GlassCard';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { Badge, type Tone } from '@/shared/components/ui/Badge';
import { EmptyState } from '@/shared/components/ui/StateViews';
import { MoneyValue, PercentValue } from '@/shared/components/ui/FinancialValue';
import type { SimAssetRow, TimelineResult } from '@/shared/types';
import { t, type TKey } from '@/shared/i18n/fa';

type CardKind = 'maxGain' | 'maxLoss' | 'minGain' | 'minLoss';

interface AnalyticsItem {
  kind: CardKind;
  row: SimAssetRow;
}

/** pick the four analytic assets from valid rows */
export function pickAnalytics(result: TimelineResult): AnalyticsItem[] {
  const gains = result.rows
    .filter((r) => r.valueUsd !== null && r.changePct !== null && r.changePct > 0)
    .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0));
  const losses = result.rows
    .filter((r) => r.valueUsd !== null && r.changePct !== null && r.changePct < 0)
    .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0));

  const items: AnalyticsItem[] = [];
  if (gains.length > 0) {
    items.push({ kind: 'maxGain', row: gains[gains.length - 1] });
    items.push({ kind: 'minGain', row: gains[0] });
  }
  if (losses.length > 0) {
    items.push({ kind: 'maxLoss', row: losses[0] });
    items.push({ kind: 'minLoss', row: losses[losses.length - 1] });
  }
  return items;
}

const CARD: Record<CardKind, { label: TKey; rank: TKey; icon: typeof TrendingUp; tone: Tone }> = {
  maxGain: { label: 'analyticsMaxGain', rank: 'rankMaxGain', icon: TrendingUp, tone: 'gain' },
  maxLoss: { label: 'analyticsMaxLoss', rank: 'rankMaxLoss', icon: TrendingDown, tone: 'loss' },
  minGain: { label: 'analyticsMinGain', rank: 'rankMinGain', icon: ChevronsUp, tone: 'neutral' },
  minLoss: { label: 'analyticsMinLoss', rank: 'rankMinLoss', icon: ChevronsDown, tone: 'neutral' }
};

export function AnalyticsCards({ result, timeline }: { result: TimelineResult; timeline: 1 | 2 }) {
  const items = pickAnalytics(result);
  const dateLabel = timeline === 1 ? t('analyticsDateT1') : t('analyticsDateT2');

  if (items.length === 0) return <EmptyState message={t('analyticsEmpty')} />;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map(({ kind, row }) => {
        const c = CARD[kind];
        const Icon = c.icon;
        const isGain = kind === 'maxGain' || kind === 'minGain';
        return (
          <Surface key={kind} className="p-4 md:p-5">
            <div className="flex items-center gap-3">
              <AssetLogo symbol={row.symbol} kind={row.kind} size={36} />
              <div className="min-w-0 flex-1">
                <Badge tone={c.tone} icon={<Icon aria-hidden />}>
                  {t(c.label)}
                </Badge>
                <p className="mt-1 truncate text-sm font-semibold text-ink">
                  {row.nameFa}
                </p>
              </div>
              <div className="text-end">
                <p className="text-lg font-bold"><PercentValue value={row.changePct} /></p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-7 text-muted">
              {t('analyticsIntro').replace('{date}', dateLabel)}
              <span className="font-semibold text-ink"> {row.nameFa} </span>
              {t('analyticsMiddle').replace('{rank}', t(c.rank))}{' '}
              <MoneyValue value={row.valueUsd} className="font-semibold text-ink" />{' '}
              {t(isGain ? 'analyticsTailGain' : 'analyticsTailLoss')}{' '}
              <MoneyValue value={row.profitLoss} signed tone="auto" className="font-semibold" />{' '}
              {isGain ? t('analyticsEndGain') : t('analyticsEndLoss')}
            </p>
          </Surface>
        );
      })}
    </div>
  );
}
