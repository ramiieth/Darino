import { readProviderCache,writeProviderCache } from './_providerCache.js';
// Server domain module has no browser/db imports. Normalize in the presentation layer.
const KEY='public-llama-directory-v1';
let running:Promise<{protocols:unknown;chains:unknown;fetchedAt:number}>|null=null;
export async function getDirectory(){
 const hit=await readProviderCache<{protocols:unknown;chains:unknown;fetchedAt:number}>(KEY);if(hit&&Date.now()-hit.fetchedAt<86400000)return hit;
 if(running)return running;
 running=(async()=>{const read=async(path:string)=>{const r=await fetch('https://api.llama.fi/'+path,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw new Error('directory unavailable');return await r.json();};const [protocols,chains]=await Promise.all([read('protocols'),read('v2/chains')]);
 const slim=(rows:unknown,keys:string[])=>Array.isArray(rows)?rows.filter(r=>r&&typeof r==='object').slice(0,15000).map(r=>Object.fromEntries(keys.map(k=>[k,(r as Record<string,unknown>)[k]]))):[];
 const value={protocols:slim(protocols,['name','slug','logo','parentProtocol','tvl','deadFrom','disabled','deprecated','status']),chains:slim(chains,['name','chainId','tvl','deadFrom','disabled','deprecated','status']),fetchedAt:Date.now()};await writeProviderCache(KEY,value,86400000);return value;})();
 try{return await running;}finally{running=null;}
}
