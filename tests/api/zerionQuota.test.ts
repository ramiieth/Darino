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
it('honors quota exhaustion on a successful final response without discarding that response',async()=>{
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({data:[]}),{headers:{'RateLimit-Org-Day-Remaining':'0','RateLimit-Org-Day-Reset':'1800'}}));vi.stubGlobal('fetch',fetcher);
 const {getTransactions}=await import('../../api/_zerion');expect((await getTransactions('0x'+'fa'.repeat(20))).rows).toEqual([]);
 await expect(getTransactions('0x'+'fb'.repeat(20))).rejects.toMatchObject({status:429});expect(fetcher).toHaveBeenCalledTimes(1);
});

it('does not mistake blank or malformed quota headers for exhaustion',async()=>{
 const {zerionThrottle,getTransactions}=await import('../../api/_zerion');
 expect(zerionThrottle(new Headers({'RateLimit-Org-Day-Remaining':'','RateLimit-Org-Month-Remaining':' '})).message).toContain('موقتاً');
 const f=vi.fn(async()=>new Response(JSON.stringify({data:[]}),{headers:{'RateLimit-Org-Day-Remaining':''}}));vi.stubGlobal('fetch',f);
 await getTransactions('0x'+'ab'.repeat(20));await getTransactions('0x'+'ac'.repeat(20));expect(f).toHaveBeenCalledTimes(2);
});
it('preserves observed budget when a later response omits quota headers',async()=>{
 const f=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({data:[]}),{headers:{'RateLimit-Org-Day-Limit':'300','RateLimit-Org-Day-Remaining':'44'}})).mockResolvedValueOnce(new Response(JSON.stringify({data:[]})));vi.stubGlobal('fetch',f);
 const {getTransactions,zerionQuota}=await import('../../api/_zerion');await getTransactions('0x'+'ba'.repeat(20));const before=await zerionQuota();await getTransactions('0x'+'bb'.repeat(20));expect(await zerionQuota()).toEqual(before);expect(before).toMatchObject({dayRemaining:44,dayLimit:300,level:'limited'});
});
