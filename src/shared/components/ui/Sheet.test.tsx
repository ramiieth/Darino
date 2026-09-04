// @vitest-environment jsdom
/**
 * فاز ۴ تست‌ها — کامپوننت‌های UI: Bottom Sheet (باز/بسته با ESC و درگ) 
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Sheet } from '@/shared/components/ui/Sheet';

afterEach(() => cleanup());

describe('Bottom Sheet', () => {
  it('با باز بودن رندر می‌شود و با کلیک روی پس‌زمینه بسته می‌شود', () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="جزئیات">
        <p>محتوا</p>
      </Sheet>
    );
    expect(screen.getByText('جزئیات')).toBeTruthy();
    // کلیک روی overlay
    const overlay = document.querySelector('.fixed.inset-0.z-50.bg-black\\/50');
    fireEvent.click(overlay as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('با کلید Escape بسته می‌شود', () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="جزئیات">
        <p>محتوا</p>
      </Sheet>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('وقتی open=false رندر نمی‌شود', () => {
    const onClose = vi.fn();
    render(
      <Sheet open={false} onClose={onClose} title="جزئیات">
        <p>محتوا</p>
      </Sheet>
    );
    expect(screen.queryByText('جزئیات')).toBeNull();
  });

  it('با کشیدن دستگیره به پایین (درگ) بسته می‌شود', () => {
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="جزئیات">
        <p>محتوا</p>
      </Sheet>
    );
    const handle = document.querySelector('.cursor-grab') as Element;
    expect(handle).toBeTruthy();
    // شروع درگ روی دستگیره
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 100 });
    // شبیه‌سازی درگ رو به پایین روی پنل (jsdom بدون pointer-capture → رویداد روی پنل)
    const panel = document.querySelector('[role="dialog"]') as Element;
    fireEvent.pointerMove(panel, { pointerId: 1, clientY: 240 });
    fireEvent.pointerUp(panel, { pointerId: 1, clientY: 240 });
    // offset=140 > 110 → بستن (پیاده‌سازی CSS+pointer بدون framer)
    expect(onClose).toHaveBeenCalledTimes(1);
    // دکمه بستن (X) هم جدا کار می‌کند
    const closeBtn = screen.getByLabelText('بستن');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
