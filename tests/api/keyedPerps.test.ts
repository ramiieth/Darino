// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1';
import { messageDigest } from '../../api/_eip712';

const KEYS = ['ONDO_PERPS_KEY_ID', 'ONDO_PERPS_API_SECRET', 'QFEX_PUBLIC_KEY', 'QFEX_SECRET_KEY', 'ASTER_USER', 'ASTER_SIGNER', 'ASTER_SIGNER_PRIVATE_KEY'];
const ASTER_PK = '0x4fd0a42218f3eae43a6ce26d22544e986139a01e5b34a62db53757ffca81bae1';
const ASTER_SIGNER = '0x21cF8Ae13Bb72632562c6Fff438652Ba1a151bb0';
const fetchMock = vi.fn();
const load = async () => { vi.resetModules(); return import('../../api/_keyedPerps'); };

beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); for (const k of KEYS) delete process.env[k]; });
afterEach(() => vi.unstubAllGlobals());

describe('امضاها', () => {
  it('اوندو: HMAC مستندات روی timestamp+GET+path', async () => {
    const { ondoHeaders } = await load();
    const h = ondoHeaders('/v1/perps/balance', 'ondoKeyId_X', 'ondoApiSecret_S', 1700000000000);
    expect(h).toEqual({ 'ONDO-KEY-ID': 'ondoKeyId_X', 'ONDO-TIMESTAMP': '1700000000000', 'ONDO-SIGN': createHmac('sha256', 'ondoApiSecret_S').update('1700000000000GET/v1/perps/balance').digest('hex') });
  });

  it('کیوفکس: چهار هدر و HMAC روی nonce:unix_ts (ثانیه)', async () => {
    const { qfexHeaders } = await load();
    const h = qfexHeaders('qfex_pub_x', 'qfex_secret_y', 1700000000999, 'abc123');
    expect(h).toEqual({ 'x-qfex-public-key': 'qfex_pub_x', 'x-qfex-nonce': 'abc123', 'x-qfex-timestamp': '1700000000', 'x-qfex-hmac-signature': createHmac('sha256', 'qfex_secret_y').update('abc123:1700000000').digest('hex') });
  });

  it('آستر: user، signer و nonce در رشتهٔ امضاشده؛ امضا به signer برمی‌گردد', async () => {
    const { asterQuery } = await load();
    const q = asterQuery({ limit: '10' }, '0x63DD5aCC6b1aa0f563956C0e534DD30B6dcF7C4e', ASTER_SIGNER, ASTER_PK, 1748310859508867);
    const [msg, sig] = q.split('&signature=');
    expect(msg).toBe('limit=10&user=0x63DD5aCC6b1aa0f563956C0e534DD30B6dcF7C4e&signer=0x21cF8Ae13Bb72632562c6Fff438652Ba1a151bb0&nonce=1748310859508867');
    const s = secp256k1.Signature.fromCompact(sig.slice(2, 130)).addRecoveryBit(parseInt(sig.slice(130), 16) - 27);
    const d = { name: 'AsterSignTransaction', version: '1', chainId: 1666, verifyingContract: '0x0000000000000000000000000000000000000000' };
    expect(s.recoverPublicKey(messageDigest(d, msg)).toHex(false)).toBe(Buffer.from(secp256k1.getPublicKey(ASTER_PK.slice(2), false)).toString('hex'));
  });
});

describe('getKeyedPerps', () => {
  it('بدون کلید: هیچ پلتفرمی و هیچ درخواستی', async () => {
    const { getKeyedPerps, configuredVenues } = await load();
    expect(configuredVenues()).toEqual([]);
    expect(await getKeyedPerps(true)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('خطای یک پلتفرم بقیه را خراب نمی‌کند و کلیدها هرگز در پاسخ نیستند', async () => {
    Object.assign(process.env, { ONDO_PERPS_KEY_ID: 'ondoKeyId_SECRETID', ONDO_PERPS_API_SECRET: 'ondoApiSecret_TOPSECRET', QFEX_PUBLIC_KEY: 'qfex_pub_PUB', QFEX_SECRET_KEY: 'qfex_secret_TOPSECRET2' });
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('https://api.ondoperps.xyz')) return new Response(JSON.stringify({ success: false, error_code: 'signature_mismatch' }), { status: 401 });
      if (url.includes('/user/positions')) return new Response(JSON.stringify({ balance: { realised_pnl: 1, unrealised_pnl: 2, net_funding: 0 }, positions: [] }));
      if (url.includes('/user/account-equity')) return new Response(JSON.stringify({ data: [{ value: 100 }] }));
      throw new Error(url);
    });
    const { getKeyedPerps } = await load();
    const r = await getKeyedPerps(true);
    expect(r).toEqual([expect.objectContaining({ venue: 'qfex', equity: 100, allTimePnl: 3 }), { venue: 'ondo', error: 'HTTP 401 · signature_mismatch' }]);
    expect(JSON.stringify(r)).not.toMatch(/TOPSECRET|SECRETID|qfex_pub_PUB/);
  });

  it('آستر: کلید با signer نخواند → خطای روشن بدون درخواست', async () => {
    Object.assign(process.env, { ASTER_USER: '0x63DD5aCC6b1aa0f563956C0e534DD30B6dcF7C4e', ASTER_SIGNER: '0x' + '1'.repeat(40), ASTER_SIGNER_PRIVATE_KEY: ASTER_PK });
    const { getKeyedPerps } = await load();
    expect(await getKeyedPerps(true)).toEqual([{ venue: 'aster', error: 'کلید ASTER_SIGNER_PRIVATE_KEY با ASTER_SIGNER نمی‌خواند' }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('آدرس‌های env', () => {
  it('چند آدرس با کاما/فاصله، حروف کوچک، بدون تکرار؛ نامعتبر کنار می‌رود', async () => {
    const A = '0x' + 'A'.repeat(40), B = '0x' + 'b'.repeat(40);
    Object.assign(process.env, { HYPERLIQUID_ADDRESS: `${A}, ${A.toLowerCase()} bad`, LIGHTER_ADDRESS: B });
    const { envAddresses } = await load();
    expect(envAddresses()).toEqual({ hyperliquid: [A.toLowerCase()], 'lighter-mainnet': [B], 'lighter-robinhood': [], txflow: [] });
    delete process.env.HYPERLIQUID_ADDRESS; delete process.env.LIGHTER_ADDRESS;
  });
});
