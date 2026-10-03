import { useEffect, useState } from 'react';
import { fetchJson } from '@/repositories/remoteClient';
import { accountHistorySchema, type BorosAccountHistory, type BorosAccountSnapshot } from '@/shared/boros/account';
import { EmptyState, Notice } from '@/shared/components/ui/StateViews';
import { MoneyValue, PercentValue, QuantityValue } from '@/shared/components/ui/FinancialValue';
import { TokenLogo } from '@/shared/components/ui/EntityLogo';
import { tokenName } from '@/features/connected/presentation/identity';
export function AccountHistory({account,kind,token,label}:{account:BorosAccountSnapshot;kind:'order-history'|'trade-history';token:number|null;label:(id:number)=>string}){
 const [state,setState]=useState<{data:BorosAccountHistory|null;error:string|null}>({data:null,error:null});
 useEffect(()=>{let live=true;setState({data:null,error:null});void fetchJson(`/api/borosAccount?root=${account.root}&accountId=${account.accountId}&view=${kind}`,{timeoutMs:58000}).then(raw=>{const data=accountHistorySchema.parse(raw);if(data.root!==account.root||data.accountId!==account.accountId||data.kind!==kind)throw new Error('mismatch');if(live)setState({data,error:null});}).catch(()=>{if(live)setState({data:null,error:'تاریخچه دریافت نشد؛ دوباره زبانه را باز کنید'});});return()=>{live=false;};},[account.root,account.accountId,kind]);
 if(state.error)return <Notice tone="warn">{state.error}</Notice>;
 if(!state.data)return <EmptyState message="در حال دریافت تاریخچه…"/>;
 const rows=state.data.rows.filter(r=>token===null||r.tokenId===token);
 return <div className="divide-y divide-divider">{rows.map(r=>{const a=account.assets.find(a=>a.tokenId===r.tokenId);return <article key={r.handle+':'+r.marketId+':'+r.id} className="py-3"><div className="flex flex-wrap justify-between items-center gap-3"><div className="flex items-center gap-2"><TokenLogo logo={a?.logo} symbol={a?.symbol??''} name={tokenName(a?.symbol??'')} size={30}/><div><p className="text-sm font-semibold">{label(r.marketId)}</p><p className="text-xs text-muted mt-1">{r.side==='long'?'لانگ فاندینگ':'شورت فاندینگ'} · {r.status}</p></div></div><QuantityValue value={r.size} unit="واحد بازده"/></div><div className="flex flex-wrap justify-between items-center gap-3 mt-3 text-xs"><span className="text-muted">{r.at===null?'—':new Intl.DateTimeFormat('fa-IR',{dateStyle:'short',timeStyle:'short'}).format(r.at)}</span><PercentValue value={r.rate===null?null:r.rate*100} tone="none"/>{kind==='trade-history'&&<MoneyValue value={r.pnl!==null&&a?.priceUsd!=null?r.pnl*a.priceUsd:null} signed tone="auto"/>}</div></article>;})}{!rows.length&&<EmptyState message="رویدادی در دادهٔ دریافت‌شده نیست."/>}{!state.data.complete&&<p className="pt-3 text-xs text-muted">آخرین رویدادهای دریافت‌شده؛ تاریخچه کامل نیست.</p>}{kind==='trade-history'&&rows.length>0&&<p className="pt-3 text-xs text-muted">سود معاملات پس از کارمزد؛ معادل دلار با قیمت فعلی وثیقه.</p>}</div>;
}
