/**
 * Hero ارزش خالص دارایی (ممیزی §۴) — فقط دارایی‌های واقعی کاربر:
 *   3.33 ETH + 23,216 USDT
 * نمایش: دلار (لاتین/LTR) + معادل تومانی (فارسی) + تغییر ۲۴ساعته + تخصیص
 * بازطراحی UI/UX: سلسله‌مراتب عددی قوی — عدد اصلی ≫ برچسب ≫ جزئیات
 */
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { GlassCard } from '@/shared/components/ui/GlassCard';
import { USER_ASSETS } from './EthSummaryCard';
import { useCoinLivePrice } from '@/features/simulation/data/useCryptoPrices';
import { useCryptoPrices } from '@/features/simulation/data/useCryptoPrices';
import { useAccounting } from '@/features/accounting/data/useAccounting';
import { isCashStablecoin } from '@/features/accounting/domain/types';
import { COINS } from '@/features/simulation/domain/constants';
import { useMergedCryptoPrices } from '@/shared/hooks/useMergedCryptoPrices';
import { useFxStore } from '@/shared/store/fxStore';
import { PRICE_SNAPSHOT_FALLBACK } from '@/features/simulation/domain/constants';
import { fmtUSD, fmtToman, fmtPct, fmtIntLatin } from '@/shared/utils/formatters';
import { t } from '@/shared/i18n/fa';
import { cn } from '@/shared/lib/cn';

const SYMBOL_TO_ID = Object.fromEntries(Object.entries(COINS).map(([id, sym]) => [sym, id]));

export function NetWorthHero() {
  const liveEth = useCoinLivePrice('ethereum');
  const crypto = useCryptoPrices();
  const fxRate = useFxStore((s) => s.rate);
  // دارایی واقعی از حسابداری (Single Source of Truth) — فالبک: مقادیر ثابت فعلی
  const acc = useAccounting();
  const merged = useMergedCryptoPrices();
  const accReady = !acc.loading;

  const ethPrice = liveEth ?? PRICE_SNAPSHOT_FALLBACK.ethereum ?? null;

  // ارزش نگهداری‌ها (بدون استیبل‌کوین — آن‌ها = نقد)
  const holdingsValue = useMemo(() => {
    if (!accReady) return USER_ASSETS.ETH * (ethPrice ?? 0);
    let total = 0;
    for (const h of acc.holdings) {
      if (isCashStablecoin(h.symbol)) continue;
      const id = SYMBOL_TO_ID[h.symbol];
      const p = id ? merged.prices[id] : undefined;
      if (typeof p === 'number' && Number.isFinite(p)) total += p * h.qty;
    }
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accReady, acc.holdings, merged.prices, ethPrice]);

  const cashUsd = accReady ? acc.cashBalance : USER_ASSETS.USDT;
  const ethValue = accReady
    ? (acc.holdings.find((h) => h.symbol === 'ETH')?.qty ?? USER_ASSETS.ETH) * (ethPrice ?? 0)
    : USER_ASSETS.ETH * (ethPrice ?? 0);
  const netUsd = cashUsd + holdingsValue;

  const change24h = crypto.data?.changes24h?.ethereum ?? null;

  const ethShare = netUsd && netUsd > 0 ? ((ethValue ?? 0) / netUsd) * 100 : 0;
  const usdtShare = netUsd && netUsd > 0 ? (cashUsd / netUsd) * 100 : 0;

  const positive = change24h !== null && change24h >= 0;

  return (
    <GlassCard className="relative overflow-hidden p-5 md:p-6">
      {/* خط تاکید ظریف بالای کارت — به‌جای بلاک رنگی */}
      <div
        aria-hidden
        className={cn(
          'absolute inset-x-0 top-0 h-[3px]',
          positive
            ? 'bg-gradient-to-e from-transparent via-positive/70 to-transparent'
            : 'bg-gradient-to-e from-transparent via-negative/70 to-transparent'
        )}
      />

      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
          <Wallet className="h-3.5 w-3.5 text-accent" />
          {t('netWorth')}
        </p>
        <span className="text-[10px] font-medium text-muted/80">{t('netWorthHint')}</span>
      </div>

      {/* عدد اصلی — بزرگ‌ترین عنصر صفحه */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <motion.span
          key={netUsd ?? 'na'}
          initial={{ opacity: 0.5 }}
          animate={{ opacity: 1 }}
          className="num-ltr text-[34px] font-black leading-none tracking-tight text-ink md:text-[40px]"
        >
          {fmtUSD(netUsd)}
        </motion.span>
        {change24h !== null && (
          <span
            className={cn(
              'num-ltr inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-extrabold',
              positive ? 'bg-positive/8 text-positive' : 'bg-negative/8 text-negative'
            )}
          >
            {positive ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            {fmtPct(change24h)}
            <span className="text-[10px] font-bold text-muted">۲۴ساعته</span>
          </span>
        )}
      </div>

      {/* معادل تومانی — ارقام فارسی طبق دستور کارفرما */}
      <p className="mt-2 text-[13px] font-bold text-accent">{fmtToman(netUsd, fxRate)}</p>

      {/* تخصیص ETH / USDT — با جداساز ظریف به‌جای کارت دوم */}
      <div className="mt-5 border-t border-line/10 pt-4">
        <div className="mb-2.5 flex h-1.5 overflow-hidden rounded-full bg-line/10">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${ethShare}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="h-full bg-info"
          />
          <div className="h-full flex-1 bg-emerald-400/80" style={{ width: `${usdtShare}%` }} />
        </div>
        <div className="flex items-center justify-between gap-3 text-[11px] font-bold">
          <span className="flex min-w-0 items-center gap-1.5 text-muted">
            <span className="h-2 w-2 shrink-0 rounded-full bg-info" />
            {t('allocationEth')}
            <span className="num-ltr truncate text-ink">
              {fmtIntLatin(ethShare)}٪ · {fmtUSD(ethValue)}
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-muted">
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
            {t('allocationUsdt')}
            <span className="num-ltr truncate text-ink">
              {fmtIntLatin(usdtShare)}٪ · {fmtUSD(cashUsd)}
            </span>
          </span>
        </div>
      </div>
    </GlassCard>
  );
}
