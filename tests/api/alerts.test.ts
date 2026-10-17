// @vitest-environment node
/** سرور اعلان‌ها: کلید زمان‌بند، بررسی دوره‌ای، ارسال، حذف اشتراک باطل و نشت نکردن داده */
import { createECDH, randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkUser, handleAlertsOp, rotateTickKey, runTick, verifyTickKey, type AlertsStore, type StoredSubscription } from '../../api/_alerts';
import { b64u, type PushSubscriptionRecord } from '../../api/_webpush';

afterEach(() => vi.unstubAllGlobals());

function memoryStore(holdings: unknown[] = []): AlertsStore & { kv: Map<string, unknown>; subs: Map<string, StoredSubscription[]> } {
  const kv = new Map<string, unknown>(); const subs = new Map<string, StoredSubscription[]>();
  return {
    kv, subs,
    async get<T>(u: string, k: string) { return (kv.get(`${u}|${k}`) as T) ?? null; },
    async put(u, k, p) { kv.set(`${u}|${k}`, JSON.parse(JSON.stringify(p))); },
    async subscriptions(u) { return subs.get(u) ?? []; },
    async addSubscription(u, s, label) { subs.set(u, [...(subs.get(u) ?? []).filter((x) => x.endpoint !== s.endpoint), { ...s, label, createdAt: Date.now() }]); },
    async removeSubscription(u, endpoint) { subs.set(u, (subs.get(u) ?? []).filter((x) => x.endpoint !== endpoint)); },
    async users() { return [...kv.keys()].filter((k) => k.endsWith('|rules') && !k.startsWith('__system')).map((k) => k.split('|')[0]); },
    async holdings() { return holdings; }
  };
}

function browserSub(endpoint = 'https://fcm.googleapis.com/fcm/send/abc'): PushSubscriptionRecord & { keys: { p256dh: string; auth: string } } {
  const e = createECDH('prime256v1'); e.generateKeys();
  const p256dh = b64u(e.getPublicKey()); const auth = b64u(randomBytes(16));
  return { endpoint, p256dh, auth, keys: { p256dh, auth } };
}

const ok = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });

describe('کلید زمان‌بند', () => {
  it('فقط هش ذخیره می‌شود؛ کلید اشتباه یا قدیمی رد می‌شود', async () => {
    const store = memoryStore();
    expect(await verifyTickKey(store, 'x'.repeat(43))).toBe(false); // هنوز ساخته نشده
    const key = await rotateTickKey(store);
    expect(JSON.stringify([...store.kv.values()])).not.toContain(key);
    expect(await verifyTickKey(store, key)).toBe(true);
    expect(await verifyTickKey(store, key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A'))).toBe(false);
    const next = await rotateTickKey(store);
    expect(await verifyTickKey(store, key)).toBe(false);
    expect(await verifyTickKey(store, next)).toBe(true);
  });
});

describe('بررسی و ارسال', () => {
  const watch = { key: 'BTC:arcus>lighter', base: 'BTC', shortVenue: 'arcus', shortRef: 'BTC-USD', longVenue: 'lighter', longRef: '1', lastSign: 1 };

  it('برعکس‌شدن اسپرد → Web Push؛ اشتراک باطل (۴۱۰) حذف می‌شود؛ علامت ذخیره می‌شود', async () => {
    const store = memoryStore();
    await store.put('u1', 'rules', { funding: [watch], liquidation: { enabled: false, thresholdPct: 15 } });
    const live = browserSub(); const dead = browserSub('https://fcm.googleapis.com/fcm/send/dead');
    await store.addSubscription('u1', live, 'مک'); await store.addSubscription('u1', dead, null);
    const f = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('funding-rates')) return ok({ funding_rates: [{ exchange: 'lighter', market_id: 1, rate: 0.00024 }, { exchange: 'binance', market_id: 1, rate: 0 }] });
      if (url.includes('/v1/markets')) return ok({ markets: [{ marketDisplayName: 'BTC-USD', fundingRate: '0.00001', maintenanceMarginFraction: '0.03' }] });
      if (url.endsWith('/dead')) return new Response(null, { status: 410 });
      if (url.startsWith('https://fcm.googleapis.com/')) return new Response(null, { status: 201 });
      throw new Error(`unexpected ${url}`);
    });
    vi.stubGlobal('fetch', f);
    const r = await checkUser(store, 'u1');
    expect(r).toMatchObject({ sent: 1, flips: 1, errors: [] });
    expect((await store.get<{ funding: { lastSign: number }[] }>('u1', 'rules'))!.funding[0].lastSign).toBe(-1);
    expect((await store.subscriptions('u1')).map((s) => s.endpoint)).toEqual([live.endpoint]);
    expect((await store.get<{ title: string }[]>('u1', 'log'))![0].title).toBe('اسپرد فاندینگ برعکس شد');
    // دوباره: تغییری نیست → اعلانی نیست
    expect((await checkUser(store, 'u1')).sent).toBe(0);
  });

  it('runTick: اجرای پشت‌سرهم کمتر از یک دقیقه نادیده گرفته می‌شود', async () => {
    const store = memoryStore();
    vi.stubGlobal('fetch', vi.fn());
    const t = Date.UTC(2026, 9, 18);
    expect((await runTick(store, t)).skipped).toBe(false);
    expect((await runTick(store, t + 30_000)).skipped).toBe(true);
    expect((await runTick(store, t + 61_000)).skipped).toBe(false);
  });
});

describe('مسیرهای احراز‌شده', () => {
  it('اشتراک با endpoint غیررسمی رد می‌شود؛ وضعیت endpoint و کلید خصوصی را برنمی‌گرداند', async () => {
    const store = memoryStore();
    const bad = { ...browserSub('https://169.254.169.254/x') };
    expect((await handleAlertsOp(store, 'push-subscribe', 'POST', 'u1', async () => ({ subscription: bad })))[0]).toBe(400);
    const good = browserSub();
    expect((await handleAlertsOp(store, 'push-subscribe', 'POST', 'u1', async () => ({ subscription: good, label: 'آیفون Safari<script>' })))[0]).toBe(200);
    const [, body] = await handleAlertsOp(store, 'alerts-status', 'GET', 'u1', async () => ({}));
    const text = JSON.stringify(body);
    expect(text).not.toContain(good.endpoint);
    expect(text).not.toContain((await store.get<{ privateKey: string }>('__system', 'vapid'))!.privateKey);
    expect((body as { devices: { label: string }[] }).devices[0].label).toBe('آیفون Safariscript');
    expect((await handleAlertsOp(store, 'alerts-rules', 'GET', 'u1', async () => ({})))[0]).toBe(405);
  });
});
