/** ============================================================
 * امضای EIP-712 «Message(string msg)» — فقط سرور (کلید خصوصی کیف پول API آستر در env)
 *
 * آستر V3: domain = { name: 'AsterSignTransaction', version: '1', chainId: 1666, verifyingContract: 0x0 }
 * و msg = رشتهٔ URL-encoded پارامترها (شامل nonce و signer، بدون signature).
 * درستی هش‌ها در tests/api/keyedPerps.test.ts با بردارهای مرجع EIP-712 و نمونهٔ مستندات آستر سنجیده می‌شود.
 * ============================================================ */
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

export interface Eip712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

const keccak = (b: Uint8Array) => keccak_256(b);
const word = (n: bigint) => hexToBytes(n.toString(16).padStart(64, '0'));
const addressWord = (a: string) => hexToBytes(a.toLowerCase().replace(/^0x/, '').padStart(64, '0'));

const DOMAIN_TYPE = keccak(utf8ToBytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'));
const MESSAGE_TYPE = keccak(utf8ToBytes('Message(string msg)'));

export function domainSeparator(d: Eip712Domain): Uint8Array {
  return keccak(concatBytes(DOMAIN_TYPE, keccak(utf8ToBytes(d.name)), keccak(utf8ToBytes(d.version)), word(BigInt(d.chainId)), addressWord(d.verifyingContract)));
}

export function messageDigest(d: Eip712Domain, msg: string): Uint8Array {
  const struct = keccak(concatBytes(MESSAGE_TYPE, keccak(utf8ToBytes(msg))));
  return keccak(concatBytes(new Uint8Array([0x19, 0x01]), domainSeparator(d), struct));
}

/** امضای 65 بایتی r‖s‖v (v = 27/28) به‌صورت 0x… مثل eth_account */
export function signMessage(d: Eip712Domain, msg: string, privateKeyHex: string): string {
  const sig = secp256k1.sign(messageDigest(d, msg), privateKeyHex.replace(/^0x/, ''), { lowS: true });
  return '0x' + sig.toCompactHex() + (27 + sig.recovery).toString(16);
}

/** آدرس اتریوم کلید خصوصی (برای اعتبارسنجی تطابق signer با کلید) */
export function addressOf(privateKeyHex: string): string {
  const pub = secp256k1.getPublicKey(privateKeyHex.replace(/^0x/, ''), false).slice(1);
  return '0x' + bytesToHex(keccak(pub).slice(-20));
}
