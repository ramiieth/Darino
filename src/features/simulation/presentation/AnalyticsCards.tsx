/**
 * کارت‌های تحلیلی هر بازه زمانی — ۴ کارت روایی:
 *  بیشترین رشد / بیشترین ضرر / کمترین رشد / کمترین ضرر
 *
 * متن: «اگر از [تاریخ] دارایی [نام] ([نماد]) را که [بیشترین رشد] را داشته
 *       می‌خریدی، ارزش دارایی شما تا به الان به [+$ارزش کل] می‌رسید و
 *       [+$میزان سود] سود می‌کردی.»
 */
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, ChevronsUp, ChevronsDown } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import type { SimAssetRow, TimelineResult } from '@/shared/types';
import { fmtUSD } from '@/shared/utils/formatters';
import { t, type TKey } from '@/shared/i18n/fa';
import { cn } from '@/shared/lib/cn';

type CardKind = 'maxGain' | 'maxLoss' | 'minGain' | 'minLoss';

interface AnalyticsItem {
  kind: CardKind;
  row: SimAssetRow;
}

/** انتخاب ۴ دارایی تحلیلی از ردیف‌های معتبر */
export function pickAnalytics(result: TimelineResult): AnalyticsItem[] {
  const gains = result.rows
    .filter((r) => r.valueUsd !== null && r.changePct !== null && r.changePct > 0)
    .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0));
  const losses = result.rows
    .filter((r) => r.valueUsd !== null && r.changePct !== null && r.changePct < 0)
    .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0));

  const items: AnalyticsItem[] = [];
  if (gains.length > 0) {
    items.push({ kind: 'maxGain', row: gains[gains.length - 1] }); // بیشترین رشد
    items.push({ kind: 'minGain', row: gains[0] }); // کمترین رشد (مثبت)
  }
  if (losses.length > 0) {
    items.push({ kind: 'maxLoss', row: losses[0] }); // بیشترین ضرر
    items.push({ kind: 'minLoss', row: losses[losses.length - 1] }); // کمترین ضرر
  }
  return items;
}

const CARD_STYLE = {
  maxGain: { label: 'analyticsMaxGain', icon: TrendingUp, tone: 'pos' },
  maxLoss: { label: 'analyticsMaxLoss', icon: TrendingDown, tone: 'neg' },
  minGain: { label: 'analyticsMinGain', icon: ChevronsUp, tone: 'warn' },
  minLoss: { label: 'analyticsMinLoss', icon: ChevronsDown, tone: 'soft' }
} as const satisfies Record<
  CardKind,
  { label: string; icon: typeof TrendingUp; tone: 'pos' | 'neg' | 'warn' | 'soft' }
>;

const TONE_CLASS = {
  pos: { chip: 'text-positive bg-positive/10', border: 'border-positive/25', bar: 'from-positive/60' },
  neg: { chip: 'text-negative bg-negative/10', border: 'border-negative/25', bar: 'from-negative/60' },
  warn: { chip: 'text-warn bg-warn/10', border: 'border-warn/25', bar: 'from-warn/60' },
  soft: { chip: 'text-accent bg-accent/10', border: 'border-accent/25', bar: 'from-accent/60' }
} as const;

export function AnalyticsCards({
  result,
  timeline
}: {
  result: TimelineResult;
  timeline: 1 | 2;
}) {
  const items = pickAnalytics(result);
  const dateLabel = timeline === 1 ? t('analyticsDateT1') : t('analyticsDateT2');

  if (items.length === 0) {
    return (
      <GlassCard variant="soft" className="p-4 text-center text-xs font-bold text-muted">
        {t('analyticsEmpty')}
      </GlassCard>
    );
  }

  return (
    <div className="space-y-2.5">
      {items.map(({ kind, row }, i) => {
        const style = CARD_STYLE[kind];
        const tone = TONE_CLASS[style.tone];
        const Icon = style.icon;
        const isGain = kind === 'maxGain' || kind === 'minGain';
        const value = fmtUSD(row.valueUsd);
        const amount = fmtUSD(Math.abs(row.profitLoss ?? 0));

        // متن روایی با ایزوله LTR برای مقادیر مالی (ممیزی §۸)
        const rankKey: TKey = kind === 'maxGain' ? 'rankMaxGain' : kind === 'maxLoss' ? 'rankMaxLoss' : kind === 'minGain' ? 'rankMinGain' : 'rankMinLoss';
        const rankWord = t(rankKey);
        const valueWord = isGain ? `+${value}` : value;
        const amountWord = isGain ? `+${amount}` : `−${amount}`;

        return (
          <motion.div
            key={kind}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.35 }}
          >
            <GlassCard
              className={cn('relative overflow-hidden p-4', tone.border)}
            >
              <div
                className={cn(
                  'pointer-events-none absolute -top-16 -end-16 h-36 w-36 rounded-full bg-gradient-to-br to-transparent blur-2xl opacity-20',
                  tone.bar
                )}
              />
              <div className="flex items-center gap-3">
                <AssetLogo symbol={row.symbol} kind={row.kind} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Icon className={cn('h-3.5 w-3.5', tone.chip)} />
                    <span className={cn('badge', tone.chip)}>{t(style.label as TKey)}</span>
                  </div>
                  <p className="mt-1 truncate text-[13px] font-extrabold text-ink">
                    {row.nameFa}
                    <span className="num-ltr ms-1.5 text-[11px] font-bold text-muted">
                      {row.symbol}
                    </span>
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] font-medium leading-6 text-muted">
                {t('analyticsIntro').replace('{date}', dateLabel)}
                <span className="font-extrabold text-ink"> {row.nameFa} </span>
                <span className="num-ltr font-extrabold text-ink">({row.symbol})</span>{' '}
                {t('analyticsMiddle').replace('{rank}', rankWord)}
                <span className="num-ltr font-extrabold text-ink"> {valueWord} </span>
                {t(isGain ? 'analyticsTailGain' : 'analyticsTailLoss')}
                <span className="num-ltr font-extrabold text-ink"> {amountWord} </span>
                {isGain ? t('analyticsEndGain') : t('analyticsEndLoss')}
              </p>
            </GlassCard>
          </motion.div>
        );
      })}
    </div>
  );
}

export { fmtUSD as _fmtUSD };
