import { useEffect } from 'react';
import { useBorosAccount, refreshBorosAccount, accountIsStale } from '@/features/boros/data/useBorosAccount';
import { useConnectedStore, refreshWallet, type WalletState } from '@/features/connected/data/store';
import type { ConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
import { fetchBorosMarkets } from '@/features/boros/data/borosService';
import { useBorosStore } from '@/features/boros/data/useBoros';
import { addressKey } from '@/features/connected/domain/model';
export function useCostSources(portfolio:ConnectedPortfolio){
 const state=useBorosAccount();const wallets=useConnectedStore(s=>s.wallets);
 const refs=portfolio.arcus.filter(a=>a.holding.arcus?.env==='mainnet');
 const key=refs.map(a=>a.holding.arcus!.address).join('|');
 useEffect(()=>{const update=()=>{if(document.visibilityState!=='visible')return;void refreshBorosAccount();const seen=new Set(portfolio.wallets.map(w=>addressKey(w.holding.address!)));for(const a of refs){const address=a.holding.arcus!.address;if(!seen.has(addressKey(address))){seen.add(addressKey(address));void refreshWallet(address);}}};update();const timer=setInterval(update,60000);return()=>clearInterval(timer);},[key,portfolio.wallets.map(w=>w.holding.address).join('|')]);
 const marketKey=state.data?.positions.map(p=>p.marketId).sort().join('|')??'';
 useEffect(()=>{if(!marketKey||state.data!.positions.every(p=>useBorosStore.getState().markets.some(m=>m.marketId===p.marketId)))return;void fetchBorosMarkets().then(r=>useBorosStore.setState({markets:r.markets,loadedAt:r.fetchedAt,stale:r.stale})).catch(()=>{});},[marketKey]);
 const extras=costWalletExtras(portfolio,wallets);
 return {boros:{data:state.data,stale:accountIsStale(state),error:state.error,loading:state.loading,root:state.root},extraWallets:extras};
}

export function costWalletExtras(portfolio:ConnectedPortfolio,wallets:Record<string,WalletState>){
 return portfolio.arcus.filter(a=>a.holding.arcus?.env==='mainnet').flatMap(a=>{const address=a.holding.arcus!.address;const w=wallets[addressKey(address)];return w?.data?[{holding:{...a.holding,address},state:{...w,data:{...w.data,positions:w.data.positions.filter(p=>p.chain==='robinhood')}},value:null,stale:!!w.error||!!w.data.stale||Date.now()-w.data.fetchedAt>1800000}]:[];});
}
