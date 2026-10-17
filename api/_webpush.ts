/** ============================================================
 * Web Push بدون کتابخانهٔ خارجی — فقط node:crypto
 *
 *  • رمزنگاری پیام: RFC 8291 (aes128gcm) — فقط مرورگرِ مشترک می‌تواند پیام را باز کند.
 *  • هویت سرور: VAPID (RFC 8292) با امضای ES256.
 *  • فقط به سرویس‌های رسمی Push (گوگل، اپل، موزیلا، مایکروسافت) ارسال می‌شود؛
 *    endpoint دلخواه پذیرفته نمی‌شود (جلوگیری از SSRF).
 * ============================================================ */
import { createCipheriv, createECDH, createHmac, createPrivateKey, generateKeyPairSync, randomBytes, sign, type ECDH, type KeyObject } from 'node:crypto';

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface VapidKeys {
  /** نقطهٔ عمومی P-256 فشرده‌نشده (۶۵ بایت)، base64url */
  publicKey: string;
  /** کلید خصوصی خام (۳۲ بایت)، base64url */
  privateKey: string;
}

const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];

export const b64u = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url');
export const unb64u = (s: string) => Buffer.from(s, 'base64url');

/** فقط https روی سرویس‌های رسمی Push، بدون پورت و اعتبارنامه */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.port && !u.username && !u.password && PUSH_HOSTS.some((r) => r.test(u.hostname)) && endpoint.length <= 1024;
  } catch {
    return false;
  }
}

export function validSubscription(s: unknown): s is PushSubscriptionRecord {
  const r = s as Partial<PushSubscriptionRecord> | null;
  if (!r || typeof r.endpoint !== 'string' || typeof r.p256dh !== 'string' || typeof r.auth !== 'string') return false;
  if (!isAllowedPushEndpoint(r.endpoint)) return false;
  try {
    return unb64u(r.p256dh).length === 65 && unb64u(r.p256dh)[0] === 4 && unb64u(r.auth).length === 16;
  } catch {
    return false;
  }
}

export function generateVapidKeys(): VapidKeys {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' }) as { d: string };
  const pub = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  return { privateKey: jwk.d, publicKey: b64u(Buffer.concat([Buffer.from([4]), unb64u(pub.x), unb64u(pub.y)])) };
}

function vapidPrivateKey(keys: VapidKeys): KeyObject {
  const pub = unb64u(keys.publicKey);
  return createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: keys.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
}

/** Authorization: vapid t=<JWT>, k=<public key> */
export function vapidHeader(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): string {
  const header = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key: vapidPrivateKey(keys), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64u(signature)}, k=${keys.publicKey}`;
}

const hmac = (key: Buffer, data: Buffer) => createHmac('sha256', key).update(data).digest();
/** HKDF-Expand برای طول ≤ ۳۲ بایت */
const expand = (prk: Buffer, info: Buffer, length: number) => hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, length);

/** بدنهٔ رمزشدهٔ aes128gcm (RFC 8291) برای یک مشترک */
export function encryptPayload(sub: PushSubscriptionRecord, plaintext: Buffer, salt = randomBytes(16), serverEcdh?: ECDH): Buffer {
  if (!serverEcdh) {
    serverEcdh = createECDH('prime256v1');
    serverEcdh.generateKeys();
  }
  const uaPublic = unb64u(sub.p256dh);
  const asPublic = serverEcdh.getPublicKey();
  const shared = serverEcdh.computeSecret(uaPublic);
  const ikm = expand(hmac(unb64u(sub.auth), shared), Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
  const prk = hmac(salt, ikm);
  const cek = expand(prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = expand(prk, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  // یک رکورد: پیام + جداکنندهٔ «رکورد آخر» (0x02)
  const body = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

export interface PushMessage {
  title: string;
  body: string;
  /** مسیر داخل اپ برای باز شدن با لمس اعلان، مثل /calculators */
  url?: string;
  tag?: string;
}

export type PushResult = 'sent' | 'gone' | 'failed';

/** ارسال؛ 404/410 یعنی اشتراک باطل شده و باید حذف شود */
export async function sendPush(sub: PushSubscriptionRecord, msg: PushMessage, keys: VapidKeys, subject: string): Promise<PushResult> {
  if (!validSubscription(sub)) return 'gone';
  const payload = Buffer.from(JSON.stringify({ title: msg.title.slice(0, 120), body: msg.body.slice(0, 500), url: msg.url && msg.url.startsWith('/') ? msg.url : '/', tag: msg.tag }));
  try {
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: vapidHeader(sub.endpoint, keys, subject), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high' },
      body: new Uint8Array(encryptPayload(sub, payload))
    });
    if (res.status === 404 || res.status === 410) return 'gone';
    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}
