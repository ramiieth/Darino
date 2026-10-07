import { useEffect } from 'react';
import { create } from 'zustand';
import { fetchJson } from '@/repositories/remoteClient';
import { useDirectoryStore } from '@/features/connected/data/directory';
import { NETWORKS } from '@/features/custody/domain/catalog';
import { pendleMarketLogos,type PendleLogo } from '@/shared/domain/pendleLogos';
import seed from '@/shared/domain/pendleLogoSeed.json';
const TTL=15*60*1000;
export const usePendleLogos=create<{logos:PendleLogo[];checked:number}>(()=>({logos:pendleMarketLogos(seed),checked:0}));
let running:Promise<void>|null=null;
export function refreshPendleLogos(){
 if(running)return running;if(Date.now()-usePendleLogos.getState().checked<TTL)return Promise.resolve();
 usePendleLogos.setState({checked:Date.now()});
 running=fetchJson<{logos:PendleLogo[];fetchedAt:number}>('/api/integrations?op=pendle-logos',{timeoutMs:30000}).then(d=>{
  if(Array.isArray(d.logos)&&d.logos.length)usePendleLogos.setState({logos:d.logos});
 }).catch(()=>{/* Retain the previous official metadata on an outage. */}).finally(()=>{running=null;});return running;
}
export function usePendleLogo(enabled:boolean,chain?:string,contract?:string|null){
 const logos=usePendleLogos(s=>s.logos);
 const chains=useDirectoryStore(s=>s.metadata.chains);
 useEffect(()=>{if(!enabled)return;void refreshPendleLogos();const timer=setInterval(()=>void refreshPendleLogos(),TTL);return()=>clearInterval(timer);},[enabled]);
 const chainId=NETWORKS.find(n=>n.id===chain)?.chainId??chains.find(n=>n.id===chain)?.chainId??Number(chain);
 return enabled&&contract?logos.find(l=>l.chainId===chainId&&l.contract===contract.toLowerCase()):undefined;
}
