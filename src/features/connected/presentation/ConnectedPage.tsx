import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus,Wallet,ArrowLeft } from 'lucide-react';
import { Page,PageHeader } from '@/shared/components/layout/Page';
import { Surface } from '@/shared/components/ui/GlassCard';
import { Field,Input } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { Sheet } from '@/shared/components/ui/Sheet';
import { Notice } from '@/shared/components/ui/StateViews';
import { LogoImage } from '@/shared/components/ui/EntityLogo';
import { HttpError } from '@/repositories/remoteClient';
import { useCustody } from '@/features/custody/data/useCustody';
import { saveHolding,savePref,getPref,getCustodySnapshot } from '@/features/custody/data/repository';
import { useCustodySync } from '@/features/custody/data/sync';
import { CONNECTED_PREF } from '../data/useConnectedPortfolio';
import { validPublicAddress,addressKey } from '../domain/model';
import { ConnectedWalletCard } from './ConnectedWalletCard';
export const providerError=(e:unknown)=>e instanceof HttpError?e.code??'ارتباط با سرور برقرار نشد':e instanceof Error?e.message:'دریافت داده انجام نشد';
export const dateTime=(at:number)=>new Date(at).toLocaleString('fa-IR',{dateStyle:'short',timeStyle:'short'});
export default function ConnectedPage(){
 useCustodySync();const custody=useCustody();const [open,setOpen]=useState(false),[address,setAddress]=useState(''),[label,setLabel]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const enabled=getPref<string[]>(CONNECTED_PREF)?.value??[];
 const wallets=custody.holdings.filter(h=>h.kind==='wallet'&&!h.archivedAt&&h.address&&enabled.includes(h.id));
 const arcus=custody.holdings.filter(h=>h.kind==='arcus'&&!h.archivedAt);
 async function add(){if(busy)return;setError(null);setBusy(true);try{const publicAddress=address.trim();if(!await validPublicAddress(publicAddress))throw Error('آدرس عمومی معتبر وارد کنید');const existing=getCustodySnapshot().holdings.find(h=>h.kind==='wallet'&&h.address&&addressKey(h.address)===addressKey(publicAddress));if(existing&&enabled.includes(existing.id)&&!existing.archivedAt)throw Error('این کیف پول قبلاً اضافه شده است');const now=Date.now(),id=existing?.id??crypto.randomUUID();await saveHolding({...existing,id,kind:'wallet',address:publicAddress,label:label.trim()||existing?.label||'کیف پول من',createdAt:existing?.createdAt??now,updatedAt:now,archivedAt:null});await savePref(CONNECTED_PREF,[...new Set([...enabled,id])]);setOpen(false);setAddress('');setLabel('');}catch(e){setError(providerError(e));}finally{setBusy(false);}}
 async function disconnect(id:string){const ids=getPref<string[]>(CONNECTED_PREF)?.value??[];await savePref(CONNECTED_PREF,ids.filter(x=>x!==id));}
 return <Page><PageHeader title="مدیریت کیف پول‌ها" actions={<Button icon={<Plus/>} onClick={()=>{setError(null);setOpen(true);}}>افزودن کیف پول</Button>}/>
 <Surface className="wallet-management-list overflow-hidden"><ul aria-label="حساب‌های متصل" className="divide-y divide-divider">{wallets.map(h=><li key={h.id}><ConnectedWalletCard holding={h} onDisconnect={()=>disconnect(h.id)}/></li>)}{arcus.map(h=><li key={h.id}><Link to="/arcus" className="flex min-h-20 items-center gap-3 px-4 py-4 md:px-5"><LogoImage src="/logos/platform-arcus.png" label="آرکوس" size={36} square/><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{h.label}</p><p className="mt-1 text-xs text-muted">آرکوس{h.arcus?.env==='testnet'?' · آزمایشی':''}</p></div><ArrowLeft className="h-4 w-4 text-muted"/></Link></li>)}</ul>{!wallets.length&&!arcus.length&&<div className="flex flex-col items-center gap-3 px-5 py-12 text-center"><Wallet className="h-8 w-8 text-muted"/><p className="text-sm text-muted">هنوز کیف پولی اضافه نشده است.</p></div>}</Surface>
 <Link to="/dashboard" className="inline-flex min-h-11 items-center gap-2 text-sm text-accent">مشاهدهٔ پرتفولیو<ArrowLeft className="h-4 w-4"/></Link>
 <Sheet open={open} onClose={()=>{if(!busy)setOpen(false);}} title="افزودن کیف پول"><form onSubmit={e=>{e.preventDefault();void add();}} className="space-y-4"><Field label="نام کیف پول"><Input disabled={busy} value={label} maxLength={80} placeholder="مثلاً کیف پول اصلی" onChange={e=>setLabel(e.target.value)}/></Field><Field label="آدرس عمومی"><Input disabled={busy} dir="ltr" value={address} maxLength={100} autoComplete="off" placeholder="0x…" onChange={e=>setAddress(e.target.value)}/></Field>{error&&<Notice tone="warn">{error}</Notice>}<Button type="submit" className="w-full" loading={busy} disabled={!address.trim()}>افزودن</Button></form></Sheet></Page>;
}
