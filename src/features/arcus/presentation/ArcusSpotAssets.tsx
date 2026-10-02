import { TokenLogo,LogoImage } from '@/shared/components/ui/EntityLogo';
import { AssetValue } from '@/features/connected/presentation/AssetValue';
import { chainIdentity,tokenQuantity,tokenName } from '@/features/connected/presentation/identity';
import { visiblePositions,tokenLogo } from '@/features/connected/domain/visibility';
import { assetDisplayName } from '@/shared/i18n/assetDisplayName';
import type { LivePosition,ChainInfo } from '@/features/connected/domain/model';
export function ArcusSpotAssets({positions,chains}:{positions:LivePosition[];chains?:ChainInfo[]}) {
 const rows=visiblePositions(positions),n=chainIdentity('robinhood',chains);
 if(!rows.length)return <p className="py-5 text-center text-sm text-muted">دارایی اسپات قابل نمایش یافت نشد.</p>;
 return <ul className="grid gap-3 sm:grid-cols-2">{rows.map(p=>{const name=tokenName(p.symbol,assetDisplayName(p.symbol,p.name).name);return <li key={p.id} className="native-wallet-card min-w-0 rounded-card border border-divider bg-card p-4"><div className="flex items-center gap-3"><TokenLogo logo={tokenLogo(p)} symbol={p.symbol} name={name} networkLogo={n.logo} networkName={n.name} size={42}/><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{name}</p><p className="text-[10px] text-muted">اسپات · {p.symbol}</p></div></div><p className="mt-4 break-words text-xl font-bold tabular-nums"><bdi dir="ltr">{tokenQuantity(p.quantity)} <span className="text-xs font-normal text-muted">{p.symbol}</span></bdi></p><div className="mt-3 flex flex-wrap items-end justify-between gap-2 border-t border-divider pt-3"><span className="inline-flex items-center gap-1.5 text-[10px] text-muted"><LogoImage src={n.logo} label={n.name} size={16}/>{n.name}</span><AssetValue value={p.value} primaryClassName="text-sm font-semibold" className="text-end"/></div></li>;})}</ul>;
}
