import { describe,it,expect } from 'vitest';
import { normalizePosition,normalizeTransaction,type LivePosition,type WalletTransaction } from './model';
import { visiblePosition,visibleTransaction,visibleWalletValue,trustedToken } from './visibility';
const eth:LivePosition={id:'eth',tokenId:'ethereum',chain:'ethereum',contract:null,name:'Ether',symbol:'ETH',icon:null,quantity:'1',value:3000,price:3000,type:'wallet',protocol:null,protocolIcon:null,group:null,receipt:null,displayable:true,spam:false};
const receive:WalletTransaction={id:'tx',hash:'hash',chain:'ethereum',type:'receive',status:'confirmed',minedAt:'2026-10-03',fee:0,transfers:[{direction:'in',symbol:'ETH',tokenId:'ethereum',quantity:'0.1',value:300,address:null,icon:null}]};
describe('shared display policy for portfolio, activity and asset pickers',()=>{
 it('retains genuine catalog tokens without provider icons, never trusts a ticker or icon alone',()=>{
  expect(visiblePosition(eth)).toBe(true);
  expect(visiblePosition({...eth,symbol:'USDT',contract:'0x'+'ab'.repeat(20),icon:'/logos/token-usdt.png',verified:false})).toBe(false);
  expect(trustedToken({...eth,contract:'0x'+'ab'.repeat(20),verified:true,icon:null})).toBe(false);
  expect(trustedToken({...eth,contract:'0x'+'ab'.repeat(20),verified:true,icon:'https://evil.example/a.png'})).toBe(false);
 });
 it('hides each network balance below $2 and keeps only genuine Robinhood ETH as the gas exception',()=>{
  expect(visiblePosition({...eth,value:1.99})).toBe(false);
  expect(visiblePosition({...eth,value:2})).toBe(true);
  expect(visiblePosition({...eth,value:0.001,chain:'robinhood'})).toBe(true);
  expect(visiblePosition({...eth,value:0.001,chain:'robinhood',symbol:'USDT',contract:'0x'+'ab'.repeat(20)})).toBe(false);
  expect(visiblePosition({...eth,spam:true,chain:'robinhood'})).toBe(false);
  expect(visiblePosition({...eth,quantity:'0',chain:'robinhood'})).toBe(false);
 });
 it('rejects missing native implementation identity instead of accepting fake ETH metadata',()=>{
  expect(visiblePosition({...eth,tokenId:'unknown',verified:false})).toBe(false);
 });
 it('does not include hidden spam or dust in the displayed wallet total',()=>{
  expect(visibleWalletValue({address:'a',fetchedAt:0,total:99999,change:null,positions:[eth,{...eth,id:'spam',spam:true,value:10000},{...eth,id:'dust',chain:'base',value:1}],chains:[],complete:true,unpriced:0})).toBe(3000);
 });
 it('hides dust receipts at exact decimal threshold while retaining outgoing and historical meaningful transfers',()=>{
  const tiny={...receive,transfers:receive.transfers.map(t=>({...t,quantity:'0.000001000000000000'}))};
  expect(visibleTransaction(tiny)).toBe(false);
  expect(visibleTransaction({...tiny,type:'send',transfers:tiny.transfers.map(t=>({...t,direction:'out'}))})).toBe(true);
  expect(visibleTransaction({...receive,transfers:receive.transfers.map(t=>({...t,quantity:'0.000001000000000001'}))})).toBe(true);
  expect(visibleTransaction(receive)).toBe(true);
  expect(visibleTransaction({...receive,transfers:receive.transfers.map(t=>({...t,quantity:'1',value:0.000001}))})).toBe(false);
 });
 it('honors provider trash flags and rejects spoof transfers without mutating raw FIFO history',()=>{
  const spoof={...receive,transfers:receive.transfers.map(t=>({...t,symbol:'USDT',contract:'0x'+'ab'.repeat(20),verified:false,icon:'/logos/token-usdt.png'}))};
  expect(visibleTransaction(spoof)).toBe(false);expect(spoof.transfers).toHaveLength(1);
  expect(visibleTransaction({...receive,spam:true})).toBe(false);
  expect(visibleTransaction({...receive,type:'approve',transfers:[]})).toBe(true);
 });
 it('normalizes real verification and trash flags from Zerion for both positions and transactions',()=>{
  const f={id:'token',flags:{verified:true},symbol:'TEST'};
  expect(normalizePosition({attributes:{fungible_info:f}}).verified).toBe(true);
  const tx=normalizeTransaction({attributes:{flags:{is_trash:true},transfers:[{fungible_info:f}]}});
  expect(tx.spam).toBe(true);expect(tx.transfers[0].verified).toBe(true);
 });
});
