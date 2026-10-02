import { useState,useCallback } from 'react';
import { Check,ChevronDown,Layers } from 'lucide-react';
import { Sheet } from '@/shared/components/ui/Sheet';
import { SearchField } from '@/shared/components/ui/Input';
import { LogoImage } from '@/shared/components/ui/EntityLogo';
import { NETWORKS } from '@/features/custody/domain/catalog';
import { normalizeForSearch } from '@/shared/utils/formatters';
import type { ChainInfo } from '../domain/model';
import { chainIdentity } from './identity';
export function NetworkPicker({value,onChange,chains=[],ids=[],label='انتخاب شبکه',all=true}:{value:string;onChange:(id:string)=>void;chains?:ChainInfo[];ids?:string[];label?:string;all?:boolean}) {
 const [open,setOpen]=useState(false),[q,setQ]=useState('');const close=useCallback(()=>setOpen(false),[]);
 const options=[...new Set([...NETWORKS.map(n=>n.id),...chains.map(n=>n.id),...ids])];
 const selected=chainIdentity(value,chains),search=normalizeForSearch(q);
 return <><button type="button" aria-label={label} aria-haspopup="dialog" onClick={()=>{setQ('');setOpen(true);}} className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-field border border-divider bg-card px-3 py-2 text-start text-sm">{value==='all'?<Layers className="h-5 w-5 text-accent"/>:<LogoImage src={selected.logo} label={selected.name} size={24}/>}<span className="min-w-0 flex-1 truncate">{value==='all'?'همهٔ شبکه‌ها':selected.name}</span><ChevronDown className="h-4 w-4 text-muted"/></button><Sheet open={open} onClose={close} title="انتخاب شبکه" size="sm"><div className="space-y-3"><SearchField label="جستجوی شبکه" placeholder="نام شبکه" value={q} onChange={setQ}/><ul className="max-h-[55vh] overflow-y-auto overscroll-contain" role="listbox" aria-label="شبکه‌ها">{[...(all?['all']:[]),...options].filter(id=>id==='all'?!search:normalizeForSearch(id+' '+chainIdentity(id,chains).name).includes(search)).map(id=>{const n=chainIdentity(id,chains);return <li key={id}><button type="button" role="option" aria-selected={value===id} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-3 text-start hover:bg-surface-2" onClick={()=>{onChange(id);close();}}>{id==='all'?<Layers className="h-8 w-8 text-accent"/>:<LogoImage src={n.logo} label={n.name} size={32}/>}<span className="min-w-0 flex-1 truncate text-sm font-semibold">{id==='all'?'همهٔ شبکه‌ها':n.name}</span>{id===value&&<Check className="h-4 w-4 text-accent"/>}</button></li>;})}</ul></div></Sheet></>;
}
