// @vitest-environment jsdom
/**
 * تست‌های زمان‌بند همگام‌سازی خودکار (useAutoSync)
 *  - منطق خالص dueSyncTasks: فاصله دوره‌ای، مین‌ایج هنگام فوکوس، تب مخفی
 *  - ثبت/حذف وظایف با کلید مشترک (رفر-کاونت)
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import {
  useAutoSync,
  dueSyncTasks,
  resetAutoSyncRegistry,
  autoSyncTaskCount,
  type SyncTask
} from '@/shared/hooks/useAutoSync';

function mk(key: string, intervalMs: number, minAgeMs: number, lastRun: number, run = () => {}): SyncTask {
  return { key, intervalMs, minAgeMs, lastRun, run };
}

afterEach(() => {
  cleanup();
  resetAutoSyncRegistry();
  vi.useRealTimers();
});

describe('dueSyncTasks — منطق خالص', () => {
  const now = 1_000_000;

  it('وظیفه با عمر >= فاصله، در tick دوره‌ای اجرا می‌شود', () => {
    const t1 = mk('a', 120_000, 30_000, now - 121_000);
    const t2 = mk('b', 120_000, 30_000, now - 1000); // هنوز تازه است
    const due = dueSyncTasks(now, [t1, t2]);
    expect(due.map((t) => t.key)).toEqual(['a']);
  });

  it('در فوکوس فقط داده‌های کهنه‌تر از minAge رفرش می‌شوند (نه درخواست اضافه)', () => {
    const t1 = mk('a', 300_000, 60_000, now - 90_000); // ۹۰ ثانیه — کهنه → رفرش
    const t2 = mk('b', 300_000, 60_000, now - 10_000); // ۱۰ ثانیه — تازه → بدون رفرش
    const due = dueSyncTasks(now, [t1, t2], { focus: true });
    expect(due.map((t) => t.key)).toEqual(['a']);
  });

  it('وقتی تب مخفی است هیچ درخواستی ارسال نمی‌شود (صرفه‌جویی شبکه)', () => {
    const t1 = mk('a', 60_000, 10_000, now - 10 * 60_000);
    expect(dueSyncTasks(now, [t1], { hidden: true })).toEqual([]);
  });

  it('وظیفه با فاصله ۰ همیشه آماده اجراست', () => {
    const t = mk('a', 0, 0, now);
    expect(dueSyncTasks(now, [t])).toHaveLength(1);
  });
});

describe('useAutoSync — زمان‌بند سراسری', () => {
  it('mount → وظیفه ثبت می‌شود؛ unmount → حذف می‌شود (رفر-کاونت)', () => {
    const { unmount } = renderHook(() => useAutoSync('k1', () => {}));
    expect(autoSyncTaskCount()).toBe(1);
    unmount();
    expect(autoSyncTaskCount()).toBe(0);
  });

  it('دو mount با کلید یکسان — دو وظیفه ولی یک تایمر مؤثر؛ هر دو پس از unmount پاک می‌شوند', () => {
    const h1 = renderHook(() => useAutoSync('same', () => {}));
    const h2 = renderHook(() => useAutoSync('same', () => {}));
    expect(autoSyncTaskCount()).toBe(2);
    h1.unmount();
    expect(autoSyncTaskCount()).toBe(1);
    h2.unmount();
    expect(autoSyncTaskCount()).toBe(0);
  });

  it('tick دوره‌ای: run آخرین بستار را اجرا می‌کند (بدون stale closure)', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const { rerender } = renderHook(
      ({ v }: { v: number }) => useAutoSync('k', () => void (calls = v), { intervalMs: 60_000 }),
      { initialProps: { v: 1 } }
    );
    rerender({ v: 2 });

    // ۶۰ ثانیه بعد از mount → اجرا با آخرین بستار (v=2)
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(calls).toBe(2);
  });

  it('enabled=false → هیچ وظیفه‌ای ثبت نمی‌شود', () => {
    renderHook(() => useAutoSync('off', () => {}, { enabled: false }));
    expect(autoSyncTaskCount()).toBe(0);
  });

  it('فوکوس پنجره → فقط وظایف کهنه‌تر از minAge اجرا می‌شوند', async () => {
    vi.useFakeTimers();
    let calls = 0;
    renderHook(() => useAutoSync('f', () => void calls++, { intervalMs: 600_000, minAgeMs: 60_000 }));

    // فوکوس بلافاصله بعد از mount: داده تازه (lastRun=now) → بدون اجرا
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(calls).toBe(0);

    // بعد از ۶۱ ثانیه → فوکوس دوباره اجرا می‌کند
    await act(async () => {
      vi.advanceTimersByTime(61_000);
      window.dispatchEvent(new Event('focus'));
    });
    expect(calls).toBe(1);

    // فوکوس بعدی بلافاصله: داده تازه → بدون اجرا
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(calls).toBe(1);
  });

  it('خطا در run زمان‌بند را نمی‌شکند', async () => {
    vi.useFakeTimers();
    let calls = 0;
    renderHook(() =>
      useAutoSync('boom', () => {
        calls++;
        throw new Error('x');
      }, { intervalMs: 60_000 })
    );
    await act(async () => {
      vi.advanceTimersByTime(60_000);
      vi.advanceTimersByTime(60_000);
    });
    expect(calls).toBe(2); // بعد از خطا هم ادامه می‌دهد
  });
});
