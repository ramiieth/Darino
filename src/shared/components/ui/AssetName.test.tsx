/** @vitest-environment jsdom */
/**
 * تست رندر AssetName — سلسله‌مراتب نام فارسی / Ticker و ایمنی Bidi
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AssetName } from './AssetName';

describe('AssetName — نمایش نام دارایی', () => {
  it('نام فارسی به‌عنوان عنصر اصلی و Ticker به‌عنوان ثانویه رندر می‌شود', () => {
    const { container } = render(<AssetName symbol="BTC" />);
    expect(screen.getByText('بیت‌کوین')).toBeTruthy();
    expect(screen.getByText('BTC')).toBeTruthy();
    // Ticker داخل bdi با dir=ltr → متن لاتین ایزوله است
    const bdis = container.querySelectorAll('bdi');
    expect(bdis.length).toBe(2);
    expect(bdis[0].getAttribute('dir')).toBe('rtl'); // نام فارسی
    expect(bdis[1].getAttribute('dir')).toBe('ltr'); // Ticker
  });

  it('نام فارسی از Ticker وزن بصری بیشتری دارد', () => {
    const { container } = render(<AssetName symbol="ETH" />);
    const [nameEl, tickerEl] = Array.from(container.querySelectorAll('p'));
    expect(nameEl.className).toContain('text-[12px]');
    expect(nameEl.className).toContain('font-extrabold');
    expect(tickerEl.className).toContain('text-[9px]');
    expect(tickerEl.className).toContain('text-muted/70');
  });

  it('نام‌های طولانی truncate می‌شوند (ارتفاع ردیف ثابت)', () => {
    const long = 'یک نام بسیار بسیار طولانی برای آزمودن سرریز کارت در موبایل';
    const { container } = render(<AssetName symbol="LONGX" fallbackName={long} />);
    expect(container.querySelectorAll('p')[0].className).toContain('truncate');
    expect(container.querySelector('p:nth-of-type(2) bdi')?.className).toContain('truncate');
    expect(container.firstElementChild?.className).toContain('min-w-0');
  });

  it('نماد ناشناخته فقط Ticker را نشان می‌دهد (بدون خط دوم تکراری)', () => {
    const { container } = render(<AssetName symbol="XYZ" />);
    expect(screen.getByText('XYZ')).toBeTruthy();
    expect(container.querySelectorAll('p').length).toBe(1);
  });

  it('برچسب منبع هم‌خط با Ticker است — ارتفاع همیشه حداکثر ۲ خط', () => {
    const { container } = render(<AssetName symbol="BTC" meta="کریپتو" />);
    const ps = container.querySelectorAll('p');
    expect(ps.length).toBe(2);
    expect(ps[1].textContent).toContain('BTC');
    expect(ps[1].textContent).toContain('کریپتو');
  });

  it('در نبود نگاشت، نام فعلی سیستم + Ticker حفظ می‌شود', () => {
    render(<AssetName symbol="TSLAX" fallbackName="تسلا (توکن‌ایز)" />);
    expect(screen.getByText('تسلا (توکن‌ایز)')).toBeTruthy();
    expect(screen.getByText('TSLAX')).toBeTruthy();
  });

  it('همه نمادهای کلیدی نام فارسی + Ticker دارند', () => {
    for (const sym of ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'USDT', 'USDC', 'XAUT']) {
      const { container, unmount } = render(<AssetName symbol={sym} />);
      const ps = container.querySelectorAll('p');
      expect(ps.length, sym).toBe(2);
      expect(ps[1].textContent, sym).toBe(sym); // Symbol دست‌نخورده
      unmount();
    }
  });
});
