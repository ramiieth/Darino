import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPerpsRead } from '../../api/_perpsRead';
const address='0x1111111111111111111111111111111111111111';
afterEach(()=>vi.unstubAllGlobals());
const ok=(data:unknown)=>new Response(JSON.stringify(data),{status:200});
describe('fixed read-only perps gateway',()=>{
 it('rejects arbitrary operations and addresses before fetching',async()=>{const f=vi.fn();vi.stubGlobal('fetch',f);await expect(getPerpsRead('https://evil.example','')).rejects.toMatchObject({status:400});await expect(getPerpsRead('lighter-account','https://evil.example')).rejects.toMatchObject({status:400});expect(f).not.toHaveBeenCalled();});
 it('paginates only the fixed Robinhood API with GET and no credentials',async()=>{const f=vi.fn().mockResolvedValueOnce(ok({code:200,accounts:[{index:1}],next_cursor:'next'})).mockResolvedValueOnce(ok({code:200,accounts:[{index:2}]}));vi.stubGlobal('fetch',f);const data=await getPerpsRead('lighter-account',address) as {accounts:unknown[]};expect(data.accounts).toHaveLength(2);expect(f.mock.calls[1][0]).toContain('cursor=next');for(const [url,opts] of f.mock.calls){expect(new URL(url).origin).toBe('https://api.rh.lighter.xyz');expect(opts.method).toBe('GET');expect(opts.redirect).toBe('error');expect(opts.headers).toEqual({accept:'application/json'});}});
 it('treats Lighter "account not found" as an empty account list, other 400s as errors',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({code:21100,message:'account not found'}),{status:400})).mockResolvedValueOnce(new Response(JSON.stringify({code:20001,message:'invalid param'}),{status:400})));await expect(getPerpsRead('lighter-account',address)).resolves.toMatchObject({accounts:[]});await expect(getPerpsRead('lighter-account',address)).rejects.toMatchObject({status:502});});
 it('rejects repeating cursors rather than returning partial totals',async()=>{vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>Promise.resolve(ok({code:200,accounts:[],next_cursor:'same'}))));await expect(getPerpsRead('lighter-account',address)).rejects.toMatchObject({status:502});});
 it('handles provider errors and invalid account bodies',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response('',{status:429})).mockResolvedValueOnce(ok({code:200})).mockResolvedValueOnce(ok({code:200})));await expect(getPerpsRead('lighter-markets','')).rejects.toMatchObject({status:429});await expect(getPerpsRead('lighter-account',address)).rejects.toMatchObject({status:502});});
 it('requests only the two public Ondo endpoints',async()=>{const f=vi.fn().mockImplementation(()=>Promise.resolve(ok({success:true,result:{}})));vi.stubGlobal('fetch',f);await getPerpsRead('ondo-markets','');expect(f.mock.calls.map(c=>c[0]).sort()).toEqual(['https://api.ondoperps.xyz/v1/markets','https://api.ondoperps.xyz/v1/perps/mark_prices']);});
});

it('routes mainnet reads to the mainnet host without Robinhood credentials or endpoints',async()=>{const f=vi.fn().mockImplementation(()=>Promise.resolve(ok({code:200,accounts:[]})));vi.stubGlobal('fetch',f);await getPerpsRead('lighter-mainnet-account',address);await getPerpsRead('lighter-mainnet-markets','');expect(f.mock.calls.map(c=>new URL(c[0]).origin)).toEqual(['https://mainnet.zklighter.elliot.ai','https://mainnet.zklighter.elliot.ai','https://mainnet.zklighter.elliot.ai']);for(const [,opts]of f.mock.calls)expect(opts.headers).toEqual({accept:'application/json'});});

it('preserves market prices when optional token metadata is unavailable',async()=>{vi.stubGlobal('fetch',vi.fn().mockImplementation(url=>String(url).endsWith('/tokenlist')?Promise.reject(new Error('offline')):Promise.resolve(ok({code:200,order_book_details:[{symbol:'EIGEN'}]}))));await expect(getPerpsRead('lighter-mainnet-markets','')).resolves.toMatchObject({order_book_details:[{symbol:'EIGEN'}]});});
it('uses only the matching host for public names and icons',async()=>{const f=vi.fn().mockImplementation(url=>Promise.resolve(ok(String(url).endsWith('/tokenlist')?{code:200,tokens:[{symbol:'EIGEN',name:'EigenCloud'}]}:{code:200,order_book_details:[]})));vi.stubGlobal('fetch',f);await expect(getPerpsRead('lighter-markets','')).resolves.toMatchObject({tokens:[{symbol:'EIGEN',name:'EigenCloud'}]});expect(f.mock.calls.map(c=>c[0])).toEqual(['https://api.rh.lighter.xyz/api/v1/orderBookDetails','https://api.rh.lighter.xyz/api/v1/tokenlist']);});

describe('عملیات عمومی Ondo برای ماشین‌حساب‌ها', () => {
 const markets={success:true,result:{perps:{tradingPairs:[
  {market:'MSTR-USD.P',pair:{base:'MSTR',quote:'USD'},longName:'Strategy',tags:['Equities'],makerFee:'0.0001',takerFee:'0.00025',marginInfo:[{maxLeverage:'10',maintenanceMarginRate:'0.05'}]},
  {market:'https://evil.example',pair:{base:'X'}},
  {market:'BTC-USD.P',pair:{base:'BTC'},marginInfo:'bad'}
 ]}}};
 const prices={success:true,result:{'MSTR-USD.P':{markPrice:'142.2'}}};
 it('فقط فیلدهای عمومی لازم را نگه می‌دارد و بازار نامعتبر را حذف می‌کند',async()=>{
  const { trimOndoMarkets } = await import('../../api/_perpsRead');
  expect(trimOndoMarkets(markets,prices)).toEqual([
   {market:'MSTR-USD.P',base:'MSTR',name:'Strategy',tags:['Equities'],makerFee:0.0001,takerFee:0.00025,maxLeverage:10,maintenanceMarginRate:0.05,markPrice:142.2},
   {market:'BTC-USD.P',base:'BTC',name:'BTC',tags:[],makerFee:null,takerFee:null,maxLeverage:null,maintenanceMarginRate:null,markPrice:null}
  ]);
 });
 it('فقط دو آدرس ثابت عمومی Ondo با GET و کش ۶۰ ثانیه‌ای',async()=>{
  vi.resetModules();
  const { getOndoPublicMarkets } = await import('../../api/_perpsRead');
  const f=vi.fn().mockImplementation(url=>Promise.resolve(ok(String(url).endsWith('/mark_prices')?prices:markets)));vi.stubGlobal('fetch',f);
  const a=await getOndoPublicMarkets();const b=await getOndoPublicMarkets();
  expect(a).toBe(b);expect(a.markets).toHaveLength(2);
  expect(f.mock.calls.map(c=>c[0]).sort()).toEqual(['https://api.ondoperps.xyz/v1/markets','https://api.ondoperps.xyz/v1/perps/mark_prices']);
  for(const [,opts] of f.mock.calls){expect(opts.method).toBe('GET');expect(opts.headers).toEqual({accept:'application/json'});}
 });
 it('پاسخ بدون بازار معتبر خطا می‌دهد و کش نمی‌شود',async()=>{
  vi.resetModules();
  const { getOndoPublicMarkets } = await import('../../api/_perpsRead');
  vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>Promise.resolve(ok({success:true,result:{}}))));
  await expect(getOndoPublicMarkets()).rejects.toMatchObject({status:502});
 });
});

describe('تاریخچهٔ فاندینگ و عمق عمومی Ondo برای اسکنر', () => {
 it('بازار نامعتبر پیش از هر درخواست رد می‌شود',async()=>{const f=vi.fn();vi.stubGlobal('fetch',f);const { getOndoFundingHistory, getOndoDepth } = await import('../../api/_perpsRead');await expect(getOndoFundingHistory('https://evil.example')).rejects.toMatchObject({status:400});await expect(getOndoDepth('BTC-USD.P&x=1')).rejects.toMatchObject({status:400});expect(f).not.toHaveBeenCalled();});
 it('فقط مسیر ثابت تاریخچه، ۷۲۰ ساعت، خروجی خلاصه',async()=>{const f=vi.fn().mockResolvedValue(ok({success:true,result:[{market:'ETH-USD.P',time:'2026-10-17T14:00:00.007Z',fundingRate:'0.0000125'},{time:'bad',fundingRate:'1'}]}));vi.stubGlobal('fetch',f);const { getOndoFundingHistory } = await import('../../api/_perpsRead');const data=await getOndoFundingHistory('ETH-USD.P');expect(data).toEqual({market:'ETH-USD.P',rates:[{t:Date.parse('2026-10-17T14:00:00.007Z'),r:0.0000125}]});const url=new URL(f.mock.calls[0][0]);expect(url.origin+url.pathname).toBe('https://api.ondoperps.xyz/v1/perps/funding_rate_history');expect(url.searchParams.get('market')).toBe('ETH-USD.P');expect(url.searchParams.get('limit')).toBe('720');expect(f.mock.calls[0][1].method).toBe('GET');});
 it('عمق: حداکثر ۱۰۰ سطح معتبر',async()=>{const f=vi.fn().mockResolvedValue(ok({success:true,result:{bids:[['100','1'],['x','2'],['99','0']],asks:[['101','2']]}}));vi.stubGlobal('fetch',f);const { getOndoDepth } = await import('../../api/_perpsRead');expect(await getOndoDepth('SOL-USD.P')).toEqual({market:'SOL-USD.P',bids:[[100,1]],asks:[[101,2]]});expect(new URL(f.mock.calls[0][0]).searchParams.get('depth')).toBe('100');});
});

describe('عملیات عمومی QFEX برای ماشین‌حساب‌ها', () => {
 const contracts={data:[
  {ticker_id:'AAPL-USD',base_currency:'AAPL',product_type:'Perpetual',last_price:'344.05',index_price:'344.2',target_volume:'5256087.5',funding_rate:'-0.0000023',funding_interval_minutes:60},
  {ticker_id:'EUR-USD',base_currency:'EUR',product_type:'Perpetual',last_price:'1.1',funding_rate:'0',funding_interval_minutes:60},
  {ticker_id:'https://evil.example',base_currency:'X',product_type:'Perpetual'},
  {ticker_id:'CL-USD',base_currency:'CL',product_type:'Perpetual',last_price:'',index_price:'99.5',funding_rate:'0.00001',funding_interval_minutes:480}
 ]};
 const refdata={type:'x',data:[
  {symbol:'AAPL-USD',status:'ACTIVE',product_category:'EQUITY',default_max_leverage:10},
  {symbol:'EUR-USD',status:'DELISTED',product_category:'FX',default_max_leverage:50},
  {symbol:'CL-USD',status:'ACTIVE',product_category:'COMMODITY',default_max_leverage:10}
 ]};
 it('فقط بازارهای فعال؛ فاندینگ فقط وقتی بازهٔ تسویه ۶۰ دقیقه است',async()=>{
  const { trimQfexMarkets } = await import('../../api/_perpsRead');
  expect(trimQfexMarkets(contracts,refdata)).toEqual([
   {market:'AAPL-USD',base:'AAPL',category:'EQUITY',maxLeverage:10,markPrice:344.05,fundingHourly:-0.0000023,volume24hUsd:5256087.5},
   {market:'CL-USD',base:'CL',category:'COMMODITY',maxLeverage:10,markPrice:99.5,fundingHourly:null,volume24hUsd:null}
  ]);
 });
 it('فقط دو آدرس ثابت عمومی QFEX با GET و کش',async()=>{
  vi.resetModules();
  const { getQfexPublicMarkets } = await import('../../api/_perpsRead');
  const f=vi.fn().mockImplementation(url=>Promise.resolve(ok(String(url).endsWith('/refdata')?refdata:contracts)));vi.stubGlobal('fetch',f);
  const a=await getQfexPublicMarkets();const b=await getQfexPublicMarkets();
  expect(a).toBe(b);expect(a.markets).toHaveLength(2);
  expect(f.mock.calls.map(c=>c[0]).sort()).toEqual(['https://api.qfex.com/md/contracts','https://api.qfex.com/refdata']);
  for(const [,opts] of f.mock.calls){expect(opts.method).toBe('GET');expect(opts.headers).toEqual({accept:'application/json'});}
 });
 it('بازار نامعتبر پیش از هر درخواست رد می‌شود',async()=>{const f=vi.fn();vi.stubGlobal('fetch',f);const { getQfexFundingHistory, getQfexDepth } = await import('../../api/_perpsRead');await expect(getQfexFundingHistory('../refdata')).rejects.toMatchObject({status:400});await expect(getQfexDepth('AAPL-USD?x=1')).rejects.toMatchObject({status:400});expect(f).not.toHaveBeenCalled();});
 it('تاریخچه: مسیر ثابت، ساعتی، ۳۰ روز، خروجی خلاصه',async()=>{
  const f=vi.fn().mockResolvedValue(ok({count:2,data:[{symbol:'TSLA-USD',intervalMinutes:60,windowStart:'2026-10-19T10:00:00Z',rate:4.8e-7},{windowStart:'bad',rate:1}]}));vi.stubGlobal('fetch',f);
  const { getQfexFundingHistory } = await import('../../api/_perpsRead');
  expect(await getQfexFundingHistory('TSLA-USD')).toEqual({market:'TSLA-USD',rates:[{t:Date.parse('2026-10-19T10:00:00Z'),r:4.8e-7}]});
  const url=new URL(f.mock.calls[0][0]);expect(url.origin+url.pathname).toBe('https://api.qfex.com/funding/TSLA-USD');expect(url.searchParams.get('intervalMinutes')).toBe('60');
  expect(Date.parse(url.searchParams.get('toISO')!)-Date.parse(url.searchParams.get('fromISO')!)).toBe(30*86_400_000);
 });
 it('عمق: سطوح با حجم صفر حذف می‌شوند',async()=>{
  const f=vi.fn().mockResolvedValue(ok({ticker_id:'NVDA-USD',timestamp:1,bids:[['100','0'],['99.9','2']],asks:[['100.1','0'],['100.2','1']]}));vi.stubGlobal('fetch',f);
  const { getQfexDepth } = await import('../../api/_perpsRead');
  expect(await getQfexDepth('NVDA-USD')).toEqual({market:'NVDA-USD',bids:[[99.9,2]],asks:[[100.2,1]]});
  expect(f.mock.calls[0][0]).toBe('https://api.qfex.com/md/orderbook/NVDA-USD');
 });
});

describe('سری عمومی سود/زیان لایتر',()=>{
 it('فقط شمارهٔ حساب عددی و دو op ثابت؛ پیش از هر درخواست رد می‌شود',async()=>{const f=vi.fn();vi.stubGlobal('fetch',f);const { getLighterPnl } = await import('../../api/_perpsRead');await expect(getLighterPnl('lighter-pnl','1&by=l1')).rejects.toMatchObject({status:400});await expect(getLighterPnl('evil','1')).rejects.toMatchObject({status:400});expect(f).not.toHaveBeenCalled();});
 it('ساعتی و روزانه از میزبان درست؛ فقط [زمان، trade_pnl]',async()=>{const { getLighterPnl } = await import('../../api/_perpsRead');const f=vi.fn().mockImplementation(()=>Promise.resolve(ok({code:200,pnl:[{timestamp:10,trade_pnl:5.5,inflow:100},{timestamp:'x',trade_pnl:1}]})));vi.stubGlobal('fetch',f);const r=await getLighterPnl('lighter-mainnet-pnl','27160');expect(r.hourly).toEqual([[10,5.5]]);expect(r.daily).toEqual([[10,5.5]]);const urls=f.mock.calls.map(c=>new URL(c[0]));expect(urls.map(u=>u.origin)).toEqual(['https://mainnet.zklighter.elliot.ai','https://mainnet.zklighter.elliot.ai']);expect(urls.map(u=>u.searchParams.get('resolution')).sort()).toEqual(['1d','1h']);expect(urls.every(u=>u.searchParams.get('by')==='index'&&u.searchParams.get('value')==='27160')).toBe(true);});
});
