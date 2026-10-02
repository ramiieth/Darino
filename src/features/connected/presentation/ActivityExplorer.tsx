import { NetworkPicker } from './NetworkPicker';
import { SmartDateField } from '@/shared/components/ui/SmartDateField';
import { parseIsoToTs,formatGregorianIso } from '@/shared/utils/jalali';
import { Sheet } from '@/shared/components/ui/Sheet';
import { Button } from '@/shared/components/ui/Button';
import { SlidersHorizontal } from 'lucide-react';
import { useState,useCallback } from 'react';
import { SearchField,Select } from '@/shared/components/ui/Input';
import { Badge } from '@/shared/components/ui/Badge';
import { ActivityList } from './ActivityList';
import { chainIdentity,tokenName,platformName,operationNames } from './identity';
import { filterActivities } from '../domain/activityView';
import { visibleTransaction,visibleTransfer } from '../domain/visibility';
import type { Activity,ActivityLink } from '../domain/activity';
import type { ChainInfo } from '../domain/model';
export function ActivityExplorer({rows,links=[],addresses=[],chains=[],compact=false}:{rows:Activity[];links?:ActivityLink[];addresses?:string[];chains?:ChainInfo[];compact?:boolean}) {
 const [search,setSearch]=useState(''),[kind,setKind]=useState('all'),[asset,setAsset]=useState('all'),[date,setDate]=useState(''),[network,setNetwork]=useState('all');
 const [open,setOpen]=useState(false);const close=useCallback(()=>setOpen(false),[]);
 const visible=rows.filter(r=>!r.tx||visibleTransaction(r.tx));
 const networks=[...new Set(visible.flatMap(r=>r.tx?[r.tx.chain]:[]))];
 const kinds=[...new Set(visible.map(r=>r.kind))];
 const assets=[...new Map(visible.flatMap(r=>r.tx?[...r.tx.transfers,...r.tx.approvals??[]].filter(t=>visibleTransfer(t,r.tx!.chain)).map(t=>[`${t.chain??r.tx?.chain}:${t.tokenId||t.contract||t.symbol}`,{...t,chain:t.chain??r.tx!.chain}] as const):[])).entries()];
 const filtered=filterActivities(visible,{search:'',kind,asset,date}).filter(r=>network==='all'||r.tx?.chain===network).filter(r=>!search.trim()||[r.label,operationNames[r.kind]??r.kind,r.tx?.protocol,r.tx?.protocol?platformName(r.tx.protocol):'',r.tx?.hash,r.tx?.from,r.tx?.to,...[...r.tx?.transfers??[],...r.tx?.approvals??[]].flatMap(t=>[tokenName(t.symbol,t.name??t.symbol),t.symbol,t.address,t.sender,t.recipient,t.contract])??[]].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
 return <div className="native-activity-explorer space-y-3"><div className="flex items-center gap-2"><div className="min-w-0 flex-1"><SearchField label="جستجوی تراکنش" placeholder="جستجوی تراکنش" value={search} onChange={setSearch}/></div><Button variant="outline" aria-label="فیلتر تراکنش‌ها" onClick={()=>setOpen(true)}><SlidersHorizontal className="h-4 w-4"/></Button></div>
 <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted"><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-positive"/>اسپم پنهان است</span>{network!=='all'&&<Badge>{chainIdentity(network,chains).name}</Badge>}{kind!=='all'&&<Badge>{operationNames[kind]??'فعالیت آرکوس'}</Badge>}</div>
 <ActivityList rows={compact?filtered.slice(0,12):filtered} links={links} addresses={addresses} chains={chains}/>{!filtered.length&&<p className="py-6 text-center text-sm text-muted">تراکنش قابل نمایش یافت نشد.</p>}
 <Sheet open={open} onClose={close} title="فیلتر تراکنش‌ها" footer={<Button className="w-full" onClick={close}>نمایش نتیجه</Button>}><div className="space-y-4"><div className="space-y-1"><p className="text-xs text-muted">شبکه</p><NetworkPicker label="شبکهٔ تراکنش" value={network} onChange={setNetwork} chains={chains} ids={networks}/></div><label className="block text-xs text-muted">نوع تراکنش<Select aria-label="نوع تراکنش" value={kind} onChange={e=>setKind(e.target.value)}><option value="all">همهٔ تراکنش‌ها</option>{kinds.map(k=><option key={k} value={k}>{operationNames[k]??(k==='DEPOSIT'?'واریز آرکوس':k==='WITHDRAWAL'?'برداشت آرکوس':'فعالیت آرکوس')}</option>)}</Select></label><label className="block text-xs text-muted">دارایی<Select aria-label="دارایی تراکنش" value={asset} onChange={e=>setAsset(e.target.value)}><option value="all">همهٔ دارایی‌ها</option>{assets.map(([key,t])=><option key={key} value={key}>{tokenName(t.symbol,t.name??t.symbol)} · {chainIdentity(t.chain??'',chains).name}</option>)}</Select></label><div><SmartDateField label="تاریخ تراکنش" value={date?parseIsoToTs(date):null} onChange={ts=>setDate(ts===null?'':formatGregorianIso(ts))} compact/></div><Button variant="ghost" className="w-full" onClick={()=>{setKind('all');setAsset('all');setDate('');setNetwork('all');setSearch('');}}>پاک‌کردن فیلترها</Button></div></Sheet></div>;
}
