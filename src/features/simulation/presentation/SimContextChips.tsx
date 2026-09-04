import { motion } from 'framer-motion';
import { Wallet, Coins } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import type { TimelineResult } from '@/shared/types';
import { fmtUSD } from '@/shared/utils/formatters';
import { t } from '@/shared/i18n/fa';

/**
 * چیپ‌های زمینه بازه: سرمایه پایه + معیار اتریوم (هم‌ارز)
 * (کارت‌های ارزش پرتفوی و سود/زیان طبق دستور حذف شده‌اند)
 */
export function SimContextChips({ result }: { result: TimelineResult }) {
  const ethBenchmarkValue =
    result.ethLivePrice !== null ? (result.baseCapital / result.ethRefPrice) * result.ethLivePrice : null;

  const chips = [
    {
      label: t('baseCapital'),
      value: fmtUSD(result.baseCapital),
      icon: Wallet,
      subText: result.timeline === 1 ? t('analyticsDateT1') : t('analyticsDateT2')
    },
    {
      label: t('ethBenchmark'),
      value: fmtUSD(ethBenchmarkValue),
      icon: Coins,
      subText: result.ethLivePrice !== null ? `ETH ${fmtUSD(result.ethLivePrice)}` : t('na')
    }
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {chips.map((c, i) => (
        <motion.div
          key={c.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.3 }}
        >
          <GlassCard variant="soft" className="p-3.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-muted">{c.label}</p>
              <c.icon className="h-3.5 w-3.5 text-accent" />
            </div>
            <p className="tnum mt-1.5 text-[15px] font-black text-ink">{c.value}</p>
            <p className="tnum mt-0.5 text-[11px] font-semibold text-muted">{c.subText}</p>
          </GlassCard>
        </motion.div>
      ))}
    </div>
  );
}
