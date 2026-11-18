// @vitest-environment jsdom
/**
 * تست رندر یکپارچه صفحه «طلای ایران» (GoldPage / GoldTab):
 * تضمین می‌کند تغییر وضعیت از حالت در حال بارگذاری (isLoading: true) به دریافت داده (isLoading: false)
 * هیچ خطای ترتیب هوک‌های React (Rendered more hooks than during the previous render) ایجاد نمی‌کند
 * و تمام ۵ بخش بدون کرش رندر می‌شوند.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoldPayload } from '../domain/gold';
import GoldPage from './GoldPage';

const DAY_MS = 86_400_000;
const NOW = Date.now();

const mockPayload: GoldPayload = {
  fetchedAt: NOW,
  ounceUsd: 2680,
  dollarToman: 69000,
  usdtToman: 69400,
  dollarSource: 'free',
  intrinsic: 4_461_000,
  bazaar: 4_520_000,
  rows: [
    { platform: 'melligold', buy: 4_530_000, sell: 4_500_000, spread: 0.0066, premium: 0.015 },
    { platform: 'milli', buy: 4_535_000, sell: 4_505_000, spread: 0.0066, premium: 0.016 }
  ],
  failed: [],
  premium: 0.013,
  stats: { p10: -0.005, p50: 0.012, p90: 0.032, days: 60, since: NOW - 60 * DAY_MS },
  coins: [{ coin: 'sekee', price: 52_000_000, premium: 0.195, stats: null }],
  decomposition: [{ days: 30, iran: 0.08, ounce: 0.03, dollar: 0.04, premium: 0.01 }],
  history18k: Array.from({ length: 65 }, (_, i) => ({
    t: NOW - (64 - i) * DAY_MS,
    close: 4_100_000 + i * 6_500
  })),
  historyDollar: Array.from({ length: 65 }, (_, i) => ({
    t: NOW - (64 - i) * DAY_MS,
    close: 64_000 + i * 80
  })),
  recordedDays: 60
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('GoldPage & GoldTab', () => {
  it('از حالت در حال بارگذاری بدون خطای React Hooks به حالت نمایش داده منتقل می‌شود و همه تب‌ها کار می‌کنند', async () => {
    let resolveFetch!: (val: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <GoldPage />
        </QueryClientProvider>
      </MemoryRouter>
    );

    // در لحظه اول (قبل از پاسخ API و بدون کش قبلی) هدر و تب‌ها بدون صفحه سفید رندر می‌شوند
    expect(screen.getByText('طلای ایران')).toBeTruthy();
    expect(screen.getByText('در حال دریافت...')).toBeTruthy();

    // پاسخ API می‌رسد (گذار از isLoading=true به isLoading=false)
    resolveFetch(
      new Response(JSON.stringify(mockPayload), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );

    expect(await screen.findByText('زنده · متصل')).toBeTruthy();
    expect(screen.getByText('تحلیل تاریخی قیمت طلای ۱۸ عیار (۷، ۳۰ و ۶۰ روز گذشته)')).toBeTruthy();

    // جابه‌جایی بین هر ۵ تب ماژول طلای ایران
    fireEvent.click(screen.getByText('خرید طلای آنلاین'));
    expect(screen.getByText('خرید و فروش طلای آنلاین')).toBeTruthy();

    fireEvent.click(screen.getByText('طلای زینتی و مقایسه'));
    expect(screen.getByText('محاسبه خرید و فروش مجدد طلای زینتی')).toBeTruthy();

    fireEvent.click(screen.getByText('صندوق‌های طلا'));
    expect(screen.getByText('صندوق‌های طلای بورسی')).toBeTruthy();
    expect(screen.getByText('صندوق عیار')).toBeTruthy();

    fireEvent.click(screen.getByText('دلار و تتر'));
    expect(screen.getByText('تحلیل تاریخی دلار آزاد و تتر')).toBeTruthy();
  });
});
