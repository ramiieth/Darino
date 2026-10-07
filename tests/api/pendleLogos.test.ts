import { afterEach,expect,it,vi } from 'vitest';
const cache=vi.hoisted(()=>({read:vi.fn(),write:vi.fn()}));
vi.mock('../../api/_providerCache.js',()=>({readProviderCache:cache.read,writeProviderCache:cache.write}));
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();vi.clearAllMocks();});
const icon='https://storage.googleapis.com/prod-pendle-bucket-a/images/uploads/future.svg',contract='0x'+'cd'.repeat(20);
const market={chainId:1,address:contract,yt:'1-'+contract,pt:'1-'+contract,icon,name:'FUTURE'};
it('reads every page from the fixed public origin and refreshes future receipt metadata',async()=>{
 cache.read.mockResolvedValue(null);cache.write.mockResolvedValue(true);
 const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({total:101,results:Array(100).fill(market)}))).mockResolvedValueOnce(new Response(JSON.stringify({total:101,results:[{...market,chainId:42161,yt:'42161-'+contract,pt:'42161-'+contract}]})));
 vi.stubGlobal('fetch',fetch);const {getPendleLogos}=await import('../../api/_pendleLogos');const data=await getPendleLogos();
 expect(data.logos).toHaveLength(303);expect(data.logos.filter(l=>l.chainId===42161)).toHaveLength(3);
 expect(fetch.mock.calls.map(c=>c[0])).toEqual(['https://api-v2.pendle.finance/core/v2/markets/all?limit=100&skip=0','https://api-v2.pendle.finance/core/v2/markets/all?limit=100&skip=100']);
 expect(fetch.mock.calls[0][1]).toMatchObject({redirect:'error'});expect(cache.write).toHaveBeenCalledOnce();
});
it('retains existing metadata on upstream failure without caching an empty replacement',async()=>{
 const old={logos:[{chainId:1,contract,kind:'YT',logo:icon,underlying:'FUTURE'}],fetchedAt:Date.now()-3600000};cache.read.mockResolvedValue(old);
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(Error('offline')));const {getPendleLogos}=await import('../../api/_pendleLogos');expect(await getPendleLogos()).toEqual(old);expect(cache.write).not.toHaveBeenCalled();
});
it('does not fetch metadata again inside the refresh interval',async()=>{
 const fresh={logos:[],fetchedAt:Date.now()};cache.read.mockResolvedValue(fresh);const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const {getPendleLogos}=await import('../../api/_pendleLogos');expect(await getPendleLogos()).toEqual(fresh);expect(fetch).not.toHaveBeenCalled();
});
