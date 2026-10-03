import {describe,it,expect} from 'vitest';
import {quoteUsable} from './quoteValidity';
import type {OfficialPreview} from '@/shared/boros/account';
const now=1_800_000_000_000;
const q:OfficialPreview={fetchedAt:now,handle:'0x'+'11'.repeat(26),marketId:1,side:'short',requestedSize:4,matchedSize:4,matchedApr:.0731,margin:.014,liquidationApr:.1011,priceImpact:.0028,status:'FILLED',success:true};
const check=(quote=q,scope=true,available=true,id=1,side:'long'|'short'='short',size=4,maturity=now/1000+86400,time=now)=>quoteUsable(quote,scope,available,id,side,size,maturity,time);
describe('execution quote lifecycle',()=>{
 it('accepts a current quote for exactly this account and order',()=>expect(check()).toBe(true));
 it('rejects expired and future-dated quotes',()=>{expect(check({...q,fetchedAt:now-60000})).toBe(false);expect(check({...q,fetchedAt:now+1})).toBe(false);});
 it('invalidates changed balances/accounts, unavailable collateral, size and side',()=>{expect(check(q,false)).toBe(false);expect(check(q,true,false)).toBe(false);expect(check(q,true,true,1,'short',2)).toBe(false);expect(check(q,true,true,1,'long')).toBe(false);});
 it('rejects expired markets, wrong markets, failed and missing execution rates',()=>{expect(check(q,true,true,1,'short',4,now/1000)).toBe(false);expect(check(q,true,true,2)).toBe(false);expect(check({...q,success:false})).toBe(false);expect(check({...q,matchedApr:null})).toBe(false);});
});
