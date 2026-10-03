import { z } from 'zod';
import { accountSnapshotSchema, accountHistorySchema, historyRowSchema, officialPreviewSchema, unpackAccount, packAccount, CROSS, x18, type BorosAccountSnapshot, type BorosAccountHistory, type OfficialPreview } from '../src/shared/boros/account.js';
const BASE = 'https://api-boros.pendle.finance/apis/v1';
const n = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const str = (v: unknown) => typeof v === 'string' ? v.slice(0,160) : '';
const syncAt = (v: unknown) => { const s = n((v as any)?.syncStatus?.timestamp); return s === null ? null : s * 1000; };
const page = z.object({ results: z.array(z.record(z.unknown())).max(2000), resumeToken: z.string().nullable().optional(), syncStatus: z.object({ timestamp: z.number().finite(), blockNumber: z.number().finite() }).optional() });
export class BorosReadError extends Error { constructor(public status: number, message: string) { super(message); } }
export function borosPreviewError(value:unknown):string {
 const text=JSON.stringify(value).slice(0,4000).toLowerCase();
 if(/margin|collateral|balance|insufficient.?cash/.test(text))return 'مارجین آزاد برای این حجم کافی نیست؛ حجم را کاهش دهید یا حساب و وثیقه را بررسی کنید';
 if(/slippage|out.of.range|rate.*bound/.test(text))return 'نرخ اجرا از حد مجاز خارج است؛ حجم و حد لغزش نرخ را بررسی کنید';
 if(/liquid|not.filled|fok/.test(text))return 'این حجم در حد لغزش انتخاب‌شده کامل اجرا نمی‌شود؛ حجم کوچک‌تر را بررسی کنید';
 if(/minimum|min.*order|order.*small/.test(text))return 'حجم از حداقل سفارش این بازار کمتر است؛ حجم معتبر وارد کنید';
 return 'پیش‌نمایش این سفارش پذیرفته نشد؛ حجم، بازار و مارجین را بررسی کنید';
}
export async function borosRead(path: string, body?: unknown) {
 const preview=path==='/simulations/place-order';
 for(let attempt=0;attempt<(preview?2:1);attempt++){
  let r:Response;
  try{r=await fetch(BASE+path,{method:body?'POST':'GET',headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(preview?20000:15000)});}
  catch{if(preview&&attempt===0)continue;throw new BorosReadError(504,'پاسخ بوروس دیر رسید؛ دوباره پیش‌نمایش را بررسی کنید');}
  if(r.status===429)throw new BorosReadError(429,'سهمیه بوروس محدود است؛ آخرین داده حفظ شد');
  if(preview&&r.status>=500&&attempt===0)continue;
  if(r.status===401||r.status===403)throw new BorosReadError(502,'دسترسی به دادهٔ عمومی بوروس پذیرفته نشد؛ اتصال سرویس را بررسی کنید');
  if(preview&&r.status>=400&&r.status<500){let detail:unknown=null;try{detail=await r.json();}catch{}throw new BorosReadError(422,borosPreviewError(detail));}
  if(!r.ok)throw new BorosReadError(502,'سرویس بوروس موقتاً پاسخ نمی‌دهد؛ دوباره تلاش کنید');
  return r.json();
 }
 throw new BorosReadError(502,'سرویس بوروس موقتاً پاسخ نمی‌دهد');
}

const cache = new Map<string,{ at:number; value:BorosAccountSnapshot }>();
const pending = new Map<string,Promise<BorosAccountSnapshot>>();
export function clearBorosAccountCache() { cache.clear(); pending.clear(); previewCache.clear(); previewPending.clear(); historyCache.clear(); historyPending.clear(); }
function owned(handle: unknown, root: string, id: number) {
 if (typeof handle !== 'string') throw new Error('invalid handle');
 const h = unpackAccount(handle);
 if (h.root !== root || h.accountId !== id) throw new Error('account mismatch');
 return h;
}
export async function readBorosAccount(root: string, accountId: number): Promise<BorosAccountSnapshot> {
 const key = `${root}:${accountId}`;
 const hit = cache.get(key); if (hit && Date.now()-hit.at < 45000) return hit.value;
 const running = pending.get(key); if (running) return running;
 const job = (async () => {
  const q = `root=${root}&accountId=${accountId}`;
  const errors:string[] = [];
  const [assetsRaw, positionsRaw] = await Promise.all([borosRead('/assets?isCollateral=true'), borosRead('/accounts/active-positions?'+q)]);
  const tokenLogos:Record<string,string>={WETH:'/logos/token-eth.svg',WBTC:'/logos/token-btc.png',USDT:'/logos/token-usdt.svg','USD₮0':'/logos/token-usdt0.svg',HYPE:'/logos/token-hype.jpg',BNB:'/logos/chain-56.svg'};
  const assets = page.parse(assetsRaw).results.map(a => ({ tokenId: a.tokenId, symbol: str(a.symbol), priceUsd: typeof a.usdPrice==='string' && a.usdPrice.trim() ? Number(a.usdPrice) : null, logo:tokenLogos[str(a.symbol)]??null }));
  const positionRows = page.parse(positionsRaw).results;
  const getOptional=async(path:string,label:string)=>{try{return page.parse(await borosRead(path));}catch{errors.push(label);return null;}};
  const ancillary = Promise.all([
   getOptional('/accounts/settlement-events?'+q+'&limit=100','تاریخچه تسویه دریافت نشد'),
   getOptional('/accounts/transfer-logs?'+q+'&limit=100','تاریخچه انتقال دریافت نشد'),
   getOptional('/accounts/orders?'+q+'&isActive=true&limit=100','سفارش‌ها دریافت نشد'),
   borosRead('/accounts/gas-balance?root='+root).catch(()=>null)
  ]);
  // Enumerate main-account isolated collateral, then query every collateral cross handle
  // directly: a deposit must be visible even before the first trade is opened.
  let discovered: z.infer<typeof page> = {results:[]};
  if (accountId===0) {
   try { discovered=page.parse(await borosRead('/accounts/market-acc-infos-by-root?root='+root)); }
   catch { errors.push('کشف حساب‌های جدا انجام نشد'); }
  }
  const handles=[...new Set([...assets.map(a=>packAccount(root,accountId,Number(a.tokenId),CROSS)), ...discovered.results.map(b=>String(b.marketAcc)), ...positionRows.map(p=>String(p.marketAcc))].map(h=>h.toLowerCase()))];
  handles.forEach(h=>owned(h,root,accountId));
  if(!handles.length||handles.length>100)throw new Error('invalid balance handles');
  const balanceRaw=await borosRead('/accounts/market-acc-infos',{marketAccs:handles});
  const balanceRows=page.parse(balanceRaw).results;
  // Missing responses are unknown, never fabricated zero balances.
  const returned=new Set(balanceRows.map(b=>String(b.marketAcc).toLowerCase()));
  if(returned.size!==handles.length||handles.some(h=>!returned.has(h.toLowerCase())))throw new Error('missing account balances');
  if(accountId!==0)errors.push('وثیقه جدا بدون پوزیشن در حساب فرعی ممکن است در فهرست نباشد');
  const balances = balanceRows.map(b=>{ const h=owned(b.marketAcc,root,accountId); return {handle:String(b.marketAcc).toLowerCase(), tokenId:h.tokenId,marketId:h.marketId,cash:x18(b.totalCash),equity:x18(b.netBalance),margin:x18(b.initialMargin),freeMargin:x18(b.availableInitialMargin),maintenanceBuffer:x18(b.availableMaintMargin)}; });
  if(new Set(balances.map(b=>b.handle)).size!==balances.length)throw new Error('duplicate balances');
  const positions = positionRows.map(p=>{
   const h=owned(p.marketAcc,root,accountId); const size=x18(p.signedSize);
   const b=balanceRows.find(b=>String(b.marketAcc).toLowerCase()===String(p.marketAcc).toLowerCase());
   const detail=Array.isArray(b?.positions) ? b.positions.find((v:any)=>v.marketId===p.marketId) : null;
   if (size===null || size===0 || (p.side!==0&&p.side!==1) || (size>0)!==(p.side===0)) throw new Error('invalid position side');
   return {handle:String(p.marketAcc).toLowerCase(), marketId:p.marketId,tokenId:h.tokenId,side:p.side===0?'long':'short',size:Math.abs(size),fixedApr:n(p.fixedApr),unrealized:x18(p.unrealisedPnl),realizedTrade:x18(p.cumulativePnl),settlement:x18(p.settlementPnl),liquidationApr:x18(detail?.liquidationApr),matured:p.isMatured===true};
  });
  if(new Set(positions.map(p=>p.handle+':'+p.marketId)).size!==positions.length)throw new Error('duplicate positions');
  const [settled, moved, ordered, gasRaw] = await ancillary;
  const settlements = settled?.results.map(e=>{ const h=owned(e.marketAcc,root,accountId);return {id:str(e.id),marketId:n(e.marketId),tokenId:h.tokenId,at:n(e.timestamp)===null?null:Number(e.timestamp)*1000,kind:'settlement',amount:x18(e.settlement),fee:x18(e.fee),rate:n(e.settlementRate)}; }) ?? [];
  const transfers = moved?.results.map(e=>{ if (str(e.root).toLowerCase()!==root || e.accountId!==accountId) throw new Error('transfer mismatch');return {id:str(e.transferLogId),marketId:null,tokenId:e.tokenId,at:n(e.blockTimestamp)===null?null:Number(e.blockTimestamp)*1000,kind:`${str((e.fromFundLocation as any)?.fundType)}→${str((e.toFundLocation as any)?.fundType)} · ${str(e.status)}`,amount:x18(e.amount),fee:null,rate:null}; }) ?? [];
  const orders = ordered?.results.map(e=>{owned(e.marketAcc,root,accountId);if(e.side!==0&&e.side!==1)throw new Error('order mismatch');return {id:str(e.orderId),marketId:e.marketId,side:e.side===0?'long':'short',size:x18(e.unfilledSize),rate:n(e.impliedApr),margin:x18(e.marginRequired)};}) ?? [];
  const times=[syncAt(balanceRaw),syncAt(positionsRaw)].filter((v):v is number=>v!==null);
  const result=accountSnapshotSchema.parse({root,accountId,fetchedAt:Date.now(),syncedAt:times.length===2?Math.min(...times):null,balances,positions,assets,settlements,transfers,orders,gasBalanceUsd:n((gasRaw as any)?.balanceInUSD),partial:errors.length>0||!!ordered?.resumeToken||balances.some(b=>[b.cash,b.equity,b.margin,b.freeMargin,b.maintenanceBuffer].some(v=>v===null))||positions.some(p=>[p.fixedApr,p.unrealized,p.realizedTrade,p.settlement].some(v=>v===null)),historyComplete:!!settled&&!!moved&&!settled.resumeToken&&!moved.resumeToken,errors});
  if(cache.size>=40)cache.delete(cache.keys().next().value!);
  cache.set(key,{at:Date.now(),value:result});return result;
 })();
 pending.set(key,job);try{return await job;}finally{pending.delete(key);}
}
const previewCache=new Map<string,{at:number;value:OfficialPreview}>();
const previewPending=new Map<string,Promise<OfficialPreview>>();
export async function readBorosPreview(body: {marketAcc:string;marketId:number;side:0|1;size:string;tif:2;slippage:number}):Promise<OfficialPreview> {
 const key=JSON.stringify(body);const hit=previewCache.get(key);if(hit&&Date.now()-hit.at<10000)return hit.value;const existing=previewPending.get(key);if(existing)return existing;
 const job=(async()=>{
 const r:any=await borosRead('/simulations/place-order',body);
 if (!r || typeof r.statusCode!=='string' || typeof r.status!=='string' || !r.matched || !r.postState) throw new Error('invalid preview');
 const result=officialPreviewSchema.parse({fetchedAt:Date.now(),handle:body.marketAcc,marketId:body.marketId,side:body.side===0?'long':'short',requestedSize:x18(body.size),matchedSize:x18(r.matched.size)===null?null:Math.abs(x18(r.matched.size)!),matchedApr:n(r.matched.rate),margin:x18(r.postState.marginRequired),liquidationApr:n(r.postState.liquidationApr),priceImpact:n(r.priceImpact),status:str(r.status),success:r.statusCode==='Succeed'&&r.status==='FILLED'&&x18(r.matched.size)!==null&&(BigInt(r.matched.size)<0n?-BigInt(r.matched.size):BigInt(r.matched.size))===BigInt(body.size)});
 if(previewCache.size>=40)previewCache.delete(previewCache.keys().next().value!);previewCache.set(key,{at:Date.now(),value:result});return result;
 })();previewPending.set(key,job);try{return await job;}finally{previewPending.delete(key);}
}

const historyCache=new Map<string,{at:number;value:BorosAccountHistory}>();
const historyPending=new Map<string,Promise<BorosAccountHistory>>();
/** History is requested only when its tab opens; no background trade-history fan-out. */
export async function readBorosHistory(root:string,accountId:number,kind:'order-history'|'trade-history'):Promise<BorosAccountHistory>{
 const key=`${root}:${accountId}:${kind}`;const hit=historyCache.get(key);if(hit&&Date.now()-hit.at<60000)return hit.value;const pending=historyPending.get(key);if(pending)return pending;
 const job=(async()=>{
  const q=`root=${root}&accountId=${accountId}`;
  const orders=page.parse(await borosRead('/accounts/orders-by-placed-time?'+q+'&limit=100'));
  const side=(v:unknown)=>{if(v!==0&&v!==1)throw new Error('invalid history side');return v===0?'long' as const:'short' as const;};
  const statuses:Record<number,string>={0:'باز',1:'لغوشده',2:'تکمیل‌شده',3:'منقضی‌شده',4:'حذف‌شده'};
  const orderRows=orders.results.map(e=>{const h=owned(e.marketAcc,root,accountId);return {id:str(e.orderId),handle:String(e.marketAcc),marketId:e.marketId,tokenId:h.tokenId,at:n(e.placedTimestamp)===null?null:Number(e.placedTimestamp)*1000,side:side(e.side),size:x18(e.placedSize),rate:n(e.impliedApr),status:statuses[Number(e.status)]??'نامشخص',pnl:null,fee:null};});
  let complete=!orders.resumeToken;let rows=historyRowSchema.array().parse(orderRows);
  if(kind==='trade-history'){
   complete=false; // Recent-order discovery cannot prove complete lifetime OTC/liquidation coverage.
   const active=page.parse(await borosRead('/accounts/active-positions?'+q));
   const pairs=new Map<string,{handle:string;marketId:number}>();
   for(const e of [...orders.results,...active.results]){owned(e.marketAcc,root,accountId);if(!Number.isInteger(e.marketId)||Number(e.marketId)<1||Number(e.marketId)>=CROSS)throw new Error('invalid history market');pairs.set(String(e.marketAcc)+':'+e.marketId,{handle:String(e.marketAcc),marketId:Number(e.marketId)});}
   // Bounded recent-history scan. Never advertise an incomplete scan as all-time PnL.
   if(pairs.size>8)complete=false;
   const groups=await Promise.all([...pairs.values()].slice(0,8).map(async p=>{
    const r=page.parse(await borosRead(`/accounts/position-update-events?marketAcc=${p.handle}&marketId=${p.marketId}&limit=100`));if(r.resumeToken)complete=false;
    return r.results.map(e=>{const h=owned(e.marketAcc,root,accountId);if(String(e.marketAcc).toLowerCase()!==p.handle.toLowerCase()||e.marketId!==p.marketId)throw new Error('history mismatch');return {id:str(e.id),handle:String(e.marketAcc),marketId:p.marketId,tokenId:h.tokenId,at:n(e.timestamp)===null?null:Number(e.timestamp)*1000,side:side(e.side),size:x18(e.tradeSize),rate:n(e.tradeRate),status:'انجام‌شده',pnl:x18(e.pnl),fee:x18(e.fee)};});
   }));rows=groups.flat();
  }
  const value=accountHistorySchema.parse({root,accountId,kind,fetchedAt:Date.now(),rows:rows.sort((a,b)=>(b.at??0)-(a.at??0)),complete});
  if(historyCache.size>=40)historyCache.delete(historyCache.keys().next().value!);historyCache.set(key,{at:Date.now(),value});return value;
 })();historyPending.set(key,job);try{return await job;}finally{historyPending.delete(key);}
}
