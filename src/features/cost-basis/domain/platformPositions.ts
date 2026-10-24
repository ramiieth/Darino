import type { ConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
import type { BorosAccountSnapshot } from '@/shared/boros/account';
import type { BorosMarket } from '@/features/boros/domain/types';
import { isStale, accountKey } from '@/features/arcus/data/useArcusAccount';
import type { PerpVenueAccount } from '@/features/perps/domain/perpPortfolio';
const number=(v:unknown)=>v!=null&&String(v).trim()!==''&&Number.isFinite(Number(v))?Number(v):null;
const logos:Record<string,string>={BTC:'/logos/token-btc.png',ETH:'/logos/token-eth.svg',SOL:'/logos/chain-solana.svg',BNB:'/logos/chain-56.svg',HYPE:'/logos/token-hype.jpg'};
const LIGHTER:Record<string,{name:string;chain:string}>={'lighter-robinhood':{name:'لایتر رابین‌هود',chain:'robinhood'},'lighter-mainnet':{name:'لایتر',chain:'ethereum'}};
export function platformPositions(portfolio:ConnectedPortfolio,boros:{data:BorosAccountSnapshot|null;stale:boolean},markets:BorosMarket[],lighter:readonly PerpVenueAccount[]=[]){
 const rows:{key:string;symbol:string;logo:string|null;source:string;chain:string;side:string;size:number|null;entry:number|null;rate:boolean;mark:number|null;pnl:number|null;margin:number|null;stale:boolean}[]=[];
 for(const a of portfolio.arcus.filter(a=>a.holding.arcus?.env==='mainnet'))for(const p of a.state?.positions.data??[]){
  const size=number(p.size);if(size===null||size===0)continue;const symbol=p.marketDisplayName.split('-')[0];
  rows.push({key:'arcus:'+accountKey(a.holding.arcus!)+':'+p.marketId,symbol,logo:logos[symbol]??null,source:'پرپچوال آرکوس · '+a.holding.label,chain:'robinhood',side:p.side==='LONG'?'لانگ':'شورت',size:Math.abs(size),entry:number(p.averageEntryPrice),rate:false,mark:number(p.markPx)!>0?number(p.markPx):null,pnl:number(p.unrealizedPnl),margin:number(p.marginUsed),stale:isStale(a.state!.positions)});
 }
 for(const a of lighter){const v=LIGHTER[a.venue];if(!v)continue;a.positions.forEach((p,i)=>{
  rows.push({key:'lighter:'+a.id+':'+p.symbol+':'+i,symbol:p.symbol,logo:logos[p.symbol]??null,source:'پرپچوال '+v.name+' · '+a.label,chain:v.chain,side:p.side==='long'?'لانگ':'شورت',size:p.size,entry:p.entry,rate:false,mark:p.mark,pnl:p.pnl,margin:null,stale:a.stale});
 });}
 if(boros.data){const d=boros.data;for(const p of d.positions){
  const m=markets.find(m=>m.marketId===p.marketId),a=d.assets.find(a=>a.tokenId===p.tokenId);const price=a?.priceUsd;
  rows.push({key:'boros:'+p.handle+':'+p.marketId,symbol:m?.asset??a?.symbol??'',logo:m?logos[m.asset]??null:a?.logo??null,source:'بوروس · بازار '+new Intl.NumberFormat('fa-IR').format(p.marketId),chain:'arbitrum',side:p.side==='long'?'لانگ فاندینگ':'شورت فاندینگ',size:p.size,entry:p.fixedApr===null?null:p.fixedApr*100,rate:true,mark:m?.snapshotAt&&Date.now()-m.snapshotAt<180000?m.markApr*100:null,pnl:p.unrealized!==null&&price!=null&&price>0?p.unrealized*price:null,margin:null,stale:boros.stale});
 }}
 return rows;
}
