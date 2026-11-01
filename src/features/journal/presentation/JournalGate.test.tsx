// @vitest-environment jsdom
/**
 * ژورنال روی دستگاه‌های قبلاً مجاز بدون رمز؛ دستگاه تازه فقط صفحهٔ ورود، بدون هیچ گزینهٔ «بدون رمز»
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useAuth } from '@/features/auth/authClient';
import { JournalGate } from './JournalGate';

vi.mock('qrcode', () => ({ toDataURL: vi.fn(async () => 'data:image/png;base64,AAAA') }));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('JournalGate', () => {
  it('دستگاه تازه: صفحهٔ ورود، بدون گزینهٔ باز کردن بدون رمز', () => {
    useAuth.setState({ status: 'unauthenticated', hasPasskeys: false, hasPassword: true, setupAvailable: false, session: null });
    render(<JournalGate><p>محتوای ژورنال</p></JournalGate>);
    expect(screen.queryByText('محتوای ژورنال')).toBeNull();
    expect(screen.getByText('ورود به دارینو')).toBeTruthy();
    expect(screen.queryByText(/بدون رمز/)).toBeNull();
  });

  it('دستگاه قبلاً مجاز: ژورنال بدون رمز؛ «قفل این دستگاه» آن را به صفحهٔ ورود برمی‌گرداند', () => {
    localStorage.setItem('darino-journal-open-device', '1');
    useAuth.setState({ status: 'unauthenticated', hasPasskeys: false, hasPassword: true, setupAvailable: false, session: null });
    render(<JournalGate><p>محتوای ژورنال</p></JournalGate>);
    expect(screen.getByText('محتوای ژورنال')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'قفل این دستگاه' }));
    expect(screen.queryByText('محتوای ژورنال')).toBeNull();
    expect(localStorage.getItem('darino-journal-open-device')).toBeNull();
  });

  it('با ورود: ژورنال بدون پیام', () => {
    localStorage.setItem('darino-journal-open-device', '1');
    useAuth.setState({ status: 'authenticated' });
    render(<JournalGate><p>محتوای ژورنال</p></JournalGate>);
    expect(screen.getByText('محتوای ژورنال')).toBeTruthy();
    expect(screen.queryByText('قفل این دستگاه')).toBeNull();
  });
});
