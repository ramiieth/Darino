/**
 * useAutoSync — همگام‌سازی خودکار داده‌ها (زنده‌نگهداشتن همه بخش‌ها)
 *
 * یک زمان‌بند سراسری که بین همه کامپوننت‌ها با کلید یکسان مشترک است:
 *  - هر کلید فقط یک تایمر مؤثر دارد (رفر-کاونت هنگام mount/unmount)
 *  - به‌روزرسانی دوره‌ای با فاصله `intervalMs`
 *  - به‌روزرسانی هنگام فوکوس/بازگشت به تب (اگر داده از `minAgeMs` کهنه‌تر باشد)
 *  - وقتی تب مخفی است درخواست شبکه ارسال نمی‌شود (document.hidden)
 *  - runها توسط خود لایه داده (loadPromise/in-flight) و کش TTL سرویس‌ها dedupe می‌شوند
 */
import { useEffect, useRef } from 'react';

/** یک وظیفه همگام‌سازی (یک کلید = یک دامنه داده) */
export interface SyncTask {
  key: string;
  intervalMs: number;
  minAgeMs: number;
  lastRun: number;
  run: () => void;
}

/** فاصله بررسی سراسری — وظایف هر کدام فاصله خودشان را دارند */
const GLOBAL_TICK_MS = 10_000;

const tasks = new Set<SyncTask>();
let globalTimer: ReturnType<typeof setInterval> | null = null;
let focusBound = false;

/**
 * منطق خالص: کدام وظایف الان باید اجرا شوند؟
 *  - تب مخفی → هیچ (صرفه‌جویی شبکه + مرورگرها به‌هرحال throttle می‌کنند)
 *  - tick دوره‌ای → `now - lastRun >= intervalMs`
 *  - فوکوس → `now - lastRun >= minAgeMs` (فقط وقتی داده به‌اندازه کافی کهنه است)
 */
export function dueSyncTasks(
  now: number,
  taskList: SyncTask[],
  opts: { focus?: boolean; hidden?: boolean } = {}
): SyncTask[] {
  if (opts.hidden) return [];
  return taskList.filter((t) => {
    const age = now - t.lastRun;
    const min = opts.focus ? t.minAgeMs : t.intervalMs;
    return age >= min;
  });
}

function runDue(now: number, focus = false): void {
  const hidden = typeof document !== 'undefined' && document.hidden;
  dueSyncTasks(now, [...tasks], { focus, hidden }).forEach((t) => {
    t.lastRun = now;
    try {
      t.run();
    } catch {
      /* خطای اجرا — زمان‌بند نباید بشکند */
    }
  });
}

function onFocus(): void {
  runDue(Date.now(), true);
}

function onVisibility(): void {
  if (!document.hidden) runDue(Date.now(), true);
}

function ensureScheduler(): void {
  if (!globalTimer) {
    globalTimer = setInterval(() => runDue(Date.now(), false), GLOBAL_TICK_MS);
  }
  if (!focusBound) {
    focusBound = true;
    if (typeof window !== 'undefined') window.addEventListener('focus', onFocus);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  }
}

/** پاک‌سازی زمان‌بند (تست) */
export function resetAutoSyncRegistry(): void {
  tasks.clear();
  if (globalTimer) {
    clearInterval(globalTimer);
    globalTimer = null;
  }
  if (focusBound) {
    focusBound = false;
    if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
  }
}

/**
 * هوک مصرفی:
 *  - در mount یک وظیفه با کلید `key` ثبت می‌کند (اگر هیچ نمونه دیگری با همان کلید mount نباشد)
 *  - در unmount آن را حذف می‌کند
 *  - `run` همیشه آخرین بستار است (بدون مشکل stale closure)
 */
export function useAutoSync(
  key: string,
  run: () => void,
  opts?: { intervalMs?: number; minAgeMs?: number; enabled?: boolean }
): void {
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    const enabled = opts?.enabled ?? true;
    if (!enabled) return;
    const task: SyncTask = {
      key,
      intervalMs: opts?.intervalMs ?? 120_000,
      minAgeMs: opts?.minAgeMs ?? 30_000,
      // داده همین الان (در mount) دریافت می‌شود → اولین tick دوره‌ای رفرش اضافه نمی‌زند
      lastRun: Date.now(),
      run: () => runRef.current()
    };
    tasks.add(task);
    ensureScheduler();
    return () => {
      tasks.delete(task);
    };
    // فقط کلید/فاصله‌ها در deps — run از طریق ref خوانده می‌شود
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, opts?.intervalMs, opts?.minAgeMs, opts?.enabled]);
}

/** تعداد وظایف فعال (تست) */
export function autoSyncTaskCount(): number {
  return tasks.size;
}
