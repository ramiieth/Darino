import { beforeEach, describe, expect, it, vi } from 'vitest';
import { borosRead, readBorosAccount, readBorosPreview, readBorosHistory, clearBorosAccountCache } from '../../api/_borosAccount';
import { accountTotals, packAccount, unpackAccount, x18, toX18, CROSS } from '../../src/shared/boros/account';
import { borosRoot, borosHandle, accountAssets, accountBalances, accountPositions, accountSettlements, accountTransfers, accountSync } from '../fixtures/borosAccount';
const fetcher=vi.fn();
beforeEach(()=>{clearBorosAccountCache();vi.stubGlobal('fetch',fetcher);vi.stubEnv('BOROS_API_KEY','test-boros-key');fetcher.mockReset();fetcher.mockImplementation(async(url:string,init:any)=>{const path=new URL(url).pathname;const data=path.endsWith('/assets')?accountAssets:path.endsWith('/active-positions')?accountPositions:path.endsWith('/market-acc-infos-by-root')?accountBalances:path.endsWith('/market-acc-infos')?{...accountBalances,results:JSON.parse(init.body).marketAccs.map((h:string)=>accountBalances.results.find(b=>b.marketAcc===h)??{...accountBalances.results[0],marketAcc:h,totalCash:'0',netBalance:'0',initialMargin:'0',availableInitialMargin:'0',availableMaintMargin:'0',positions:[]})}:path.endsWith('/gas-balance')?{balanceInUSD:12.5}:path.endsWith('/settlement-events')?accountSettlements:path.endsWith('/transfer-logs')?accountTransfers:{results:[],syncStatus:accountSync};return new Response(JSON.stringify(data));});});
describe('Boros account units, identities and API contract',()=>{
 it('packs handles exactly like the published SDK, including leading-zero roots',()=>{const root='0x0000000000000000000000000000000000000001';const h=packAccount(root,255,65535,1);expect(h).toBe(root+'ffffff000001');expect(unpackAccount(h)).toEqual({root,accountId:255,tokenId:65535,marketId:1});expect(()=>packAccount(root,256,2,CROSS)).toThrow();});
 it('preserves fractional quantities and x18 USDT normalization without native-decimal rescaling',()=>{expect(toX18('12345.123456789012345678')).toBe('12345123456789012345678');expect(toX18('0.65')).toBe('650000000000000000');expect(x18('650000000000000000')).toBe(.65);expect(x18('1000000')).toBe(.000000000001);expect(x18(null)).toBeNull();expect(()=>toX18('0')).toThrow();expect(()=>toX18('0.0000000000000000001')).toThrow();});
 it('reads actual root-based schemas, keeps PnL streams separate, caches and never returns secrets',async()=>{const s=await readBorosAccount(borosRoot,0);expect(s.balances[0].equity).toBe(1.1);expect(s.positions[0]).toMatchObject({size:2,fixedApr:.05,unrealized:.02,realizedTrade:.01,settlement:.03,liquidationApr:.15});expect(s.settlements[0].amount).toBe(.029);expect(accountTotals(s)).toMatchObject({equityUsd:2200,unrealizedUsd:40,realizedTradeUsd:20,settlementUsd:60});expect(s.historyComplete).toBe(true);expect(JSON.stringify(s)).not.toContain('test-boros-key');expect(fetcher.mock.calls.every(([url,init])=>url.startsWith('https://api-boros.pendle.finance/apis/v1/')&&!('Authorization' in init.headers)&&!JSON.stringify(init).includes('test-boros-key'))).toBe(true);await readBorosAccount(borosRoot,0);expect(fetcher).toHaveBeenCalledTimes(8);});
 it('reads deposited balances without any API signing credential',async()=>{vi.stubEnv('BOROS_API_KEY','');const s=await readBorosAccount(borosRoot,0);expect(s.balances[0].cash).toBe(1);expect(fetcher.mock.calls.every(([,init])=>!('Authorization' in init.headers))).toBe(true);});
 it('deduplicates concurrent refreshes',async()=>{await Promise.all([readBorosAccount(borosRoot,0),readBorosAccount(borosRoot,0)]);expect(fetcher).toHaveBeenCalledTimes(8);});
 it('rejects a response belonging to another root instead of displaying its balances',async()=>{fetcher.mockImplementation(async(url:string)=>new Response(JSON.stringify(url.includes('active-positions')?{...accountPositions,results:[{...accountPositions.results[0],marketAcc:packAccount('0x2222222222222222222222222222222222222222',0,2,CROSS)}]}:accountAssets)));await expect(readBorosAccount(borosRoot,0)).rejects.toThrow();});
 it('retains unknown USD valuation and marks incomplete history after an optional provider failure',async()=>{fetcher.mockImplementation(async(url:string,init:any)=>{if(url.includes('settlement-events'))return new Response('',{status:429});const data=url.includes('/assets')?{results:[{tokenId:2,symbol:'WETH',usdPrice:null,metadata:{}}]}:url.includes('active-positions')?accountPositions:url.includes('market-acc-infos-by-root')?accountBalances:url.endsWith('/market-acc-infos')?accountBalances:url.includes('transfer-logs')?accountTransfers:{results:[],syncStatus:accountSync};return new Response(JSON.stringify(data));});const s=await readBorosAccount(borosRoot,0);expect(s.partial).toBe(true);expect(s.historyComplete).toBe(false);expect(accountTotals(s).equityUsd).toBeNull();});
 it('reads deposited collateral with no open position through direct cross handles',async()=>{
  fetcher.mockImplementation(async(url:string,init:any)=>{
   const path=new URL(url).pathname;
   const data=path.endsWith('/assets')?accountAssets:path.endsWith('/active-positions')?{results:[],syncStatus:accountSync}:path.endsWith('/market-acc-infos')?{results:JSON.parse(init.body).marketAccs.map((h:string)=>({...accountBalances.results[0],marketAcc:h,totalCash:h===borosHandle?'650000000000000000':'0',netBalance:h===borosHandle?'650000000000000000':'0',initialMargin:'0',positions:[]})),syncStatus:accountSync}:{results:[],syncStatus:accountSync};
   return new Response(JSON.stringify(data));
  });
  const s=await readBorosAccount(borosRoot,0);expect(s.positions).toEqual([]);expect(s.balances.find(b=>b.handle===borosHandle)?.cash).toBe(.65);expect(accountTotals(s).equityUsd).toBe(1300);
 });
 it('queries every collateral cross account for a selected sub-account before trading',async()=>{
  fetcher.mockImplementation(async(url:string,init:any)=>new Response(JSON.stringify(url.includes('/assets')?accountAssets:url.endsWith('/market-acc-infos')?{results:JSON.parse(init.body).marketAccs.map((h:string)=>({...accountBalances.results[0],marketAcc:h,positions:[]})),syncStatus:accountSync}:{results:[],syncStatus:accountSync})));
  const s=await readBorosAccount(borosRoot,3);expect(s.balances.every(b=>unpackAccount(b.handle).accountId===3)).toBe(true);expect(s.balances.some(b=>b.cash===1)).toBe(true);
 });
 it('does not turn omitted collateral responses into a zero account',async()=>{
  fetcher.mockImplementation(async(url:string)=>new Response(JSON.stringify(url.includes('/assets')?accountAssets:{results:[],syncStatus:accountSync})));
  await expect(readBorosAccount(borosRoot,0)).rejects.toThrow('missing account balances');
 });
 it('uses only simulation POST; converts collateral margin and signed short size without mistaking matched cost for a fee',async()=>{fetcher.mockResolvedValue(new Response(JSON.stringify({matched:{size:'-650000000000000000',rate:.08,cost:'900000000000000000'},postState:{marginRequired:'20000000000000000',liquidationApr:.12},priceImpact:.001,status:'FILLED',statusCode:'Succeed'})));const s=await readBorosPreview({marketAcc:borosHandle,marketId:1,side:1,size:toX18('.65'),tif:2,slippage:.005});expect(s).toMatchObject({matchedSize:.65,matchedApr:.08,margin:.02,liquidationApr:.12,success:true});expect(s).not.toHaveProperty('fees');expect(fetcher.mock.calls[0][0]).toContain('/simulations/place-order');expect(fetcher.mock.calls[0][1].method).toBe('POST');});
 it('does not present an unfilled FOK simulation as successful entry',async()=>{fetcher.mockResolvedValue(new Response(JSON.stringify({matched:{size:'0',rate:0},postState:{marginRequired:'0',liquidationApr:null},priceImpact:0,status:'NOT_FILLED',statusCode:'Succeed'})));const s=await readBorosPreview({marketAcc:borosHandle,marketId:1,side:0,size:toX18('1'),tif:2,slippage:.005});expect(s.success).toBe(false);expect(s.matchedSize).toBe(0);});
});

describe('lazy read-only Boros account history',()=>{
 const order={orderId:'o1',marketAcc:borosHandle,marketId:1,placedTimestamp:1800000000,placedSize:'2000000000000000000',impliedApr:.05,status:2,side:0};
 it('keeps completed order amounts separate from real executed trades and net PnL',async()=>{
  fetcher.mockImplementation(async(url:string)=>new Response(JSON.stringify(url.includes('orders-by-placed-time')?{results:[order],syncStatus:accountSync}:url.includes('active-positions')?accountPositions:{results:[{id:'trade1',marketAcc:borosHandle,marketId:1,timestamp:1800000000,side:0,tradeSize:'650000000000000000',tradeRate:.07,pnl:'-10000000000000000',fee:'1000000000000000'}],syncStatus:accountSync})));
  const o=await readBorosHistory(borosRoot,0,'order-history');expect(o.rows[0]).toMatchObject({size:2,status:'تکمیل‌شده',pnl:null});
  const t=await readBorosHistory(borosRoot,0,'trade-history');expect(t.rows).toHaveLength(1);expect(t.rows[0]).toMatchObject({size:.65,pnl:-.01,fee:.001,rate:.07});expect(t.complete).toBe(false);
  const calls=fetcher.mock.calls.length;await readBorosHistory(borosRoot,0,'trade-history');expect(fetcher).toHaveBeenCalledTimes(calls);
  expect(fetcher.mock.calls.every(([url,init])=>url.includes('/accounts/')&&init.method==='GET')).toBe(true);
 });
 it('rejects other-wallet history and preserves provider failures instead of pretending history is empty',async()=>{
  fetcher.mockResolvedValue(new Response(JSON.stringify({results:[{...order,marketAcc:packAccount('0x2222222222222222222222222222222222222222',0,2,CROSS)}]})));
  await expect(readBorosHistory(borosRoot,0,'order-history')).rejects.toThrow('account mismatch');
  fetcher.mockResolvedValue(new Response('',{status:429}));await expect(readBorosHistory(borosRoot,0,'order-history')).rejects.toThrow('سهمیه');
 });
});

describe('actionable readonly preview failures',()=>{
 it('retries a temporary simulation error once without ever submitting a trade',async()=>{
  fetcher.mockReset();fetcher.mockResolvedValueOnce(new Response('{}',{status:503})).mockResolvedValueOnce(new Response(JSON.stringify({matched:{size:'1000000000000000000',rate:.0857792615},postState:{marginRequired:'8052771003132609',liquidationApr:-.0193645316},priceImpact:.0008679072,status:'FILLED',statusCode:'Succeed'}),{status:201}));
  const result=await readBorosPreview({marketAcc:borosHandle,marketId:209,side:0,size:toX18('1'),tif:2,slippage:.0105});
  expect(result).toMatchObject({success:true,matchedSize:1,liquidationApr:-.0193645316});expect(fetcher).toHaveBeenCalledTimes(2);expect(fetcher.mock.calls.every(([u])=>u.endsWith('/simulations/place-order'))).toBe(true);
 });
 it.each([['INSUFFICIENT_MARGIN','مارجین آزاد'],['FOK_NOT_FILLED','کامل اجرا نمی‌شود'],['RATE_OUT_OF_RANGE','حد مجاز'],['MIN_ORDER_VALUE','حداقل سفارش']])('translates %s without exposing provider internals',async(code,message)=>{
  fetcher.mockResolvedValue(new Response(JSON.stringify({message:code,secret:'never show this'}),{status:400}));
  await expect(borosRead('/simulations/place-order',{})).rejects.toMatchObject({status:422,message:expect.stringContaining(message)});expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('does not retry quota exhaustion',async()=>{fetcher.mockResolvedValue(new Response('{}',{status:429}));await expect(borosRead('/simulations/place-order',{})).rejects.toMatchObject({status:429});expect(fetcher).toHaveBeenCalledTimes(1);});
});
