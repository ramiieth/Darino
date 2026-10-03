import { describe, it, expect } from 'vitest';
import { reconcileBasis } from './currentBasis';
import { costSummary } from './summary';
import type { ConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
const asset={key:'fungible:ethereum',tokenId:'ethereum',symbol:'ETH',name:'اتریوم',chain:'ethereum',contract:null,icon:'/logos/token-eth.svg'};
const p=(qty='.65',value=1950)=>({wallets:[{holding:{address:'0x'+'11'.repeat(20)},state:{data:{complete:true,fetchedAt:900,positions:[{...asset,id:'eth',quantity:qty,value,price:3000,type:'wallet',verified:true,spam:false,displayable:true}]},history:[],historyLoaded:false,next:null,historyError:null},stale:false}],arcus:[],partial:false,stale:false,total:value}) as unknown as ConnectedPortfolio;
describe('current-balance purchase reconciliation',()=>{
 it('derives average cost from the total and authoritative fractional balance without old-history dependency',()=>{
  const book=reconcileBasis(undefined,asset,'.65','1625',1000);const row=costSummary(p(),book).rows[0];
  expect(row.avgCost).toBe(2500);expect(row.basis).toBe(1625);expect(row.pnl).toBe(325);expect(row.pnlPct).toBe(20);expect(row.status).toBe('ready');
 });
 it('preserves old FIFO lots and prior reconciliation revisions',()=>{
  const original={version:1 as const,asOf:100,lots:[{id:'old',asset,quantity:'1',unitCost:'1000',fee:'0',at:50,source:'legacy'}],legacyRetired:true,migrationConfirmed:true};
  const first=reconcileBasis(original,asset,'.65','1625',1000),next=reconcileBasis(first,asset,'.65','1300',2000);
  expect(next.lots).toEqual(original.lots);expect(next.asOf).toBe(100);expect(next.basisHistory?.[0].total).toBe('1625');expect(first.currentBasis?.[asset.key].total).toBe('1625');
 });
 it('does not invent acquisition costs after balance increases',()=>{
  const book=reconcileBasis(undefined,asset,'.65','1625',1000);const row=costSummary(p('1',3000),book).rows[0];
  expect(row.valuation.unknown).toBe('0.35');expect(row.pnl).toBeNull();
 });
 it('rejects invalid total, quantity and corrupt persisted data without crashing the dashboard',()=>{
  expect(()=>reconcileBasis(undefined,asset,'0','1',1000)).toThrow();expect(()=>reconcileBasis(undefined,asset,'1','-1',1000)).toThrow();
  const book=reconcileBasis(undefined,asset,'.65','1625',1000);book.currentBasis![asset.key].quantity='bad';expect(costSummary(p(),book).rows[0].pnl).toBeNull();
 });
});
