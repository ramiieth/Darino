import Decimal from 'decimal.js';
import { addressKey } from '@/features/connected/domain/model';
import type { ConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
import type { ActivityLink } from '@/features/connected/domain/activity';
import type { BorosAccountSnapshot } from '@/shared/boros/account';
import { accountKey } from '@/features/arcus/data/useArcusAccount';
import { costSummary } from './summary';
import { validCurrentBasis } from './currentBasis';
import type { CostAsset, CostBook } from './book';
export type BasisRow=ReturnType<typeof costSummary>['rows'][number]&{sourceLabel:string;snapshotComplete:boolean;provider:'wallet'|'arcus'|'boros'};
const positive=(v:unknown):Decimal|null=>{try{if(v==null)return null;const n=new Decimal(String(v));return n.isFinite()&&n.gt(0)?n:null;}catch{return null;}};
/** Platform balances are scoped by account, never merged by ticker with wallet FIFO. */
export function allSourceCostSummary(portfolio:ConnectedPortfolio,book:CostBook|undefined,links:ActivityLink[],boros:{data:BorosAccountSnapshot|null;stale:boolean},extraWallets:ConnectedPortfolio['wallets']=[]){
 const seen=new Set(portfolio.wallets.map(w=>w.holding.address?addressKey(w.holding.address):undefined));
 const extras=extraWallets.filter(w=>{const k=w.holding.address?addressKey(w.holding.address):undefined;if(!k||seen.has(k))return false;seen.add(k);return true;});
 const walletSummary=costSummary({...portfolio,wallets:[...portfolio.wallets,...extras]},book,links,true);
 const rows:BasisRow[]=walletSummary.rows.map(r=>({...r,sourceLabel:r.sources.some(w=>extras.includes(w))?'کیف پول آرکوس':'کیف پول',provider:'wallet',snapshotComplete:r.holdingSources.every(w=>!!w.state?.data?.complete)}));
 function add(asset:CostAsset,quantity:Decimal,price:number|null,label:string,stale:boolean,complete:boolean,provider:'arcus'|'boros'){
  const stored=book?.currentBasis?.[asset.key];const current=validCurrentBasis(stored,asset.key)?stored:undefined;
  const matches=!!current&&new Decimal(current.quantity).eq(quantity);
  const basis=matches?Number(current.total):null;const value=price!==null?quantity.times(price):new Decimal(0);
  const pnl=matches&&!current?.pendingBalanceConfirmation&&!stale&&complete&&price!==null?value.minus(current.total).toNumber():null;
  const estimatedPnl=pnl===null&&matches&&!current?.pendingBalanceConfirmation&&complete&&price!==null?value.minus(current!.total).toNumber():null;
  const status=!current?'missing':!matches?'mismatch':current.pendingBalanceConfirmation?'confirmation':stale?'stale':!complete?'history':'ready';
  rows.push({asset,quantity,value,priced:price!==null,chains:new Set([asset.chain]),sources:[],holdingSources:[],current,price,ready:matches&&complete&&!current?.pendingBalanceConfirmation,stale,issues:stored&&!current?[{key:'invalid-current:'+asset.key,reason:'بهای تطبیق‌شده معتبر نیست',assetKeys:[asset.key]}]:[],valuation:{covered:matches?quantity.toString():'0',unknown:matches?'0':quantity.toString(),excess:'0',basis:basis??0,pnl,partialPnl:pnl},basis,pnl,estimatedPnl,status,avgCost:basis!==null?new Decimal(basis).div(quantity).toNumber():null,pnlPct:pnl!==null&&basis!==null&&basis>0?pnl/basis*100:null,share:null,sourceLabel:label,snapshotComplete:complete,provider});
 }
 for(const a of portfolio.arcus.filter(a=>a.holding.arcus?.env==='mainnet')){
  const quantity=positive(a.state?.account.data?.netQuoteBalance);if(!quantity)continue;
  const key='arcus:'+accountKey(a.holding.arcus!)+':quote';
  // This is quote-account credit (USD accounting unit), not ERC-20 USDG spot holdings.
  add({key,tokenId:key,symbol:'USDG',name:'یو اس دی جی',chain:'robinhood',contract:null,icon:'/logos/token-usdg.png'},quantity,1,'اعتبار آرکوس · '+a.holding.label,a.stale,!!a.state?.account.fetchedAt&&!a.state.account.error,'arcus');
 }
 if(boros.data){const d=boros.data;
  for(const b of d.balances){const quantity=positive(b.cash);if(!quantity)continue;const a=d.assets.find(a=>a.tokenId===b.tokenId);if(!a)continue;
   const key='boros:'+d.root+':'+d.accountId+':'+b.handle;
   add({key,tokenId:key,symbol:a.symbol,name:a.symbol,chain:'arbitrum',contract:null,icon:a.logo},quantity,a.priceUsd!==null&&a.priceUsd>0?a.priceUsd:null,b.marketId===0xffffff?'وثیقه بوروس · مشترک':'وثیقه بوروس · بازار '+new Intl.NumberFormat('fa-IR').format(b.marketId),boros.stale,b.cash!==null&&b.equity!==null,'boros');
  }
 }
 // This panel never constructs a new portfolio total; platform equity overlap is unresolved.
 if(rows.some(r=>r.provider!=='wallet')||extras.length)rows.forEach(r=>r.share=null);
 return {...walletSummary,rows};
}
