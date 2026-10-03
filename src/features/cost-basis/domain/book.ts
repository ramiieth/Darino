import Decimal from 'decimal.js';
import { catalogToken } from '@/features/connected/domain/visibility';
import { ASSETS } from '@/features/custody/domain/catalog';
import { addressKey } from '@/features/connected/domain/model';
import type { LivePosition, WalletTransaction } from '@/features/connected/domain/model';
import type { ActivityLink } from '@/features/connected/domain/activity';
import { transactionKey } from '@/features/connected/domain/activity';
export const COST_PREF='cost-basis-v1';
export interface CostAsset { key:string;tokenId:string;symbol:string;name:string;chain:string;contract:string|null;icon:string|null }
export interface CostLot { id:string;asset:CostAsset;quantity:string;unitCost:string;fee:string|null;at:number;source:string }
export interface ArchivedPurchase {id:string;symbol:string;quantity:string;unitCost:string;fee:string|null;at:number}
export interface CostBook {currentBasis?:Record<string,import('./currentBasis').CurrentBasis>;basisHistory?:import('./currentBasis').CurrentBasis[];archivedPurchases?:ArchivedPurchase[];version:1;asOf:number;lots:CostLot[];migrationConfirmed:boolean;legacyRetired:boolean}
const CASH_SYMBOLS=new Set(['USDT','USDC','DAI','USDG','USD₮0','USDT0']);
const CASH_IDS=new Set(['tether','usdt','usdt0','usd-coin','usdc','dai','global-dollar','usdg']);
export function verifiedCash(chain:string,contract:string|null|undefined,token?:{verified?:boolean;tokenId?:string;symbol:string}) {
 const local=ASSETS.some(a=>a.networkId===chain&&CASH_SYMBOLS.has(a.symbol)&&((!contract&&!a.contract)||(!!contract&&!!a.contract&&(chain==='solana'?a.contract===contract:a.contract.toLowerCase()===contract.toLowerCase()))));
 return local||!!(token?.verified&&token.tokenId&&CASH_IDS.has(token.tokenId.toLowerCase())&&CASH_SYMBOLS.has(token.symbol.toUpperCase()));
}

export interface CostResult {lots:CostLot[];realized:string;issues:{key:string;reason:string;assetKeys?:string[]}[];processed:string[]}
export const assetKey=(p:Pick<LivePosition,'chain'|'contract'|'tokenId'> & Partial<Pick<LivePosition,'symbol'|'verified'>>)=>{
 const native=p.symbol?catalogToken({...p,symbol:p.symbol}):undefined;
 const id=p.tokenId||(!p.contract&&native?.isNative?native.coingeckoId:undefined);
 return id?`fungible:${id}`:`${p.chain}:${(p.chain==='solana'?p.contract:p.contract?.toLowerCase())??'native'}`;
};
export const costAsset=(p:LivePosition):CostAsset=>({key:assetKey(p),tokenId:p.tokenId||(!p.contract&&catalogToken(p)?.isNative?catalogToken(p)?.coingeckoId:'')||'',symbol:p.symbol,name:p.name,chain:p.chain,contract:p.contract,icon:p.icon});
export function decimalPositive(s:string):boolean {try{return new Decimal(s).isFinite() && new Decimal(s).gt(0);}catch{return false;}}
export function replayCost(book:CostBook, transactions:WalletTransaction[],links:ActivityLink[]=[],ownedAddresses:string[]=[]):CostResult {
 const issues:CostResult['issues']=[];
 const lots=book.lots.filter(l=>{try{if(typeof l.quantity!=='string'||typeof l.unitCost!=='string'||!l.asset?.key||!new Decimal(l.quantity).isFinite()||new Decimal(l.quantity).lt(0)||!new Decimal(l.unitCost).isFinite()||new Decimal(l.unitCost).lt(0)||!Number.isFinite(l.at)||l.fee!==null&&(!new Decimal(l.fee).isFinite()||new Decimal(l.fee).lt(0)))throw Error();return true;}catch{issues.push({key:'invalid:'+l.id,reason:'اطلاعات خرید معتبر نیست',assetKeys:l.asset?.key?[l.asset.key]:[]});return false;}}).map(l=>({...l,asset:{...l.asset}}));const processed:string[]=[];let realized=new Decimal(0);
 const blocked=new Set<string>();
 const fail=(key:string,reason:string,assetKeys:string[])=>{issues.push({key,reason,assetKeys});assetKeys.forEach(k=>blocked.add(k));};
 for(const lot of lots)if(lot.fee===null)issues.push({key:'opening-fees:'+lot.id,reason:'کارمزد خرید نامشخص',assetKeys:[lot.asset.key]});
 const owned=new Set(ownedAddresses.map(addressKey));
 const fees=new Map<string,WalletTransaction[]>();
 const consumeFee=(key:string,tx:WalletTransaction)=>{const t=tx.feeToken;if(!t?.tokenId||!t.quantity||!decimalPositive(t.quantity)||verifiedCash(t.chain??tx.chain,t.contract,t)||!(tx.from&&owned.has(addressKey(tx.from))||tx.chain==='bitcoin'&&t.direction==='out'))return;const feeKey='fungible:'+t.tokenId;const open=lots.filter(l=>l.asset.key===feeKey&&l.at<=Date.parse(tx.minedAt)&&decimalPositive(l.quantity)).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));if(open.reduce((s,l)=>s.plus(l.quantity),new Decimal(0)).lt(t.quantity)){fail(key+':fee','بهای خرید کارمزد شبکه نامشخص',[feeKey]);return;}let left=new Decimal(t.quantity);for(const lot of open){if(left.lte(0))break;const take=Decimal.min(left,lot.quantity);lot.quantity=new Decimal(lot.quantity).minus(take).toString();left=left.minus(take);}};
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
  const affected=tx.transfers.filter(t=>t.tokenId&&!verifiedCash(t.chain??tx.chain,t.contract,t)).map(t=>'fungible:'+t.tokenId);
  if(affected.some(k=>blocked.has(k))){fail(key,'محاسبه پس از تراکنش نامشخص متوقف است',affected);continue;}
  if(tx.type==='bridge') {
   const sell=tx.transfers[0],buy=tx.transfers[1];
   if(!sell?.tokenId||!buy?.tokenId||sell.tokenId!==buy.tokenId||!sell.quantity||!buy.quantity||!decimalPositive(sell.quantity)||!decimalPositive(buy.quantity)) {fail(key,'هویت یا مقدار بریج متفاوت است',affected);continue;}
   const open=lots.filter(l=>l.asset.key===`fungible:${sell.tokenId}`&&l.at<=Date.parse(tx.minedAt)&&decimalPositive(l.quantity)).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
   if(open.reduce((s,l)=>s.plus(l.quantity),new Decimal(0)).lt(sell.quantity)) {if(!verifiedCash(sell.chain??tx.chain,sell.contract,sell))fail(key,'بهای خرید دارایی بریج‌شده کامل نیست',affected);continue;}
   let left=new Decimal(sell.quantity);const added:CostLot[]=[];
   for(const l of open){if(left.lte(0))break;const take=Decimal.min(left,l.quantity),received=take.times(buy.quantity).div(sell.quantity);l.quantity=new Decimal(l.quantity).minus(take).toString();left=left.minus(take);added.push({...l,id:key+':'+l.id,asset:{...l.asset,chain:buy.chain??l.asset.chain,contract:buy.contract??null},quantity:received.toString(),unitCost:take.times(l.unitCost).div(received).toString(),source:key});}
   lots.push(...added);processed.push(key);continue;
  }
  if(tx.type!=='trade') continue;
  const incoming=tx.transfers.filter(t=>t.direction==='in'),outgoing=tx.transfers.filter(t=>t.direction==='out');
  if(incoming.length!==1||outgoing.length!==1||(tx.acts?.filter(a=>a.type==='trade').length ?? 0)>1) {fail(key,'مبادلهٔ چندمرحله‌ای؛ نیازمند بررسی',affected);continue;}
  const buy=incoming[0],sell=outgoing[0];
  if(!buy.tokenId||!sell.tokenId||!buy.quantity||!sell.quantity||!decimalPositive(buy.quantity)||!decimalPositive(sell.quantity)||sell.value===null||buy.value===null||!Number.isFinite(sell.value)||!Number.isFinite(buy.value)||sell.value<0||buy.value<0||tx.fee===null||!Number.isFinite(tx.fee)||tx.fee<0||sell.spam||buy.spam||sell.verified===false||buy.verified===false) {fail(key,'هویت، مقدار، ارزش تاریخی یا کارمزد نامشخص',affected);continue;}
  const sellKey=`fungible:${sell.tokenId}`,buyKey=`fungible:${buy.tokenId}`;
  if(sellKey===buyKey) {fail(key,'تبدیل هم‌هویت؛ نیازمند بررسی',affected);continue;}
  const open=lots.filter(l=>l.asset.key===sellKey&&l.at<=Date.parse(tx.minedAt)&&new Decimal(l.quantity).gt(0)).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
  const sellCash=verifiedCash(sell.chain??tx.chain,sell.contract,sell),buyCash=verifiedCash(buy.chain??tx.chain,buy.contract,buy);
  const available=open.reduce((sum,l)=>sum.plus(l.quantity),new Decimal(0));
  if(!sellCash&&available.lt(sell.quantity)) {fail(key,'بهای خرید دارایی خروجی کامل نیست',affected);continue;}
  let left=new Decimal(sell.quantity),basis=new Decimal(0);
  if(sellCash) basis=new Decimal(sell.value);
  else for(const l of open) {if(left.lte(0))break;const qty=Decimal.min(left,l.quantity);basis=basis.plus(qty.times(l.unitCost));l.quantity=new Decimal(l.quantity).minus(qty).toString();left=left.minus(qty);}
  if(!sellCash) realized=realized.plus(new Decimal(buy.value).minus(basis).minus(tx.fee));
  if(!buyCash) lots.push({id:key,asset:{key:buyKey,tokenId:buy.tokenId,symbol:buy.symbol,name:buy.name||buy.symbol,chain:buy.chain??tx.chain,contract:buy.contract??null,icon:buy.icon},quantity:buy.quantity,unitCost:new Decimal(sellCash?sell.value:buy.value).plus(sellCash?tx.fee:0).div(buy.quantity).toString(),fee:String(tx.fee),at:Date.parse(tx.minedAt),source:key});
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
