// @vitest-environment node
import {it,expect,vi,afterEach} from 'vitest';
import {normalizeBridgeProof,lookupBridge} from '../../api/_bridge';
afterEach(()=>vi.unstubAllGlobals());
const hash='0x'+'ab'.repeat(32),dest='0x'+'cd'.repeat(32);
it('only links successful exact hashes across distinct chains',()=>{
 expect(normalizeBridgeProof('lifi',{status:'DONE',sending:{txHash:hash,chainId:1},receiving:{txHash:dest,chainId:8453}},hash)).toHaveLength(1);
 expect(normalizeBridgeProof('lifi',{status:'PENDING',sending:{txHash:hash,chainId:1},receiving:{txHash:dest,chainId:8453}},hash)).toEqual([]);
 expect(normalizeBridgeProof('relay',{requests:[{status:'success',data:{inTxs:[{txHash:hash,chainId:1}],outTxs:[{txHash:dest,chainId:8453,status:'success'}]}}]},hash)).toHaveLength(1);
 expect(normalizeBridgeProof('relay',{requests:[{status:'success',data:{inTxs:[{txHash:dest,chainId:1}],outTxs:[{txHash:dest,chainId:8453,status:'success'}]}}]},hash)).toEqual([]);
});
it('rejects arbitrary hosts and malformed hashes before network access',async()=>{const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);await expect(lookupBridge('https://evil.example',hash)).rejects.toThrow();await expect(lookupBridge('relay','bad')).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();});
