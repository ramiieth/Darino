// @vitest-environment node
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
const storage=vi.hoisted(()=>new Map<string,{payload:unknown;expiresAt:number}>());
vi.mock('../../api/_neon',()=>({isDbConfigured:()=>true,db:()=>async(parts:TemplateStringsArray,...values:unknown[])=>{
 const sql=parts.join('?');if(sql.startsWith('SELECT')){const row=storage.get(values[0] as string);return row&&row.expiresAt>Number(values[1])?[row]:[];}
 if(sql.includes('RETURNING')){const key=values[0] as string,now=Number(values[4]),spacing=Number(values[5]),deadline=Number(values[8]);const expiresAt=Math.max(storage.get(key)?.expiresAt??0,now)+spacing;if(expiresAt>deadline)return [];storage.set(key,{payload:{lease:true},expiresAt});return [{expiresAt}];}
 if(sql.startsWith('INSERT'))storage.set(values[0] as string,{payload:JSON.parse(values[1] as string),expiresAt:Number(values[2])});return [];
}}));
beforeEach(()=>{storage.clear();vi.resetModules();vi.stubEnv('ZERION_API_KEY','private-key-for-test');});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('a cold instance reuses cached transactions without storing an API key',async()=>{
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({data:[]})));vi.stubGlobal('fetch',fetcher);const address='0x'+'aa'.repeat(20);
 const first=await (await import('../../api/_zerion')).getTransactions(address);vi.resetModules();const second=await (await import('../../api/_zerion')).getTransactions(address);expect(second.fetchedAt).toBe(first.fetchedAt);
 expect(fetcher).toHaveBeenCalledTimes(1);expect(JSON.stringify([...storage])).not.toContain('private-key-for-test');expect([...storage.keys()].every(k=>/^[0-9a-f]{64}$/.test(k))).toBe(true);
});
it('another instance also observes daily cooldown and makes no new provider request',async()=>{
 const fetcher=vi.fn(async()=>new Response('{}',{status:429,headers:{'RateLimit-Org-Day-Remaining':'0','RateLimit-Org-Day-Reset':'300'}}));vi.stubGlobal('fetch',fetcher);
 await expect((await import('../../api/_zerion')).getTransactions('0x'+'bb'.repeat(20))).rejects.toMatchObject({status:429});vi.resetModules();
 await expect((await import('../../api/_zerion')).getTransactions('0x'+'cc'.repeat(20))).rejects.toMatchObject({status:429});expect(fetcher).toHaveBeenCalledTimes(1);
});

it('a cold instance serves last complete assets after the freshness cache expires and quota is exhausted',async()=>{
 const address='0x'+'fa'.repeat(20),fetcher=vi.fn(async(url:string)=>url.includes('/chains/')?new Response(JSON.stringify({data:[]})):new Response(JSON.stringify({data:[{id:'p',attributes:{position_type:'wallet',quantity:{numeric:'2'},value:20,price:10,fungible_info:{id:'token',name:'Token',symbol:'TOK',flags:{verified:true}}},relationships:{chain:{data:{id:'ethereum'}}}}]})));vi.stubGlobal('fetch',fetcher);
 const original=await (await import('../../api/_zerion')).getWallet(address,'owner');expect(original.complete).toBe(true);
 for(const [key,row]of storage)if(row.payload&&typeof row.payload==='object'&&'data' in row.payload)storage.delete(key);
 vi.resetModules();fetcher.mockImplementation(async()=>new Response('{}',{status:429,headers:{'RateLimit-Org-Day-Remaining':'0','Retry-After':'3600'}}));
 const cached=await (await import('../../api/_zerion')).getWallet(address,'owner');expect(cached.positions).toEqual(original.positions);expect(cached.fetchedAt).toBe(original.fetchedAt);expect(cached.stale).toBe(true);expect(cached.retryAt).toBeGreaterThan(Date.now());
});

it('keeps successful assets when a server key is rotated and the new key is throttled',async()=>{
 const address='0x'+'fe'.repeat(20);vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({data:[]}))));
 const original=await (await import('../../api/_zerion')).getWallet(address,'owner');expect(original.complete).toBe(true);
 vi.resetModules();vi.stubEnv('ZERION_API_KEY','replacement-test-key');
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('{}',{status:429,headers:{'Retry-After':'10'}})));
 const cached=await (await import('../../api/_zerion')).getWallet(address,'owner');expect(cached.complete).toBe(true);expect(cached.stale).toBe(true);expect(cached.fetchedAt).toBe(original.fetchedAt);
});
it('reserves distinct time slots across cold server instances and rejects an overfull deadline',async()=>{
 const now=Date.now(),first=await import('../../api/_providerCache');const key=first.providerCacheKey('request-slots');
 expect(await first.reserveProviderSlot(key,now,now+2000)).toBe(now);vi.resetModules();const second=await import('../../api/_providerCache');
 expect(await second.reserveProviderSlot(key,now,now+2000)).toBe(now+550);
 expect(await second.reserveProviderSlot(key,now,now+1000)).toBeNull();
});
