// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';
import { addressOf, domainSeparator, messageDigest, signMessage } from '../../api/_eip712';

describe('EIP-712', () => {
  it('جداکنندهٔ دامنه با بردار مرجع مشخصات EIP-712 («Ether Mail») برابر است', () => {
    const d = { name: 'Ether Mail', version: '1', chainId: 1, verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC' };
    expect(bytesToHex(domainSeparator(d))).toBe('f2cee375fa42b42143804025fc449deafd50cc031ca257e0b194a650a912090f');
  });

  it('آدرس کلید نمونهٔ مستندات آستر = signer همان مستندات', () => {
    expect(addressOf('0x4fd0a42218f3eae43a6ce26d22544e986139a01e5b34a62db53757ffca81bae1')).toBe('0x21cf8ae13bb72632562c6fff438652ba1a151bb0');
  });

  it('امضا قابل بازیابی به همان آدرس است (v=27/28، low-s)', () => {
    const pk = '0x4fd0a42218f3eae43a6ce26d22544e986139a01e5b34a62db53757ffca81bae1';
    const d = { name: 'AsterSignTransaction', version: '1', chainId: 1666, verifyingContract: '0x0000000000000000000000000000000000000000' };
    const msg = 'nonce=1748310859508867&signer=0x21cF8Ae13Bb72632562c6Fff438652Ba1a151bb0';
    const sig = signMessage(d, msg, pk);
    expect(sig).toMatch(/^0x[0-9a-f]{128}(1b|1c)$/);
    const r = secp256k1.Signature.fromCompact(sig.slice(2, 130)).addRecoveryBit(parseInt(sig.slice(130), 16) - 27);
    const pub = r.recoverPublicKey(messageDigest(d, msg)).toHex(false);
    expect(pub).toBe(bytesToHex(secp256k1.getPublicKey(pk.slice(2), false)));
  });
});
