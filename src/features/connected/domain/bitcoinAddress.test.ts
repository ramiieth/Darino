// @vitest-environment node
import { expect,it } from 'vitest';
import { isBitcoinAddress,validBitcoinAddress } from './bitcoinAddress';
import { validPublicAddress,addressKey } from './model';
it('checks mainnet Base58 checksums and distinguishes Solana keys',async()=>{
 expect(await validBitcoinAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe(true);
 expect(await validBitcoinAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb')).toBe(false);
 expect(isBitcoinAddress('11111111111111111111111111111111')).toBe(false);
 expect(await validPublicAddress('11111111111111111111111111111111')).toBe(true);
});
it('validates Bech32 checksum, mixed case, mainnet prefix and normalized identity',async()=>{
 const v='bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';expect(await validPublicAddress(v)).toBe(true);expect(await validPublicAddress(v.toUpperCase())).toBe(true);expect(addressKey(v.toUpperCase())).toBe(v);
 expect(isBitcoinAddress(v.slice(0,-1)+'q')).toBe(false);expect(isBitcoinAddress('bC'+v.slice(2))).toBe(false);expect(isBitcoinAddress('tb'+v.slice(2))).toBe(false);
});
