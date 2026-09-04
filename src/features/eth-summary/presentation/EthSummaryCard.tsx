import { motion } from 'framer-motion';
import { Wallet, TrendingUp, TrendingDown, ArrowLeftRight } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { SourceBadge } from '@/shared/components/ui/SourceBadge';
import { AssetLogo } from '@/shared/components/ui/AssetLogo';
import { computeEthSummary } from '@/features/eth-summary/domain/ethSummary';
import { useCoinLivePrice } from '@/features/simulation/data/useCryptoPrices';
import { useSettingsStore } from '@/shared/store/settingsStore';
import { fmtUSD, fmtNumLatin, fmtPct, pnlClass, fmtIntLatin } from '@/shared/utils/formatters';
import { t } from '@/shared/i18n/fa';
import { cn } from '@/shared/lib/cn';

/** دارایی‌های واقعی و تنها دارایی‌های کاربر */
export const USER_ASSETS = { ETH: 3.33, USDT: 23_216 } as const;

/** کارت شیشه‌ای خلاصه پورتفولیوی اتریوم (اولویت بالا) */
export function EthSummaryCard() {
  const liveEth = useCoinLivePrice('ethereum');
  const scenario = useSettingsStore((s) => s.scenario);

  const s = computeEthSummary(liveEth, {
    amount: scenario.ethAmount,
    buyPrice: scenario.ethBuyPrice,
    initialInvestment: scenario.ethInitialInvestment,
    usdcAllocation: scenario.usdcAllocation2026
  });

  const pnlPositive = (s.profitLoss ?? 0) >= 0;

  const rows = [
    { label: t('ethAmount'), value: `${fmtNumLatin(s.amount)} ETH`, icon: ArrowLeftRight, accent: true },
    { label: t('ethBuyPrice'), value: fmtUSD(s.buyPrice), icon: Wallet },
    { label: t('ethInitialInvestment'), value: fmtUSD(s.initialInvestment), icon: Wallet },
    { label: t('ethCurrentPrice'), value: fmtUSD(s.currentPrice), icon: TrendingUp }
  ];

  return (
    <GlassCard animated className="relative overflow-hidden p-5">
      {/* خط تاکید ظریف — وضعیت با رنگ + آیکون (نه فقط رنگ) */}
      <div
        aria-hidden
        className={cn(
          'absolute inset-x-0 top-0 h-[3px]',
          pnlPositive
            ? 'bg-gradient-to-e from-transparent via-positive/60 to-transparent'
            : 'bg-gradient-to-e from-transparent via-negative/60 to-transparent'
        )}
      />

      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <AssetLogo symbol="ETH" kind="crypto" size={40} />
          <div>
            <h2 className="text-sm font-extrabold text-ink">{t('ethSummaryTitle')}</h2>
            <p className="text-[11px] font-medium text-muted">{t('ethLiveBadge')}</p>
          </div>
        </div>
        <SourceBadge source={s.source} />
      </div>

      {/* ارزش فعلی — برجسته */}
      <div className="mb-4">
        <p className="text-[11px] font-bold text-muted">{t('ethCurrentValue')}</p>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <motion.span
            key={s.currentValue ?? 'na'}
            initial={{ opacity: 0.4, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="num-ltr text-3xl font-black text-ink"
          >
            {fmtUSD(s.currentValue)}
          </motion.span>
          {s.profitLoss !== null && (
            <span className={cn('num-ltr flex items-center gap-1 text-sm font-extrabold', pnlClass(s.profitLoss))}>
              {pnlPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {fmtUSD(s.profitLoss)}
              <span className="text-[11px] opacity-80">({fmtPct(s.profitLossPct)})</span>
            </span>
          )}
        </div>
      </div>

      {/* جزئیات دقیق کارت */}
      <div className="glass-inset grid grid-cols-2 gap-px overflow-hidden rounded-2xl">
        {rows.map(({ label, value, icon: Icon, accent }) => (
          <div key={label} className="flex items-center gap-2.5 p-3">
            <Icon className={cn('h-4 w-4 shrink-0', accent ? 'text-accent' : 'text-muted')} />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-bold text-muted">{label}</p>
              <p className="tnum truncate text-[13px] font-extrabold text-ink">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* دارایی‌های واقعی کاربر: 3.33 ETH + 23,216 USDT */}
      <div className="mt-3 flex items-center justify-between rounded-2xl px-3 py-2.5 text-[11px] font-bold">
        <span className="flex items-center gap-1.5 text-muted">
          <Wallet className="h-3.5 w-3.5" />
          {t('realAssets')}
        </span>
        <span className="num-ltr text-ink">
          {fmtNumLatin(USER_ASSETS.ETH)} ETH + {fmtIntLatin(USER_ASSETS.USDT)} USDT
        </span>
      </div>
    </GlassCard>
  );
}

/** شمارنده کوچک آمار */
export function StatChip({
  label,
  value,
  sub,
  tone = 'neutral'
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'neutral' | 'positive' | 'negative';
}) {
  return (
    <div className="glass-soft rounded-2xl p-3.5">
      <p className="text-[11px] font-bold text-muted">{label}</p>
      <p className={cn('tnum mt-1 text-lg font-black', tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-ink')}>
        {value}
      </p>
      {sub && <p className="tnum mt-0.5 text-[11px] font-semibold text-muted">{sub}</p>}
    </div>
  );
}

