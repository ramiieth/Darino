// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://divar.ir/s/ahvaz/buy-apartment"}
/**
 * پل مرورگر — اجرای «کد باندل‌شده واقعی» bookmarklet روی divar.ir شبیه‌سازی‌شده
 *
 *  fetch → فیکسچرهای پاسخ واقعی دیوار؛ دست‌دادن ready → payload → ack
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import bookmarkletCode from 'virtual:pm-bookmarklet';
import list from '../collector/__fixtures__/divar-list.json';
import detail from '../collector/__fixtures__/divar-detail.json';
import { MSG_ACK, MSG_PAYLOAD, MSG_READY, parseSeedPayload } from './protocol';

const DARINO = 'https://darino.test';

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  delete (window as { __darinoPmBridge?: boolean }).__darinoPmBridge;
});

describe('bookmarklet (کد باندل‌شده)', () => {
  it('کد مستقل است (بدون import/require) و placeholder دارد', () => {
    expect(bookmarkletCode).toContain('%%DARINO_ORIGIN%%');
    expect(bookmarkletCode).not.toMatch(/\bimport\s*\(|\brequire\(/);
    // اندازه منطقی برای bookmarklet
    expect(bookmarkletCode.length).toBeLessThan(60_000);
  });

  it('روی divar.ir: جمع‌آوری → ارسال به دارینو با دست‌دادن و ack', async () => {
    const requests: { url: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      requests.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
      if (url.includes('/places/cities')) return jsonResponse({ cities: [{ id: 7, slug: 'ahvaz', name: 'اهواز' }] });
      if (url.includes('/postlist/')) return jsonResponse({ ...list, pagination: { has_next_page: false, data: null } });
      return jsonResponse(detail);
    });
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(window);
    const postSpy = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);

    // اجرای همان کدی که کاربر در bookmark دارد
    new Function(bookmarkletCode.split('%%DARINO_ORIGIN%%').join(DARINO))();

    await vi.waitFor(() => expect(buttonByText('ارسال به دارینو')).toBeTruthy(), { timeout: 10_000 });
    expect(document.body.textContent).toContain('۳ آگهی آماده است');

    // در مرورگر: User-Agent ارسال نمی‌شود (preflight دیوار رد می‌کرد)
    expect(requests.every((r) => !('User-Agent' in r.headers))).toBe(true);
    expect(requests.some((r) => r.url.startsWith('https://api.divar.ir/v8/posts-v2/web/'))).toBe(true);

    buttonByText('ارسال به دارینو')!.click();
    expect(openSpy).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/darino\.test\/#\/property-market\?bridge=1&t=\d+$/), 'darino-pm-bridge');

    // پیام ready از origin دیگر → نادیده
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.test', data: { type: MSG_READY }, source: window }));
    expect(postSpy).not.toHaveBeenCalled();

    // ready از دارینو → payload فقط به origin دارینو
    window.dispatchEvent(new MessageEvent('message', { origin: DARINO, data: { type: MSG_READY }, source: window }));
    expect(postSpy).toHaveBeenCalledTimes(1);
    const [msg, target] = postSpy.mock.calls[0] as [{ type: string; payload: unknown }, string];
    expect(target).toBe(DARINO);
    expect(msg.type).toBe(MSG_PAYLOAD);
    const parsed = parseSeedPayload(msg.payload);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.payload.source).toBe('divar');
      expect(parsed.payload.via).toBe('bridge');
      expect(parsed.payload.seeds.length).toBe(3);
      const s = parsed.payload.seeds.find((x) => x.token === 'gagCBuEm')!;
      expect(s.areaSqm).toBe(90);
      expect(s.totalPriceToman).toBe(3_100_000_000);
    }

    // ready تکراری → payload دوباره ارسال نمی‌شود
    window.dispatchEvent(new MessageEvent('message', { origin: DARINO, data: { type: MSG_READY }, source: window }));
    expect(postSpy).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new MessageEvent('message', { origin: DARINO, data: { type: MSG_ACK, ok: true, added: 3 }, source: window }));
    expect(document.body.textContent).toContain('در دارینو ثبت شد');
  }, 20_000);

  it('روی سایت دیگر اجرا نمی‌شود (هشدار)', () => {
    // hostname فعلی divar.ir است؛ با history نمی‌توان host را عوض کرد → تابع detectSource جداگانه تست شده
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const code = bookmarkletCode.split('%%DARINO_ORIGIN%%').join(DARINO);
    // اجرای دوم همزمان → نادیده (فلگ سراسری)
    (window as { __darinoPmBridge?: boolean }).__darinoPmBridge = true;
    new Function(code)();
    expect(document.querySelectorAll('button').length).toBe(0);
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
