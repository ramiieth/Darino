// @vitest-environment node
import { expect,it,vi,afterEach } from 'vitest';
import { normalizeBitcoinTransaction,getBitcoinWallet,getBitcoinTransactions } from '../../api/_bitcoin';
const address='1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
afterEach(()=>vi.unstubAllGlobals());
it('removes change and the miner fee from the outgoing payment amount',()=>{
 const tx={txid:'ab'.repeat(32),vin:[{prevout:{scriptpubkey_address:address,value:100000000}}],vout:[{scriptpubkey_address:address,value:49990000},{scriptpubkey_address:'other',value:50000000}],fee:10000,status:{confirmed:true,block_time:1000}};
 const row=normalizeBitcoinTransaction(tx,address);expect(row.transfers[0].quantity).toBe('0.5');expect(row.feeToken?.quantity).toBe('0.0001');expect(row.fee).toBeNull();expect(row.transfers[0].value).toBeNull();expect(row.type).toBe('send');
});
it('does not assign the entire fee of a multi-input transaction to one address',()=>{
 const row=normalizeBitcoinTransaction({txid:'bc'.repeat(32),vin:[{prevout:{scriptpubkey_address:address,value:1000}},{prevout:{scriptpubkey_address:'other',value:1000}}],vout:[{scriptpubkey_address:'else',value:1500}],fee:500,status:{confirmed:false}},address);
 expect(row.feeToken).toBeUndefined();expect(row.transfers[0].quantity).toBe('0.00001');expect(row.status).toBe('pending');
});
it('reads and caches confirmed balance without sending wallet addresses to the price provider',async()=>{
 const f=vi.fn(async(url:string)=>new Response(JSON.stringify(url.includes('coinbase')?{data:{amount:'60000',currency:'USD'}}:{chain_stats:{funded_txo_sum:150000000,spent_txo_sum:50000000},mempool_stats:{funded_txo_sum:80000000,spent_txo_sum:0}})));vi.stubGlobal('fetch',f);
 const result=await getBitcoinWallet(address,'test');expect(result.positions[0].quantity).toBe('1');expect(result.total).toBe(60000);await getBitcoinWallet(address,'test');expect(f).toHaveBeenCalledTimes(2);expect(f.mock.calls.find(c=>c[0].includes('coinbase'))?.[0]).not.toContain(address);
 await expect(getBitcoinTransactions(address,'https://evil.invalid')).rejects.toMatchObject({status:400});
});
