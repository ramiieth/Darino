import { TokenLogo } from '@/shared/components/ui/EntityLogo';
import type { BorosMarket } from '../domain/types';
import { borosAssetName, borosVenueName } from './borosLabels';
import { toFaDigits } from '@/shared/utils/formatters';
const logos: Record<string, string> = { ETH: '/logos/token-eth.svg', BTC: '/logos/token-btc.png', HYPE: '/logos/token-hype.jpg', BNB: '/logos/chain-56.svg', SOL: '/logos/chain-solana.svg', USDT: '/logos/token-usdt.svg', USDC: '/logos/token-usdc.svg' };
export function MarketIdentity({ market, compact = false }: { market: BorosMarket; compact?: boolean }) {
  return <div className="flex min-w-0 items-center gap-3">
    <TokenLogo logo={logos[market.asset]} symbol={market.asset} name={borosAssetName(market.asset)} networkLogo="/logos/chain-arbitrum.svg" networkName="آربیتروم" size={compact ? 30 : 36} />
    <div className="min-w-0"><p className="font-bold text-ink">{borosAssetName(market.asset)}</p><p className="text-xs text-muted">{borosVenueName(market.venue)} · {toFaDigits(new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(market.maturity * 1000)))}</p></div>
  </div>;
}
