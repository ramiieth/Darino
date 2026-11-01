// @vitest-environment jsdom
/**
 * صفحه‌های شخصی بدون رمز و بدون پیام؛ فقط «امنیت و دستگاه‌ها» (strict) صفحهٔ ورود دارد
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AuthGate } from './AuthGate';
import { useAuth } from './authClient';

vi.mock('qrcode', () => ({ toDataURL: vi.fn(async () => 'data:image/png;base64,AAAA') }));

const CONTENT = 'محتوای داشبورد';
const ui = (strict = false) => render(<AuthGate strict={strict}><p>{CONTENT}</p></AuthGate>);

beforeEach(() => useAuth.setState({ status: 'unauthenticated', hasPasskeys: false, hasPassword: true, setupAvailable: false, session: null }));
afterEach(cleanup);

describe('AuthGate', () => {
  it('بدون ورود: صفحه مستقیم و بدون پیام باز می‌شود', () => {
    ui();
    expect(screen.getByText(CONTENT)).toBeTruthy();
    expect(screen.queryByText('ورود به دارینو')).toBeNull();
    expect(screen.queryByText(/بدون رمز باز است/)).toBeNull();
  });

  it('پیش از معلوم شدن وضعیت ورود هم صفحه منتظر نمی‌ماند', () => {
    useAuth.setState({ status: 'unknown' });
    ui();
    expect(screen.getByText(CONTENT)).toBeTruthy();
  });

  it('صفحهٔ امنیت (strict) بدون ورود صفحهٔ ورود دارد', () => {
    ui(true);
    expect(screen.queryByText(CONTENT)).toBeNull();
    expect(screen.getByText('ورود به دارینو')).toBeTruthy();
  });
});
