import { create } from 'zustand';
import { fetchJson, HttpError } from '@/repositories/remoteClient';
import { addressKey, type WalletSnapshot, type TransactionPage, type WalletTransaction } from '../domain/model';
export interface WalletState { data: WalletSnapshot | null; loading: boolean; error: string | null; history: WalletTransaction[]; historyLoaded: boolean; historyAt: number | null; next: string | null; historyLoading: boolean; historyError: string | null }
const empty = (): WalletState => ({ data: null, loading: false, error: null, history: [], historyLoaded: false, historyAt: null, next: null, historyLoading: false, historyError: null });
export const useConnectedStore = create<{ wallets: Record<string, WalletState> }>(() => ({ wallets: {} }));
let generation = 0;
function patch(address: string, changes: Partial<WalletState>) { const k = addressKey(address); useConnectedStore.setState(s => ({ wallets: { ...s.wallets, [k]: { ...(s.wallets[k] ?? empty()), ...changes } } })); }
function errorText(e: unknown): string { return e instanceof HttpError ? e.code ?? 'خطای اتصال به سرور' : e instanceof Error ? e.message : 'دریافت داده انجام نشد'; }
export async function refreshWallet(address: string, force = false): Promise<void> {
  const s = useConnectedStore.getState().wallets[addressKey(address)];
  if (s?.loading || (!force && s?.data && Date.now() - s.data.fetchedAt < 900000)) return;
  const gen = generation; patch(address, { loading: true });
  try { const data = await fetchJson<WalletSnapshot>(`/api/integrations?op=wallet&address=${encodeURIComponent(address)}${force ? '&refresh=1' : ''}`, { timeoutMs: 58000 }); if (gen === generation) patch(address, { data, error: null, loading: false }); }
  catch(e) { if (gen === generation) patch(address, { error: errorText(e), loading: false }); }
}
export async function refreshTransactions(address: string, more = false): Promise<void> {
  const s = useConnectedStore.getState().wallets[addressKey(address)]; if (s?.historyLoading || (more && !s?.next)) return;
  const gen = generation; patch(address,{ historyLoading:true });
  try {
    const data = await fetchJson<TransactionPage>(`/api/integrations?op=transactions&address=${encodeURIComponent(address)}${more ? `&next=${encodeURIComponent(s!.next!)}` : ''}`,{ timeoutMs:20000 });
    if(gen !== generation) return;
    const current = useConnectedStore.getState().wallets[addressKey(address)];
    const unique = new Map((current?.history ?? []).map(r => [r.id,r])); data.rows.forEach(r => unique.set(r.id,r));
    patch(address,{ history:[...unique.values()].sort((a,b) => Date.parse(b.minedAt)-Date.parse(a.minedAt)), historyLoaded:true, historyAt:data.fetchedAt, next: more || !current?.historyLoaded ? data.next : current.next, historyError:null, historyLoading:false });
  } catch(e) { if(gen === generation) patch(address,{ historyError:errorText(e), historyLoading:false }); }
}
export function clearConnectedMemory() { generation++; useConnectedStore.setState({ wallets:{} }); }
