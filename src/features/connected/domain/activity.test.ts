import {it,expect} from 'vitest';
import {walletActivities,validateLink,type Activity} from './activity';
import {normalizeTransaction} from './model';
it('preserves contract identity, nested acts and atomic quantities',()=>{
 const tx=normalizeTransaction({id:'x',attributes:{hash:'h',sent_to:'router',operation_type:'trade',transfers:[{direction:'in',quantity:{int:'1',decimals:18},fungible_info:{id:'asset',symbol:'ETH',implementations:[{chain_id:'ethereum',address:'contract'}]}}],acts:[{id:'1',type:'trade',application_metadata:{contract_address:'router',name:'Arcus'}}]},relationships:{chain:{data:{id:'ethereum'}}}});
 expect(tx.transfers[0]).toMatchObject({tokenId:'asset',contract:'contract',quantity:'0.000000000000000001'});expect(tx.acts?.[0].contract).toBe('router');
 expect(walletActivities([{label:'one',address:'a',history:[tx]},{label:'two',address:'b',history:[tx]}])).toHaveLength(1);
});
it('does not link an Arcus withdrawal directly to a bridge and rejects failed legs',()=>{
 const from:Activity={key:'a',provider:'arcus',kind:'WITHDRAWAL',at:1,status:'APPLIED',label:'Arcus'};
 const to:Activity={key:'b',provider:'zerion',kind:'receive',at:2,status:'confirmed',label:'Wallet',tx:{id:'b',hash:'b',chain:'ethereum',type:'receive',status:'confirmed',minedAt:'',fee:0,transfers:[{direction:'in',symbol:'USDC',quantity:'1',value:1,address:null,icon:null}]}};
 expect(validateLink(from,to,'bridge')).not.toBeNull();expect(validateLink(from,to,'arcus_withdrawal')).toBeNull();expect(validateLink(from,{...to,status:'failed'},'arcus_withdrawal')).not.toBeNull();
});
