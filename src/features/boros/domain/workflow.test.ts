import {describe,it,expect} from 'vitest';
import {compareWithBudget,marketWarnings} from './workflow';
import {mapMarket} from '../data/borosService';
import {borosRaw} from '../../../../tests/fixtures/boros';
const now=1_800_000_000_000;
const market={...mapMarket(borosRaw,now),snapshotAt:now,marketId:1,tokenId:2,collateralPriceUsd:3000,status:'GOOD' as const,isUiWhitelisted:true,maturity:now/1000+30*86400,kIM:.5,kMM:.06,marginFloor:.06,ytmFloor:5/365,markApr:.08,floatingApr:.10,dailyVolatility:.002,volume24h:1000,notionalOI:10000,bestBid:.079,bestAsk:.081};
const costs={feesUsd:1,gasUsd:2,slippageUsd:0};
describe('shared-budget comparisons',()=>{
 it('uses the same capital and costs but different contract sizes for different maturities',()=>{const a=compareWithBudget(market,'long',100,50,costs,now/1000)!;const b=compareWithBudget({...market,marketId:2,maturity:now/1000+60*86400},'long',100,50,costs,now/1000)!;expect(a.sizeYu).toBeGreaterThan(b.sizeYu);expect(a.result.margin).toBeCloseTo(b.result.margin);expect(a.result.costs).toBeGreaterThan(3);expect(a.result.costs).toBeLessThan(100);});
 it('retains losing short alternatives instead of silently excluding them from comparison',()=>{expect(compareWithBudget(market,'short',100,50,costs,now/1000)!.result.net).toBeLessThan(0);});
 it('rejects unknown costs, excessive allocation, expired markets and unavailable price',()=>{expect(compareWithBudget(market,'long',100,50,{...costs,gasUsd:null},now/1000)).toBeNull();expect(compareWithBudget(market,'long',100,101,costs,now/1000)).toBeNull();expect(compareWithBudget({...market,maturity:now/1000},'long',100,50,costs,now/1000)).toBeNull();expect(compareWithBudget({...market,collateralPriceUsd:0},'long',100,50,costs,now/1000)).toBeNull();});
});
describe('contextual market warnings',()=>{
 it('marks stale or missing snapshots unknown rather than safe',()=>{expect(marketWarnings({...market,snapshotAt:now-300001},now)[0].tone).toBe('stale');expect(marketWarnings({...market,snapshotAt:undefined},now)[0].tone).toBe('stale');});
 it('distinguishes missing volatility and liquidity from low-risk evidence',()=>{const warnings=marketWarnings({...market,dailyVolatility:null,volume24h:0},now);expect(warnings.map(w=>w.text)).toContain('دادهٔ نوسان در دسترس نیست');expect(warnings.map(w=>w.text)).toContain('نقدشوندگی تأیید نشده است');});
 it('adds near-maturity and observed volatility flags without a probability score',()=>{expect(marketWarnings({...market,maturity:now/1000+86400,dailyVolatility:.02},now)).toHaveLength(2);});
});
