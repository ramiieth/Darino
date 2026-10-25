import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/shared/components/ui/Button';
import { Notice } from '@/shared/components/ui/StateViews';
import { fetchJson } from '@/repositories/remoteClient';
import { toFaDigits } from '@/shared/utils/formatters';
import { useCustody } from '@/features/custody/data/useCustody';
import { saveHolding, savePref, getPref, getCustodySnapshot } from '@/features/custody/data/repository';
import { lighterAccounts } from '@/features/perps/domain/model';
/** آدرس‌هایی که کاربر پیشنهاد افزودن لایتر رابین‌هود را برایشان رد کرده (حروف کوچک) */
export const LIGHTER_RH_DISMISSED_PREF='connected.lighterRhDismissed';
/** همان برای لایتر اصلی */
export const LIGHTER_MAIN_DISMISSED_PREF='connected.lighterMainDismissed';
const NET={
 robinhood:{platform:'lighter-robinhood',name:'لایتر رابین‌هود',op:'lighter-account',key:'lighter-robinhood-account',pref:LIGHTER_RH_DISMISSED_PREF,page:'صفحهٔ لایتر رابین‌هود و پایش دلتا نوترال'},
 mainnet:{platform:'lighter-mainnet',name:'لایتر',op:'lighter-mainnet-account',key:'lighter-mainnet-account',pref:LIGHTER_MAIN_DISMISSED_PREF,page:'داشبورد پرپچوال و صفحهٔ لایتر'}
} as const;
/** کیف پول EVM متصل که روی لایتر (رابین‌هود یا اصلی) حساب دارد ولی هنوز ثبت نشده → پیشنهاد افزودن (فقط آدرس عمومی) */
export function LighterRhSuggestion({address,label,network='robinhood'}:{address:string;label:string;network?:keyof typeof NET}){
 const n=NET[network];const PLATFORM=n.platform;
 const custody=useCustody();const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const key=address.toLowerCase();
 const linked=custody.holdings.some(h=>h.kind==='platform'&&h.platformId===PLATFORM&&!h.archivedAt&&h.address?.toLowerCase()===key);
 const dismissed=getPref<string[]>(n.pref)?.value??[];
 const enabled=custody.loaded&&/^0x[0-9a-fA-F]{40}$/.test(address)&&!linked&&!dismissed.includes(key);
 // همان کلید کش صفحهٔ لایتر؛ بدون تازه‌سازی دوره‌ای چون فقط وجود حساب مهم است
 const q=useQuery({queryKey:[n.key,key],queryFn:()=>fetchJson<unknown>(`/api/integrations?op=${n.op}&address=${encodeURIComponent(address)}`,{timeoutMs:15000}),enabled,staleTime:5*60_000,retry:1});
 if(!enabled)return null;
 const accounts=lighterAccounts(q.data,address);if(!accounts.length)return null;
 const positions=accounts.reduce((n,a)=>n+a.positions.length,0);
 async function add(){if(busy)return;setBusy(true);setError('');try{const existing=getCustodySnapshot().holdings.find(h=>h.kind==='platform'&&h.platformId===PLATFORM&&h.address?.toLowerCase()===key);const now=Date.now();await saveHolding({id:existing?.id??crypto.randomUUID(),kind:'platform',platformId:PLATFORM,address,label:existing?.label||`${label} · ${n.name}`,createdAt:existing?.createdAt??now,updatedAt:now,archivedAt:null});}catch{setError('ذخیره انجام نشد؛ دوباره تلاش کنید');}finally{setBusy(false);}}
 async function dismiss(){if(busy)return;setBusy(true);try{await savePref(n.pref,[...new Set([...dismissed,key])]);}finally{setBusy(false);}}
 return <Notice className="m-5 mt-0" title={`حساب ${n.name} پیدا شد`}>
  <p>این کیف پول روی {n.name} {toFaDigits(accounts.length)} حساب{positions?` و ${toFaDigits(positions)} پوزیشن باز`:''} دارد. با افزودن آن، پوزیشن‌ها در {n.page} دیده می‌شوند. فقط آدرس عمومی ذخیره می‌شود.</p>
  {error&&<p className="mt-1 text-warn">{error}</p>}
  <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" loading={busy} onClick={()=>void add()}>افزودن حساب</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>void dismiss()}>نه، ممنون</Button></div>
 </Notice>;
}
