import { settingGet,settingSet,settingDeletePrefix } from '@/shared/lib/db';
import { addressKey,type WalletSnapshot } from '../domain/model';
const PREFIX='connected.last-wallet.v1:';
let epoch=0;
const writes=new Set<Promise<void>>();
export async function loadWalletSnapshot(address:string):Promise<WalletSnapshot|null>{
 const value=await settingGet<WalletSnapshot|null>(PREFIX+addressKey(address),null);
 return value&&value.complete&&addressKey(value.address)===addressKey(address)&&Array.isArray(value.positions)&&Number.isFinite(value.fetchedAt)?value:null;
}
export function saveWalletSnapshot(value:WalletSnapshot):Promise<void>{
 if(!value.complete||value.stale)return Promise.resolve();
 const version=epoch;const work=(async()=>{if(version!==epoch)return;await settingSet(PREFIX+addressKey(value.address),value);})();writes.add(work);void work.finally(()=>writes.delete(work));return work;
}
export async function clearWalletSnapshots(){epoch++;await Promise.allSettled([...writes]);await settingDeletePrefix(PREFIX); }
