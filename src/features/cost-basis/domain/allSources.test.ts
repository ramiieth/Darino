import { describe,it,expect } from 'vitest';
import { allSourceCostSummary } from './allSources';
import { reconcileBasis } from './currentBasis';
import { platformPositions } from './platformPositions';
import type { ConnectedPortfolio } from '@/features/connected/data/useConnectedPortfolio';
import type { BorosAccountSnapshot } from '@/shared/boros/account';
const now=Date.now(),address='0x'+'11'.repeat(20),handle=address+'000002ffffff';
const pos={id:'eth',tokenId:'ethereum',symbol:'ETH',name:'اتریوم',chain:'ethereum',contract:null,icon:'/logos/token-eth.svg',quantity:'.65',price:3000,value:1950,type:'wallet',verified:true,spam:false,displayable:true,protocol:null,protocolIcon:null,group:null,receipt:null};
const wallet={holding:{address,label:'کیف پول'},state:{data:{positions:[pos],complete:true,fetchedAt:now},history:[],historyLoaded:true,historyError:null,next:null},stale:false};
const arcus={holding:{label:'حساب اصلی',arcus:{address,accountIndex:0,env:'mainnet'}},state:{account:{data:{netQuoteBalance:'100',equity:'150'},fetchedAt:now,error:null},positions:{data:[{marketId:1,marketDisplayName:'ETH-USD',side:'LONG',size:'2',averageEntryPrice:'2500',markPx:'3000',unrealizedPnl:'50',marginUsed:'30'}],fetchedAt:now,error:null}},stale:false};
const portfolio=()=>structuredClone({wallets:[wallet],arcus:[arcus],total:2100,partial:false,stale:false}) as unknown as ConnectedPortfolio;
const boros={root:address,accountId:0,fetchedAt:now,syncedAt:now,assets:[{tokenId:2,symbol:'WETH',priceUsd:3000,logo:'/logos/token-eth.svg'}],balances:[{handle,tokenId:2,marketId:0xffffff,cash:.65,equity:.85,margin:.1,freeMargin:.75,maintenanceBuffer:.8}],positions:[{handle,marketId:128,tokenId:2,side:'long',size:20,fixedApr:.08,unrealized:.01,realizedTrade:.02,settlement:.03,liquidationApr:.12,matured:false}],orders:[],settlements:[],transfers:[],partial:false,historyComplete:true,errors:[]} as BorosAccountSnapshot;
describe('editable cost basis across real account sources',()=>{
 it('uses actual collateral cash and quote credit, never equity or derivative notional as purchased crypto',()=>{
  const s=allSourceCostSummary(portfolio(),undefined,[],{data:boros,stale:false});expect(s.rows).toHaveLength(3);
  expect(s.rows.find(r=>r.provider==='arcus')?.quantity.toString()).toBe('100');expect(s.rows.find(r=>r.provider==='boros')?.quantity.toString()).toBe('0.65');expect(s.rows.find(r=>r.provider==='boros')?.value.toNumber()).toBe(1950);expect(s.rows.every(r=>r.share===null)).toBe(true);
 });
 it('keeps same-symbol costs scoped to each account and derives average from the total',()=>{
  const s=allSourceCostSummary(portfolio(),undefined,[],{data:boros,stale:false});let book;
  for(const r of s.rows)book=reconcileBasis(book,r.asset,r.quantity.toString(),r.provider==='arcus'?'90':'1625',now);
  const rows=allSourceCostSummary(portfolio(),book,[],{data:boros,stale:false}).rows;
  expect(rows.filter(r=>r.provider!=='arcus').map(r=>r.pnl)).toEqual([325,325]);expect(rows.find(r=>r.provider==='arcus')?.pnl).toBe(10);expect(new Set(rows.map(r=>r.asset.key)).size).toBe(3);
  expect(rows.find(r=>r.provider==='boros')?.avgCost).toBe(2500);
 });
 it('requires reconciliation after platform collateral changes and suppresses stale PnL',()=>{
  const r=allSourceCostSummary(portfolio(),undefined,[],{data:boros,stale:false}).rows.find(r=>r.provider==='boros')!;
  const book=reconcileBasis(undefined,r.asset,'.65','1625',now);
  const changed={...boros,balances:[{...boros.balances[0],cash:1}]};expect(allSourceCostSummary(portfolio(),book,[],{data:changed,stale:false}).rows.find(r=>r.provider==='boros')).toMatchObject({pnl:null,status:'mismatch'});
  expect(allSourceCostSummary(portfolio(),book,[],{data:boros,stale:true}).rows.find(r=>r.provider==='boros')?.pnl).toBeNull();
 });
 it('includes verified wallet cash while continuing to hide spam and exclude testnet',()=>{
  const p=portfolio();p.wallets[0].state!.data!.positions.push({...pos,id:'usdc',tokenId:'usd-coin',symbol:'USDC',quantity:'100',value:100,price:1});p.arcus[0].holding.arcus!.env='testnet';
  const rows=allSourceCostSummary(p,undefined,[],{data:null,stale:false}).rows;expect(rows.map(r=>r.asset.symbol)).toEqual(['ETH','USDC']);
 });
 it('deduplicates Arcus spot wallets already connected to the portfolio',()=>{
  const p=portfolio();const rows=allSourceCostSummary(p,undefined,[],{data:null,stale:false},p.wallets).rows;expect(rows.filter(r=>r.provider==='wallet')).toHaveLength(1);
 });
 it('shows derivative entry and PnL as API fields without creating cost-basis holdings',()=>{
  const rows=platformPositions(portfolio(),{data:boros,stale:false},[]);expect(rows[0]).toMatchObject({size:2,entry:2500,pnl:50,rate:false});expect(rows[1]).toMatchObject({size:20,entry:8,pnl:30,rate:true});
 });
});
