import {describe,it,expect} from 'vitest';
import {replayCost,valueCost,verifiedCash,type CostBook} from './book';
import type {WalletTransaction} from '@/features/connected/domain/model';
const book:CostBook={version:1,asOf:1000,migrationConfirmed:true,legacyRetired:true,lots:[{id:'a',asset:{key:'fungible:eth',tokenId:'eth',symbol:'ETH',name:'Ether',chain:'ethereum',contract:null,icon:null},quantity:'2',unitCost:'1000',fee:'0',at:0,source:'test'},{id:'b',asset:{key:'fungible:eth',tokenId:'eth',symbol:'ETH',name:'Ether',chain:'ethereum',contract:null,icon:null},quantity:'1',unitCost:'2000',fee:'0',at:100,source:'test'}]};
const tx:WalletTransaction={id:'t',hash:'0x1',chain:'ethereum',type:'trade',status:'confirmed',minedAt:new Date(2000).toISOString(),fee:10,transfers:[{direction:'out',symbol:'ETH',tokenId:'eth',quantity:'2.5',value:7500,address:null,icon:null},{direction:'in',symbol:'USDC',tokenId:'usdc',contract:'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',quantity:'7500',value:7500,address:null,icon:null}]};
describe('cost basis from real activity',()=>{
 it('consumes oldest lots once, preserves precision and deducts fee once',()=>{const r=replayCost(book,[tx,tx]);expect(r.realized).toBe('4490');expect(r.lots.map(l=>l.quantity)).toEqual(['0','0.5']);expect(book.lots[0].quantity).toBe('2');});
 it('never treats bridge or internal transfer as a sale',()=>{expect(replayCost(book,[{...tx,type:'send'}]).realized).toBe('0');expect(replayCost(book,[{...tx,type:'receive'}]).lots).toEqual(book.lots);});
 it('stops at an unpriced trade, never silently uses future lots',()=>{const bad={...tx,fee:null};const r=replayCost(book,[bad,{...tx,id:'later',hash:'later',minedAt:new Date(3000).toISOString()}]);expect(r.issues).toHaveLength(2);expect(r.processed).toEqual([]);expect(r.lots).toEqual(book.lots);});
 it('does not identify a fake stablecoin by its ticker',()=>{expect(verifiedCash('ethereum','0x'+'ab'.repeat(20))).toBe(false);expect(verifiedCash('ethereum',tx.transfers[1].contract)).toBe(true);});
 it('reports uncovered quantity and suppresses PnL when manual lots exceed real balance',()=>{expect(valueCost(book.lots,'4',3000).unknown).toBe('1');expect(valueCost(book.lots,'1',3000).pnl).toBeNull();expect(valueCost([],'1',3000).pnl).toBeNull();});
});
it('preserves the original FIFO date and entire basis across a confirmed bridge',()=>{
 const source={...tx,id:'source',hash:'source',type:'send',transfers:[{...tx.transfers[0],quantity:'1'}]};
 const target={...tx,id:'target',hash:'target',chain:'base',type:'receive',minedAt:new Date(3000).toISOString(),transfers:[{...tx.transfers[0],direction:'in',quantity:'0.99'}]};
 const r=replayCost(book,[source,target],[{id:'bridge',from:'chain:ethereum:source',to:'chain:base:target',kind:'bridge',at:3000}]);
 expect(r.realized).toBe('0');expect(r.issues).toEqual([]);const added=r.lots.find(l=>l.asset.chain==='base');expect(added?.quantity).toBe('0.99');expect(added?.at).toBe(0);expect(added&&Number(added.unitCost)*Number(added.quantity)).toBeCloseTo(1000);
});

it('cannot finance a sale using lots acquired after its transaction date',()=>{
 const r=replayCost({...book,lots:book.lots.map(l=>({...l,at:3000}))},[tx]);
 expect(r.realized).toBe('0');expect(r.processed).toEqual([]);expect(r.issues[0].reason).toContain('کامل نیست');
});

it('displaying fewer dust units does not falsely report excess FIFO inventory',()=>{
 const v=valueCost(book.lots,'2.99',3000,'3');expect(v.excess).toBe('0');expect(v.pnl).toBe(4990);
});
it('provider-marked spam cannot realize a sale or consume genuine purchase lots',()=>{
 const r=replayCost(book,[{...tx,spam:true}]);expect(r.realized).toBe('0');expect(r.lots).toEqual(book.lots);
});
it('does not claim full PnL when only part of the balance has a purchase cost',()=>{expect(valueCost(book.lots,'4',3000).pnl).toBeNull();});
it('a missing ETH trade does not stop a fully known purchase on another asset',()=>{
 const other={...tx,id:'sol',hash:'sol',minedAt:new Date(3000).toISOString(),transfers:[{...tx.transfers[1],direction:'out'},{...tx.transfers[0],direction:'in',symbol:'SOL',tokenId:'solana',quantity:'1',value:100}]};
 const r=replayCost(book,[{...tx,fee:null},other]);expect(r.lots.some(l=>l.asset.key==='fungible:solana')).toBe(true);expect(r.issues[0].assetKeys).toContain('fungible:eth');
});
it('classifies provider-verified cash by canonical identity and keeps fake tickers out',()=>{
 expect(verifiedCash('solana','mint',{verified:true,tokenId:'usd-coin',symbol:'USDC'})).toBe(true);
 expect(verifiedCash('solana','mint',{verified:true,tokenId:'fake',symbol:'USDC'})).toBe(false);
 expect(verifiedCash('arc',null)).toBe(true);
});
it('consumes gas units only for the wallet that paid, without treating approvals as sales',()=>{
 const address='0x'+'ab'.repeat(20),feeToken={...tx.transfers[0],quantity:'0.01',value:30};
 const approve={...tx,type:'approve',from:address,feeToken,transfers:[]};
 const paid=replayCost(book,[approve],[],[address]);expect(paid.lots[0].quantity).toBe('1.99');expect(paid.realized).toBe('0');
 expect(replayCost(book,[{...approve,from:'other'}],[],[address]).lots[0].quantity).toBe('2');
});
it('rejects malformed old purchase rows without crashing other assets',()=>{
 const r=replayCost({...book,lots:[{...book.lots[0],unitCost:'invalid'},book.lots[1]]},[]);expect(r.lots).toHaveLength(1);expect(r.issues[0].reason).toContain('معتبر نیست');
});
it('reports the known portion separately without presenting it as the full PnL',()=>{
 const value=valueCost(book.lots,'4',3000);expect(value.pnl).toBeNull();expect(value.partialPnl).toBe(5000);expect(value.unknown).toBe('1');
});
it('automatically updates ETH cost basis and weighted average across 4 Uniswap swaps (including multi-hop and WETH)',()=>{
 const ethAsset={key:'fungible:ethereum',tokenId:'ethereum',symbol:'ETH',name:'Ether',chain:'ethereum',contract:null,icon:null};
 const initialBook:CostBook={
  version:1,
  asOf:1000,
  migrationConfirmed:true,
  legacyRetired:true,
  lots:[{id:'current:fungible:ethereum',asset:ethAsset,quantity:'3.33',unitCost:'2820',fee:'0',at:1000,source:'current-balance-confirmed'}]
 };
 const usdcOut={direction:'out',symbol:'USDC',tokenId:'usdc',contract:'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',quantity:'500',value:500,address:null,icon:null,verified:true};
 const swaps:WalletTransaction[]=[
  {id:'s1',hash:'0x11',chain:'ethereum',type:'trade',status:'confirmed',minedAt:new Date(2000).toISOString(),fee:1,transfers:[usdcOut,{direction:'in',symbol:'ETH',tokenId:'ethereum',quantity:'0.2',value:500,address:null,icon:null,verified:true}]},
  {id:'s2',hash:'0x12',chain:'ethereum',type:'trade',status:'confirmed',minedAt:new Date(3000).toISOString(),fee:1,acts:[{id:'a1',type:'trade',protocol:'Uniswap',contract:'0x1'},{id:'a2',type:'trade',protocol:'Uniswap',contract:'0x2'}],transfers:[usdcOut,{direction:'in',symbol:'WETH',tokenId:'weth',quantity:'0.2',value:500,address:null,icon:null,verified:true}]},
  {id:'s3',hash:'0x13',chain:'base',type:'trade',status:'confirmed',minedAt:new Date(4000).toISOString(),fee:0.5,transfers:[{...usdcOut,chain:'base',contract:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'},{direction:'in',symbol:'ETH',tokenId:'',contract:null,quantity:'0.1',value:240,address:null,icon:null,verified:true},{direction:'in',symbol:'WETH',tokenId:'weth',quantity:'0.1',value:260,address:null,icon:null,verified:true}]},
  {id:'s4',hash:'0x14',chain:'arbitrum',type:'trade',status:'confirmed',minedAt:new Date(5000).toISOString(),fee:0.5,transfers:[{...usdcOut,chain:'arbitrum',contract:'0xaf88d065e77c8cc2239327c5edb3a432268e5831'},{direction:'in',symbol:'ETH',tokenId:'ethereum',quantity:'0.2',value:500,address:null,icon:null,verified:true}]}
 ];
 const r=replayCost(initialBook,swaps);
 expect(r.issues).toEqual([]);
 expect(r.processed).toHaveLength(4);
 const v=valueCost(r.lots.filter(l=>l.asset.key==='fungible:ethereum'),'4.13',3000);
 expect(v.covered).toBe('4.13');
 expect(v.unknown).toBe('0');
 expect(v.basis).toBeCloseTo(11393.6,2);
 expect(v.pnl).not.toBeNull();
});
