import Decimal from 'decimal.js';
import { catalogToken } from '@/features/connected/domain/visibility';
import { ASSETS } from '@/features/custody/domain/catalog';
import { addressKey } from '@/features/connected/domain/model';
import type { LivePosition, TransactionTransfer, WalletTransaction } from '@/features/connected/domain/model';
import type { ActivityLink } from '@/features/connected/domain/activity';
import { transactionKey } from '@/features/connected/domain/activity';
export const COST_PREF='cost-basis-v1';
export interface CostAsset { key:string;tokenId:string;symbol:string;name:string;chain:string;contract:string|null;icon:string|null }
export interface CostLot { id:string;asset:CostAsset;quantity:string;unitCost:string;fee:string|null;at:number;source:string }
export interface ArchivedPurchase {id:string;symbol:string;quantity:string;unitCost:string;fee:string|null;at:number}
export interface CostBook {currentBasis?:Record<string,import('./currentBasis').CurrentBasis>;basisHistory?:import('./currentBasis').CurrentBasis[];archivedPurchases?:ArchivedPurchase[];version:1;asOf:number;lots:CostLot[];migrationConfirmed:boolean;legacyRetired:boolean}
const CASH_SYMBOLS=new Set(['USDT','USDC','DAI','USDG','USD₮0','USDT0','USDE','USDS','FDUSD','PYUSD','USDC.E','USDBC']);
const CASH_IDS=new Set(['tether','usdt','usdt0','usd-coin','usdc','dai','global-dollar','usdg','ethena-usde','usde','sky-dollar','usds']);
const WRAPPED_EQUIV:Record<string,{tokenId:string;symbol:string}>={
 WETH:{tokenId:'ethereum',symbol:'ETH'},
 'WRAPPED-ETHER':{tokenId:'ethereum',symbol:'ETH'},
 WBTC:{tokenId:'bitcoin',symbol:'BTC'},
 CBBTC:{tokenId:'bitcoin',symbol:'BTC'},
 WSOL:{tokenId:'solana',symbol:'SOL'},
 WHYPE:{tokenId:'hyperliquid',symbol:'HYPE'},
 WBNB:{tokenId:'binancecoin',symbol:'BNB'},
 WAVAX:{tokenId:'avalanche-2',symbol:'AVAX'},
 WPOL:{tokenId:'polygon-ecosystem-token',symbol:'POL'},
 WMATIC:{tokenId:'polygon-ecosystem-token',symbol:'POL'},
 WS:{tokenId:'sonic-3',symbol:'S'}
};
export function verifiedCash(chain:string,contract:string|null|undefined,token?:{verified?:boolean;tokenId?:string;symbol:string}) {
 const local=ASSETS.some(a=>a.networkId===chain&&CASH_SYMBOLS.has(a.symbol)&&((!contract&&!a.contract)||(!!contract&&!!a.contract&&(chain==='solana'?a.contract===contract:a.contract.toLowerCase()===contract.toLowerCase()))));
 return local||!!(token?.verified&&token.tokenId&&CASH_IDS.has(token.tokenId.toLowerCase())&&CASH_SYMBOLS.has(token.symbol.toUpperCase()));
}

export interface CostResult {lots:CostLot[];realized:string;issues:{key:string;reason:string;assetKeys?:string[]}[];processed:string[]}
export const assetKey=(p:Pick<LivePosition,'chain'|'contract'|'tokenId'> & Partial<Pick<LivePosition,'symbol'|'verified'>>)=>{
 const sym=(p.symbol??'').toUpperCase();
 const wrapped=p.verified!==false?WRAPPED_EQUIV[sym]:undefined;
 if(wrapped) return `fungible:${wrapped.tokenId}`;
 const native=p.symbol?catalogToken({...p,symbol:p.symbol}):undefined;
 const id=p.tokenId||(!p.contract&&native?.isNative?native.coingeckoId:undefined);
 return id?`fungible:${id}`:`${p.chain}:${(p.chain==='solana'?p.contract:p.contract?.toLowerCase())??'native'}`;
};
export const costAsset=(p:LivePosition):CostAsset=>({key:assetKey(p),tokenId:p.tokenId||(!p.contract&&catalogToken(p)?.isNative?catalogToken(p)?.coingeckoId:'')||'',symbol:p.symbol,name:p.name,chain:p.chain,contract:p.contract,icon:p.icon});
export function decimalPositive(s:string):boolean {try{return new Decimal(s).isFinite() && new Decimal(s).gt(0);}catch{return false;}}

/** نرمال‌سازی کلید دارایی یک ترنسفر سواپ برای تمام رمزارزها (شامل رپدها، توکن بومی شبکه و توکن‌های قراردادی) */
function transferAssetKey(t:TransactionTransfer,chain:string,knownAssetKeys:ReadonlySet<string>):{key:string;tokenId:string;symbol:string} | null {
 const txChain=t.chain??chain;
 const sym=(t.symbol??'').toUpperCase();
 const wrapped=t.verified!==false?WRAPPED_EQUIV[sym]:undefined;
 if(wrapped) {
  if(knownAssetKeys.has(`fungible:${sym.toLowerCase()}`)) return {key:`fungible:${sym.toLowerCase()}`,tokenId:sym.toLowerCase(),symbol:sym};
  if(knownAssetKeys.has('fungible:eth')&&wrapped.symbol==='ETH') return {key:'fungible:eth',tokenId:'eth',symbol:'ETH'};
  return {key:`fungible:${wrapped.tokenId}`,tokenId:wrapped.tokenId,symbol:wrapped.symbol};
 }
 const cat=t.symbol?catalogToken({chain:txChain,contract:t.contract,symbol:t.symbol,tokenId:t.tokenId,verified:t.verified}):undefined;
 const rawId=t.tokenId||(!t.contract&&cat?.isNative?cat.coingeckoId:undefined);
 if(rawId) {
  if((rawId==='ethereum'||rawId==='eth')&&knownAssetKeys.has('fungible:eth')&&!knownAssetKeys.has('fungible:ethereum')) return {key:'fungible:eth',tokenId:'eth',symbol:t.symbol||'ETH'};
  if((rawId==='ethereum'||rawId==='eth')&&knownAssetKeys.has('fungible:ethereum')&&!knownAssetKeys.has('fungible:eth')) return {key:'fungible:ethereum',tokenId:'ethereum',symbol:t.symbol||'ETH'};
  return {key:`fungible:${rawId}`,tokenId:rawId,symbol:t.symbol};
 }
 if(t.contract) {
  const normContract=txChain==='solana'?t.contract:t.contract.toLowerCase();
  const key=`${txChain}:${normContract}`;
  return {key,tokenId:key,symbol:t.symbol};
 }
 return null;
}

/** تجمیع پایه‌های ورودی یا خروجی سواپ (برای پشتیبانی از سواپ‌های چندمسیره Uniswap Universal Router) */
function aggregateSwapLegs(transfers:readonly TransactionTransfer[],chain:string,knownAssetKeys:ReadonlySet<string>):TransactionTransfer[] | null {
 const valid=transfers.filter(t=>!t.spam&&t.verified!==false&&t.quantity&&decimalPositive(t.quantity));
 if(!valid.length) return null;
 const byKey=new Map<string,TransactionTransfer>();
 for(const t of valid) {
  const resolved=transferAssetKey(t,chain,knownAssetKeys);
  if(!resolved||t.value===null||!Number.isFinite(t.value)||t.value<0) return null;
  const prev=byKey.get(resolved.key);
  if(prev) {
   byKey.set(resolved.key,{
    ...prev,
    quantity:new Decimal(prev.quantity!).plus(t.quantity!).toString(),
    value:new Decimal(prev.value!).plus(t.value).toNumber()
   });
  } else {
   byKey.set(resolved.key,{...t,tokenId:resolved.tokenId,symbol:resolved.symbol});
  }
 }
 return [...byKey.values()];
}

export function replayCost(book:CostBook, transactions:WalletTransaction[],links:ActivityLink[]=[],ownedAddresses:string[]=[]):CostResult {
 const issues:CostResult['issues']=[];
 const lots=book.lots.filter(l=>{try{if(typeof l.quantity!=='string'||typeof l.unitCost!=='string'||!l.asset?.key||!new Decimal(l.quantity).isFinite()||new Decimal(l.quantity).lt(0)||!new Decimal(l.unitCost).isFinite()||new Decimal(l.unitCost).lt(0)||!Number.isFinite(l.at)||l.fee!==null&&(!new Decimal(l.fee).isFinite()||new Decimal(l.fee).lt(0)))throw Error();return true;}catch{issues.push({key:'invalid:'+l.id,reason:'اطلاعات خرید معتبر نیست',assetKeys:l.asset?.key?[l.asset.key]:[]});return false;}}).map(l=>({...l,asset:{...l.asset}}));const processed:string[]=[];let realized=new Decimal(0);
 const knownAssetKeys=new Set<string>([...lots.map(l=>l.asset.key),...Object.keys(book.currentBasis??{})]);
 const blocked=new Set<string>();
 const fail=(key:string,reason:string,assetKeys:string[])=>{issues.push({key,reason,assetKeys});assetKeys.forEach(k=>blocked.add(k));};
 for(const lot of lots)if(lot.fee===null)issues.push({key:'opening-fees:'+lot.id,reason:'کارمزد خرید نامشخص',assetKeys:[lot.asset.key]});
 const owned=new Set(ownedAddresses.map(addressKey));
 const fees=new Map<string,WalletTransaction[]>();
 const consumeFee=(key:string,tx:WalletTransaction)=>{
  const t=tx.feeToken;
  if(!t?.quantity||!decimalPositive(t.quantity)||verifiedCash(t.chain??tx.chain,t.contract,t)||!(tx.from&&owned.has(addressKey(tx.from))||tx.chain==='bitcoin'&&t.direction==='out'))return;
  const resolved=transferAssetKey(t,t.chain??tx.chain,knownAssetKeys);
  if(!resolved)return;
  const feeKey=resolved.key;
  const open=lots.filter(l=>l.asset.key===feeKey&&l.at<=Date.parse(tx.minedAt)&&decimalPositive(l.quantity)).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
  if(open.reduce((s,l)=>s.plus(l.quantity),new Decimal(0)).lt(t.quantity)){fail(key+':fee','بهای خرید کارمزد شبکه نامشخص',[feeKey]);return;}
  let left=new Decimal(t.quantity);
  for(const lot of open){if(left.lte(0))break;const take=Decimal.min(left,lot.quantity);lot.quantity=new Decimal(lot.quantity).minus(take).toString();left=left.minus(take);}
 };
 const unique=new Map(transactions.map(tx=>[transactionKey(tx),tx]));
 for(const link of links.filter(l=>l.kind==='bridge'||l.kind==='bridge_swap')) {
  const source=unique.get(link.from),target=unique.get(link.to);
  if(!source||!target||source.status!=='confirmed'||target.status!=='confirmed')continue;
  const outgoing=source.transfers.filter(t=>t.direction==='out'),incoming=target.transfers.filter(t=>t.direction==='in');
  const at=Date.parse(target.minedAt);if(at<=book.asOf)continue;
  if(outgoing.length!==1||incoming.length!==1) {fail(link.id,'بریج چنددارایی؛ نیازمند بررسی',[...outgoing,...incoming].filter(t=>t.tokenId).map(t=>'fungible:'+t.tokenId));continue;}
  fees.set('linked:'+link.id,[source,target]);
  unique.delete(link.from);unique.delete(link.to);
  unique.set('linked:'+link.id,{...source,id:link.id,hash:'linked:'+link.id,type:link.kind==='bridge_swap'?'trade':'bridge',minedAt:target.minedAt,
   fee:source.fee===null||target.fee===null?null:source.fee+target.fee,
   transfers:[{...outgoing[0],chain:source.chain},{...incoming[0],chain:target.chain}]});
 }

 for(const [key,tx] of [...unique].sort((a,b)=>Date.parse(a[1].minedAt)-Date.parse(b[1].minedAt))) {
  if(tx.spam||tx.status!=='confirmed'||!Number.isFinite(Date.parse(tx.minedAt))||Date.parse(tx.minedAt)<=book.asOf) continue;
  for(const paying of fees.get(key)??[tx])consumeFee(key,paying);
  // Transfers, bridge and protocol deposits never create purchases or realized PnL.
  const affected=tx.transfers.filter(t=>!verifiedCash(t.chain??tx.chain,t.contract,t)).map(t=>transferAssetKey(t,t.chain??tx.chain,knownAssetKeys)?.key).filter((k):k is string=>!!k);
  if(affected.some(k=>blocked.has(k))){fail(key,'محاسبه پس از تراکنش نامشخص متوقف است',affected);continue;}
  if(tx.type==='bridge') {
   const sell=tx.transfers[0],buy=tx.transfers[1];
   const sellRes=sell?transferAssetKey(sell,sell.chain??tx.chain,knownAssetKeys):null;
   const buyRes=buy?transferAssetKey(buy,buy.chain??tx.chain,knownAssetKeys):null;
   if(!sellRes||!buyRes||sellRes.key!==buyRes.key||!sell.quantity||!buy.quantity||!decimalPositive(sell.quantity)||!decimalPositive(buy.quantity)) {fail(key,'هویت یا مقدار بریج متفاوت است',affected);continue;}
   const open=lots.filter(l=>l.asset.key===sellRes.key&&l.at<=Date.parse(tx.minedAt)&&decimalPositive(l.quantity)).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
   if(open.reduce((s,l)=>s.plus(l.quantity),new Decimal(0)).lt(sell.quantity)) {if(!verifiedCash(sell.chain??tx.chain,sell.contract,sell))fail(key,'بهای خرید دارایی بریج‌شده کامل نیست',affected);continue;}
   let left=new Decimal(sell.quantity);const added:CostLot[]=[];
   for(const l of open){if(left.lte(0))break;const take=Decimal.min(left,l.quantity),received=take.times(buy.quantity).div(sell.quantity);l.quantity=new Decimal(l.quantity).minus(take).toString();left=left.minus(take);added.push({...l,id:key+':'+l.id,asset:{...l.asset,chain:buy.chain??l.asset.chain,contract:buy.contract??null},quantity:received.toString(),unitCost:take.times(l.unitCost).div(received).toString(),source:key});}
   lots.push(...added);processed.push(key);continue;
  }
  if(tx.type!=='trade') continue;
  const rawIn=tx.transfers.filter(t=>t.direction==='in'),rawOut=tx.transfers.filter(t=>t.direction==='out');
  const incoming=aggregateSwapLegs(rawIn,tx.chain,knownAssetKeys),outgoing=aggregateSwapLegs(rawOut,tx.chain,knownAssetKeys);
  if(!incoming||!outgoing||incoming.length!==1||outgoing.length!==1) {
   if(rawIn.length!==1||rawOut.length!==1) {fail(key,'مبادلهٔ چندمرحله‌ای؛ نیازمند بررسی',affected);continue;}
   fail(key,'هویت، مقدار، ارزش تاریخی یا کارمزد نامشخص',affected);continue;
  }
  const buy=incoming[0],sell=outgoing[0];
  if(!buy.tokenId||!sell.tokenId||!buy.quantity||!sell.quantity||!decimalPositive(buy.quantity)||!decimalPositive(sell.quantity)||sell.value===null||buy.value===null||!Number.isFinite(sell.value)||!Number.isFinite(buy.value)||sell.value<0||buy.value<0||tx.fee===null||!Number.isFinite(tx.fee)||tx.fee<0||sell.spam||buy.spam||sell.verified===false||buy.verified===false) {fail(key,'هویت، مقدار، ارزش تاریخی یا کارمزد نامشخص',affected);continue;}
  const sellKey=sell.tokenId.includes(':')?sell.tokenId:`fungible:${sell.tokenId}`;
  const buyKey=buy.tokenId.includes(':')?buy.tokenId:`fungible:${buy.tokenId}`;
  if(sellKey===buyKey) {
   // تبدیل مستقیم ETH <-> WETH سواپ مشمول سود/زیان نیست
   processed.push(key);continue;
  }
  const open=lots.filter(l=>l.asset.key===sellKey&&l.at<=Date.parse(tx.minedAt)&&new Decimal(l.quantity).gt(0)).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
  const sellCash=verifiedCash(sell.chain??tx.chain,sell.contract,sell),buyCash=verifiedCash(buy.chain??tx.chain,buy.contract,buy);
  const available=open.reduce((sum,l)=>sum.plus(l.quantity),new Decimal(0));
  if(!sellCash&&available.lt(sell.quantity)) {fail(key,'بهای خرید دارایی خروجی کامل نیست',affected);continue;}
  let left=new Decimal(sell.quantity),basis=new Decimal(0);
  if(sellCash) basis=new Decimal(sell.value);
  else for(const l of open) {if(left.lte(0))break;const qty=Decimal.min(left,l.quantity);basis=basis.plus(qty.times(l.unitCost));l.quantity=new Decimal(l.quantity).minus(qty).toString();left=left.minus(qty);}
  if(!sellCash) realized=realized.plus(new Decimal(buy.value).minus(basis).minus(tx.fee));
  if(!buyCash) {
   lots.push({id:key,asset:{key:buyKey,tokenId:buy.tokenId,symbol:buy.symbol,name:buy.name||buy.symbol,chain:buy.chain??tx.chain,contract:buy.contract??null,icon:buy.icon},quantity:buy.quantity,unitCost:new Decimal(sellCash?sell.value:buy.value).plus(sellCash?tx.fee:0).div(buy.quantity).toString(),fee:String(tx.fee),at:Date.parse(tx.minedAt),source:key});
   knownAssetKeys.add(buyKey);
  }
  processed.push(key);
 }
 return {lots,realized:realized.toString(),issues,processed};
}
export function valueCost(lots:CostLot[],quantity:string,price:number|null,totalQuantity=quantity) {
 const open=lots.filter(l=>decimalPositive(l.quantity)&&(()=>{try{return new Decimal(l.unitCost).isFinite()&&new Decimal(l.unitCost).gte(0);}catch{return false;}})()).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
 let left=new Decimal(quantity),basis=new Decimal(0),covered=new Decimal(0);
 for(const l of open) {if(left.lte(0))break;const take=Decimal.min(left,l.quantity);basis=basis.plus(take.times(l.unitCost));covered=covered.plus(take);left=left.minus(take);}
 const partialPnl=covered.isZero()||price===null||!Number.isFinite(price)||price<0||open.reduce((s,l)=>s.plus(l.quantity),new Decimal(0)).gt(totalQuantity)?null:covered.times(price).minus(basis).toNumber();
 return {partialPnl,basis:basis.toNumber(),covered:covered.toString(),unknown:Decimal.max(left,0).toString(),excess:Decimal.max(open.reduce((s,l)=>s.plus(l.quantity),new Decimal(0)).minus(totalQuantity),0).toString(),pnl:covered.isZero()||!left.isZero()||price===null||!Number.isFinite(price)||price<0||open.reduce((s,l)=>s.plus(l.quantity),new Decimal(0)).gt(totalQuantity)?null:covered.times(price).minus(basis).toNumber()};
}
