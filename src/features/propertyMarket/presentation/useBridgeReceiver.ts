/** ============================================================
 * Property Market — دریافت داده «پل مرورگر» (postMessage)
 *
 *  - فقط پیام از originهای مجاز (divar.ir / sheypoor.com) پذیرفته می‌شود
 *  - payload کامل اعتبارسنجی می‌شود (parseSeedPayload) — داده نامطمئن
 *  - وقتی صفحه با ?bridge=1 از طرف پل باز شده، «ready» به opener فرستاده
 *    می‌شود (فقط به originهای مجاز؛ بدون '*')
 *  - نتیجه با «ack» به همان پنجره برمی‌گردد
 * ============================================================ */
import { useEffect, useRef } from 'react';
import { usePropertyMarketStore } from '../data/store';
import {
  BRIDGE_ALLOWED_ORIGINS,
  MSG_ACK,
  MSG_PAYLOAD,
  MSG_READY,
  isAllowedBridgeOrigin,
  isBridgeLaunch,
  parseSeedPayload
} from '../bridge/protocol';

export function useBridgeReceiver(): void {
  const handled = useRef(new Set<string>());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onMessage = (ev: MessageEvent) => {
      if (!isAllowedBridgeOrigin(ev.origin)) return;
      const data = ev.data as { type?: string; payload?: unknown } | null;
      if (!data || typeof data !== 'object' || data.type !== MSG_PAYLOAD) return;
      const reply = (msg: Record<string, unknown>) => {
        try {
          (ev.source as Window | null)?.postMessage({ type: MSG_ACK, ...msg }, ev.origin);
        } catch {
          /* پنجره پل بسته شده */
        }
      };
      const parsed = parseSeedPayload(data.payload);
      if (!parsed.ok) {
        reply({ ok: false, error: parsed.error });
        return;
      }
      // جلوگیری از ورود دوباره همان بسته (ready تکراری)
      const key = `${parsed.payload.source}:${parsed.payload.collectedAt}:${parsed.payload.seeds.length}`;
      if (handled.current.has(key)) return; // تکراری — پاسخ فقط از ورود اول
      handled.current.add(key);
      void usePropertyMarketStore
        .getState()
        .importPayloads([parsed.payload], 'پل مرورگر')
        .then((r) => reply({ ok: r.ok, added: r.added, error: r.error }))
        .catch(() => reply({ ok: false, error: 'خطای ذخیره در دارینو' }));
    };
    window.addEventListener('message', onMessage);

    // دست‌دادن با پنجره پل (فقط وقتی از طرف پل باز شده‌ایم). اجرای دوباره پل
    // همان تب نام‌دار را فقط با تغییر hash باز می‌کند → با hashchange دوباره شروع می‌شود.
    let timer: ReturnType<typeof setInterval> | null = null;
    const startHandshake = () => {
      const opener = window.opener as Window | null;
      if (!opener || !isBridgeLaunch(window.location.search, window.location.hash)) return;
      if (timer) clearInterval(timer);
      let tries = 0;
      const sendReady = () => {
        tries += 1;
        for (const origin of BRIDGE_ALLOWED_ORIGINS) {
          try {
            opener.postMessage({ type: MSG_READY }, origin);
          } catch {
            /* origin نامطابق — مرورگر پیام را رها می‌کند */
          }
        }
        if (tries >= 30 && timer) clearInterval(timer);
      };
      sendReady();
      timer = setInterval(sendReady, 1000);
    };
    startHandshake();
    window.addEventListener('hashchange', startHandshake);

    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('hashchange', startHandshake);
      if (timer) clearInterval(timer);
    };
  }, []);
}
