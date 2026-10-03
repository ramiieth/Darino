import { isBitcoinAddress } from '../domain/bitcoinAddress';
import { loadWalletSnapshot,saveWalletSnapshot } from './snapshotCache';
import { create } from 'zustand';
import { fetchJson, HttpError } from '@/repositories/remoteClient';
import { addressKey, type WalletSnapshot, type TransactionPage, type WalletTransaction } from '../domain/model';
export interface WalletState { data: WalletSnapshot | null; loading: boolean; error: string | null; history: WalletTransaction[]; historyLoaded: boolean; historyAt: number | null; next: string | null; historyLoading: boolean; historyError: string | null }
const empty = (): WalletState => ({ data: null, loading: false, error: null, history: [], historyLoaded: false, historyAt: null, next: null, historyLoading: false, historyError: null });
export const useConnectedStore = create<{ wallets: Record<string, WalletState> }>(() => ({ wallets: {} }));
let generation = 0;
const eventProbes=new Map<string,{at:number;promise:Promise<void>}>();
const COOLDOWN_KEY='darino.zerion.retry.v1';
let retryAt=0;
let manualProbeAt=0;
try{const stored=Number(localStorage.getItem(COOLDOWN_KEY));retryAt=Number.isFinite(stored)&&stored>Date.now()?stored:0;}catch{/* Storage can be unavailable. */}
function setRetry(at:number){retryAt=Math.max(retryAt,at);try{localStorage.setItem(COOLDOWN_KEY,String(retryAt));}catch{/* Keep memory cooldown. */}}
function cooldown(e:unknown,address:string){if(!isBitcoinAddress(address)&&e instanceof HttpError&&e.status===429)setRetry(Date.now()+(e.retryAfter>0?e.retryAfter:60)*1000);}
function patch(address: string, changes: Partial<WalletState>) { const k = addressKey(address); useConnectedStore.setState(s => ({ wallets: { ...s.wallets, [k]: { ...(s.wallets[k] ?? empty()), ...changes } } })); }
function errorText(e: unknown): string { return e instanceof HttpError ? e.code ?? 'خطای اتصال به سرور' : e instanceof Error ? e.message : 'دریافت داده انجام نشد'; }
export async function refreshWallet(address: string, force = false): Promise<void> {
  const s = useConnectedStore.getState().wallets[addressKey(address)];
  if (s?.loading || (!force && s?.data && Date.now() - s.data.fetchedAt < (s.data.refreshAfterMs??1800000))) return;
  const gen = generation; patch(address, { loading: true });
  if(!s?.data){const cached=await loadWalletSnapshot(address);if(gen!==generation)return;if(cached)patch(address,{data:{...cached,stale:true},error:'آخرین موجودی ذخیره‌شده؛ در انتظار به‌روزرسانی'});}
  if(!isBitcoinAddress(address)&&Date.now()<retryAt&&(!force||Date.now()-manualProbeAt<60000)){const data=useConnectedStore.getState().wallets[addressKey(address)]?.data;patch(address,{loading:false,error:useConnectedStore.getState().wallets[addressKey(address)]?.error??(data?'به‌روزرسانی پس از بازشدن محدودیت ادامه می‌یابد':'دریافت موجودی پس از بازشدن محدودیت ادامه می‌یابد')});return;}
  if(force&&!isBitcoinAddress(address))manualProbeAt=Date.now();
  try { const data = await fetchJson<WalletSnapshot>(`/api/integrations?op=wallet&address=${encodeURIComponent(address)}${force ? '&refresh=1' : ''}`, { timeoutMs: 58000 }); if (gen === generation) {if(!isBitcoinAddress(address)&&data.retryAt)setRetry(data.retryAt);else if(!isBitcoinAddress(address)&&data.complete&&!data.stale){retryAt=0;try{localStorage.removeItem(COOLDOWN_KEY);}catch{/* Memory remains usable. */}}const previous=useConnectedStore.getState().wallets[addressKey(address)]?.data;if(!data.complete&&previous?.complete)patch(address,{data:previous,error:data.detailsError??'جزئیات کامل دریافت نشد؛ آخرین دادهٔ موفق حفظ شده است',loading:false});else {patch(address, { data, error: data.detailsError??null, loading: false });await saveWalletSnapshot(data);}} }
  catch(e) {if(gen!==generation)return;cooldown(e,address);patch(address, { error: errorText(e)+(useConnectedStore.getState().wallets[addressKey(address)]?.data?'؛ آخرین موجودی ذخیره‌شده نمایش داده می‌شود':'؛ هنوز موجودی موفقی برای این کیف پول ذخیره نشده'), loading: false }); }
}
export async function refreshTransactions(address: string, more = false): Promise<void> {
  const s = useConnectedStore.getState().wallets[addressKey(address)]; if ((!isBitcoinAddress(address)&&Date.now()<retryAt) || s?.historyLoading || (more && !s?.next) || (!more&&s?.historyAt&&Date.now()-s.historyAt<3600000)) return;
  const gen = generation; patch(address,{ historyLoading:true });
  try {
    const data = await fetchJson<TransactionPage>(`/api/integrations?op=transactions&address=${encodeURIComponent(address)}${more ? `&next=${encodeURIComponent(s!.next!)}` : ''}`,{ timeoutMs:20000 });
    if(gen !== generation) return;
    const current = useConnectedStore.getState().wallets[addressKey(address)];
    const unique = new Map((current?.history ?? []).map(r => [r.id,r])); data.rows.forEach(r => unique.set(r.id,r));
    patch(address,{ history:[...unique.values()].sort((a,b) => Date.parse(b.minedAt)-Date.parse(a.minedAt)), historyLoaded:true, historyAt:data.fetchedAt, next: more || !current?.historyLoaded ? data.next : current.next, historyError:null, historyLoading:false });
  } catch(e) {if(gen!==generation)return;cooldown(e,address);patch(address,{ historyError:errorText(e), historyLoading:false }); }
}
export function clearConnectedMemory() { generation++;eventProbes.clear(); retryAt=0;manualProbeAt=0;try{localStorage.removeItem(COOLDOWN_KEY);}catch{/* Unavailable storage. */} useConnectedStore.setState({ wallets:{} }); }

export function zerionRetryAt(){return retryAt>Date.now()?retryAt:null;}

/** Lightweight activity revision lookup reads our cache, never the Zerion provider. */
export async function refreshWalletEvents(addresses:string[]):Promise<void>{
 const list=[...new Set(addresses.filter(a=>!isBitcoinAddress(a)).map(addressKey))].sort().slice(0,30);if(!list.length)return;
 const key=list.join(','),old=eventProbes.get(key);if(old&&Date.now()-old.at<60000)return old.promise;
 const gen=generation;
 const promise=(async()=>{try{
  const events=await fetchJson<{events:Record<string,number>;refreshAfterMs?:number}>('/api/integrations?op=wallet-events&addresses='+encodeURIComponent(key));if(gen!==generation)return;
  for(const address of list){if(gen!==generation)return;const at=events.events[addressKey(address)]??0;const s=useConnectedStore.getState().wallets[addressKey(address)];if(at>(s?.data?.fetchedAt??0)&&Date.now()-(s?.data?.fetchedAt??0)>=(events.refreshAfterMs??60000)){patch(address,{historyAt:null});await refreshWallet(address,true);if(gen===generation&&s?.historyLoaded)await refreshTransactions(address);}}
 }catch{/* Periodic refresh remains the fallback if event delivery or cache is unavailable. */}})();
 if(eventProbes.size>20)eventProbes.clear();eventProbes.set(key,{at:Date.now(),promise});return promise;
}
