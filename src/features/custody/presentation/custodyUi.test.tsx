// @vitest-environment jsdom
/**
 * رابط دارایی چندشبکه‌ای و Arcus — حالت خالی بدون دادهٔ ساختگی، لوگو و fallback، RTL
 * IndexedDB در jsdom وجود ندارد → مخزن روی فالبک حافظه کار می‌کند (هیچ دادهٔ واقعی‌ای نوشته نمی‌شود).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LogoImage, TokenLogo, safeLogoSrc } from '@/shared/components/ui/EntityLogo';
import { __resetCustodyForTests } from '../data/repository';
import HoldingsPage from './HoldingsPage';
import ArcusPage from '@/features/arcus/presentation/ArcusPage';

beforeEach(() => {
  __resetCustodyForTests();
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('شبکه در تست غیرفعال است'))));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('EntityLogo', () => {
  it('فقط مسیر محلی /logos پذیرفته می‌شود؛ URL دلخواه یا SVG بارگذاری نمی‌شود', () => {
    expect(safeLogoSrc('/logos/chain-4663.png')).toBe('/logos/chain-4663.png');
    expect(safeLogoSrc('/logos/x.webp')).toBeNull();
    expect(safeLogoSrc('https://evil.example/x.png')).toBeNull();
    expect(safeLogoSrc('/logos/x.svg')).toBeNull();
    expect(safeLogoSrc('/logos/../secret.png')).toBeNull();
  });

  it('خطای بارگذاری → آواتار حرفی با alt مناسب (رابط خراب نمی‌شود)', () => {
    render(<LogoImage src="/logos/token-usdg.png" label="USDG" />);
    const img = screen.getByAltText('USDG');
    fireEvent.error(img);
    expect(screen.queryByAltText('USDG')).toBeNull();
    expect(screen.getByRole('img', { name: 'USDG' })).toBeTruthy();
  });

  it('لوگوی توکن نشان شبکه دارد و متن جایگزین شبکه را می‌گوید', () => {
    render(<TokenLogo logo="/logos/token-usdg.png" symbol="USDG" name="Global Dollar" networkLogo="/logos/chain-4663.png" networkName="Robinhood Chain" />);
    expect(screen.getByRole('img', { name: 'Global Dollar روی Robinhood Chain' })).toBeTruthy();
    expect(screen.getByAltText('Robinhood Chain')).toBeTruthy();
  });
});

describe('حالت خالی — بدون داده یا موجودی ساختگی', () => {
  it('صفحهٔ دارایی‌ها پیش از ثبت هیچ عدد یا رکوردی نشان نمی‌دهد', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <HoldingsPage />
        </MemoryRouter>
      );
    });
    expect(await screen.findByText('هنوز محل نگهداری‌ای ثبت نشده')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\$\d/);
  });

  it('تب عملیات خالی است و دکمه‌ها «ثبت» می‌گویند نه «اجرا»', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/?tab=operations']}>
          <HoldingsPage />
        </MemoryRouter>
      );
    });
    expect(await screen.findByText('هنوز عملیاتی ثبت نشده')).toBeTruthy();
    expect(screen.getByRole('button', { name: /ثبت عملیات/ })).toBeTruthy();
    const labels = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    expect(labels.some((l) => /اجرا|ارسال|Swap now|Bridge now|Execute/i.test(l))).toBe(false);
    expect(document.body.textContent).toContain('تراکنشی اجرا نمی‌شود');
  });

  it('صفحهٔ آرکوس بدون تنظیمات، فقط دعوت به افزودن زیرحساب را نشان می‌دهد و درخواستی نمی‌فرستد', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <ArcusPage />
        </MemoryRouter>
      );
    });
    expect(await screen.findByText('هنوز زیرحساب آرکوس ذخیره نشده')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/private key|seed phrase|کلید خصوصی را وارد/i);
  });

  it('فرم افزودن زیرحساب: فیلدها خالی‌اند و کلید/امضا خواسته نمی‌شود', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <ArcusPage />
        </MemoryRouter>
      );
    });
    fireEvent.click((await screen.findAllByRole('button', { name: /افزودن زیرحساب/ }))[0]);
    const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
    expect(inputs.every((i) => i.type === 'checkbox' || i.value === '')).toBe(true);
    expect(document.body.textContent).toContain('کلید خصوصی یا عبارت بازیابی نمی‌خواهد');
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
});
