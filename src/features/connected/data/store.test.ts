// @vitest-environment jsdom
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { refreshWallet,refreshTransactions,clearConnectedMemory,useConnectedStore } from './store';
import { HttpError,fetchJson } from '@/repositories/remoteClient';
vi.mock('@/repositories/remoteClient',async original=>({...await original<typeof import('@/repositories/remoteClient')>(),fetchJson:vi.fn()}));
const address='0x'+'ac'.repeat(20);
beforeEach(()=>{clearConnectedMemory();vi.mocked(fetchJson).mockReset();});afterEach(()=>vi.useRealTimers());
it('keeps the last complete snapshot when quota failure returns partial details',async()=>{
 const complete={address,fetchedAt:Date.now()-1000000,total:100,positions:[{id:'token'}],complete:true};useConnectedStore.setState({wallets:{[address]:{data:complete} as any}});
 vi.mocked(fetchJson).mockResolvedValue({...complete,positions:[],complete:false,detailsError:'سهمیهٔ روزانه تمام شده'});await refreshWallet(address,true);
 expect(useConnectedStore.getState().wallets[address].data).toBe(complete);expect(useConnectedStore.getState().wallets[address].error).toContain('روزانه');
});
it('avoids duplicate history loads and respects provider Retry-After across wallets',async()=>{
 vi.mocked(fetchJson).mockResolvedValue({rows:[],next:null,fetchedAt:Date.now()});await refreshTransactions(address);await refreshTransactions(address);expect(fetchJson).toHaveBeenCalledTimes(1);
 vi.mocked(fetchJson).mockRejectedValue(new HttpError(429,'محدودیت',120));await refreshWallet(address,true);await refreshWallet('0x'+'dd'.repeat(20),true);expect(fetchJson).toHaveBeenCalledTimes(2);
});
