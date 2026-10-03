import {it,expect} from 'vitest';
import {mapMarket} from '../data/borosService';
import {borosRaw} from '../../../../tests/fixtures/boros';
import {entryCandidates,recommendationCosts,distinctBest,previewBudgetRemaining} from './recommendations';
import {FeeCalculator} from './engine/fees';
const now=1800000000;
const m={...mapMarket(borosRaw,now*1000),tokenId:2,status:'GOOD' as const,isUiWhitelisted:true,snapshotAt:now*1000,maturity:now+20*86400,collateralPriceUsd:3000,markApr:.08,floatingApr:.12,kIM:.5,kMM:.06,marginFloor:.06,ytmFloor:5/365,volume24h:1000000,notionalOI:1000000,bestBid:.079,bestAsk:.081,assetMarkPrice:3000,fundingHistory:Array.from({length:30},(_,i)=>({ts:now-i*86400,c:.11}))};
const costs={feesUsd:1,gasUsd:.2,slippageUsd:0};
it('filters collateral, status, maturity and stale data; never substitutes hypothetical cash',()=>{
 const rows=entryCandidates([m,{...m,marketId:2,tokenId:3},{...m,marketId:3,maturity:now+60*86400},{...m,marketId:4,status:'PAUSED'},{...m,marketId:5,snapshotAt:(now-600)*1000}],2,300,50,30,costs,now);
 expect(rows.length).toBeGreaterThan(0);expect(rows.every(r=>r.m.marketId===m.marketId)).toBe(true);
 expect(entryCandidates([m],2,0,50,30,costs,now)).toEqual([]);expect(entryCandidates([m],2,300,50,30,{...costs,feesUsd:null},now)).toEqual([]);
});
it('calculates each market fee for its own size and maturity and reserves costs before allocation',()=>{
 const first=entryCandidates([m],2,300,50,30,costs,now)[0];expect(first).toBeTruthy();
 const fee=FeeCalculator.calc({m,size:first.sizeYu,unitPriceUsd:3000,nowSec:now}).total;
 expect(first.result.costs).toBeCloseTo(1.2+fee);expect(first.result.margin).toBeCloseTo((300-first.result.costs!)*.5);
 expect(first.result.net).toBeCloseTo(first.result.preview.expectedSettlementPnl-1.2-fee);
 const longer={...m,maturity:now+30*86400};expect(recommendationCosts(longer,1,costs,true,now).feesUsd).toBeGreaterThan(recommendationCosts(m,1,costs,true,now).feesUsd!);
});
it('ranks net profit first, then sooner maturity, and returns distinct markets rather than both sides',()=>{
 const row=(id:number,net:number,days:number,adverse:number)=>({candidate:{m:{...m,marketId:id,maturity:now+days*86400}},net,adverse});
 const rows=distinctBest([row(1,10,30,5),row(1,11,30,1),row(2,15,30,-2),row(3,15,10,-4),row(4,5,2,5)]);
 expect(rows.map(r=>r.candidate.m.marketId)).toEqual([3,2,1]);
});

it('reserves immediate execution losses without treating paper gains as spendable cash',()=>{
 expect(previewBudgetRemaining(100,50,2,-10)).toBe(38);expect(previewBudgetRemaining(100,50,2,10)).toBe(48);
 expect(previewBudgetRemaining(100,90,2,-10)).toBeLessThan(0);
});
