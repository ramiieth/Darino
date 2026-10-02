// @vitest-environment jsdom
/**
 * صفحهٔ ورود — راه‌اندازی رمز + Google Authenticator و ورود با رمز + کد
 * شبکه mock است؛ هیچ رمز یا کلید واقعی‌ای استفاده یا ذخیره نمی‌شود.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LoginScreen } from './AuthGate';
import { useAuth } from './authClient';

vi.mock('qrcode', () => ({ toDataURL: vi.fn(async () => 'data:image/png;base64,AAAA') }));

function setStatus(p: Partial<ReturnType<typeof useAuth.getState>>) {
  useAuth.setState({ status: 'unauthenticated', hasPasskeys: false, hasPassword: false, setupAvailable: true, session: null, ...p });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

describe('صفحهٔ ورود', () => {
  it('اولین اجرا: فرم راه‌اندازی رمز باز است و تا رمز معتبر و یکسان نباشد «ادامه» غیرفعال است', () => {
    setStatus({});
    render(<LoginScreen />);
    const next = screen.getByRole('button', { name: 'ادامه' }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fireEvent.change(input('کد راه‌اندازی'), { target: { value: 'x'.repeat(30) } });
    fireEvent.change(input('رمز عبور جدید'), { target: { value: 'کوتاه' } });
    expect(screen.getByText('کوتاه است')).toBeTruthy();
    fireEvent.change(input('رمز عبور جدید'), { target: { value: 'یک-عبارت-طولانی-۱۴۰۵' } });
    fireEvent.change(input('تکرار رمز عبور'), { target: { value: 'یک-عبارت-طولانی-۱۴۰۶' } });
    expect(next.disabled).toBe(true);
    fireEvent.change(input('تکرار رمز عبور'), { target: { value: 'یک-عبارت-طولانی-۱۴۰۵' } });
    expect(next.disabled).toBe(false);
  });

  it('گام ۲: QR و دکمهٔ افزودن مستقیم نمایش داده می‌شود؛ کد با ارقام فارسی پذیرفته می‌شود', async () => {
    setStatus({});
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ ok: true, secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/Darino?secret=JBSWY3DPEHPK3PXP&issuer=Darino' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<LoginScreen />);
    fireEvent.change(input('کد راه‌اندازی'), { target: { value: 'x'.repeat(30) } });
    fireEvent.change(input('رمز عبور جدید'), { target: { value: 'یک-عبارت-طولانی-۱۴۰۵' } });
    fireEvent.change(input('تکرار رمز عبور'), { target: { value: 'یک-عبارت-طولانی-۱۴۰۵' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'ادامه' }));
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain('op=password-setup-begin');
    expect(await screen.findByAltText('کد QR برای Google Authenticator')).toBeTruthy();
    const link = screen.getByText(/افزودن مستقیم به Google Authenticator/).closest('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toMatch(/^otpauth:\/\//);
    fireEvent.change(input('کد ۶ رقمی Google Authenticator'), { target: { value: '۱۲۳ ۴۵۶' } });
    expect(input('کد ۶ رقمی Google Authenticator').value).toBe('123456');
  });

  it('رمز تعیین شده: فرم ورود رمز + کد نمایش داده می‌شود', () => {
    setStatus({ hasPassword: true, setupAvailable: false });
    render(<LoginScreen />);
    expect(input('رمز عبور').type).toBe('password');
    expect(input('کد ۶ رقمی Google Authenticator').getAttribute('autocomplete')).toBe('one-time-code');
    expect(screen.queryByRole('button', { name: 'ادامه' })).toBeNull();
  });
});
