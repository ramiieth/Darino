/**
 * هشدار برعکس‌شدن اسپرد فاندینگ — فهرست پایش در تنظیمات محلی، بررسی با نرخ‌های لحظه‌ای
 *
 * فقط وقتی دارینو باز است کار می‌کند (سرور یا پوش پس‌زمینه ندارد).
 * برای هر جفت فقط در لحظهٔ تغییر علامت (مثبت → صفر/منفی و برعکس) یک بار خبر می‌دهد.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { settingGet, settingSet } from '@/shared/lib/db';
import { toast } from '@/shared/store/toastStore';
import { DELTA_VENUE_LABELS, type DeltaVenue, type VenueBook } from './deltaMarkets';

const KEY = 'calc.fundingWatch.v1';

export interface WatchEntry {
  key: string;
  base: string;
  shortVenue: DeltaVenue;
  shortRef: string;
  longVenue: DeltaVenue;
  longRef: string;
  /** آخرین علامت دیده‌شده: ۱ = به نفع، -۱ = برعکس */
  lastSign: 1 | -1;
}

interface WatchState {
  hydrated: boolean;
  entries: WatchEntry[];
}

export const useSpreadWatch = create<WatchState>(() => ({ hydrated: false, entries: [] }));

let hydrating: Promise<void> | null = null;
export function hydrateSpreadWatch(): Promise<void> {
  if (useSpreadWatch.getState().hydrated) return Promise.resolve();
  hydrating ??= settingGet<WatchEntry[]>(KEY, []).then((list) => {
    useSpreadWatch.setState({ hydrated: true, entries: Array.isArray(list) ? list.filter((e) => e && typeof e.key === 'string').slice(0, 30) : [] });
  });
  return hydrating;
}

function save(entries: WatchEntry[]) {
  useSpreadWatch.setState({ entries });
  void settingSet(KEY, entries);
}

export function toggleWatch(entry: Omit<WatchEntry, 'lastSign'>): boolean {
  const { entries } = useSpreadWatch.getState();
  if (entries.some((e) => e.key === entry.key)) {
    save(entries.filter((e) => e.key !== entry.key));
    return false;
  }
  save([...entries, { ...entry, lastSign: 1 as const }].slice(-30));
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission().catch(() => undefined);
  return true;
}

/** اسپرد لحظه‌ای (٪ سالانه) برای جهت ذخیره‌شده؛ null اگر نرخ یکی از دو طرف نامعلوم باشد */
export function currentSpreadApr(e: WatchEntry, books: Record<DeltaVenue, VenueBook>): number | null {
  const s = books[e.shortVenue].quotes.find((q) => q.ref === e.shortRef)?.fundingHourly;
  const l = books[e.longVenue].quotes.find((q) => q.ref === e.longRef)?.fundingHourly;
  return s == null || l == null ? null : (s - l) * 8760 * 100;
}

function notify(bad: boolean, title: string, body: string) {
  toast(bad ? 'error' : 'info', `${title} — ${body}`);
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible') new Notification(title, { body });
  } catch {
    /* مرورگر اعلان را پشتیبانی نمی‌کند */
  }
}

/** هر بار که نرخ‌های لحظه‌ای تازه می‌شوند علامت اسپرد جفت‌های پایش‌شده را بررسی می‌کند */
export function useReversalAlerts(books: Record<DeltaVenue, VenueBook>) {
  useEffect(() => {
    void hydrateSpreadWatch();
  }, []);
  const entries = useSpreadWatch((s) => s.entries);
  useEffect(() => {
    let changed = false;
    const next = entries.map((e) => {
      const apr = currentSpreadApr(e, books);
      if (apr === null) return e;
      const sign: 1 | -1 = apr > 0 ? 1 : -1;
      if (sign === e.lastSign) return e;
      changed = true;
      const pair = `${e.base}: Short ${DELTA_VENUE_LABELS[e.shortVenue]} / Long ${DELTA_VENUE_LABELS[e.longVenue]}`;
      notify(
        sign < 0,
        sign < 0 ? 'اسپرد فاندینگ برعکس شد' : 'اسپرد فاندینگ دوباره به نفع شد',
        sign < 0 ? `${pair} — الان این جهت فاندینگ می‌پردازد؛ خروج یا جابه‌جایی را بررسی کنید.` : `${pair} — اسپرد دوباره مثبت است.`
      );
      return { ...e, lastSign: sign };
    });
    if (changed) save(next);
  }, [books, entries]);
}
