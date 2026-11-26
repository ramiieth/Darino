/**
 * Timeline insights — four narrative findings:
 *  largest gain / largest loss / smallest gain / smallest loss
 *
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
import { cn } from '@/shared/lib/cn';

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

const CARD: Record<CardKind, { label: TKey; rank: TKey; icon: typeof TrendingUp; tone: Tone; accentBorder: string }> = {
  maxGain: { label: 'analyticsMaxGain', rank: 'rankMaxGain', icon: TrendingUp, tone: 'gain', accentBorder: 'border-s-4 border-s-gain' },
  maxLoss: { label: 'analyticsMaxLoss', rank: 'rankMaxLoss', icon: TrendingDown, tone: 'loss', accentBorder: 'border-s-4 border-s-loss' },
  minGain: { label: 'analyticsMinGain', rank: 'rankMinGain', icon: ChevronsUp, tone: 'neutral', accentBorder: 'border-s-4 border-s-gain/40' },
  minLoss: { label: 'analyticsMinLoss', rank: 'rankMinLoss', icon: ChevronsDown, tone: 'neutral', accentBorder: 'border-s-4 border-s-loss/40' }
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
          <Surface key={kind} className={cn('space-y-3 p-4 md:p-5', c.accentBorder)}>
            <div className="flex items-center gap-3">
              <AssetLogo symbol={row.symbol} kind={row.kind} size={38} />
              <div className="min-w-0 flex-1">
                <Badge tone={c.tone} icon={<Icon aria-hidden />}>
                  {t(c.label)}
                </Badge>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <p className="truncate text-sm font-extrabold text-ink">{row.nameFa}</p>
                  <bdi dir="ltr" className="font-mono text-2xs uppercase text-subtle">
                    {row.symbol}
                  </bdi>
                </div>
              </div>
              <div className="shrink-0 text-end">
                <span
                  className={cn(
                    'inline-flex rounded-xl px-2.5 py-1 text-base font-extrabold',
                    isGain ? 'bg-gain/10 text-positive' : 'bg-negative/10 text-negative'
                  )}
                >
                  <PercentValue value={row.changePct} />
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 rounded-xl bg-surface-2/55 p-2.5 text-xs">
              <div>
                <span className="block text-2xs text-muted">ارزش امروز سرمایه</span>
                <span className="mt-0.5 block font-bold text-ink">
                  <MoneyValue value={row.valueUsd} />
                </span>
              </div>
              <div>
                <span className="block text-2xs text-muted">{isGain ? 'سود خالص' : 'زیان خالص'}</span>
                <span className="mt-0.5 block font-bold">
                  <MoneyValue value={row.profitLoss} signed tone="auto" />
                </span>
              </div>
            </div>

            <p className="text-xs leading-6 text-muted">
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
