import { useState } from 'react';
import { SearchField,Select,Input } from '@/shared/components/ui/Input';
import { Badge } from '@/shared/components/ui/Badge';
import { ActivityList } from './ActivityList';
import { chainIdentity,tokenName,platformName,operationNames } from './identity';
import { filterActivities } from '../domain/activityView';
import { visibleTransaction,visibleTransfer } from '../domain/visibility';
import type { Activity,ActivityLink } from '../domain/activity';
import type { ChainInfo } from '../domain/model';
export function ActivityExplorer({rows,links=[],addresses=[],chains=[],compact=false}:{rows:Activity[];links?:ActivityLink[];addresses?:string[];chains?:ChainInfo[];compact?:boolean}) {
 const [search,setSearch]=useState(''),[kind,setKind]=useState('all'),[asset,setAsset]=useState('all'),[date,setDate]=useState(''),[network,setNetwork]=useState('all');
 const visible=rows.filter(r=>!r.tx||visibleTransaction(r.tx));
 const networks=[...new Set(visible.flatMap(r=>r.tx?[r.tx.chain]:[]))];
 const kinds=[...new Set(visible.map(r=>r.kind))];
 const assets=[...new Map(visible.flatMap(r=>r.tx?[...r.tx.transfers,...r.tx.approvals??[]].filter(t=>visibleTransfer(t,r.tx!.chain)).map(t=>[`${t.chain??r.tx?.chain}:${t.tokenId||t.contract||t.symbol}`,{...t,chain:t.chain??r.tx!.chain}] as const):[])).entries()];
 const filtered=filterActivities(visible,{search:'',kind,asset,date}).filter(r=>network==='all'||r.tx?.chain===network).filter(r=>!search.trim()||[r.label,operationNames[r.kind]??r.kind,r.tx?.protocol,r.tx?.protocol?platformName(r.tx.protocol):'',r.tx?.hash,r.tx?.from,r.tx?.to,...[...r.tx?.transfers??[],...r.tx?.approvals??[]].flatMap(t=>[tokenName(t.symbol,t.name??t.symbol),t.symbol,t.address,t.sender,t.recipient,t.contract])??[]].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
 return <div className="space-y-4"><div className="space-y-3"><div className="flex flex-wrap items-center gap-2"><Badge tone="gain">اسپم پنهان است</Badge><div className="ms-auto min-w-0"><Select aria-label="شبکهٔ تراکنش" value={network} onChange={e=>setNetwork(e.target.value)}><option value="all">همهٔ شبکه‌ها</option>{networks.map(id=><option key={id} value={id}>{chainIdentity(id,chains).name}</option>)}</Select></div></div><SearchField label="جستجوی تراکنش" placeholder="جستجوی دارایی، آدرس یا پلتفرم" value={search} onChange={setSearch}/>{!compact&&<div className="grid grid-cols-1 gap-2 sm:grid-cols-3"><Select aria-label="نوع تراکنش" value={kind} onChange={e=>setKind(e.target.value)}><option value="all">همهٔ تراکنش‌ها</option>{kinds.map(k=><option key={k} value={k}>{operationNames[k]??(k==='DEPOSIT'?'واریز آرکوس':k==='WITHDRAWAL'?'برداشت آرکوس':'فعالیت آرکوس')}</option>)}</Select><Select aria-label="دارایی تراکنش" value={asset} onChange={e=>setAsset(e.target.value)}><option value="all">همهٔ دارایی‌ها</option>{assets.map(([key,t])=><option key={key} value={key}>{tokenName(t.symbol,t.name??t.symbol)} · {chainIdentity(t.chain??'',chains).name}</option>)}</Select><Input type="date" aria-label="تاریخ تراکنش" value={date} onChange={e=>setDate(e.target.value)}/></div>}</div>
 <ActivityList rows={compact?filtered.slice(0,12):filtered} links={links} addresses={addresses} chains={chains}/>{!filtered.length&&<p className="py-6 text-center text-sm text-muted">تراکنش قابل نمایش یافت نشد.</p>}</div>;
}
