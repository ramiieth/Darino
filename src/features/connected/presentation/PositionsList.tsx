import { TokenLogo,LogoImage } from '@/shared/components/ui/EntityLogo';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { Notice } from '@/shared/components/ui/StateViews';
import { toFaDigits } from '@/shared/utils/formatters';
import { chainIdentity,tokenName,positionNames,tokenQuantity,platformName } from './identity';
import { tokenLogo } from '../domain/visibility';
import { positionRows } from '../domain/positions';
import type { WalletSnapshot } from '../domain/model';
export function PositionsList({data,groupByToken=false}:{data:WalletSnapshot;groupByToken?:boolean}) {
 const positions=positionRows(data.positions,groupByToken);
 return <>{!data.complete&&<Notice tone="warn">{data.detailsError||'جزئیات دارایی‌ها کامل دریافت نشده است.'}</Notice>}
 {!positions.length&&data.complete&&<p className="py-6 text-sm text-muted">دارایی قابل نمایش یافت نشد.</p>}
 {!!positions.length&&<div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] gap-4 border-b border-divider py-3 text-xs font-semibold text-muted lg:grid" aria-hidden><span>دارایی</span><span>قیمت</span><span>مقدار موجودی</span><span className="text-end">ارزش</span></div>}
 <ul className="divide-y divide-divider">{positions.map(p=>{const chain=chainIdentity(p.chain,data.chains),multi=p.networks.length>1;return <li key={p.id} className="py-4">
 <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-4">
 <div className="flex min-w-0 items-center gap-3"><TokenLogo logo={tokenLogo(p)} symbol={p.symbol} name={tokenName(p.symbol,p.name)} networkLogo={multi?null:chain.logo} networkName={multi?undefined:chain.name} size={42}/><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{tokenName(p.symbol,p.name)}</p><p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">{multi?<><span className="inline-flex -space-x-1" dir="ltr">{p.networks.slice(0,4).map(id=>{const n=chainIdentity(id,data.chains);return <LogoImage key={id} src={n.logo} label={n.name} size={14}/>;})}</span>{toFaDigits(p.networks.length)} شبکه</>:chain.name}{p.type!=='wallet'&&` · ${positionNames[p.type]??'پوزیشن'}`}</p></div></div>
 <div className="hidden text-sm lg:block"><MoneyValue value={p.price}/></div>
 <p dir="ltr" className="col-start-1 row-start-2 break-words ps-[54px] text-start text-xs text-muted lg:col-auto lg:row-auto lg:p-0 lg:text-sm" title={p.quantity??undefined}>{tokenQuantity(p.quantity)} <bdi>{p.symbol}</bdi></p>
 <div className="col-start-2 row-start-1 min-w-0 text-end lg:col-auto lg:row-auto"><MoneyValue value={p.value} className="text-sm font-semibold"/></div></div>
 <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer text-end">{multi?'تفکیک شبکه‌ها':'جزئیات'}</summary><div className="mt-2 space-y-3 rounded-field bg-surface-2 p-3"><p className="lg:hidden">قیمت هر واحد <MoneyValue value={p.price}/></p>{p.legs.map(leg=>{const n=chainIdentity(leg.chain,data.chains);return <div key={leg.id}><div className="flex flex-wrap items-center justify-between gap-2"><span className="inline-flex items-center gap-2"><LogoImage src={n.logo} label={n.name} size={18}/>{n.name}</span><bdi dir="ltr">{tokenQuantity(leg.quantity)} {leg.symbol}</bdi><MoneyValue value={leg.value}/></div>{leg.protocol&&<p className="mt-2 inline-flex items-center gap-2"><LogoImage src={leg.protocolIcon} label={leg.protocol} size={16}/>{platformName(leg.protocol)}</p>}{leg.contract&&<bdi dir="ltr" className="mt-2 block break-all">{leg.contract}</bdi>}</div>;})}</div></details>
 </li>;})}</ul></>;
}
