import {arr,obj,str,finite} from '../src/features/connected/domain/model.js';
import {ProviderError} from './_zerion.js';
export interface BridgeProof {provider:'lifi'|'relay';sourceHash:string;sourceChain:number;destinationHash:string;destinationChain:number}
export function normalizeBridgeProof(provider:'lifi'|'relay',data:unknown,hash:string):BridgeProof[] {
 const proofs:BridgeProof[]=[];
 if(provider==='lifi') {
  const d=obj(data),s=obj(d.sending),r=obj(d.receiving);
  const a=finite(s.chainId)??finite(obj(s.token).chainId),b=finite(r.chainId)??finite(obj(r.token).chainId);
  if(d.status==='DONE'&&str(s.txHash).toLowerCase()===hash.toLowerCase()&&a!==null&&b!==null&&a!==b&&str(r.txHash))proofs.push({provider,sourceHash:str(s.txHash),sourceChain:a,destinationHash:str(r.txHash),destinationChain:b});
 } else for(const value of arr(obj(data).requests)) {
  const request=obj(value),d=obj(request.data);
  if(request.status!=='success')continue;
  const input=arr(d.inTxs).map(obj).filter(t=>str(t.txHash).toLowerCase()===hash.toLowerCase());
  const output=arr(d.outTxs).map(obj).filter(t=>t.status==='success');
  if(input.length!==1||output.length!==1)continue;
  const a=finite(input[0].chainId),b=finite(output[0].chainId);
  if(a!==null&&b!==null&&a!==b&&str(output[0].txHash))proofs.push({provider,sourceHash:str(input[0].txHash),sourceChain:a,destinationHash:str(output[0].txHash),destinationChain:b});
 }
 return proofs;
}
const cache=new Map<string,{at:number;proofs:BridgeProof[]}>();
export async function lookupBridge(provider:string,hash:string):Promise<BridgeProof[]> {
 if(!['lifi','relay'].includes(provider)||!/^0x[0-9a-fA-F]{64}$/.test(hash))throw new ProviderError(400,'شناسه یا ارائه‌دهندهٔ بریج معتبر نیست');
 const key=provider+':'+hash.toLowerCase(),old=cache.get(key);if(old&&Date.now()-old.at<120000)return old.proofs;
 const url=provider==='lifi'?new URL('https://li.quest/v1/status'):new URL('https://api.relay.link/requests/v3');
 url.searchParams.set(provider==='lifi'?'txHash':'term',hash);
 if(provider==='relay')url.searchParams.set('limit','20');
 const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
 if(response.status===404)return [];
 if(!response.ok)throw new ProviderError(response.status===429?429:502,'تطبیق بریج از ارائه‌دهنده دریافت نشد');
 const proofs=normalizeBridgeProof(provider as 'lifi'|'relay',await response.json(),hash);
 if(cache.size>500)cache.clear();cache.set(key,{at:Date.now(),proofs});return proofs;
}
