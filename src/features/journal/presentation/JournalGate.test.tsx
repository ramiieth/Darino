// @vitest-environment jsdom
/**
 * ژورنال: دستگاه خود کاربر (پرچم یا دادهٔ محلی) بدون رمز؛ دستگاه تازه فقط صفحهٔ ورود؛ قفل با تأیید و برگشت‌پذیر
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useAuth } from '@/features/auth/authClient';

const store = vi.hoisted(() => ({ value: { loaded: true, prefs: [] as { id: string }[], holdings: [] as unknown[], operations: [] as unknown[] } }));
vi.mock('@/features/custody/data/repository', () => ({ loadCustody: vi.fn(() => Promise.resolve()), useCustodyStore: () => store.value }));
vi.mock('qrcode', () => ({ toDataURL: vi.fn(async () => 'data:image/png;base64,AAAA') }));

import { JournalGate } from './JournalGate';

const KEY = 'darino-journal-open-device';
const CONTENT = 'محتوای ژورنال';
const ui = () => render(<JournalGate><p>{CONTENT}</p></JournalGate>);

beforeEach(() => {
  store.value = { loaded: true, prefs: [], holdings: [], operations: [] };
  useAuth.setState({ status: 'unauthenticated', hasPasskeys: false, hasPassword: true, setupAvailable: false, session: null });
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('JournalGate', () => {
  it('دستگاه تازه (بدون پرچم و بدون داده): صفحهٔ ورود بدون هیچ گزینهٔ بدون رمز', () => {
    ui();
    expect(screen.queryByText(CONTENT)).toBeNull();
    expect(screen.getByText('ورود به دارینو')).toBeTruthy();
    expect(screen.queryByText(/باز کردن دوباره/)).toBeNull();
  });

  it('دستگاه خود کاربر که پرچمش پاک شده (دادهٔ ژورنال دارد): خودکار باز و پرچم ماندگار', () => {
    store.value = { ...store.value, prefs: [{ id: 'jp:abc' }] };
    ui();
    expect(screen.getByText(CONTENT)).toBeTruthy();
    expect(localStorage.getItem(KEY)).toBe('1');
  });

  it('قفل با تأیید؛ انصراف چیزی را عوض نمی‌کند؛ قفل‌شده «باز کردن دوباره» دارد', () => {
    localStorage.setItem(KEY, '1');
    ui();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'قفل این دستگاه' }));
    expect(screen.getByText(CONTENT)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'قفل این دستگاه' }));
    expect(screen.queryByText(CONTENT)).toBeNull();
    expect(localStorage.getItem(KEY)).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'باز کردن دوباره روی این دستگاه' }));
    expect(screen.getByText(CONTENT)).toBeTruthy();
  });

  it('قفل‌شده با دادهٔ محلی خودکار باز نمی‌شود', () => {
    localStorage.setItem(KEY, '0');
    store.value = { ...store.value, prefs: [{ id: 'jp:abc' }] };
    ui();
    expect(screen.queryByText(CONTENT)).toBeNull();
  });

  it('با ورود: ژورنال بدون پیام', () => {
    useAuth.setState({ status: 'authenticated' });
    ui();
    expect(screen.getByText(CONTENT)).toBeTruthy();
    expect(screen.queryByText('قفل این دستگاه')).toBeNull();
  });
});
