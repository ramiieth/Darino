/**
 * کلاینت اعلان‌ها — وضعیت، قواعد، اشتراک Web Push این دستگاه
 * همهٔ درخواست‌ها با نشست و هدر CSRF از طریق fetchJson.
 */
import { fetchJson } from '@/repositories/remoteClient';
import type { AlertRules } from '../domain/rules';

export interface AlertsStatus {
  vapidPublicKey: string;
  devices: { id: string; label: string | null; host: string; createdAt: number }[];
  rules: AlertRules;
  tick: { configured: boolean; lastAt: number | null; lastResult: { users: number; sent: number; errors: string[] } | null };
  bale: boolean;
  log: { at: number; title: string; body: string; push: number; bale: 'sent' | 'off' | 'failed' }[];
}

const op = (name: string) => `/api/integrations?op=${name}`;

export const getAlertsStatus = () => fetchJson<AlertsStatus>(op('alerts-status'), { timeoutMs: 15_000 });
export const saveAlertRules = (rules: AlertRules) => fetchJson<{ rules: AlertRules }>(op('alerts-rules'), { method: 'POST', body: { rules } });
export const sendTestAlert = () => fetchJson<{ push: number; bale: 'sent' | 'off' | 'failed' }>(op('alerts-test'), { method: 'POST', body: {}, timeoutMs: 20_000 });
export const checkNow = () => fetchJson<{ sent: number; flips: number; nearLiquidation: number; exposures: number; errors: string[] }>(op('alerts-check'), { method: 'POST', body: {}, timeoutMs: 45_000 });
export const newTickKey = () => fetchJson<{ key: string }>(op('alerts-tick-key'), { method: 'POST', body: {} });
export const removeDevice = (id: string) => fetchJson<{ ok: boolean }>(op('push-unsubscribe'), { method: 'POST', body: { id } });

/** پشتیبانی مرورگر؛ روی آیفون فقط وقتی دارینو به صفحهٔ اصلی اضافه شده باشد */
export function pushSupport(): 'ok' | 'ios-install' | 'unsupported' {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  if (!('PushManager' in window) || !('Notification' in window)) return ios && !standalone ? 'ios-install' : 'unsupported';
  return 'ok';
}

const keyBytes = (b64url: string) => {
  const s = atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'آیفون' : /Android/.test(ua) ? 'اندروید' : /Mac/.test(ua) ? 'مک' : /Windows/.test(ua) ? 'ویندوز' : 'دستگاه';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [os, browser].filter(Boolean).join(' ');
}

/** اجازه + اشتراک این دستگاه + ثبت در سرور */
export async function enablePush(vapidPublicKey: string): Promise<void> {
  if (pushSupport() !== 'ok') throw new Error('unsupported');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('denied');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const key = keyBytes(vapidPublicKey);
  // کلید سرور عوض شده؟ اشتراک قدیمی کار نمی‌کند
  const old = sub?.options.applicationServerKey;
  if (sub && old && !new Uint8Array(old).every((b, i) => b === key[i])) { await sub.unsubscribe(); sub = null; }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await fetchJson(op('push-subscribe'), { method: 'POST', body: { subscription: sub.toJSON(), label: deviceLabel() } });
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await fetchJson(op('push-unsubscribe'), { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => undefined);
  await sub.unsubscribe();
}
