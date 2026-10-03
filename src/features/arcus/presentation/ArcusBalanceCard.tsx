import { Surface } from '@/shared/components/ui/GlassCard';
import { TokenLogo,LogoImage } from '@/shared/components/ui/EntityLogo';
import { AssetValue } from '@/features/connected/presentation/AssetValue';
import { chainIdentity,tokenQuantity } from '@/features/connected/presentation/identity';
import type { ArcusAccount } from '../api/types';
/** Quote-account credit is not a wallet ERC-20 balance; equity includes position PnL. */
export function ArcusBalanceCard({account,env='mainnet'}:{account:ArcusAccount|null|undefined;env?:'mainnet'|'testnet'}) {
 const n=chainIdentity('robinhood');
 return <Surface className="native-wallet-card space-y-4 p-4 sm:p-5"><div className="flex min-w-0 items-center gap-3"><TokenLogo logo="/logos/token-usdg.png" symbol="USDG" name="یو اس دی جی" networkLogo={n.logo} networkName={n.name} size={44}/><div className="min-w-0 flex-1"><p className="font-bold text-ink">یو اس دی جی{env==='testnet'?' · آزمایشی':''}</p></div><div className="min-w-0 max-w-[45%] text-end"><p className="break-words text-lg font-bold tabular-nums"><span dir="rtl" className="persian-amount"><bdi dir="ltr">{tokenQuantity(account?.netQuoteBalance)}</bdi> <span className="text-xs font-normal text-muted">یو اس دی جی</span></span></p></div></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-3"><span className="inline-flex items-center gap-1.5 text-xs text-muted"><LogoImage src={n.logo} label={n.name} size={18}/>{n.name}</span><div className="text-end"><p className="mb-1 text-[10px] text-muted">ارزش کل حساب</p><AssetValue value={account?Number(account.equity):null} primaryClassName="text-lg font-semibold"/></div></div></Surface>;
}
