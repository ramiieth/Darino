import Decimal from 'decimal.js';
import { ASSETS } from '@/features/custody/domain/catalog';
import type { LivePosition, WalletTransaction } from '@/features/connected/domain/model';
import type { ActivityLink } from '@/features/connected/domain/activity';
import { transactionKey } from '@/features/connected/domain/activity';
export const COST_PREF='cost-basis-v1';
export interface CostAsset { key:string;tokenId:string;symbol:string;name:string;chain:string;contract:string|null;icon:string|null }
export interface CostLot { id:string;asset:CostAsset;quantity:string;unitCost:string;fee:string|null;at:number;source:string }
export interface ArchivedPurchase {id:string;symbol:string;quantity:string;unitCost:string;fee:string|null;at:number}
export interface CostBook {archivedPurchases?:ArchivedPurchase[];version:1;asOf:number;lots:CostLot[];migrationConfirmed:boolean;legacyRetired:boolean}
export function verifiedCash(chain:string,contract:string|null|undefined) {return !!contract && ASSETS.some(a=>a.networkId===chain&&a.contract?.toLowerCase()===contract.toLowerCase()&&['USDT','USDC','DAI','USDG','USD₮0'].includes(a.symbol));}
export interface CostResult {lots:CostLot[];realized:string;issues:{key:string;reason:string}[];processed:string[]}
export const assetKey=(p:Pick<LivePosition,'chain'|'contract'|'tokenId'>)=>p.tokenId ? `fungible:${p.tokenId}` : `${p.chain}:${p.contract?.toLowerCase() ?? 'native'}`;
export const costAsset=(p:LivePosition):CostAsset=>({key:assetKey(p),tokenId:p.tokenId,symbol:p.symbol,name:p.name,chain:p.chain,contract:p.contract,icon:p.icon});
export function decimalPositive(s:string):boolean {try{return new Decimal(s).isFinite() && new Decimal(s).gt(0);}catch{return false;}}
export function replayCost(book:CostBook, transactions:WalletTransaction[],links:ActivityLink[]=[]):CostResult {
 const lots=book.lots.map(l=>({...l,asset:{...l.asset}}));const issues:CostResult['issues']=[];const processed:string[]=[];let realized=new Decimal(0);
 if(book.lots.some(l=>l.fee===null)) issues.push({key:'opening-fees',reason:'کارمزد خریدهای اولیه تأیید نشده است'});
 const unique=new Map(transactions.map(tx=>[transactionKey(tx),tx]));
 for(const link of links.filter(l=>l.kind==='bridge'||l.kind==='bridge_swap')) {
  const source=unique.get(link.from),target=unique.get(link.to);
  if(!source||!target||source.status!=='confirmed'||target.status!=='confirmed')continue;
  const outgoing=source.transfers.filter(t=>t.direction==='out'),incoming=target.transfers.filter(t=>t.direction==='in');
  const at=Date.parse(target.minedAt);if(at<=book.asOf)continue;
  if(outgoing.length!==1||incoming.length!==1) {issues.push({key:link.id,reason:'بریج چنددارایی؛ بهای خرید نیازمند بررسی است'});continue;}
  unique.delete(link.from);unique.delete(link.to);
  unique.set('linked:'+link.id,{...source,id:link.id,hash:'linked:'+link.id,type:link.kind==='bridge_swap'?'trade':'bridge',minedAt:target.minedAt,
   fee:source.fee===null||target.fee===null?null:source.fee+target.fee,
   transfers:[{...outgoing[0],chain:source.chain},{...incoming[0],chain:target.chain}]});
 }

 for(const [key,tx] of [...unique].sort((a,b)=>Date.parse(a[1].minedAt)-Date.parse(b[1].minedAt))) {
  if(tx.spam||tx.status!=='confirmed'||!Number.isFinite(Date.parse(tx.minedAt))||Date.parse(tx.minedAt)<=book.asOf) continue;
  // Transfers, bridge and protocol deposits never create purchases or realized PnL.
  if(tx.type==='bridge') {
   const sell=tx.transfers[0],buy=tx.transfers[1];
   if(!sell?.tokenId||!buy?.tokenId||sell.tokenId!==buy.tokenId||!sell.quantity||!buy.quantity||!decimalPositive(sell.quantity)||!decimalPositive(buy.quantity)) {issues.push({key,reason:'هویت یا مقدار بریج متفاوت است؛ تبدیل دارایی را بررسی کنید'});break;}
   const open=lots.filter(l=>l.asset.key===`fungible:${sell.tokenId}`&&l.at<=Date.parse(tx.minedAt)&&decimalPositive(l.quantity)).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
   if(open.reduce((s,l)=>s.plus(l.quantity),new Decimal(0)).lt(sell.quantity)) {if(!verifiedCash(sell.chain??tx.chain,sell.contract))issues.push({key,reason:'بهای خرید دارایی بریج‌شده کامل نیست'});continue;}
   let left=new Decimal(sell.quantity);const added:CostLot[]=[];
   for(const l of open){if(left.lte(0))break;const take=Decimal.min(left,l.quantity),received=take.times(buy.quantity).div(sell.quantity);l.quantity=new Decimal(l.quantity).minus(take).toString();left=left.minus(take);added.push({...l,id:key+':'+l.id,asset:{...l.asset,chain:buy.chain??l.asset.chain,contract:buy.contract??null},quantity:received.toString(),unitCost:take.times(l.unitCost).div(received).toString(),source:key});}
   lots.push(...added);processed.push(key);continue;
  }
  if(tx.type!=='trade') continue;
  const incoming=tx.transfers.filter(t=>t.direction==='in'),outgoing=tx.transfers.filter(t=>t.direction==='out');
  if(incoming.length!==1||outgoing.length!==1||(tx.acts?.filter(a=>a.type==='trade').length ?? 0)>1) {issues.push({key,reason:'مبادلهٔ چندمرحله‌ای؛ نیازمند بررسی'});break;}
  const buy=incoming[0],sell=outgoing[0];
  if(!buy.tokenId||!sell.tokenId||!buy.quantity||!sell.quantity||!decimalPositive(buy.quantity)||!decimalPositive(sell.quantity)||sell.value===null||buy.value===null||tx.fee===null) {issues.push({key,reason:'هویت، مقدار، ارزش تاریخی یا کارمزد نامشخص'});break;}
  const sellKey=`fungible:${sell.tokenId}`,buyKey=`fungible:${buy.tokenId}`;
  if(sellKey===buyKey) {issues.push({key,reason:'تبدیل هم‌هویت؛ نیازمند بررسی'});break;}
  const open=lots.filter(l=>l.asset.key===sellKey&&l.at<=Date.parse(tx.minedAt)&&new Decimal(l.quantity).gt(0)).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
  const sellCash=verifiedCash(sell.chain??tx.chain,sell.contract),buyCash=verifiedCash(buy.chain??tx.chain,buy.contract);
  const available=open.reduce((sum,l)=>sum.plus(l.quantity),new Decimal(0));
  if(!sellCash&&available.lt(sell.quantity)) {issues.push({key,reason:'بهای خرید دارایی خروجی کامل نیست'});break;}
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
 const open=lots.filter(l=>decimalPositive(l.quantity)).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id));
 let left=new Decimal(quantity),basis=new Decimal(0),covered=new Decimal(0);
 for(const l of open) {if(left.lte(0))break;const take=Decimal.min(left,l.quantity);basis=basis.plus(take.times(l.unitCost));covered=covered.plus(take);left=left.minus(take);}
 return {basis:basis.toNumber(),covered:covered.toString(),unknown:Decimal.max(left,0).toString(),excess:Decimal.max(open.reduce((s,l)=>s.plus(l.quantity),new Decimal(0)).minus(totalQuantity),0).toString(),pnl:covered.isZero()||price===null||open.reduce((s,l)=>s.plus(l.quantity),new Decimal(0)).gt(totalQuantity)?null:covered.times(price).minus(basis).toNumber()};
}
