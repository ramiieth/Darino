import { z } from 'zod';
import { accountSnapshotSchema, officialPreviewSchema, unpackAccount, packAccount, CROSS, x18, type BorosAccountSnapshot, type OfficialPreview } from '../src/shared/boros/account.js';
const BASE = 'https://api-boros.pendle.finance/apis/v1';
const n = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const str = (v: unknown) => typeof v === 'string' ? v.slice(0,160) : '';
const syncAt = (v: unknown) => { const s = n((v as any)?.syncStatus?.timestamp); return s === null ? null : s * 1000; };
const page = z.object({ results: z.array(z.record(z.unknown())).max(2000), resumeToken: z.string().nullable().optional(), syncStatus: z.object({ timestamp: z.number().finite(), blockNumber: z.number().finite() }).optional() });
export class BorosReadError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function borosRead(path: string, body?: unknown) {
 const key = process.env.BOROS_API_KEY?.trim();
 const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { accept:'application/json', ...(body ? {'content-type':'application/json'} : {}), ...(key ? {Authorization:`Bearer ${key}`} : {}) }, ...(body ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(15000) });
 if (!r.ok) throw new BorosReadError(r.status===429 ? 429 : 502, r.status===429 ? 'سهمیه بوروس محدود است؛ آخرین داده حفظ شد' : 'دریافت داده بوروس انجام نشد');
 return r.json();
}
const cache = new Map<string,{ at:number; value:BorosAccountSnapshot }>();
const pending = new Map<string,Promise<BorosAccountSnapshot>>();
export function clearBorosAccountCache() { cache.clear(); pending.clear(); previewCache.clear(); previewPending.clear(); }
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
  let balanceRaw:unknown;
  if (accountId===0) balanceRaw = await borosRead('/accounts/market-acc-infos-by-root?root='+root);
  else {
   const handles = [...new Set([...assets.map(a=>packAccount(root,accountId,Number(a.tokenId),CROSS)), ...positionRows.map(p=>String(p.marketAcc))])];
   if (handles.length>100) throw new Error('too many handles');
   balanceRaw = handles.length ? await borosRead('/accounts/market-acc-infos', {marketAccs:handles}) : {results:[]};
   errors.push('حساب فرعی: وثیقه جدا بدون پوزیشن ممکن است در فهرست نباشد');
  }
  const balanceRows = page.parse(balanceRaw).results;
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
  const getOptional=async(path:string,label:string)=>{try{return page.parse(await borosRead(path));}catch{errors.push(label);return null;}};
  const [settled, moved, ordered] = await Promise.all([
   getOptional('/accounts/settlement-events?'+q+'&limit=100','تاریخچه تسویه دریافت نشد'),
   getOptional('/accounts/transfer-logs?'+q+'&limit=100','تاریخچه انتقال دریافت نشد'),
   getOptional('/accounts/orders?'+q+'&isActive=true&limit=100','سفارش‌ها دریافت نشد')
  ]);
  const settlements = settled?.results.map(e=>{ const h=owned(e.marketAcc,root,accountId);return {id:str(e.id),marketId:n(e.marketId),tokenId:h.tokenId,at:n(e.timestamp)===null?null:Number(e.timestamp)*1000,kind:'settlement',amount:x18(e.settlement),fee:x18(e.fee),rate:n(e.settlementRate)}; }) ?? [];
  const transfers = moved?.results.map(e=>{ if (str(e.root).toLowerCase()!==root || e.accountId!==accountId) throw new Error('transfer mismatch');return {id:str(e.transferLogId),marketId:null,tokenId:e.tokenId,at:n(e.blockTimestamp)===null?null:Number(e.blockTimestamp)*1000,kind:`${str((e.fromFundLocation as any)?.fundType)}→${str((e.toFundLocation as any)?.fundType)} · ${str(e.status)}`,amount:x18(e.amount),fee:null,rate:null}; }) ?? [];
  const orders = ordered?.results.map(e=>{owned(e.marketAcc,root,accountId);if(e.side!==0&&e.side!==1)throw new Error('order mismatch');return {id:str(e.orderId),marketId:e.marketId,side:e.side===0?'long':'short',size:x18(e.unfilledSize),rate:n(e.impliedApr),margin:x18(e.marginRequired)};}) ?? [];
  const times=[syncAt(balanceRaw),syncAt(positionsRaw)].filter((v):v is number=>v!==null);
  const result=accountSnapshotSchema.parse({root,accountId,fetchedAt:Date.now(),syncedAt:times.length===2?Math.min(...times):null,balances,positions,assets,settlements,transfers,orders,partial:errors.length>0||!!ordered?.resumeToken||balances.some(b=>[b.cash,b.equity,b.margin,b.freeMargin,b.maintenanceBuffer].some(v=>v===null))||positions.some(p=>[p.fixedApr,p.unrealized,p.realizedTrade,p.settlement].some(v=>v===null)),historyComplete:!!settled&&!!moved&&!settled.resumeToken&&!moved.resumeToken,errors});
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
