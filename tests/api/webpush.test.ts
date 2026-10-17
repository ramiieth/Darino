// @vitest-environment node
/** Web Push بدون کتابخانه: رمزنگاری RFC 8291 (رمزگشایی مثل مرورگر)، امضای VAPID و فهرست سرویس‌های مجاز */
import { createDecipheriv, createECDH, createHmac, createPublicKey, randomBytes, verify } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { b64u, encryptPayload, generateVapidKeys, isAllowedPushEndpoint, sendPush, unb64u, validSubscription, vapidHeader } from '../../api/_webpush';

afterEach(() => vi.unstubAllGlobals());

const hmac = (k: Buffer, d: Buffer) => createHmac('sha256', k).update(d).digest();
const expand = (prk: Buffer, info: Buffer, len: number) => hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, len);

/** طرف مرورگر: کلیدهای اشتراک و رمزگشایی aes128gcm */
function browser() {
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
  const auth = randomBytes(16);
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) };
  const decrypt = (body: Buffer) => {
    const salt = body.subarray(0, 16); const idlen = body[20]; const asPublic = body.subarray(21, 21 + idlen); const ct = body.subarray(21 + idlen);
    expect(body.readUInt32BE(16)).toBe(4096);
    const shared = ecdh.computeSecret(asPublic);
    const ikm = expand(hmac(auth, shared), Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic]), 32);
    const prk = hmac(salt, ikm);
    const d = createDecipheriv('aes-128-gcm', expand(prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16), expand(prk, Buffer.from('Content-Encoding: nonce\0'), 12));
    d.setAuthTag(ct.subarray(ct.length - 16));
    const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
    expect(plain[plain.length - 1]).toBe(2); // جداکنندهٔ رکورد آخر
    return plain.subarray(0, -1).toString('utf8');
  };
  return { sub, decrypt };
}

describe('رمزنگاری پیام (RFC 8291)', () => {
  it('فقط همان مرورگر پیام فارسی را باز می‌کند', () => {
    const b = browser();
    const msg = JSON.stringify({ title: 'اسپرد فاندینگ برعکس شد', body: 'BTC' });
    expect(b.decrypt(encryptPayload(b.sub, Buffer.from(msg)))).toBe(msg);
    // مرورگر دیگر نمی‌تواند
    const other = browser();
    expect(() => other.decrypt(encryptPayload(b.sub, Buffer.from(msg)))).toThrow();
  });
});

describe('VAPID', () => {
  it('JWT با ES256 امضا می‌شود و با کلید عمومی تأیید می‌شود', () => {
    const keys = generateVapidKeys();
    expect(unb64u(keys.publicKey)).toHaveLength(65);
    const h = vapidHeader('https://fcm.googleapis.com/fcm/send/abc', keys, 'mailto:a@b.c', Date.UTC(2026, 9, 18));
    const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(h)!;
    expect(k).toBe(keys.publicKey);
    const [head, claims, sig] = token.split('.');
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toMatchObject({ aud: 'https://fcm.googleapis.com', sub: 'mailto:a@b.c' });
    const pub = unb64u(keys.publicKey);
    const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: 'jwk' });
    expect(verify('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'))).toBe(true);
  });
});

describe('فقط سرویس‌های رسمی Push (بدون SSRF)', () => {
  it.each([
    ['https://fcm.googleapis.com/fcm/send/x', true],
    ['https://web.push.apple.com/QW', true],
    ['https://updates.push.services.mozilla.com/wpush/v2/x', true],
    ['https://wns2-par02p.notify.windows.com/w/?token=x', true],
    ['http://fcm.googleapis.com/x', false],
    ['https://fcm.googleapis.com:8443/x', false],
    ['https://evil.example/fcm.googleapis.com', false],
    ['https://169.254.169.254/latest', false],
    ['https://user:pw@fcm.googleapis.com/x', false]
  ])('%s → %s', (url, ok) => expect(isAllowedPushEndpoint(url)).toBe(ok));

  it('کلید اشتراک باید نقطهٔ P-256 و auth ۱۶ بایتی باشد', () => {
    const { sub } = browser();
    expect(validSubscription(sub)).toBe(true);
    expect(validSubscription({ ...sub, auth: b64u(randomBytes(8)) })).toBe(false);
    expect(validSubscription({ ...sub, endpoint: 'https://evil.example/x' })).toBe(false);
  });

  it('ارسال: سرآیندهای درست، بدون دنبال کردن ریدایرکت؛ ۴۱۰ = اشتراک باطل', async () => {
    const { sub, decrypt } = browser();
    const f = vi.fn().mockResolvedValueOnce(new Response(null, { status: 201 })).mockResolvedValueOnce(new Response(null, { status: 410 }));
    vi.stubGlobal('fetch', f);
    const keys = generateVapidKeys();
    expect(await sendPush(sub, { title: 'آزمایش', body: 'سلام', url: '/alerts' }, keys, 'mailto:a@b.c')).toBe('sent');
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(sub.endpoint);
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(init.headers['Content-Encoding']).toBe('aes128gcm');
    expect(JSON.parse(decrypt(Buffer.from(init.body)))).toEqual({ title: 'آزمایش', body: 'سلام', url: '/alerts' });
    expect(await sendPush(sub, { title: 'x', body: 'y' }, keys, 'mailto:a@b.c')).toBe('gone');
    // آدرس بیرونی در url اعلان پذیرفته نمی‌شود
    f.mockResolvedValueOnce(new Response(null, { status: 201 }));
    await sendPush(sub, { title: 'x', body: 'y', url: 'https://evil.example' }, keys, 'mailto:a@b.c');
    expect(JSON.parse(decrypt(Buffer.from(f.mock.calls[2][1].body))).url).toBe('/');
  });
});
