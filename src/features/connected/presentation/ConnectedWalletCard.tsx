import { AssetValue } from './AssetValue';
import { isBitcoinAddress } from '../domain/bitcoinAddress';
import { useState } from 'react';
import { MoreHorizontal,Copy,Archive,Pencil } from 'lucide-react';
import { Sheet } from '@/shared/components/ui/Sheet';
import { Button } from '@/shared/components/ui/Button';
import { Input,Field } from '@/shared/components/ui/Input';
import { LogoImage } from '@/shared/components/ui/EntityLogo';
import { Notice } from '@/shared/components/ui/StateViews';
import { saveHolding } from '@/features/custody/data/repository';
import type { Holding } from '@/features/custody/domain/types';
export function ConnectedWalletCard({holding:h,onDisconnect,value=null,stale=false,loading=false}:{holding:Holding;onDisconnect:()=>Promise<void>;value?:number|null;stale?:boolean;loading?:boolean}){
 const [open,setOpen]=useState(false),[name,setName]=useState(h.label),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[copied,setCopied]=useState(false);
 const address=h.address??'',short=address.length>18?address.slice(0,8)+'…'+address.slice(-6):address;
 async function run(work:()=>Promise<void>){setBusy(true);setError(null);try{await work();}catch{setError('عملیات انجام نشد؛ دوباره تلاش کنید');}finally{setBusy(false);}}
 const network=isBitcoinAddress(address)?'بیت‌کوین':address.startsWith('0x')?'شبکه‌های EVM':'سولانا';
 return <><div className="wallet-management-row space-y-4 p-5">
 <div className="flex items-center gap-3"><LogoImage src={isBitcoinAddress(address)?'/logos/token-btc.png':address.startsWith('0x')?'/logos/platform-zerion.svg':'/logos/chain-solana.svg'} label={network} size={40} square/><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{h.label}</p><p className="mt-1 text-xs text-muted">{network}</p></div><Button variant="ghost" size="sm" aria-label={`مدیریت ${h.label}`} onClick={()=>{setName(h.label);setEditing(false);setError(null);setCopied(false);setOpen(true);}}><MoreHorizontal className="h-5 w-5"/></Button></div>
 <bdi dir="ltr" title={address} className="block rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">{short}</bdi>
 <div className="flex items-end justify-between gap-3 border-t border-divider pt-4"><div><p className="mb-2 text-xs text-muted">ارزش دارایی‌ها</p><AssetValue value={value} stale={stale} primaryClassName="text-lg font-bold"/></div><span className={`rounded-full px-2.5 py-1 text-[11px] ${stale?'bg-warn/10 text-warn':'bg-accent/10 text-accent'}`}>{loading?'در حال دریافت':stale?'نیاز به به‌روزرسانی':value===null?'در انتظار موجودی':'متصل'}</span></div>
 </div>
 <Sheet open={open} onClose={()=>{if(!busy)setOpen(false);}} title={h.label}><div className="space-y-4"><bdi dir="ltr" className="block break-all rounded-xl bg-surface-2 p-3 text-sm">{address}</bdi>{error&&<Notice tone="warn">{error}</Notice>}<Button variant="outline" className="w-full" icon={<Copy/>} loading={busy} onClick={()=>void run(async()=>{await navigator.clipboard.writeText(address);setCopied(true);})}>{copied?'کپی شد':'کپی آدرس'}</Button>{editing?<form onSubmit={e=>{e.preventDefault();void run(async()=>{await saveHolding({...h,label:name.trim(),updatedAt:Date.now()});setEditing(false);});}} className="space-y-3"><Field label="نام کیف پول"><Input value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></Field><Button type="submit" disabled={!name.trim()} loading={busy}>ذخیرهٔ نام</Button></form>:<Button className="w-full" variant="ghost" icon={<Pencil/>} onClick={()=>setEditing(true)}>تغییر نام</Button>}<Button className="w-full" variant="ghost" icon={<Archive/>} loading={busy} onClick={()=>void run(async()=>{await onDisconnect();setOpen(false);})}>قطع همگام‌سازی</Button></div></Sheet></>;
}
