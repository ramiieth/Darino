import { yieldTokenIdentity } from '@/shared/domain/yieldTokenIdentity';
import { YieldTokenLabel, YieldTokenMaturity } from '@/shared/components/ui/YieldTokenLabel';
import { AssetValue } from './AssetValue';
import { useState,useCallback } from 'react';
import { ChevronDown,Check } from 'lucide-react';
import { Sheet } from '@/shared/components/ui/Sheet';
import { SearchField } from '@/shared/components/ui/Input';
import { TokenLogo } from '@/shared/components/ui/EntityLogo';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { chainIdentity,tokenName,tokenQuantity } from './identity';
export interface AssetOption {key:string;symbol:string;name:string;chain:string;icon:string|null;contract?:string|null;quantity:string;value:number|null;networks?:string[]}
export function AssetPicker({options,value,onChange,label='انتخاب رمزارز'}:{options:AssetOption[];value:string;onChange:(key:string)=>void;label?:string}) {
 const [open,setOpen]=useState(false),[search,setSearch]=useState('');
 const close=useCallback(()=>setOpen(false),[]);
 const selected=options.find(a=>a.key===value);
 function identity(a:AssetOption){const n=chainIdentity(a.chain),receipt=yieldTokenIdentity(a.symbol,a.name);return <><TokenLogo chain={a.chain} contract={a.contract} logo={a.icon} symbol={a.symbol} name={tokenName(a.symbol,a.name)} networkLogo={n.logo} networkName={n.name} size={36}/><span className="min-w-0 flex-1 text-start"><span className="block font-semibold">{receipt?<YieldTokenLabel symbol={a.symbol} name={a.name}/>:tokenName(a.symbol,a.name)}</span><span className="mt-1 block text-xs leading-5 text-muted">{(a.networks??[a.chain]).map(id=>chainIdentity(id).name).join(' · ')}{receipt&&<> · <YieldTokenMaturity symbol={a.symbol} name={a.name}/></>}</span></span><span className="min-w-0 text-end"><AssetValue value={a.value} primaryClassName="text-sm" className="text-end"/><span dir="rtl" className="mt-1 block break-words text-xs text-muted">{tokenQuantity(a.quantity)} {!receipt&&tokenName(a.symbol)}</span></span></>;}
 return <><button type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setSearch('');setOpen(true);}} className="flex min-h-16 w-full items-center gap-3 rounded-field border border-divider-strong bg-card p-3 text-sm transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{selected?identity(selected):<span className="flex-1 text-start text-muted">{label}</span>}<ChevronDown className="h-4 w-4 shrink-0 text-muted"/></button>
 <Sheet open={open} onClose={close} title={label} size="md"><div className="space-y-3"><SearchField label="جستجوی رمزارز" placeholder="نام، نماد یا شبکه" value={search} onChange={setSearch}/><ul className="max-h-[55vh] divide-y divide-divider overflow-y-auto">{options.filter(a=>[a.name,a.symbol,tokenName(a.symbol,a.name),...(a.networks??[a.chain]).map(id=>chainIdentity(id).name)].join(' ').toLowerCase().includes(search.trim().toLowerCase())).map(a=><li key={a.key}><button type="button" aria-label={`انتخاب ${tokenName(a.symbol,a.name)}`} aria-pressed={value===a.key} className="flex w-full items-center gap-3 rounded-field py-4 text-sm hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" onClick={()=>{onChange(a.key);setOpen(false);}}>{identity(a)}{value===a.key&&<Check className="h-4 w-4 shrink-0 text-accent"/>}</button></li>)}</ul>{!options.length&&<p className="py-4 text-sm text-muted">دارایی قابل انتخاب یافت نشد.</p>}</div></Sheet></>;
}
