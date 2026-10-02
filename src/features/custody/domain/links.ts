/** ============================================================
 * لینک‌های امن — explorer و رهگیری
 *  • لینک explorer فقط از ریشهٔ ثبت‌شدهٔ شبکه + هش/آدرسِ با قالب معتبر ساخته می‌شود.
 *  • لینک رهگیری واردشدهٔ کاربر فقط اگر https و روی میزبان مجاز باشد قابل کلیک است؛
 *    در غیر این صورت فقط به‌صورت متن نمایش داده می‌شود (هیچ fetch سمت سرور انجام نمی‌شود).
 *  • آدرس عمومی https://relay.link/transaction (بدون شناسه) لینک یک تراکنش مشخص نیست.
 * ============================================================ */
import type { Network } from './types';

export const EVM_TX_HASH = /^0x[0-9a-fA-F]{64}$/;
export const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function isEvmTxHash(v: string | null | undefined): boolean {
  return !!v && EVM_TX_HASH.test(v.trim());
}

export function isEvmAddress(v: string | null | undefined): boolean {
  return !!v && EVM_ADDRESS.test(v.trim());
}

function explorerBase(network: Network | undefined): string | null {
  if (!network?.explorerUrl) return null;
  try {
    const u = new URL(network.explorerUrl);
    if (u.protocol !== 'https:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function explorerTxUrl(network: Network | undefined, hash: string | null | undefined): string | null {
  const base = explorerBase(network);
  if (!base || !isEvmTxHash(hash)) return null;
  return `${base}/tx/${hash!.trim()}`;
}

export function explorerAddressUrl(network: Network | undefined, address: string | null | undefined): string | null {
  const base = explorerBase(network);
  if (!base || !isEvmAddress(address)) return null;
  return `${base}/address/${address!.trim()}`;
}

/** میزبان‌های مجاز برای لینک رهگیری (ارائه‌دهنده‌ها و explorerهای پشتیبانی‌شده) */
export function allowedTrackingHosts(networks: Network[]): string[] {
  const hosts = new Set<string>(['relay.link', 'arcus.xyz']);
  for (const n of networks) {
    const b = explorerBase(n);
    if (b) hosts.add(new URL(b).hostname);
  }
  return [...hosts];
}

export type TrackingCheck =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/** بررسی لینک رهگیری واردشده — فقط https روی میزبان مجاز، و نه صفحهٔ عمومی بدون شناسه */
export function checkTrackingUrl(raw: string, networks: Network[]): TrackingCheck {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'آدرس معتبر نیست' };
  }
  if (u.protocol !== 'https:') return { ok: false, reason: 'فقط پیوند امن (https) پذیرفته می‌شود' };
  if (u.username || u.password) return { ok: false, reason: 'لینک نباید اطلاعات ورود داشته باشد' };
  const host = u.hostname.toLowerCase();
  const allowed = allowedTrackingHosts(networks);
  const match = allowed.some((h) => host === h || host.endsWith('.' + h));
  if (!match) return { ok: false, reason: `میزبان مجاز نیست (مجاز: ${allowed.join('، ')})` };
  const path = u.pathname.replace(/\/+$/, '');
  if (host.endsWith('relay.link') && (path === '' || path === '/transaction' || path === '/transactions')) {
    return { ok: false, reason: 'این صفحهٔ عمومی ریلی است و به یک تراکنش مشخص اشاره نمی‌کند' };
  }
  return { ok: true, url: u.toString() };
}

/** نمایش کوتاه آدرس/هش (کامل در title) */
export function shortHex(v: string | null | undefined, head = 6, tail = 4): string {
  if (!v) return '—';
  const s = v.trim();
  return s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;
}
