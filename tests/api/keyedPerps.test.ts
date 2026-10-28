// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

const KEYS = ['ONDO_PERPS_KEY_ID', 'ONDO_PERPS_API_SECRET'];
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
});

describe('getKeyedPerps', () => {
  it('بدون کلید: هیچ پلتفرمی و هیچ درخواستی', async () => {
    const { getKeyedPerps, configuredVenues } = await load();
    expect(configuredVenues()).toEqual([]);
    expect(await getKeyedPerps(true)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('خطای سرویس به پیام کوتاه تبدیل می‌شود و کلیدها هرگز در پاسخ نیستند', async () => {
    Object.assign(process.env, { ONDO_PERPS_KEY_ID: 'ondoKeyId_SECRETID', ONDO_PERPS_API_SECRET: 'ondoApiSecret_TOPSECRET' });
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ success: false, error_code: 'signature_mismatch' }), { status: 401 }));
    const { getKeyedPerps } = await load();
    const r = await getKeyedPerps(true);
    expect(r).toEqual([{ venue: 'ondo', error: 'HTTP 401 · signature_mismatch' }]);
    expect(JSON.stringify(r)).not.toMatch(/TOPSECRET|SECRETID/);
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
