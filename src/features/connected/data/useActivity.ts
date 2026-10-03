import { fetchJson } from '@/repositories/remoteClient';
import { NETWORKS } from '@/features/custody/domain/catalog';
import { useEffect,useState,useRef } from 'react';
import { getPref,useCustodyStore } from '@/features/custody/data/repository';
import { loadHistory } from '@/features/arcus/data/useArcusAccount';
import { usToMsNumber } from '@/features/arcus/api/types';
import { refreshTransactions } from './store';
import type { ConnectedPortfolio } from './useConnectedPortfolio';
import { walletActivities,type Activity,type ActivityLink } from '../domain/activity';
export const ACTIVITY_LINKS='activity-links-v1';
export function useActivity(p:ConnectedPortfolio) {
 useCustodyStore();
 const [proofs,setProofs]=useState<{provider:'lifi'|'relay';sourceHash:string;sourceChain:number;destinationHash:string;destinationChain:number}[]>([]);const checked=useRef(new Map<string,number>());
 const key=[...p.wallets.map(w=>w.holding.address+':'+Boolean(w.state?.data&&!w.state.loading)),...p.arcus.filter(a=>a.holding.arcus?.env==='mainnet').map(a=>a.holding.id)].join('|');
 useEffect(()=>{
  let stopped=false;
  async function refresh(){
   if(stopped||document.visibilityState!=='visible')return;
   for(const w of p.wallets) {if(stopped)return;if(!w.state?.data||w.state.loading)continue;await refreshTransactions(w.holding.address!);}
   for(const a of p.arcus) {if(stopped)return;if(a.holding.arcus?.env==='mainnet')await loadHistory(a.holding.arcus,'transfers',{fromUs:null,key:'all'},true);}
  }
  void refresh();const timer=setInterval(()=>void refresh(),900000);
  const visible=()=>void refresh();document.addEventListener('visibilitychange',visible);
  return()=>{stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 // Sources, not response objects, own the polling lifecycle.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key]);
 const walletRows=walletActivities(p.wallets.map(w=>({label:w.holding.label,address:w.holding.address!,history:w.state?.history??[]})));
 const arcusRows:Activity[]=p.arcus.filter(a=>a.holding.arcus?.env==='mainnet').flatMap(a=>(a.state?.history.transfers.data?.rows??[]).map(t=>({key:`arcus:${a.holding.arcus!.address.toLowerCase()}:${a.holding.arcus!.accountIndex}:${t.id}`,provider:'arcus' as const,label:a.holding.label,at:usToMsNumber(t.createdAt)??0,status:t.status,kind:t.type,amount:t.amount,account:a.holding.id})));
 const txKey=walletRows.map(r=>r.key+':'+r.status).join('|')+p.wallets.map(w=>w.state?.historyAt??0).join('|');
 useEffect(()=>{let stopped=false;async function check(){for(const row of walletRows.slice(0,100)){
  const tx=row.tx;if(!tx||tx.status!=='confirmed'||!tx.transfers.some(t=>t.direction==='out')||!/^0x[0-9a-fA-F]{64}$/.test(tx.hash))continue;
  const protocol=[tx.protocol,...(tx.acts??[]).map(a=>a.protocol)].join(' ');
  const provider=/relay/i.test(protocol)?'relay':/li[.\s-]?fi/i.test(protocol)?'lifi':null;
  if(!provider||Date.now()-(checked.current.get(row.key)??0)<300000)continue;
  checked.current.set(row.key,Date.now());if(stopped)return;
  try{const response=await fetchJson<{proofs:typeof proofs}>('/api/integrations?op=bridge-proof&provider='+provider+'&hash='+encodeURIComponent(tx.hash));if(!stopped)setProofs(old=>[...new Map([...old,...response.proofs].map(p=>[p.provider+p.sourceHash,p])).values()]);}catch{/* Unproven links remain separate; never infer from amount/time. */}
 }}void check();return()=>{stopped=true;};},[txKey]);
 const manual=getPref<ActivityLink[]>(ACTIVITY_LINKS)?.value??[];
 const all=[...walletRows,...arcusRows].sort((a,b)=>b.at-a.at);
 const automatic:ActivityLink[]=proofs.flatMap(proof=>{
  const source=walletRows.find(r=>r.tx?.hash.toLowerCase()===proof.sourceHash.toLowerCase()&&NETWORKS.find(n=>n.id===r.tx?.chain)?.chainId===proof.sourceChain);
  const target=walletRows.find(r=>r.tx?.hash.toLowerCase()===proof.destinationHash.toLowerCase()&&NETWORKS.find(n=>n.id===r.tx?.chain)?.chainId===proof.destinationChain);
  if(!source||!target||manual.some(l=>[l.from,l.to].includes(source.key)||[l.from,l.to].includes(target.key)))return [];
  return [{id:'proof:'+proof.provider+proof.sourceHash,from:source.key,to:target.key,kind:'bridge',at:target.at,proof:proof.provider}];
 });
 return {rows:all,links:[...manual,...automatic]};
}
