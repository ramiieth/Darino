/** Fixed public GET destinations. No SDK, signing, cookies or upstream credentials. */
import { ProviderError } from './_zerion.js';
const MAINNET='https://mainnet.zklighter.elliot.ai';
const LIGHTER = 'https://api.rh.lighter.xyz';
const ONDO = 'https://api.ondoperps.xyz';
async function read(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { method: 'GET', headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new ProviderError(response.status === 429 ? 429 : 502, 'دریافت اطلاعات پلتفرم انجام نشد');
  const raw: unknown = await response.json();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ProviderError(502, 'پاسخ پلتفرم معتبر نیست');
  const data = raw as Record<string, unknown>;
  if (!data || typeof data !== 'object' || Array.isArray(data) || (data.code !== undefined && data.code !== 200 && data.code !== 0) || data.success === false) throw new ProviderError(502, 'پاسخ پلتفرم معتبر نیست');
  return data;
}
export async function getPerpsRead(op: string, address: string): Promise<unknown> {
  if (op === 'lighter-mainnet-markets') return read(`${MAINNET}/api/v1/orderBookDetails`);
  if (op === 'lighter-markets') return read(`${LIGHTER}/api/v1/orderBookDetails`);
  if (op === 'ondo-markets') {
    const [markets, prices] = await Promise.all([read(`${ONDO}/v1/markets`), read(`${ONDO}/v1/perps/mark_prices`)]);
    return { markets, prices };
  }
  if (!['lighter-account','lighter-mainnet-account'].includes(op)) throw new ProviderError(400, 'درخواست ناشناخته');
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new ProviderError(400, 'آدرس عمومی EVM معتبر وارد کنید');
  const host=op==='lighter-mainnet-account'?MAINNET:LIGHTER;
  const accounts: unknown[] = []; const cursors = new Set<string>(); let cursor = '';
  // Bounded pagination: never silently present a partial equity total.
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ by: 'l1_address', value: address, active_only: 'true' });
    if (cursor) query.set('cursor', cursor);
    const data = await read(`${host}/api/v1/account?${query}`);
    if (!Array.isArray(data.accounts)) throw new ProviderError(502, 'پاسخ حساب معتبر نیست');
    accounts.push(...data.accounts);
    if (!data.next_cursor) return { accounts, fetchedAt: Date.now() };
    cursor = String(data.next_cursor);
    if (cursors.has(cursor) || cursor.length > 2048) break;
    cursors.add(cursor);
  }
  throw new ProviderError(502, 'فهرست حساب‌ها کامل دریافت نشد');
}
