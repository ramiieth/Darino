/** ============================================================
 * Arcus — دریافت زنده (WebSocket) فقط هنگام باز بودن صفحه
 *
 * مرجع: docs.arcus.xyz/api-reference/websocket و account/*
 *  • subscribe به کانال‌های حساب احراز هویت ندارد: { type, channel, id: address, accountIndex }
 *  • طراحی: پیام WS «نشانهٔ تغییر» است، نه منبع حقیقت. با هر نشانه، همان منبع از REST
 *    (با throttle) دوباره خوانده می‌شود. پس تکرار پیام، ترتیب، یا گم شدن پیام در فاصلهٔ
 *    قطع اتصال باعث خطای حساب نمی‌شود — snapshot معتبر REST بعد از هر اتصال مجدد گرفته می‌شود.
 *  • به sequence کانال‌ها برای پیوستگی تکیه نمی‌شود (طبق مستندات فقط l2OrderbookUpdates پیوسته است).
 *  • reconnect با backoff نمایی + jitter، resubscribe خودکار؛ هر صفحه حداکثر یک اتصال و ۶ اشتراک.
 *  • وقتی تب/اپ پنهان است اتصال بسته می‌شود (بدون مصرف پس‌زمینه). اپ بسته = بدون دریافت؛
 *    ثبت پیوسته در پس‌زمینه در این نسخه وجود ندارد (Vercel Function اتصال دائمی نگه نمی‌دارد).
 * ============================================================ */
import { ARCUS_HOSTS } from './client';
import type { ArcusEnv } from '@/features/custody/domain/types';

export const LIVE_CHANNELS = ['account', 'positions', 'orders', 'userFills', 'funding', 'accountTransferUpdates'] as const;
export type LiveChannel = (typeof LIVE_CHANNELS)[number];

export type LiveStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'paused' | 'closed';

export interface LiveOptions {
  env: ArcusEnv;
  address: string;
  accountIndex: number;
  onSignal: (channel: LiveChannel) => void;
  onStatus: (s: LiveStatus) => void;
  /** پس از هر اتصال (اولی یا مجدد) — برای گرفتن snapshot معتبر REST */
  onConnected: () => void;
  WebSocketImpl?: typeof WebSocket;
  random?: () => number;
}

export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
  // full jitter بین ۵۰٪ تا ۱۰۰٪
  return Math.round(base * (0.5 + random() * 0.5));
}

export function subscribeFrames(address: string, accountIndex: number): string[] {
  return LIVE_CHANNELS.map((channel) => JSON.stringify({ type: 'subscribe', channel, id: address.toLowerCase(), accountIndex }));
}

export class ArcusLive {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private paused = false;
  private readonly onVisibility = () => this.handleVisibility();

  constructor(private o: LiveOptions) {}

  start(): void {
    this.stopped = false;
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.paused = true;
      this.o.onStatus('paused');
      return;
    }
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    this.clearTimer();
    this.closeSocket();
    this.o.onStatus('closed');
  }

  private handleVisibility(): void {
    if (this.stopped) return;
    if (document.visibilityState === 'hidden') {
      this.paused = true;
      this.clearTimer();
      this.closeSocket();
      this.o.onStatus('paused');
    } else if (this.paused) {
      this.paused = false;
      this.attempt = 0;
      this.connect();
    }
  }

  private connect(): void {
    if (this.stopped || this.paused) return;
    const Impl = this.o.WebSocketImpl ?? (typeof WebSocket !== 'undefined' ? WebSocket : undefined);
    if (!Impl) {
      this.o.onStatus('closed');
      return;
    }
    this.o.onStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    let ws: WebSocket;
    try {
      ws = new Impl(ARCUS_HOSTS[this.o.env].ws);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      for (const f of subscribeFrames(this.o.address, this.o.accountIndex)) ws.send(f);
      this.o.onStatus('open');
      this.o.onConnected();
    };
    ws.onmessage = (ev) => this.handleMessage(ev.data);
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      if (!this.stopped && !this.paused) this.scheduleReconnect();
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* خاموش */
      }
    };
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') return;
    let msg: { type?: string; channel?: string; id?: string; accountIndex?: number };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (msg.type !== 'subscribed' && msg.type !== 'channel_data') return;
    if (!msg.channel || !(LIVE_CHANNELS as readonly string[]).includes(msg.channel)) return;
    // فریم باید متعلق به همین آدرس و زیرحساب باشد (هر فریم accountIndex دارد)
    if (msg.id && msg.id.toLowerCase() !== this.o.address.toLowerCase()) return;
    if (typeof msg.accountIndex === 'number' && msg.accountIndex !== this.o.accountIndex) return;
    this.o.onSignal(msg.channel as LiveChannel);
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.paused) return;
    this.clearTimer();
    const delay = backoffDelay(this.attempt++, this.o.random);
    this.o.onStatus('reconnecting');
    this.timer = setTimeout(() => this.connect(), delay);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private closeSocket(): void {
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        /* خاموش */
      }
    }
  }
}
