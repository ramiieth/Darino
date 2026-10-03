import { useEffect,useState } from 'react';
import { useTvlFlow,loadTvlFlow } from '../data/useTvlFlow';
import { approvedNetwork } from '@/shared/lib/approvedNetworks';
import { ensureDirectory,useDirectoryStore } from '@/features/connected/data/directory';
import { findProtocol } from '@/features/connected/domain/directory/model';
import { LogoImage } from '@/shared/components/ui/EntityLogo';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Button } from '@/shared/components/ui/Button';
import { SearchField } from '@/shared/components/ui/Input';
import { MoneyValue } from '@/shared/components/ui/FinancialValue';
import { normalizeForSearch,toFaDigits } from '@/shared/utils/formatters';
import { FLOW_PERIODS,type FlowPeriod,downsample } from '../domain/tvlFlow';
import { Sparkline } from './Sparkline';

function Change({value}:{value:number|null|undefined}){return <span dir="ltr" className={`whitespace-nowrap text-xs tabular-nums ${value==null?'text-muted':value<0?'text-loss':'text-gain'}`}>{value==null?'—':toFaDigits(`${value>0?'+':''}${value.toFixed(2)}٪`)}</span>;}
export function TvlFlowDashboard(){
 const data=useTvlFlow(),metadata=useDirectoryStore(s=>s.metadata);
 const [tab,setTab]=useState<'chains'|'protocols'>('chains'),[period,setPeriod]=useState<FlowPeriod>(7),[query,setQuery]=useState('');
 useEffect(()=>{void ensureDirectory();},[]);
 const q=normalizeForSearch(query);
 const chains=data.chains.filter(c=>approvedNetwork(c.name));
 const protocols=data.protocols.flatMap(p=>{const identity=findProtocol(p.s,metadata);return identity&&p.t>0?[{...p,identity}]:[];}).sort((a,b)=>b.t-a.t);
 const rows=protocols.filter(p=>normalizeForSearch(p.identity.nameFa+' '+p.n).includes(q));
 return <div className="min-w-0 space-y-5">
 <Surface className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="text-xs text-muted">ارزش قفل‌شده در شبکه‌های منتخب</p><div className="mt-2 text-2xl font-bold"><MoneyValue value={data.loadedAt?chains.reduce((s,c)=>s+c.tvl,0):null}/></div></div><Button size="sm" variant="ghost" loading={data.loading} onClick={()=>void loadTvlFlow()}>به‌روزرسانی</Button></Surface>
 <div className="flex flex-wrap items-center justify-between gap-3"><div role="tablist" aria-label="نمای دیفای" className="flex gap-4 border-b border-divider">{([['chains','شبکه‌ها'],['protocols','پروتکل‌ها']] as const).map(([id,name])=><button key={id} role="tab" aria-selected={tab===id} aria-controls={`defi-${id}`} onClick={()=>{setTab(id);setQuery('');}} className={`min-h-11 border-b-2 px-2 text-sm font-semibold ${tab===id?'border-accent text-accent':'border-transparent text-muted'}`}>{name}</button>)}</div>{tab==='chains'?<div className="flex flex-wrap gap-1" role="group" aria-label="بازهٔ تغییر ارزش قفل‌شده">{FLOW_PERIODS.map(p=><button key={p} aria-pressed={period===p} onClick={()=>setPeriod(p)} className={`min-h-10 rounded-full px-3 text-xs ${period===p?'bg-accent/10 text-accent':'text-muted'}`}>{toFaDigits(p)} روز</button>)}</div>:<div className="w-full sm:w-60"><SearchField label="جستجوی پروتکل" placeholder="نام پروتکل" value={query} onChange={setQuery}/></div>}</div>
 {data.error&&<p role="status" className="text-xs text-warn">اتصال به دیفای‌لاما برقرار نشد؛ دوباره تلاش کنید.</p>}
 {tab==='chains'?<section role="tabpanel" id="defi-chains" className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">{chains.map(c=>{const n=approvedNetwork(c.name)!,change=c.changes[period];return <Surface key={c.name} className="min-w-0 p-4"><div className="flex items-center gap-3"><LogoImage src={n.logo} label={n.name} size={34}/><h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{n.name}</h3><Change value={change?.pct}/></div><div className="my-4 text-lg font-semibold"><MoneyValue value={c.tvl}/></div><Sparkline points={downsample((c.history??[]).filter(p=>p.date>=Date.now()/1000-period*86400),40)} positive={(change?.pct??0)>=0}/></Surface>;})}{!chains.length&&<p className="py-6 text-sm text-muted">{data.loading?'در حال دریافت شبکه‌ها…':'داده‌ای برای شبکه‌های منتخب موجود نیست.'}</p>}</section>:<Surface role="tabpanel" id="defi-protocols" className="min-w-0 overflow-hidden px-4"><div className="flex items-center justify-between border-b border-divider py-3 text-[11px] text-muted"><span>پروتکل</span><span>ارزش قفل‌شده · تغییر هفتگی</span></div>{rows.slice(0,60).map(p=><div key={p.s} className="flex min-w-0 items-center gap-3 border-b border-divider py-4 last:border-0"><LogoImage src={p.identity.logo} label={p.identity.nameFa} size={34}/><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold">{p.identity.nameFa}</h3>{approvedNetwork(p.ch)&&<span className="mt-1 flex items-center gap-1 text-[11px] text-muted"><LogoImage src={approvedNetwork(p.ch)!.logo} label={approvedNetwork(p.ch)!.name} size={14}/>{approvedNetwork(p.ch)!.name}</span>}</div><div className="min-w-0 max-w-[48%] text-end"><div className="text-sm font-semibold"><MoneyValue value={p.t}/></div><Change value={p.c7}/></div></div>)}{!rows.length&&<p className="py-8 text-center text-xs text-muted">{data.loading?'در حال دریافت پروتکل‌ها…':'پروتکلی یافت نشد.'}</p>}</Surface>}
 <p className="text-[11px] leading-5 text-muted">منبع: دیفای‌لاما · تغییر ارزش قفل‌شده شامل تغییر قیمت دارایی‌هاست و معادل ورود یا خروج خالص سرمایه نیست.</p>
 </div>;
}
