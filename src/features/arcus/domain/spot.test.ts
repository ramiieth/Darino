import {it,expect} from 'vitest';
import {spotPositions,spotTransaction} from './spot';
import {normalizePosition,normalizeTransaction} from '@/features/connected/domain/model';
it('matches spot balances by chain and contract, not symbol or perpetual notional',()=>{
 const p=normalizePosition({id:'a',attributes:{position_type:'wallet',fungible_info:{symbol:'ABC',implementations:[{chain_id:'robinhood',address:'0xabc'}]}},relationships:{chain:{data:{id:'robinhood'}}}});
 const tokens=[{address:'0xabc',wrappedTokenAddress:null,symbol:'ABC',name:'ABC',decimals:18,source:'arcus',verified:true}];
 expect(spotPositions([p,{...p,id:'b',chain:'ethereum'},{...p,id:'c',type:'loan'}],tokens)).toEqual([p]);
 const tx=normalizeTransaction({id:'x',attributes:{sent_to:'0x4262efBd176F02824af27010bEa218429c33c7E8'},relationships:{chain:{data:{id:'robinhood'}}}});
 expect(spotTransaction(tx)).toBe(true);expect(spotTransaction({...tx,chain:'ethereum'})).toBe(false);
});
