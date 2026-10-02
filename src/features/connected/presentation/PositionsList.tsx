import { TokenLogo, LogoImage } from '@/shared/components/ui/EntityLogo';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { chainIdentity, tokenName, positionNames, tokenQuantity } from './identity';
import { visiblePositions,tokenLogo } from '../domain/visibility';
import type { WalletSnapshot } from '../domain/model';
export function PositionsList({ data }: { data:WalletSnapshot }) {
 const positions=visiblePositions(data.positions);
 return <>{!data.complete&&<Notice tone="warn">{data.detailsError||'جزئیات دارایی‌ها کامل دریافت نشده است.'}</Notice>}
 {!positions.length&&data.complete&&<p className="py-6 text-sm text-muted">دارایی قابل نمایش یافت نشد.</p>}
 <ul className="divide-y divide-divider">{positions.map(p=>{const chain=chainIdentity(p.chain,data.chains);return <li key={p.id} className="py-4">
 <div className="flex items-center gap-3"><TokenLogo logo={tokenLogo(p)} symbol={p.symbol} name={tokenName(p.symbol,p.name)} networkLogo={chain.logo} networkName={chain.name} size={42}/>
 <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{tokenName(p.symbol,p.name)}</p><p className="mt-1 truncate text-xs text-muted">{chain.name}{p.type!=='wallet'&&` · ${positionNames[p.type]??'پوزیشن'}`}</p></div>
 <div className="min-w-0 max-w-[50%] text-end"><MoneyValue value={p.value} className="text-sm font-semibold"/><p dir="ltr" className="mt-1 break-words text-xs text-muted" title={p.quantity??undefined}>{tokenQuantity(p.quantity)} <bdi>{p.symbol}</bdi></p></div></div>
 <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer text-end">جزئیات</summary><div className="mt-2 rounded-field bg-surface-2 p-3"><p>قیمت هر واحد <MoneyValue value={p.price}/></p>{p.protocol&&<p className="mt-2 inline-flex items-center gap-2"><LogoImage src={p.protocolIcon} label={p.protocol} size={16}/>{p.protocol}</p>}{p.contract&&<bdi dir="ltr" className="mt-2 block break-all">{p.contract}</bdi>}</div></details>
 </li>;})}</ul></>;
}
