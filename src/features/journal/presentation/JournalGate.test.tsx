// @vitest-environment jsdom
/**
 * ژورنال بدون رمز روی این دستگاه: بدون پرچم صفحهٔ ورود + گزینه؛ با پرچم مستقیم باز؛ «قفل دوباره» برمی‌گرداند.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useAuth } from '@/features/auth/authClient';
import { AuthGate } from '@/features/auth/AuthGate';
import { JournalGate } from './JournalGate';

vi.mock('qrcode', () => ({ toDataURL: vi.fn(async () => 'data:image/png;base64,AAAA') }));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const OPEN = 'باز کردن ژورنال روی این دستگاه بدون رمز';

describe('JournalGate', () => {
  it('بدون ورود و بدون پرچم: صفحهٔ ورود با گزینهٔ باز کردن؛ بعد از کلیک ژورنال و هشدار محلی، و قفل دوباره', () => {
    useAuth.setState({ status: 'unauthenticated', hasPasskeys: false, hasPassword: true, setupAvailable: false, session: null });
    render(<JournalGate><p>محتوای ژورنال</p></JournalGate>);
    expect(screen.queryByText('محتوای ژورنال')).toBeNull();
    expect(screen.getByText('ورود به دارینو')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: OPEN }));
    expect(screen.getByText('محتوای ژورنال')).toBeTruthy();
    expect(screen.getByText(/بدون رمز باز است/)).toBeTruthy();
    expect(localStorage.getItem('darino-journal-open-device')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'قفل دوباره روی این دستگاه' }));
    expect(screen.queryByText('محتوای ژورنال')).toBeNull();
    expect(localStorage.getItem('darino-journal-open-device')).toBeNull();
  });

  it('با ورود: ژورنال بدون هشدار؛ صفحه‌های خصوصی دیگر گزینهٔ بدون رمز ندارند', () => {
    localStorage.setItem('darino-journal-open-device', '1');
    useAuth.setState({ status: 'authenticated' });
    render(<JournalGate><p>محتوای ژورنال</p></JournalGate>);
    expect(screen.getByText('محتوای ژورنال')).toBeTruthy();
    expect(screen.queryByText(/بدون رمز باز است/)).toBeNull();
    cleanup();
    // پرچم ژورنال روی صفحهٔ خصوصی دیگر اثری ندارد
    useAuth.setState({ status: 'unauthenticated', hasPasskeys: false, hasPassword: true, setupAvailable: false, session: null });
    render(<AuthGate><p>دارایی من</p></AuthGate>);
    expect(screen.queryByText('دارایی من')).toBeNull();
    expect(screen.queryByRole('button', { name: OPEN })).toBeNull();
  });
});
