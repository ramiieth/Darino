/** Public address-only Bitcoin adapter. Never signs or broadcasts transactions. */
import { Decimal } from 'decimal.js';
import { readProviderCache,writeProviderCache,providerCacheKey } from './_providerCache.js';
import { ProviderError } from './_zerion.js';
import { obj,arr,type WalletSnapshot,type WalletTransaction,type TransactionPage } from '../src/features/connected/domain/model.js';
const BASE='https://blockstream.info/api';
const pending=new Map<string,Promise<unknown>>();
async function cached<T>(key:string,ttl:number,load:()=>Promise<T>,force=false):Promise<T>{
 const cacheKey=providerCacheKey('bitcoin:'+key),hit=await readProviderCache<{at:number;data:T}>(cacheKey);
 if(hit&&(!force||Date.now()-hit.at<60000))return hit.data;
 if(pending.has(cacheKey))return pending.get(cacheKey) as Promise<T>;
 const work=load().then(async data=>{await writeProviderCache(cacheKey,{at:Date.now(),data},ttl);return data;});pending.set(cacheKey,work);
 try{return await work;}finally{pending.delete(cacheKey);}
}
async function read(url:string):Promise<unknown>{const r=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw new ProviderError(r.status===429?429:502,r.status===429?'دریافت بیت‌کوین موقتاً محدود شده':'دریافت بیت‌کوین انجام نشد',r.status===429?60:0);return r.json();}
function sats(value:unknown):Decimal {if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new ProviderError(502,'اطلاعات بیت‌کوین معتبر نیست');return new Decimal(value);}
export function normalizeBitcoinTransaction(value:unknown,address:string,now=Date.now()):WalletTransaction{
 const tx=obj(value),status=obj(tx.status),inputs=arr(tx.vin).map(x=>obj(obj(x).prevout)),outputs=arr(tx.vout).map(obj);
 const sent=inputs.filter(x=>x.scriptpubkey_address===address).reduce((s,x)=>s.plus(sats(x.value)),new Decimal(0));
 const received=outputs.filter(x=>x.scriptpubkey_address===address).reduce((s,x)=>s.plus(sats(x.value)),new Decimal(0));
 const ownsAll=inputs.length>0&&inputs.every(x=>x.scriptpubkey_address===address),fee=sats(tx.fee);
 const net=received.minus(sent),amount=net.lt(0)?Decimal.max(net.abs().minus(ownsAll?fee:0),0):net;
 return {id:String(tx.txid),hash:String(tx.txid),chain:'bitcoin',type:amount.isZero()?'execute':net.lt(0)?'send':'receive',status:status.confirmed===true?'confirmed':'pending',minedAt:new Date(typeof status.block_time==='number'?status.block_time*1000:now).toISOString(),fee:null,
  feeToken:ownsAll?{direction:'out',symbol:'BTC',quantity:fee.div(1e8).toString(),value:null,address:null,tokenId:'bitcoin',chain:'bitcoin',icon:'/logos/token-btc.png',verified:true}:undefined,
  transfers:amount.isZero()?[]:[{direction:net.lt(0)?'out':'in',symbol:'BTC',name:'Bitcoin',tokenId:'bitcoin',chain:'bitcoin',quantity:amount.div(1e8).toString(),value:null,price:null,address:null,contract:null,icon:'/logos/token-btc.png',verified:true}]};
}
export async function getBitcoinWallet(address:string,userId:string,force=false):Promise<WalletSnapshot>{
 const lastKey=providerCacheKey('last-bitcoin:'+userId+':'+address);
 try{return await cached('wallet:'+address,1800000,async()=>{
  const raw=obj(await read(BASE+'/address/'+encodeURIComponent(address))),chain=obj(raw.chain_stats);
  // Confirmed UTXO balance. Pending transactions are shown separately in activity.
  const quantity=sats(chain.funded_txo_sum).minus(sats(chain.spent_txo_sum)).div(1e8);if(quantity.lt(0))throw new ProviderError(502,'اطلاعات بیت‌کوین معتبر نیست');
  const quoted=await cached('price',300000,async()=>{const r=obj(obj(await read('https://api.coinbase.com/v2/prices/BTC-USD/spot')).data);const n=Number(r.amount);if(r.currency!=='USD'||!Number.isFinite(n)||n<=0)throw new ProviderError(502,'قیمت بیت‌کوین در دسترس نیست');return n;}).catch(()=>null);
  const price=quoted,total=price===null?null:quantity.times(price).toNumber();
  const snapshot:WalletSnapshot={address,fetchedAt:Date.now(),total,change:null,complete:true,unpriced:price===null&&!quantity.isZero()?1:0,detailsError:price===null?'قیمت بیت‌کوین در دسترس نیست':undefined,chains:[{id:'bitcoin',name:'بیت‌کوین',icon:'/logos/token-btc.png',positions:true,transactions:true}],positions:quantity.isZero()?[]:[{id:'bitcoin:native',tokenId:'bitcoin',chain:'bitcoin',contract:null,name:'Bitcoin',symbol:'BTC',quantity:quantity.toString(),price,value:total,icon:'/logos/token-btc.png',verified:true,displayable:true,spam:false,type:'wallet',protocol:null,protocolIcon:null,group:null,receipt:null}]};
  if(price!==null||quantity.isZero())await writeProviderCache(lastKey,snapshot,30*86400000);return snapshot;
 },force);}catch(e){const last=await readProviderCache<WalletSnapshot>(lastKey);if(last)return {...last,stale:true,detailsError:e instanceof Error?e.message:'دریافت بیت‌کوین انجام نشد'};throw e;}
}
export async function getBitcoinTransactions(address:string,next?:string):Promise<TransactionPage>{
 if(next&&!/^[a-f0-9]{64}$/.test(next))throw new ProviderError(400,'صفحهٔ تراکنش معتبر نیست');
 return cached('history:'+address+':'+(next??''),900000,async()=>{
 const raw=arr(await read(BASE+'/address/'+encodeURIComponent(address)+'/txs'+(next?'/chain/'+next:'')));
 const confirmed=raw.filter(tx=>obj(obj(tx).status).confirmed===true);
 return {rows:raw.map(tx=>normalizeBitcoinTransaction(tx,address)),next:confirmed.length>=25?String(obj(confirmed[confirmed.length-1]).txid):null,fetchedAt:Date.now()};
 });
}
