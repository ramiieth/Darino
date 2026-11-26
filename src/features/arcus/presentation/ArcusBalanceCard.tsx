import { Surface } from '@/shared/components/ui/GlassCard';
import { TokenLogo, LogoImage } from '@/shared/components/ui/EntityLogo';
import { AssetValue } from '@/features/connected/presentation/AssetValue';
import { chainIdentity, tokenQuantity } from '@/features/connected/presentation/identity';
import type { ArcusAccount } from '../api/types';

/** Quote-account credit is not a wallet ERC-20 balance; equity includes position PnL. */
export function ArcusBalanceCard({ account, env = 'mainnet' }: { account: ArcusAccount | null | undefined; env?: 'mainnet' | 'testnet' }) {
  const n = chainIdentity('robinhood');
  return (
    <Surface variant="focal" className="native-wallet-card relative space-y-4 overflow-hidden p-4 sm:p-5">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-l from-accent via-gain/60 to-transparent" />
      <div className="flex min-w-0 items-center gap-3">
        <TokenLogo logo="/logos/token-usdg.png" symbol="USDG" name="یو اس دی جی" networkLogo={n.logo} networkName={n.name} size={44} />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink">
            یو اس دی جی{env === 'testnet' ? ' · آزمایشی' : ''}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">موجودی نقدی حساب پرپچوال</p>
        </div>
        <div className="min-w-0 max-w-[45%] rounded-xl border border-divider/80 bg-surface-2/55 px-3 py-2 text-end">
          <p className="break-words text-lg font-extrabold tabular-nums text-ink">
            <span dir="rtl" className="persian-amount">
              <bdi dir="ltr">{tokenQuantity(account?.netQuoteBalance)}</bdi>{' '}
              <span className="text-xs font-normal text-muted">یو اس دی جی</span>
            </span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider/80 pt-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2/80 px-2.5 py-1 text-xs font-medium text-muted">
          <LogoImage src={n.logo} label={n.name} size={16} />
          {n.name}
        </span>
        <div className="text-end">
          <p className="mb-0.5 text-[11px] font-medium text-muted">ارزش کل حساب</p>
          <AssetValue value={account ? Number(account.equity) : null} primaryClassName="text-lg font-extrabold" />
        </div>
      </div>
    </Surface>
  );
}
