import Decimal from 'decimal.js';
import { useEffect } from 'react';
import { useCustody } from '@/features/custody/data/useCustody';
import { getPref } from '@/features/custody/data/repository';
import { accountKey, getArcusState, refreshSummary, isStale, useArcusStoreVersion } from '@/features/arcus/data/useArcusAccount';
import { useConnectedStore, refreshWallet, refreshTransactions } from './store';
import { addressKey } from '../domain/model';
import { visibleWalletValue } from '../domain/visibility';
export const CONNECTED_PREF = 'zerion-wallets';
export function useConnectedPortfolio() {
  const custody = useCustody();
  const enabled = getPref<string[]>(CONNECTED_PREF)?.value ?? [];
  const seen = new Set<string>();
  const wallets = custody.holdings.filter(h => {
    if(h.kind !== 'wallet' || h.archivedAt || !h.address || !enabled.includes(h.id)) return false;
    const k = addressKey(h.address); if(seen.has(k)) return false; seen.add(k); return true;
  });
  const seenArcus = new Set<string>();
  const arcus = custody.holdings.filter(h => {
    if(h.kind !== 'arcus' || !h.arcus || h.archivedAt) return false;
    const k = accountKey(h.arcus); if(seenArcus.has(k)) return false; seenArcus.add(k); return true;
  });
  const walletStore = useConnectedStore(s => s.wallets);
  useArcusStoreVersion();
  const key = [...wallets.map(h => h.address), ...arcus.map(h => accountKey(h.arcus!))].join('|');
  useEffect(() => {
    let cancelled = false;
    async function update(force = false) {
      if(cancelled || document.visibilityState !== 'visible') return;
      for(const h of wallets) { if(cancelled) return; await refreshWallet(h.address!,force); const state = useConnectedStore.getState().wallets[addressKey(h.address!)]; if(state?.historyLoaded && (force || Date.now()-(state.historyAt ?? 0) > 300000)) await refreshTransactions(h.address!); }
      for(const h of arcus) { if(cancelled) return; await refreshSummary(h.arcus!); }
    }
    void update(); const timer = window.setInterval(() => void update(),60000);
    const visible = () => { void update(); }; document.addEventListener('visibilitychange',visible);
    return () => { cancelled = true; window.clearInterval(timer); document.removeEventListener('visibilitychange',visible); };
  // Identity changes restart refresh; account responses don't restart the timer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key]);
  const walletSources = wallets.map(h => { const state = walletStore[addressKey(h.address!)]; return { holding:h, state, value:state?.data ? visibleWalletValue(state.data) : null, stale:!!state?.data?.stale || !!state?.error || (!!state?.data && Date.now()-state.data.fetchedAt > 900000) }; });
  const arcusSources = arcus.map(h => { const state = getArcusState(accountKey(h.arcus!)); const raw = state?.account.data?.equity; const n = raw === undefined ? null : Number(raw); const value = state?.account.fetchedAt && state.account.data === null ? 0 : n !== null && Number.isFinite(n) ? n : null; return { holding:h, state, value, stale:state ? isStale(state.account) || isStale(state.positions) : false }; });
  const realArcus = arcusSources.filter(s => s.holding.arcus!.env === 'mainnet');
  const sources = [...walletSources,...realArcus];
  const known = sources.filter(s => s.value !== null);
  const total = known.length ? known.reduce((sum,s) => sum.plus(s.value!),new Decimal(0)).toNumber() : null;
  const partial = realArcus.some(s => !s.state?.positions.fetchedAt || !!s.state.positions.error) || known.length !== sources.length || walletSources.some(s => !s.state?.data?.complete || !!s.state.data.unpriced);
  const stale = sources.some(s => s.stale);
  async function refresh() { for(const h of wallets) await refreshWallet(h.address!,true); for(const h of arcus) await refreshSummary(h.arcus!); }
  return { wallets:walletSources, arcus:arcusSources, total, partial, stale, loading:!custody.loaded || sources.some(s => !s.state || ('loading' in (s.state ?? {}) && (s.state as { loading:boolean }).loading)), refresh };
}
export type ConnectedPortfolio = ReturnType<typeof useConnectedPortfolio>;
