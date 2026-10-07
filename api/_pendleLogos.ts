import { readProviderCache,writeProviderCache } from './_providerCache.js';
import { pendleMarketLogos,type PendleLogo } from '../src/shared/domain/pendleLogos.js';
const TTL=15*60*1000,KEY='pendle.base-token-logos.v1';
let running:Promise<{logos:PendleLogo[];fetchedAt:number}>|null=null;
export async function getPendleLogos(){
 const hit=await readProviderCache<{logos:PendleLogo[];fetchedAt:number}>(KEY);
 if(hit&&Date.now()-hit.fetchedAt<TTL)return hit;
 if(running)return running;
 running=(async()=>{
  const read=async(skip:number)=>{
   const r=await fetch('https://api-v2.pendle.finance/core/v2/markets/all?limit=100&skip='+skip,{signal:AbortSignal.timeout(12000),redirect:'error'});
   if(!r.ok)throw Error('Pendle metadata unavailable');
   const d=await r.json() as {total:number;results:unknown[]};
   if(!Number.isInteger(d.total)||d.total<0||d.total>10000||!Array.isArray(d.results))throw Error('Invalid Pendle metadata');return d;
  };
  const first=await read(0),rows=[...first.results];
  for(let skip=100;skip<first.total;skip+=400){
   const pages=await Promise.all(Array.from({length:Math.min(4,Math.ceil((first.total-skip)/100))},(_,i)=>read(skip+i*100)));
   for(const p of pages)rows.push(...p.results);
  }
  if(rows.length<first.total)throw Error('Incomplete Pendle metadata');
  const result={logos:pendleMarketLogos(rows),fetchedAt:Date.now()};
  if(!result.logos.length)throw Error('Empty Pendle metadata');
  await writeProviderCache(KEY,result,86400000);return result;
 })();
 try{return await running;}catch(e){if(hit)return hit;throw e;}finally{running=null;}
}
