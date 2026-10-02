// @vitest-environment node
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
beforeEach(()=>{vi.resetModules();vi.stubEnv('ZERION_API_KEY','quota-'+Math.random());});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('distinguishes second/day/month throttles and obeys the longest reset',async()=>{
 const {zerionThrottle}=await import('../../api/_zerion');
 expect(zerionThrottle(new Headers({'RateLimit-Org-Second-Reset':'2'}),1000).message).toContain('موقتاً');
 const day=zerionThrottle(new Headers({'Retry-After':'3','RateLimit-Org-Day-Remaining':'0','RateLimit-Org-Day-Reset':'3600'}),1000);expect(day.retryAfter).toBe(3600);expect(day.message).toContain('روزانه');
 const month=zerionThrottle(new Headers({'RateLimit-Org-Month-Remaining':'0','RateLimit-Org-Month-Reset':'7200'}),1000);expect(month.until).toBe(7201000);expect(month.message).toContain('ماهانه');
});
it('deduplicates simultaneous transaction requests and caches successful pages',async()=>{
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({data:[]})));vi.stubGlobal('fetch',fetcher);
 const {getTransactions}=await import('../../api/_zerion');const address='0x'+'de'.repeat(20);
 await Promise.all([getTransactions(address),getTransactions(address)]);await getTransactions(address);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('stops requests after quota failure, including requests for another wallet',async()=>{
 const fetcher=vi.fn(async()=>new Response('{}',{status:429,headers:{'RateLimit-Org-Day-Remaining':'0','RateLimit-Org-Day-Reset':'500'}}));vi.stubGlobal('fetch',fetcher);
 const {getTransactions}=await import('../../api/_zerion');await expect(getTransactions('0x'+'ef'.repeat(20))).rejects.toMatchObject({status:429,retryAfter:500});await expect(getTransactions('0x'+'ed'.repeat(20))).rejects.toMatchObject({status:429});expect(fetcher).toHaveBeenCalledTimes(1);
});
