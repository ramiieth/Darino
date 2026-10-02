// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useConnectedPortfolio } from './useConnectedPortfolio';
import { useConnectedStore, clearConnectedMemory } from './store';
const fixtures = vi.hoisted(() => ({ holdings: [] as any[], enabled: [] as string[], arcus: new Map<string, any>() }));
vi.mock('@/features/custody/data/useCustody', () => ({ useCustody: () => ({holdings:fixtures.holdings,loaded:true}) }));
vi.mock('@/features/custody/data/repository', () => ({ getPref: () => ({value:fixtures.enabled}) }));
vi.mock('@/features/arcus/data/useArcusAccount', () => ({
  accountKey: (r:any) => `${r.env}:${r.address.toLowerCase()}:${r.accountIndex}`,
  getArcusState: (k:string) => fixtures.arcus.get(k), refreshSummary:vi.fn(), useArcusStoreVersion:vi.fn(),
  isStale: (r:any) => !!r.error
}));
const address='0x'+'ab'.repeat(20);
beforeEach(() => { fixtures.holdings=[]; fixtures.enabled=[]; fixtures.arcus.clear(); clearConnectedMemory(); vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('test network disabled');})); });
afterEach(() => {cleanup();vi.unstubAllGlobals();});
describe('مجموع واقعی پرتفولیو', () => {
  it('کیف پول و حساب آرکوس تکراری، تست‌نت و موجودی دستی دوباره شمرده نمی‌شوند', () => {
    fixtures.holdings=[{id:'w1',kind:'wallet',address},{id:'w2',kind:'wallet',address:address.toUpperCase().replace('0X','0x')},{id:'cash',kind:'manual',value:900000},{id:'a1',kind:'arcus',arcus:{env:'mainnet',address,accountIndex:0}},{id:'a2',kind:'arcus',arcus:{env:'mainnet',address,accountIndex:0}},{id:'test',kind:'arcus',arcus:{env:'testnet',address,accountIndex:0}}];
    fixtures.enabled=['w1','w2'];
    useConnectedStore.setState({wallets:{[address]:{data:{address,total:10.1,fetchedAt:Date.now(),complete:true,unpriced:0,positions:[],chains:[],change:null},loading:false,error:null,history:[],historyLoaded:false,historyAt:null,next:null,historyLoading:false,historyError:null}}});
    for(const env of ['mainnet','testnet']) fixtures.arcus.set(`${env}:${address}:0`,{account:{data:{equity:env==='mainnet'?'2.2':'100000'},fetchedAt:Date.now(),error:null},positions:{data:[],fetchedAt:Date.now(),error:null}});
    const {result}=renderHook(()=>useConnectedPortfolio());
    expect(result.current.total).toBe(12.3);
    expect(result.current.wallets).toHaveLength(1);
    expect(result.current.arcus).toHaveLength(2);
    expect(result.current.partial).toBe(false);
  });
  it('دارایی دریافت‌نشده صفر فرض نمی‌شود و نبود جزئیات آرکوس به تحلیل اعلام می‌شود', () => {
    fixtures.holdings=[{id:'a',kind:'arcus',arcus:{env:'mainnet',address,accountIndex:0}}];
    const {result,rerender}=renderHook(()=>useConnectedPortfolio());
    expect(result.current.total).toBeNull(); expect(result.current.partial).toBe(true);
    fixtures.arcus.set(`mainnet:${address}:0`,{account:{data:{equity:'42'},fetchedAt:Date.now(),error:null},positions:{data:[],fetchedAt:Date.now(),error:new Error('unavailable')}});
    rerender();
    expect(result.current.total).toBe(42); expect(result.current.partial).toBe(true); expect(result.current.stale).toBe(true);
  });
});
