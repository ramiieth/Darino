// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkedNext, getWallet, getBalanceChart, ProviderError } from '../../api/_zerion';
import { analysisSchema, analyze } from '../../api/_assistant';
const address = '0x' + 'ab'.repeat(20);
beforeEach(() => { vi.stubEnv('ZERION_API_KEY','test-zerion'); vi.stubEnv('GEMINI_API_KEY','test-gemini'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('سرور اتصال‌های دارینو', () => {
  it('صفحه‌بندی نمی‌تواند کلید را به میزبان یا کیف پول دیگری ارسال کند', () => {
    expect(() => checkedNext('https://evil.example/x',address,'transactions')).toThrow(ProviderError);
    expect(() => checkedNext(`/v1/wallets/${'0x'+'cd'.repeat(20)}/transactions/`,address,'transactions')).toThrow();
    const next = checkedNext(`/v1/wallets/${address}/transactions/?page[lastId]=abc&currency=btc&filter[trash]=no_filter`,address,'transactions');
    const u = new URL(next,'https://api.zerion.io');
    expect(u.searchParams.get('page[lastId]')).toBe('abc');
    expect(u.searchParams.get('currency')).toBe('usd');
    expect(u.searchParams.get('filter[trash]')).toBe('only_non_trash');
  });
  it('مجموع رسمی با شکست جزئیات به صفر تبدیل نمی‌شود؛ کلید فقط در هدر سرور است', async () => {
    const fetcher = vi.fn(async (url:string, init:RequestInit) => {
      expect(init.headers).toMatchObject({Authorization:'Basic '+Buffer.from('test-zerion:').toString('base64')});
      if(url.includes('/chains/')) return new Response(JSON.stringify({data:[]}));
      if(url.includes('/portfolio')) return new Response(JSON.stringify({data:{attributes:{total:{positions:987.65}}}}));
      return new Response('{}',{status:429});
    });
    vi.stubGlobal('fetch',fetcher);
    const snapshot = await getWallet(address,'test-user');
    expect(snapshot.total).toBe(987.65);
    expect(snapshot.complete).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain('test-zerion');
  });
  it('wallet charts only use validated periods and asset IDs on the fixed authenticated provider', async()=>{
    const fetcher=vi.fn(async(url:string)=>{
      const u=new URL(url);expect(u.origin).toBe('https://api.zerion.io');expect(u.pathname).toBe(`/v1/wallets/${address}/charts/day`);expect(u.searchParams.get('filter[fungible_ids]')).toBe('eth,usdc');expect(u.searchParams.get('filter[chain_ids]')).toBe('base');
      return new Response(JSON.stringify({data:{attributes:{points:[[1700000000,10],[1700000300,12]]}}}));
    });vi.stubGlobal('fetch',fetcher);
    await expect(getBalanceChart(address,'chart-user','day',['eth','usdc'],'base')).resolves.toMatchObject({points:[[1700000000000,10],[1700000300000,12]]});
    await getBalanceChart(address,'chart-user','day',['eth','usdc'],'base');expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(getBalanceChart(address,'chart-user','../evil',['eth'],'')).rejects.toThrow();
    await expect(getBalanceChart(address,'chart-user','day',['eth&evil=x'],'')).rejects.toThrow();
  });
  it('تحلیل معتبر، تاریخچهٔ محدود و کلید در هدر Gemini؛ فیلدهای اضافی حذف می‌شوند', async () => {
    const parsed = analysisSchema.parse({question:'ریسک؟',history:[{role:'user',text:'پرسش قبلی'},{role:'assistant',text:'پاسخ قبلی'}],context:{total:100,partial:false,sources:[],positions:[],arcus:[],profile:{horizon:'',risk:'',liquidity:''},address:'secret-address'}});
    const fetcher = vi.fn(async (_url:string,init:RequestInit) => {
      expect(_url).toContain('gemini-3.8-flash:generateContent');
      expect(init.headers).toMatchObject({'x-goog-api-key':'test-gemini'});
      const body = JSON.parse(init.body as string);
      expect(body.generationConfig.thinkingConfig).toEqual({thinkingLevel:'low'});
      expect(body.contents.map((c:{role:string}) => c.role)).toEqual(['user','model','user']);
      expect(init.body).not.toContain('secret-address');
      expect(init.body).not.toContain('test-gemini');
      return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'تحلیل فارسی'}]}}]}));
    }); vi.stubGlobal('fetch',fetcher);
    expect(await analyze(parsed)).toBe('تحلیل فارسی');
    expect(analysisSchema.safeParse({...parsed,question:'x'.repeat(2001)}).success).toBe(false);
  });
});
