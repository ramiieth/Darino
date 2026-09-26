/**
 * ETH reference scenario — the configured ETH position (Settings → scenario)
 * valued at the live price. Secondary to the accounting-based positions above.
 */
import { Surface, Section } from '@/shared/components/ui/GlassCard';
import { SourceBadge } from '@/shared/components/ui/SourceBadge';
import { MoneyValue, PercentValue, QuantityValue, KeyValueList } from '@/shared/components/ui/FinancialValue';
import { computeEthSummary } from '@/features/eth-summary/domain/ethSummary';
import { useCoinLivePrice } from '@/features/simulation/data/useCryptoPrices';
import { useSettingsStore } from '@/shared/store/settingsStore';
import { t } from '@/shared/i18n/fa';

/** @deprecated legacy constant — the accounting ledger is the source of truth for holdings */
export const USER_ASSETS = { ETH: 3.33, USDT: 23_216 } as const;

export function EthSummaryCard() {
  const liveEth = useCoinLivePrice('ethereum');
  const scenario = useSettingsStore((s) => s.scenario);

  const s = computeEthSummary(liveEth, {
    amount: scenario.ethAmount,
    buyPrice: scenario.ethBuyPrice,
    initialInvestment: scenario.ethInitialInvestment,
    usdcAllocation: scenario.usdcAllocation2026
  });

  return (
    <Section
      id="eth-scenario"
      title="سناریوی اتریوم"
      description="موقعیت مرجع تنظیمات، با قیمت روز"
      action={<SourceBadge source={s.source} />}
    >
      <Surface className="p-4 md:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-muted">{t('ethCurrentValue')}</p>
            <p className="mt-1 text-2xl font-extrabold tracking-tight text-ink">
              <MoneyValue value={s.currentValue} state={s.source === 'snapshot' ? 'stale' : 'ready'} />
            </p>
          </div>
          <div className="text-end text-sm">
            <MoneyValue value={s.profitLoss} signed tone="auto" className="font-semibold" />
            <span className="ms-1.5">
              <PercentValue value={s.profitLossPct} />
            </span>
          </div>
        </div>
        <KeyValueList
          className="mt-4 border-t border-divider"
          dense
          rows={[
            { label: t('ethAmount'), value: <QuantityValue value={s.amount} unit="ETH" digits={4} /> },
            { label: t('ethBuyPrice'), value: <MoneyValue value={s.buyPrice} /> },
            { label: t('ethInitialInvestment'), value: <MoneyValue value={s.initialInvestment} /> },
            { label: t('ethCurrentPrice'), value: <MoneyValue value={s.currentPrice} /> }
          ]}
        />
      </Surface>
    </Section>
  );
}
