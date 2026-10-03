import {describe,it,expect} from 'vitest';
import {normalizeChart} from './chart';
import {positionRows} from './positions';
import {visibleTransaction} from './visibility';
import {filterActivities} from './activityView';
import {normalizeTransaction,type LivePosition,type WalletTransaction} from './model';
const eth:LivePosition={id:'eth',tokenId:'ethereum',chain:'ethereum',contract:null,name:'Ether',symbol:'ETH',icon:null,quantity:'1',value:3000,price:3000,type:'wallet',protocol:null,protocolIcon:null,group:null,receipt:null,displayable:true,spam:false};
const usdt0='0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9';
const tx:WalletTransaction={id:'send',hash:'0xhash',chain:'arbitrum',type:'send',status:'confirmed',minedAt:'2026-10-02T00:00:00Z',fee:0,transfers:[{direction:'out',symbol:'USDT0',tokenId:'usdt0',contract:usdt0,quantity:'140',value:139.89,address:'0xrecipient',icon:'/logos/token-usdt0.svg',verified:true}]};
describe('behaviour captured by Zerion reference screenshots',()=>{
 it('hides both 0.000014 and 0.0001 USDT0 receipts without hiding the legitimate outgoing payment',()=>{
  for(const quantity of ['0.000014','0.0001'])expect(visibleTransaction({...tx,type:'receive',transfers:tx.transfers.map(t=>({...t,direction:'in',quantity,value:Number(quantity)}))})).toBe(false);
  expect(visibleTransaction(tx)).toBe(true);
  expect(visibleTransaction({...tx,chain:'robinhood',type:'receive',transfers:[{direction:'in',symbol:'ETH',tokenId:'ethereum',quantity:'0.00073',value:1.97,contract:null,icon:null,address:null}]})).toBe(true);
 });
 it('rejects the fake unpriced USDT send rather than identifying it by its name',()=>{
  expect(visibleTransaction({...tx,transfers:tx.transfers.map(t=>({...t,symbol:'USDT',contract:'0x'+'aa'.repeat(20),verified:false,icon:null,value:null}))})).toBe(false);
 });
 it('groups the same provider asset across chains with exact quantities and an expandable breakdown',()=>{
  const rows=positionRows([eth,{...eth,id:'base',chain:'base',quantity:'0.200000000000000001',value:600},{...eth,id:'dust',chain:'arbitrum',quantity:'0.0003',value:0.9}],true);
  expect(rows).toHaveLength(1);expect(rows[0].quantity).toBe('1.200000000000000001');expect(rows[0].value).toBe(3600);expect(rows[0].networks).toEqual(['ethereum','base']);expect(rows[0].legs).toHaveLength(2);
 });
 it('keeps tokens with the same ticker and different provider identities separate',()=>{
  expect(positionRows([eth,{...eth,id:'other',tokenId:'other',chain:'base',verified:true}],true)).toHaveLength(2);
 });
 it('preserves real approval metadata without treating it as a purchase transfer',()=>{
  const approved=normalizeTransaction({attributes:{operation_type:'approve',approvals:[{spender:'0xspender',quantity:{numeric:'147.5'},fungible_info:{id:'usdt0',symbol:'USDT0',flags:{verified:true},icon:{url:'/logos/token-usdt0.svg'},implementations:[{chain_id:'arbitrum',address:usdt0}]}}]},relationships:{chain:{data:{id:'arbitrum'}}}});
  expect(approved.transfers).toEqual([]);expect(approved.approvals?.[0].address).toBe('0xspender');expect(visibleTransaction(approved)).toBe(true);
 });
 it('searches addresses and filters types/assets in received history without guessing unreceived pages',()=>{
  const row={key:'send',provider:'zerion' as const,label:'کیف',at:Date.parse(tx.minedAt),status:'confirmed',kind:'send',tx};
  const f={search:'recipient',kind:'send',asset:'arbitrum:usdt0',date:''};
  expect(filterActivities([row],f)).toEqual([row]);expect(filterActivities([row],{...f,kind:'receive'})).toEqual([]);
 });
 it('normalizes actual chart timestamps, sorts/deduplicates and never fabricates malformed values',()=>{
  const chart=normalizeChart({data:{attributes:{points:[[2,20],[1,10],[2,22],['3',30],[4,null],[5,-1],[NaN,5]]}}});
  expect(chart.points).toEqual([[1000,10],[2000,22]]);expect(normalizeChart({}).points).toEqual([]);
 });
});
