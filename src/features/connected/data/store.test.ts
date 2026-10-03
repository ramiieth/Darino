// @vitest-environment jsdom
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { refreshWallet,refreshTransactions,refreshWalletEvents,clearConnectedMemory,useConnectedStore } from './store';
import { clearWalletSnapshots,saveWalletSnapshot } from './snapshotCache';
import { HttpError,fetchJson } from '@/repositories/remoteClient';
vi.mock('@/repositories/remoteClient',async original=>({...await original<typeof import('@/repositories/remoteClient')>(),fetchJson:vi.fn()}));
const address='0x'+'ac'.repeat(20);
beforeEach(async()=>{await clearWalletSnapshots();clearConnectedMemory();vi.mocked(fetchJson).mockReset();});afterEach(()=>vi.useRealTimers());
it('keeps the last complete snapshot when quota failure returns partial details',async()=>{
 const complete={address,fetchedAt:Date.now()-1000000,total:100,positions:[{id:'token'}],complete:true};useConnectedStore.setState({wallets:{[address]:{data:complete} as any}});
 vi.mocked(fetchJson).mockResolvedValue({...complete,positions:[],complete:false,detailsError:'سهمیهٔ روزانه تمام شده'});await refreshWallet(address,true);
 expect(useConnectedStore.getState().wallets[address].data).toBe(complete);expect(useConnectedStore.getState().wallets[address].error).toContain('روزانه');
});
it('avoids duplicate history loads and respects provider Retry-After across wallets',async()=>{
 vi.mocked(fetchJson).mockResolvedValue({rows:[],next:null,fetchedAt:Date.now()});await refreshTransactions(address);await refreshTransactions(address);expect(fetchJson).toHaveBeenCalledTimes(1);
 vi.mocked(fetchJson).mockRejectedValue(new HttpError(429,'محدودیت',120));await refreshWallet(address,true);await refreshWallet('0x'+'dd'.repeat(20),true);expect(fetchJson).toHaveBeenCalledTimes(2);
});

it('restores a successful wallet after memory reset and daily quota failure',async()=>{
 const complete={address,fetchedAt:Date.now()-1000000,total:100,positions:[],chains:[],complete:true,unpriced:0,change:null};await saveWalletSnapshot(complete);clearConnectedMemory();
 vi.mocked(fetchJson).mockRejectedValue(new HttpError(429,'سهمیهٔ روزانه تمام شده',3600));await refreshWallet(address,true);
 expect(useConnectedStore.getState().wallets[address].data?.total).toBe(100);expect(useConnectedStore.getState().wallets[address].data?.fetchedAt).toBe(complete.fetchedAt);expect(useConnectedStore.getState().wallets[address].data?.stale).toBe(true);
 await clearWalletSnapshots();clearConnectedMemory();await refreshWallet(address,true);expect(useConnectedStore.getState().wallets[address].data).toBeNull();expect(useConnectedStore.getState().wallets[address].error).toContain('هنوز موجودی موفقی');
});

it('hydrates every cached wallet even when the first wallet exhausts the shared quota',async()=>{
 const second='0x'+'ee'.repeat(20);const snapshot={address,fetchedAt:Date.now()-1000000,total:100,positions:[],chains:[],complete:true,unpriced:0,change:null};await saveWalletSnapshot(snapshot);await saveWalletSnapshot({...snapshot,address:second,total:200});
 vi.mocked(fetchJson).mockRejectedValue(new HttpError(429,'سهمیهٔ روزانه تمام شده',3600));await refreshWallet(address);await refreshWallet(second);expect(fetchJson).toHaveBeenCalledTimes(1);expect(useConnectedStore.getState().wallets[second].data?.total).toBe(200);expect(useConnectedStore.getState().wallets[second].data?.stale).toBe(true);
});
it('resumes successfully after Retry-After and clears the wallet failure',async()=>{
 vi.useFakeTimers();const now=Date.now();vi.setSystemTime(now);
 vi.mocked(fetchJson).mockRejectedValueOnce(new HttpError(429,'سهمیهٔ روزانه تمام شده',120));await refreshWallet(address,true);
 await refreshWallet(address,true);expect(fetchJson).toHaveBeenCalledTimes(1);
 vi.setSystemTime(now+121000);vi.mocked(fetchJson).mockResolvedValue({address,fetchedAt:Date.now(),total:12,positions:[],chains:[],complete:true,unpriced:0,change:null});
 await refreshWallet(address,true);expect(fetchJson).toHaveBeenCalledTimes(2);expect(useConnectedStore.getState().wallets[address].error).toBeNull();expect(useConnectedStore.getState().wallets[address].data?.stale).toBeFalsy();
});
it('Bitcoin balance requests remain available while Zerion is cooling down',async()=>{
 vi.mocked(fetchJson).mockRejectedValueOnce(new HttpError(429,'سهمیهٔ روزانه تمام شده',3600));await refreshWallet(address,true);
 const bitcoin='1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';vi.mocked(fetchJson).mockResolvedValue({address:bitcoin,fetchedAt:Date.now(),total:60000,positions:[],chains:[],complete:true,unpriced:0,change:null});await refreshWallet(bitcoin);
 expect(fetchJson).toHaveBeenCalledTimes(2);expect(useConnectedStore.getState().wallets[bitcoin].data?.total).toBe(60000);
});
it('honors adaptive balance freshness without duplicating provider requests',async()=>{
 const snapshot={address,fetchedAt:Date.now()-2000000,total:100,positions:[],chains:[],complete:true,unpriced:0,change:null,refreshAfterMs:14400000};
 useConnectedStore.setState({wallets:{[address]:{data:snapshot,loading:false,error:null,history:[],historyLoaded:false,historyAt:null,next:null,historyLoading:false,historyError:null}}});
 await refreshWallet(address);expect(fetchJson).not.toHaveBeenCalled();
});

it('notification bursts cannot bypass low-quota freshness',async()=>{
 const snapshot={address,fetchedAt:Date.now()-120000,total:100,positions:[],chains:[],complete:true,unpriced:0,change:null};
 useConnectedStore.setState({wallets:{[address]:{data:snapshot,loading:false,error:null,history:[],historyLoaded:false,historyAt:null,next:null,historyLoading:false,historyError:null}}});
 vi.mocked(fetchJson).mockResolvedValue({events:{[address]:Date.now()},refreshAfterMs:14400000});
 await refreshWalletEvents([address]);await refreshWalletEvents([address]);expect(fetchJson).toHaveBeenCalledTimes(1);expect(useConnectedStore.getState().wallets[address].data).toBe(snapshot);
});
