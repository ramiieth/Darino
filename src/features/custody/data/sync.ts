/** ============================================================
 * همگام‌سازی دارایی چندشبکه‌ای بین دستگاه‌ها (وب + PWA آیفون)
 *
 *  • فقط وقتی نشست Passkey معتبر است (کوکی HttpOnly). بدون نشست هیچ درخواستی نمی‌رود.
 *  • pull → ادغام (نسخهٔ جدیدتر برنده) → push فقط رکوردهایی که نسخهٔ محلی جدیدتر است.
 *  • آفلاین: تغییرات محلی می‌مانند و در اولین فرصت ارسال می‌شوند (نیازی به صف جدا نیست،
 *    چون مقایسهٔ نسخه‌ها خودش رکوردهای ارسال‌نشده را پیدا می‌کند).
 *  • زمان‌بندی: پس از بارگذاری، ۱.۵ ثانیه پس از هر ذخیره، هنگام بازگشت به صفحه/اتصال،
 *    و هر ۶۰ ثانیه فقط وقتی صفحه دیده می‌شود.
 * ============================================================ */
import { create } from 'zustand';
import { fetchJson, HttpError, isRemoteAllowed } from '@/repositories/remoteClient';
import { planMerge, toSyncRecords, type SyncRecord } from '../domain/syncMerge';
import type { Asset, Holding, Network, Operation, PrefRecord } from '../domain/types';
import { applyRemote, getCustodySnapshot, loadCustody, onLocalChange } from './repository';

export type SyncState = 'idle' | 'syncing' | 'ok' | 'offline' | 'signed_out' | 'error' | 'server_unconfigured';

interface SyncStore {
  state: SyncState;
  lastSyncAt: number | null;
  pending: number;
  conflicts: number;
  message: string | null;
}

export const useCustodySync = create<SyncStore>(() => ({ state: 'idle', lastSyncAt: null, pending: 0, conflicts: 0, message: null }));

let running: Promise<boolean> | null = null;
let again = false;

function split(records: SyncRecord[]) {
  const out = { holdings: [] as Holding[], operations: [] as Operation[], networks: [] as Network[], assets: [] as Asset[], prefs: [] as PrefRecord[] };
  for (const r of records) (out[r.collection] as unknown[]).push(r.payload);
  return out;
}

/** یک دور کامل همگام‌سازی — true یعنی محلی و سرور هم‌سان شدند */
export function syncCustodyNow(): Promise<boolean> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    if (!isRemoteAllowed()) {
      useCustodySync.setState({ state: 'offline' });
      return false;
    }
    useCustodySync.setState({ state: 'syncing', message: null });
    try {
      await loadCustody();
      const remote = await fetchJson<{ configured: boolean; records: SyncRecord[] }>('/api/custody', { timeoutMs: 10_000 });
      if (!remote.configured) {
        useCustodySync.setState({ state: 'server_unconfigured', message: 'پایگاه داده روی سرور تنظیم نشده' });
        return false;
      }
      const snap = getCustodySnapshot();
      const plan = planMerge(toSyncRecords(snap), remote.records ?? []);
      if (plan.pull.length) await applyRemote(split(plan.pull));
      let stale = 0;
      for (let i = 0; i < plan.push.length; i += 500) {
        const res = await fetchJson<{ applied: string[]; stale: string[]; invalid: number }>('/api/custody', {
          method: 'POST',
          body: { records: plan.push.slice(i, i + 500) },
          timeoutMs: 20_000
        });
        stale += res.stale.length;
      }
      // اگر سرور نسخهٔ جدیدتری داشت، دور بعد آن را pull می‌کند
      if (stale > 0) again = true;
      useCustodySync.setState({ state: 'ok', lastSyncAt: Date.now(), pending: 0, conflicts: useCustodySync.getState().conflicts + stale });
      return stale === 0;
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) useCustodySync.setState({ state: 'signed_out', message: 'برای همگام‌سازی وارد شوید' });
      else if (e instanceof HttpError) useCustodySync.setState({ state: 'error', message: `خطای سرور (${e.status})` });
      else useCustodySync.setState({ state: 'offline', message: 'اتصال برقرار نیست — تغییرات روی همین دستگاه محفوظ است' });
      return false;
    }
  })().finally(() => {
    running = null;
    if (again) {
      again = false;
      setTimeout(() => void syncCustodyNow(), 300);
    }
  });
  return running;
}

let started = false;
let debounce: ReturnType<typeof setTimeout> | null = null;

/** شروع زمان‌بند (یک‌بار در اپ، پس از ورود) */
export function startCustodySync(): () => void {
  if (started || typeof window === 'undefined') return () => undefined;
  started = true;
  const schedule = (ms: number) => {
    if (debounce) clearTimeout(debounce);
    useCustodySync.setState((s) => ({ pending: s.pending + 1 }));
    debounce = setTimeout(() => void syncCustodyNow(), ms);
  };
  const off = onLocalChange(() => schedule(1500));
  const onVis = () => document.visibilityState === 'visible' && void syncCustodyNow();
  const onOnline = () => void syncCustodyNow();
  const timer = setInterval(() => document.visibilityState === 'visible' && void syncCustodyNow(), 60_000);
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('online', onOnline);
  void syncCustodyNow();
  return () => {
    started = false;
    off();
    clearInterval(timer);
    if (debounce) clearTimeout(debounce);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('online', onOnline);
  };
}
