import { loadWalletSnapshot,saveWalletSnapshot } from './snapshotCache';
import { create } from 'zustand';
import { fetchJson, HttpError } from '@/repositories/remoteClient';
import { addressKey, type WalletSnapshot, type TransactionPage, type WalletTransaction } from '../domain/model';
export interface WalletState { data: WalletSnapshot | null; loading: boolean; error: string | null; history: WalletTransaction[]; historyLoaded: boolean; historyAt: number | null; next: string | null; historyLoading: boolean; historyError: string | null }
const empty = (): WalletState => ({ data: null, loading: false, error: null, history: [], historyLoaded: false, historyAt: null, next: null, historyLoading: false, historyError: null });
export const useConnectedStore = create<{ wallets: Record<string, WalletState> }>(() => ({ wallets: {} }));
let generation = 0;
let retryAt=0;
function cooldown(e:unknown){if(e instanceof HttpError&&e.status===429)retryAt=Date.now()+Math.max(e.retryAfter,60)*1000;}
function patch(address: string, changes: Partial<WalletState>) { const k = addressKey(address); useConnectedStore.setState(s => ({ wallets: { ...s.wallets, [k]: { ...(s.wallets[k] ?? empty()), ...changes } } })); }
function errorText(e: unknown): string { return e instanceof HttpError ? e.code ?? 'خطای اتصال به سرور' : e instanceof Error ? e.message : 'دریافت داده انجام نشد'; }
export async function refreshWallet(address: string, force = false): Promise<void> {
  const s = useConnectedStore.getState().wallets[addressKey(address)];
  if (s?.loading || (!force && s?.data && Date.now() - s.data.fetchedAt < 900000)) return;
  const gen = generation; patch(address, { loading: true });
  if(!s?.data){const cached=await loadWalletSnapshot(address);if(gen!==generation)return;if(cached)patch(address,{data:{...cached,stale:true},error:'آخرین موجودی ذخیره‌شده؛ در انتظار به‌روزرسانی'});}
  if(Date.now()<retryAt){const data=useConnectedStore.getState().wallets[addressKey(address)]?.data;patch(address,{loading:false,error:data?'سهمیهٔ زریون محدود است؛ آخرین موجودی ذخیره‌شده نمایش داده می‌شود':'سهمیهٔ زریون محدود است؛ هنوز موجودی موفقی برای این کیف پول ذخیره نشده'});return;}
  try { const data = await fetchJson<WalletSnapshot>(`/api/integrations?op=wallet&address=${encodeURIComponent(address)}${force ? '&refresh=1' : ''}`, { timeoutMs: 58000 }); if (gen === generation) {const previous=useConnectedStore.getState().wallets[addressKey(address)]?.data;if(!data.complete&&previous?.complete)patch(address,{data:previous,error:data.detailsError??'جزئیات کامل دریافت نشد؛ آخرین دادهٔ موفق حفظ شده است',loading:false});else {patch(address, { data, error: data.detailsError??null, loading: false });if(data.retryAt)retryAt=Math.max(retryAt,data.retryAt);await saveWalletSnapshot(data);}} }
  catch(e) { cooldown(e); if (gen === generation) patch(address, { error: errorText(e)+(useConnectedStore.getState().wallets[addressKey(address)]?.data?'؛ آخرین موجودی ذخیره‌شده نمایش داده می‌شود':'؛ هنوز موجودی موفقی برای این کیف پول ذخیره نشده'), loading: false }); }
}
export async function refreshTransactions(address: string, more = false): Promise<void> {
  const s = useConnectedStore.getState().wallets[addressKey(address)]; if (Date.now()<retryAt || s?.historyLoading || (more && !s?.next) || (!more&&s?.historyAt&&Date.now()-s.historyAt<300000)) return;
  const gen = generation; patch(address,{ historyLoading:true });
  try {
    const data = await fetchJson<TransactionPage>(`/api/integrations?op=transactions&address=${encodeURIComponent(address)}${more ? `&next=${encodeURIComponent(s!.next!)}` : ''}`,{ timeoutMs:20000 });
    if(gen !== generation) return;
    const current = useConnectedStore.getState().wallets[addressKey(address)];
    const unique = new Map((current?.history ?? []).map(r => [r.id,r])); data.rows.forEach(r => unique.set(r.id,r));
    patch(address,{ history:[...unique.values()].sort((a,b) => Date.parse(b.minedAt)-Date.parse(a.minedAt)), historyLoaded:true, historyAt:data.fetchedAt, next: more || !current?.historyLoaded ? data.next : current.next, historyError:null, historyLoading:false });
  } catch(e) { cooldown(e); if(gen === generation) patch(address,{ historyError:errorText(e), historyLoading:false }); }
}
export function clearConnectedMemory() { generation++; retryAt=0; useConnectedStore.setState({ wallets:{} }); }
