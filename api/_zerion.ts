import { zerionBudget,type ZerionBudget } from './_zerionPolicy.js';
import { Decimal } from 'decimal.js';
import { readProviderCache,writeProviderCache,providerCacheKey,walletSnapshotKey,reserveProviderSlot } from './_providerCache.js';
import { arr, obj, str, normalizePosition, normalizeTransaction, deduplicatePositions, addressKey, type WalletSnapshot, type ChainInfo, type TransactionPage } from '../src/features/connected/domain/model.js';
export async function zerionQuota(){return readProviderCache<ZerionBudget>(providerCacheKey('quota'),true);}
export async function walletActivityAt(address:string){return (await readProviderCache<{at:number}>(providerCacheKey('activity:'+addressKey(address)),true))?.at??0;}
export class ProviderError extends Error { constructor(public status: number, message: string, public retryAfter = 0) { super(message); } }
const BASE = 'https://api.zerion.io';
const cache = new Map<string, { at: number; value: WalletSnapshot }>();
const running = new Map<string, Promise<WalletSnapshot>>();
let chainsCache: { at: number; data: ChainInfo[] } | null = null;
// Local queue plus a persistent slot reservation coordinates serverless instances.
let tail: Promise<unknown> = Promise.resolve();
let lastCall = 0;
const responseAt=new WeakMap<Record<string,unknown>,number>();
const requests=new Map<string,Promise<Record<string,unknown>>>();
export function zerionThrottle(headers:Headers,now=Date.now()) {
 const seconds=(name:string)=>{const n=Number(headers.get(name));return Number.isFinite(n)&&n>0?n:0;};
 const empty=(name:string)=>headers.has(name)&&Number(headers.get(name))===0;
 const retry=headers.get('Retry-After');const retrySeconds=retry?Number(retry):0;
 const explicit=Number.isFinite(retrySeconds)?retrySeconds:Math.max(0,(Date.parse(retry??'')-now)/1000)||0;
 const month=empty('RateLimit-Org-Month-Remaining'),day=empty('RateLimit-Org-Day-Remaining');
 const wait=Math.ceil(Math.max(explicit,month?seconds('RateLimit-Org-Month-Reset'):0,day?seconds('RateLimit-Org-Day-Reset'):0,seconds('RateLimit-Org-Second-Reset'),month||day?60:5));
 return {until:now+wait*1000,retryAfter:wait,message:month?'سهمیهٔ ماهانهٔ زریون تمام شده':day?'سهمیهٔ روزانهٔ زریون تمام شده':'زریون موقتاً درخواست‌ها را محدود کرده'};
}
async function get(path:string,deadline=Date.now()+18000,force=false):Promise<Record<string,unknown>> {
 if(requests.has(path))return requests.get(path)!;
 const work=cachedGet(path,deadline,force);requests.set(path,work);try{return await work;}finally{requests.delete(path);}
}
async function cachedGet(path: string, deadline: number,force:boolean): Promise<Record<string, unknown>> {
 const walletMatch=path.match(/^\/v1\/wallets\/([^/]+)\//);const invalidatedAt=walletMatch?await walletActivityAt(walletMatch[1]):0;
 const key=providerCacheKey(path),hit=await readProviderCache<{at:number;data:Record<string,unknown>}>(key);if(hit&&hit.at>=invalidatedAt&&(!force||Date.now()-hit.at<60000)){responseAt.set(hit.data,hit.at);return hit.data;}
 const cooldownKey=providerCacheKey('cooldown');
 const run = tail.catch(() => undefined).then(async () => {
    const cooldown=await readProviderCache<{until:number;message:string}>(cooldownKey,true);
    if(cooldown&&cooldown.until>Date.now())throw new ProviderError(429,cooldown.message,Math.ceil((cooldown.until-Date.now())/1000));
    const delay = Math.max(0, 550 - (Date.now() - lastCall));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if(Date.now() >= deadline) throw new ProviderError(504, 'زمان دریافت داده تمام شد');
    const slot=await reserveProviderSlot(providerCacheKey('request-slots'),Date.now(),deadline);
    if(slot===null)throw new ProviderError(429,'درخواست‌های زریون در صف هستند',1);
    if(slot>Date.now())await new Promise(resolve=>setTimeout(resolve,slot-Date.now()));
    const latestCooldown=await readProviderCache<{until:number;message:string}>(cooldownKey,true);
    if(latestCooldown&&latestCooldown.until>Date.now())throw new ProviderError(429,latestCooldown.message,Math.ceil((latestCooldown.until-Date.now())/1000));
    if(Date.now()>=deadline)throw new ProviderError(504,'زمان دریافت داده تمام شد');
    lastCall = Date.now();
    const apiKey = process.env.ZERION_API_KEY;
    if (!apiKey) throw new ProviderError(503, 'کلید زریون هنوز در سرور تنظیم نشده است');
    const r = await fetch(BASE + path, { headers: { Authorization: `Basic ${Buffer.from(apiKey + ':').toString('base64')}`, accept: 'application/json' }, signal: AbortSignal.timeout(Math.max(1, Math.min(12000, deadline-Date.now()))) });
    const budget=zerionBudget(r.headers);await writeProviderCache(providerCacheKey('quota'),budget,86400000);
    if(r.status===429){const throttle=zerionThrottle(r.headers);await writeProviderCache(cooldownKey,throttle,throttle.retryAfter*1000);throw new ProviderError(429,throttle.message,throttle.retryAfter);}
    if (!r.ok) throw new ProviderError(r.status === 401 ? 503 : r.status, r.status === 400 ? 'این آدرس یا شبکه برای این داده پشتیبانی نمی‌شود' : 'دریافت داده از زریون انجام نشد');
    if(['Day','Month'].some(period=>r.headers.has('RateLimit-Org-'+period+'-Remaining')&&Number(r.headers.get('RateLimit-Org-'+period+'-Remaining'))===0)){const throttle=zerionThrottle(r.headers);await writeProviderCache(cooldownKey,throttle,throttle.retryAfter*1000);}
    const data=obj(await r.json());const ttl=path.includes('/chains/')?86400000:path.includes('/charts/')?budget.chartMs:path.includes('/transactions/')?budget.historyMs:budget.walletMs;
    const at=Date.now();responseAt.set(data,at);await writeProviderCache(key,{at,data},ttl);return data;
  });
  tail = run;
  return run;
}
export function checkedNext(next: string, address: string, resource: 'positions' | 'transactions'): string {
  const u = new URL(next, BASE);
  if (u.origin !== BASE || ![ `/v1/wallets/${address}/${resource}`, `/v1/wallets/${address}/${resource}/` ].includes(u.pathname) || u.username || u.password || next.length > 6000) throw new ProviderError(400, 'صفحهٔ بعد معتبر نیست');
  // Keep provider cursor, enforce read-only filtering and USD values.
  u.searchParams.set('currency', 'usd'); u.searchParams.set('page[size]', '100');
  u.searchParams.set('filter[trash]', 'only_non_trash');
  if (resource === 'positions') u.searchParams.set('filter[positions]', 'no_filter');
  return u.pathname + u.search;
}
export async function getChains(): Promise<ChainInfo[]> {
  if (chainsCache && Date.now() - chainsCache.at < 86400000) return chainsCache.data;
  const r = await get('/v1/chains/');
  const data = arr(r.data).map(v => { const x = obj(v), a = obj(x.attributes), f = obj(a.flags); return { id: str(x.id), name: str(a.name), icon: str(obj(a.icon).url) || null, positions: f.supports_positions === true, transactions: f.supports_transactions === true }; });
  chainsCache = { at: Date.now(), data }; return data;
}
export async function getWallet(address: string, userId: string, force = false): Promise<WalletSnapshot> {
  const key = `${userId}:${addressKey(address)}`;
  const invalidatedAt=await walletActivityAt(address);
  const hit = cache.get(key); if (hit && hit.at>=invalidatedAt&&Date.now() - hit.at < (force || !hit.value.complete ? 60000 : (hit.value.refreshAfterMs??1800000))) return hit.value;
  if (running.has(key)) return running.get(key)!;
  const lastKey=walletSnapshotKey(userId,addressKey(address));
  const previous=await readProviderCache<WalletSnapshot>(lastKey)??await readProviderCache<WalletSnapshot>(providerCacheKey('last-wallet:'+userId+':'+addressKey(address)));
  if(previous?.complete)await writeProviderCache(lastKey,previous,30*86400000);
  const work = (async () => {
    const deadline = Date.now() + 48000;
    const chains = await getChains().catch(() => chainsCache?.data ?? []);
    let fetchedAt=Date.now(),retryAt:number|undefined;
    const rows = []; let next = `/v1/wallets/${address}/positions/?currency=usd&filter[positions]=no_filter&filter[trash]=only_non_trash&page[size]=100`;
    const visited = new Set<string>(); let pages = 0; let detailsError: string | undefined;
    try {
    while (next && pages < 10) {
      if (visited.has(next)) throw new ProviderError(502, 'صفحه‌بندی زریون تکراری است');
      visited.add(next); const r = await get(next, deadline, force);fetchedAt=Math.min(fetchedAt,responseAt.get(r)??Date.now()); rows.push(...arr(r.data).map(normalizePosition)); pages++;
      const link = str(obj(r.links).next); next = link ? checkedNext(link, address, 'positions') : '';
    }
    } catch(e) {if(e instanceof ProviderError&&e.retryAfter)retryAt=Date.now()+e.retryAfter*1000; detailsError = e instanceof ProviderError ? e.message : 'جزئیات دارایی‌ها دریافت نشد؛ دوباره تلاش کنید'; }
    const positions = deduplicatePositions(rows);
    const quota=await zerionQuota();
    const value: WalletSnapshot = { address, fetchedAt,refreshAfterMs:quota?.walletMs??1800000, total: !next&&!detailsError?positions.reduce((sum,p)=>sum.plus(p.value??0),new Decimal(0)).toNumber():null, change: null, positions, chains, complete: !next && !detailsError, detailsError, retryAt, unpriced: positions.filter(p => p.value === null).length };
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    if(value.complete){await writeProviderCache(lastKey,value,30*86400000);cache.set(key, { at: fetchedAt, value });return value;}
    if(previous?.complete)return {...previous,stale:true,detailsError:detailsError??'جزئیات کامل دریافت نشد',retryAt};
    if(retryAt)throw new ProviderError(429,detailsError??'سهمیهٔ زریون محدود است',Math.max(1,Math.ceil((retryAt-Date.now())/1000)));
    return value;
  })();
  running.set(key, work); try { return await work; } catch(e) {if(previous?.complete)return {...previous,stale:true,detailsError:e instanceof ProviderError?e.message:'ارتباط با زریون برقرار نشد',retryAt:e instanceof ProviderError&&e.retryAfter?Date.now()+e.retryAfter*1000:undefined};throw e;} finally { running.delete(key); }
}
export async function getTransactions(address: string, next?: string): Promise<TransactionPage> {
  const path = next ? checkedNext(next, address, 'transactions') : `/v1/wallets/${address}/transactions/?currency=usd&filter[trash]=only_non_trash&page[size]=100`;
  const r = await get(path); const link = str(obj(r.links).next);
  return { rows: arr(r.data).map(normalizeTransaction), next: link ? checkedNext(link, address, 'transactions') : null, fetchedAt: responseAt.get(r)??Date.now() };
}
export async function getPnl(address: string): Promise<unknown> { return await get(`/v1/wallets/${address}/pnl?currency=usd`); }

const chartCache = new Map<string,{at:number;value:import('../src/features/connected/domain/chart.js').WalletChart}>();
export async function getBalanceChart(address:string,userId:string,period:string,ids:string[],chain:string):Promise<import('../src/features/connected/domain/chart.js').WalletChart> {
 const {CHART_PERIODS,normalizeChart}=await import('../src/features/connected/domain/chart.js');
 if(!CHART_PERIODS.includes(period as never)||!ids.length||ids.length>25||ids.some(id=>!/^[-a-zA-Z0-9_:]{1,44}$/.test(id))||(chain&&!/^[-a-z0-9]{1,60}$/.test(chain)))throw new ProviderError(400,'پارامتر نمودار معتبر نیست');
 const params=new URLSearchParams({currency:'usd','filter[fungible_ids]':[...new Set(ids)].sort().join(',')});
 if(chain)params.set('filter[chain_ids]',chain);
 const invalidatedAt=await walletActivityAt(address);
 const path=`/v1/wallets/${address}/charts/${period}?${params}`,key=userId+':'+path,hit=chartCache.get(key);
 if(hit&&hit.at>=invalidatedAt&&Date.now()-hit.at<1800000)return hit.value;
 const response=await get(path);const value={...normalizeChart(response),fetchedAt:responseAt.get(response)??Date.now()};
 if(chartCache.size>=200)chartCache.delete(chartCache.keys().next().value!);
 chartCache.set(key,{at:value.fetchedAt,value});return value;
}
