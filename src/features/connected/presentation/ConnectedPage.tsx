import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus,Wallet,ArrowLeft,RefreshCw,Layers } from 'lucide-react';
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
import { AssetValue } from './AssetValue';
import { toFaDigits } from '@/shared/utils/formatters';
import { CONNECTED_PREF, useConnectedPortfolio } from '../data/useConnectedPortfolio';
import { validPublicAddress,addressKey } from '../domain/model';
import { ConnectedWalletCard } from './ConnectedWalletCard';
export const providerError=(e:unknown)=>e instanceof HttpError?e.code??'ارتباط با سرور برقرار نشد':e instanceof Error?e.message:'دریافت داده انجام نشد';
export const dateTime=(at:number)=>new Date(at).toLocaleString('fa-IR',{dateStyle:'short',timeStyle:'short'});
export default function ConnectedPage(){
 useCustodySync();const custody=useCustody();const portfolio=useConnectedPortfolio();const [search,setSearch]=useState('');const [open,setOpen]=useState(false),[address,setAddress]=useState(''),[label,setLabel]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const enabled=getPref<string[]>(CONNECTED_PREF)?.value??[];
 const wallets=custody.holdings.filter(h=>h.kind==='wallet'&&!h.archivedAt&&h.address&&enabled.includes(h.id));
 const arcus=custody.holdings.filter(h=>h.kind==='arcus'&&!h.archivedAt);
 async function add(){if(busy)return;setError(null);setBusy(true);try{const publicAddress=address.trim();if(!await validPublicAddress(publicAddress))throw Error('آدرس عمومی معتبر وارد کنید');const existing=getCustodySnapshot().holdings.find(h=>h.kind==='wallet'&&h.address&&addressKey(h.address)===addressKey(publicAddress));if(existing&&enabled.includes(existing.id)&&!existing.archivedAt)throw Error('این کیف پول قبلاً اضافه شده است');const now=Date.now(),id=existing?.id??crypto.randomUUID();await saveHolding({...existing,id,kind:'wallet',address:publicAddress,label:label.trim()||existing?.label||'کیف پول من',createdAt:existing?.createdAt??now,updatedAt:now,archivedAt:null});await savePref(CONNECTED_PREF,[...new Set([...enabled,id])]);setOpen(false);setAddress('');setLabel('');}catch(e){setError(providerError(e));}finally{setBusy(false);}}
 async function disconnect(id:string){const ids=getPref<string[]>(CONNECTED_PREF)?.value??[];await savePref(CONNECTED_PREF,ids.filter(x=>x!==id));}
 const filteredWallets=wallets.filter(h=>`${h.label} ${h.address}`.toLowerCase().includes(search.trim().toLowerCase()));
 return <Page>
 <PageHeader title="مدیریت کیف پول‌ها" subtitle="موجودی، اتصال و تنظیمات حساب‌ها در یک نگاه" actions={<Button icon={<Plus/>} onClick={()=>{setError(null);setOpen(true);}}>افزودن کیف پول</Button>}/>
 <Surface variant="focal" className="p-5 md:p-7">
  <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-muted">ارزش کل حساب‌های متصل</p><AssetValue value={portfolio.total} stale={portfolio.stale} className="mt-3" primaryClassName="text-3xl font-bold md:text-4xl"/></div><Button variant="outline" size="sm" loading={portfolio.loading} icon={<RefreshCw/>} onClick={()=>void portfolio.refresh()}>به‌روزرسانی موجودی‌ها</Button></div>
  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-4"><p className="flex flex-wrap gap-4 text-xs text-muted"><span>{toFaDigits(wallets.length)} کیف پول</span><span>{toFaDigits(arcus.length)} حساب آرکوس</span></p><Link to="/dashboard" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent">مشاهدهٔ پرتفولیو<ArrowLeft className="h-4 w-4"/></Link></div>
  {portfolio.partial&&<p className="mt-2 text-xs leading-6 text-muted">مجموع بر اساس موجودی‌های دریافت‌شده است؛ برخی حساب‌ها هنوز کامل همگام نشده‌اند.</p>}
 </Surface>
 <section className="space-y-4" aria-labelledby="wallet-list-title">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="wallet-list-title" className="flex items-center gap-2 text-base font-bold"><Wallet className="h-5 w-5 text-accent"/>کیف پول‌های من</h2>{wallets.length>0&&<div className="relative w-full sm:w-72"><Input aria-label="جست‌وجوی کیف پول" value={search} onChange={e=>setSearch(e.target.value)} placeholder="جست‌وجوی نام یا آدرس" withSearchIcon/></div>}</div>
  {wallets.length?<ul aria-label="کیف پول‌های متصل" className="wallet-management-list grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredWallets.map(h=>{const source=portfolio.wallets.find(w=>w.holding.id===h.id);return <li key={h.id} className="min-w-0"><Surface className="h-full overflow-hidden"><ConnectedWalletCard holding={h} value={source?.value??null} stale={source?.stale} loading={source?.state?.loading} onDisconnect={()=>disconnect(h.id)}/></Surface></li>;})}</ul>:<Surface className="flex flex-col items-center gap-3 px-5 py-10 text-center"><span className="rounded-2xl bg-accent/10 p-4 text-accent"><Wallet className="h-7 w-7"/></span><h3 className="text-sm font-semibold">اولین کیف پول خود را اضافه کنید</h3><p className="max-w-sm text-xs leading-6 text-muted">با آدرس عمومی، موجودی و فعالیت‌های کیف پول را در داشبورد ببینید.</p><Button variant="outline" icon={<Plus/>} onClick={()=>{setError(null);setOpen(true);}}>اتصال اولین کیف پول</Button></Surface>}
  {wallets.length>0&&!filteredWallets.length&&<p className="py-6 text-center text-sm text-muted">کیف پولی با این نام یا آدرس پیدا نشد.</p>}
 </section>
 {arcus.length>0&&<section className="space-y-4" aria-labelledby="arcus-list-title"><h2 id="arcus-list-title" className="flex items-center gap-2 text-base font-bold"><Layers className="h-5 w-5 text-accent"/>حساب‌های آرکوس</h2><ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{arcus.map(h=><li key={h.id}><Surface><Link to="/arcus" className="flex min-h-24 items-center gap-3 p-5"><LogoImage src="/logos/platform-arcus.png" label="آرکوس" size={40} square/><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{h.label}</p><p className="mt-2 text-xs text-muted">{h.arcus?.env==='testnet'?'حساب آزمایشی':'حساب اصلی'} · مشاهدهٔ حساب</p></div><ArrowLeft className="h-4 w-4 text-muted"/></Link></Surface></li>)}</ul></section>}
 <Sheet open={open} onClose={()=>{if(!busy)setOpen(false);}} title="افزودن کیف پول"><form onSubmit={e=>{e.preventDefault();void add();}} className="space-y-4"><Field label="نام کیف پول"><Input disabled={busy} value={label} maxLength={80} placeholder="مثلاً کیف پول اصلی" onChange={e=>setLabel(e.target.value)}/></Field><Field label="آدرس عمومی"><Input disabled={busy} dir="ltr" value={address} maxLength={100} autoComplete="off" placeholder="0x…" onChange={e=>setAddress(e.target.value)}/></Field>{error&&<Notice tone="warn">{error}</Notice>}<Button type="submit" className="w-full" loading={busy} disabled={!address.trim()}>افزودن</Button></form></Sheet></Page>;
}
