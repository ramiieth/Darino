// @vitest-environment jsdom
/**
 * PropertyMarketPage — رندر + تعامل (بدون شبکه/دیتابیس)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('@/repositories/remoteClient', () => ({
  fetchJson: vi.fn(async () => {
    throw new Error('offline');
  }),
  isRemoteAllowed: vi.fn(() => false),
  isRemoteReady: vi.fn(async () => false)
}));

import { PropertyMarketPage } from './PropertyMarketPage';
import { buildBookmarklet } from './SourcesPanel';
import { usePropertyMarketStore } from '../data/store';
import { useUsdtStore } from '@/shared/store/usdtStore';
import { makeSeedPayload, MSG_PAYLOAD } from '../bridge/protocol';
import { emptySeed } from '../collector/parse';
import type { PropertyMarketListing } from '../domain/types';

function listing(token: string, nb: string, nbKey: string, ppm: number, source: 'divar' | 'sheypoor' = 'divar'): PropertyMarketListing {
  return {
    token,
    url: `https://divar.ir/v/${token}`,
    city: 'ahvaz',
    cityId: '7',
    neighborhood: nb,
    neighborhoodKey: nbKey,
    propertyKind: 'apartment',
    areaSqm: 100,
    rooms: 2,
    yearBuilt: 1400,
    floor: 2,
    totalPriceToman: ppm * 100,
    pricePerSqmToman: ppm,
    parking: null,
    elevator: null,
    storage: null,
    balcony: null,
    title: `آگهی ${token}`,
    listedAt: null,
    scrapedAt: Date.now(),
    source
  };
}

const MANY = [
  listing('k1', 'کیانپارس', 'kianpars', 150_000_000),
  listing('k2', 'کیانپارس', 'kianpars', 155_000_000),
  listing('k3', 'کیانپارس', 'kianpars', 160_000_000, 'sheypoor'),
  listing('g1', 'گلستان', 'golestan', 90_000_000),
  listing('g2', 'گلستان', 'golestan', 92_000_000),
  listing('g3', 'گلستان', 'golestan', 95_000_000),
  listing('z1', 'زرگان', 'raw:زرگان', 40_000_000) // کم‌نمونه
];

describe('PropertyMarketPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    // نرخ تتر: والکس (سرور) در این تست در دسترس نیست → بیت‌پین مستقیم (ساختگی)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('bitpin')
          ? new Response(JSON.stringify([{ symbol: 'USDT_IRT', price: '250000', timestamp: 1790430690 }]))
          : new Response('{}', { status: 404 })
      )
    );
    useUsdtStore.setState({ quote: null, status: 'idle', preferred: 'wallex', error: null, hydrated: false });
    usePropertyMarketStore.setState({
      listings: [],
      snapshots: [],
      legacyAssets: [],
      scenario: { futureUsdRateToman: null, propertyTomanGrowthPct: null, updatedAt: 0 },
      loading: false,
      hydrated: true,
      remoteConnected: false,
      enabledSources: { divar: true, sheypoor: true },
      collect: usePropertyMarketStore.getInitialState().collect,
      diagnostics: usePropertyMarketStore.getInitialState().diagnostics,
      importState: { status: 'idle', message: null, at: null }
    });
  });

  it('حالت خالی — راهنما + مرکز منابع داده با سه روش', async () => {
    render(<PropertyMarketPage />);
    expect(await screen.findByText(/هنوز داده‌ای از بازار املاک اهواز/)).toBeTruthy();
    expect(screen.getByText('منابع داده')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /خودکار/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /پل مرورگر/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /ورود فایل/ })).toBeTruthy();
    // هر دو منبع فعال‌اند و قابل خاموش‌کردن
    expect(screen.getByRole('switch', { name: /دیوار/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('switch', { name: /شیپور/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('تب پل مرورگر — لینک bookmarklet با origin همین دارینو', async () => {
    render(<PropertyMarketPage />);
    fireEvent.click(await screen.findByRole('tab', { name: /پل مرورگر/ }));
    const link = await screen.findByTitle('به نوار بوکمارک بکشید');
    const href = link.getAttribute('href') ?? '';
    expect(href.startsWith('javascript:')).toBe(true);
    const code = decodeURIComponent(href.slice('javascript:'.length));
    expect(code).toContain(window.location.origin);
    expect(code).not.toContain('%%DARINO_ORIGIN%%');
    expect(code).toContain('api.divar.ir');
    expect(code).toContain('sheypoor');
  });

  it('buildBookmarklet: کد باندل‌شده غیرخالی و origin جایگزین می‌شود', () => {
    const b = buildBookmarklet('https://darino.example');
    expect(b.code.length).toBeGreaterThan(1000);
    expect(b.code).toContain('https://darino.example');
    expect(b.code).not.toContain('%%DARINO_ORIGIN%%');
  });

  it('با داده — خلاصه انواع قیمت، جدول مناطق (فقط پرنمونه) و نمایش همه؛ بدون «میانه»', async () => {
    usePropertyMarketStore.setState({ listings: MANY });
    render(<PropertyMarketPage />);
    expect((await screen.findAllByText('کیانپارس')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('گلستان').length).toBeGreaterThan(0);
    expect(screen.getByText('قیمت هر متر در اهواز')).toBeTruthy();
    expect(screen.getByText('کلید اول', { selector: 'span' })).toBeTruthy();
    expect(screen.getByText('۵ سال ساخت')).toBeTruthy();
    expect(screen.queryAllByText(/میانه/).length).toBe(0);
    // محله کم‌نمونه پیش‌فرض پنهان
    expect(screen.queryAllByText('زرگان').length).toBe(0);
    fireEvent.click(screen.getAllByRole('button', { name: /نمایش همه/ })[0]);
    expect((await screen.findAllByText('زرگان')).length).toBeGreaterThan(0);
  });

  it('تب آگهی‌ها — فیلتر منبع', async () => {
    usePropertyMarketStore.setState({ listings: MANY });
    render(<PropertyMarketPage />);
    fireEvent.click(await screen.findByRole('tab', { name: /آگهی‌ها/ }));
    expect(await screen.findByText('آگهی k1')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /شیپور/ }));
    expect(screen.queryByText('آگهی k1')).toBeNull();
    expect(screen.getByText('آگهی k3')).toBeTruthy();
  });

  it('کلیک روی خانه جدول مناطق → آگهی‌های همان منطقه و نوع', async () => {
    usePropertyMarketStore.setState({ listings: MANY });
    render(<PropertyMarketPage />);
    // سال ساخت ۱۴۰۰ → ۵ سال
    fireEvent.click(await screen.findByRole('button', { name: 'آگهی‌های گلستان · ۵ سال' }));
    expect(await screen.findByText('آگهی g1')).toBeTruthy();
    expect(screen.queryByText('آگهی k1')).toBeNull();
    expect((screen.getByRole('combobox', { name: 'سال ساخت' }) as HTMLSelectElement).value).toBe('y5');
  });

  it('پل مرورگر: پیام از divar.ir وارد می‌شود؛ origin غیرمجاز نادیده گرفته می‌شود', async () => {
    render(<PropertyMarketPage />);
    const s = emptySeed('bridge1');
    s.neighborhood = 'گلستان';
    s.areaSqm = 100;
    s.totalPriceToman = 9_000_000_000;
    const payload = makeSeedPayload({ source: 'divar', cityId: '7', via: 'bridge', seeds: [s] });

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.example', data: { type: MSG_PAYLOAD, payload } }));
    });
    expect(usePropertyMarketStore.getState().listings.length).toBe(0);

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { origin: 'https://divar.ir', data: { type: MSG_PAYLOAD, payload } }));
    });
    await waitFor(() => expect(usePropertyMarketStore.getState().listings.length).toBe(1));
    expect(usePropertyMarketStore.getState().snapshots.length).toBe(1);
    expect(await screen.findByText(/پل مرورگر \(دیوار\)/)).toBeTruthy();
  });

  it('سرور در دسترس نیست → هشدار و انتقال خودکار به تب پل مرورگر', async () => {
    render(<PropertyMarketPage />);
    await act(async () => {
      await usePropertyMarketStore.getState().startCollection();
    });
    expect(usePropertyMarketStore.getState().collect.status).toBe('unavailable');
    expect(await screen.findByTitle('به نوار بوکمارک بکشید')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /پل مرورگر/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('نرخ تتر زنده (فالبک بیت‌پین) در KPI و پنل سناریو', async () => {
    usePropertyMarketStore.setState({ listings: MANY });
    render(<PropertyMarketPage />);
    expect((await screen.findAllByText(/تتر ۲۵۰٬۰۰۰ تومان · بیت‌پین|تتر ۲۵۰,۰۰۰ تومان · بیت‌پین/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('زنده').length).toBeGreaterThan(0);
    expect(useUsdtStore.getState().quote?.priceToman).toBe(250000);
  });

  it('کارت نوع قیمت و تب متراژ؛ کلیک روی کارت → آگهی‌های همان نوع با معادل دلاری', async () => {
    const withAge = MANY.map((l, i) => ({ ...l, yearBuilt: i < 3 ? 1404 : 1390 }));
    usePropertyMarketStore.setState({ listings: withAge });
    render(<PropertyMarketPage />);
    await waitFor(() => expect(useUsdtStore.getState().quote).not.toBeNull());
    fireEvent.click(await screen.findByRole('tab', { name: /متراژ/ }));
    expect(await screen.findByText('۱۰۰ تا ۱۲۰ متر')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '۱ سال: آگهی‌ها' }));
    // به تب آگهی‌ها رفت و فقط نوسازها
    expect(await screen.findByText('آگهی k1')).toBeTruthy();
    expect(screen.queryByText('آگهی g1')).toBeNull();
    // معادل دلاری هر متر: 150M / 250k = $600
    expect(screen.getAllByText(/\$600/).length).toBeGreaterThan(0);
  });

  it('تب تغییرات قیمت: بدون تاریخچه → «از تاریخ X قابل نمایش»؛ با Snapshot ۳ ماه پیش → رشد دلاری', async () => {
    const mk = (id: string, dateTs: number, ppm: number, rate: number) => ({
      id, dateTs, dateLabel: '', city: 'ahvaz' as const, source: 'divar' as const,
      fxRateAtSnapshotToman: rate, fxSource: 'wallex' as const,
      cityStats: {
        medianTomanPerM2: ppm, meanTomanPerM2: ppm, p25TomanPerM2: ppm, p75TomanPerM2: ppm, listingCount: 20, medianTotalToman: ppm * 100,
        byType: { 'first-key': { count: 20, medianPpm: ppm, meanPpm: ppm, medianTotal: ppm * 100, meanTotal: ppm * 100 } }
      },
      neighborhoodStats: [{ neighborhoodKey: 'golestan', displayName: 'گلستان', stats: { medianTomanPerM2: ppm, meanTomanPerM2: ppm, p25TomanPerM2: ppm, p75TomanPerM2: ppm, listingCount: 8, medianTotalToman: ppm * 90 } }],
      cleaning: { raw: 0, normalized: 0, valid: 0, deduplicated: 0, outliersRemoved: 0, market: 20, rejectReasons: {} },
      createdAt: dateTs
    });
    const now = Date.now();
    usePropertyMarketStore.setState({ listings: MANY, snapshots: [mk('s-now', now, 80e6, 250000)] });
    render(<PropertyMarketPage />);
    fireEvent.click(await screen.findByRole('tab', { name: /تغییرات قیمت/ }));
    expect(await screen.findByText(/تاریخچه با هر «به‌روزرسانی داده» ساخته می‌شود/)).toBeTruthy();
    expect(screen.getByText(/دوره‌های ۱، ۳، ۶، ۹، ۱۲، ۱۶، ۲۴، ۳۲، ۳۶، ۴۸، ۶۰ ماه هنوز داده ندارند/)).toBeTruthy();
    cleanup();

    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setUTCMonth(threeMonthsAgo.getUTCMonth() - 3);
    usePropertyMarketStore.setState({ snapshots: [mk('s-old', threeMonthsAgo.getTime(), 60e6, 200000), mk('s-now', now, 80e6, 250000)] });
    render(<PropertyMarketPage />);
    fireEvent.click(await screen.findByRole('tab', { name: /تغییرات قیمت/ }));
    // $300 → $320 = +6.7%
    expect((await screen.findAllByText(/\+6\.67%/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$300/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$320/).length).toBeGreaterThan(0);
  });

  it('سطح منطقه/محله: کیانپارس شرقی و غربی جدا یا با هم', async () => {
    usePropertyMarketStore.setState({
      listings: [
        listing('e1', 'کیانپارس', 'kianpars-east', 150_000_000),
        listing('e2', 'کیانپارس', 'kianpars-east', 152_000_000),
        listing('e3', 'کیانپارس', 'kianpars-east', 154_000_000),
        listing('w1', 'کیانپارس', 'kianpars-west', 120_000_000),
        listing('w2', 'کیانپارس', 'kianpars-west', 122_000_000),
        listing('w3', 'کیانپارس', 'kianpars-west', 124_000_000)
      ]
    });
    render(<PropertyMarketPage />);
    // پیش‌فرض: منطقه → یک ردیف «کیانپارس» با ۶ آگهی
    expect((await screen.findAllByText('کیانپارس')).length).toBeGreaterThan(0);
    expect(screen.queryAllByText('کیانپارس شرقی').length).toBe(0);
    fireEvent.click(screen.getByRole('radio', { name: 'محله' }));
    expect((await screen.findAllByText('کیانپارس شرقی')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('کیانپارس غربی').length).toBeGreaterThan(0);
  });

  it('جدول مناطق: فقط ستون‌های کلید اول و ۱ تا ۷ سال', async () => {
    const withTypes = MANY.map((l, i) => ({ ...l, yearBuilt: 1405 - (i % 4), firstKey: i === 0 }));
    usePropertyMarketStore.setState({ listings: withTypes });
    render(<PropertyMarketPage />);
    expect((await screen.findAllByRole('columnheader', { name: 'کلید اول' })).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'منطقه', 'کلید اول', '۱ سال', '۲ سال', '۳ سال', '۴ سال', '۵ سال', '۶ سال', '۷ سال'
    ]);
    for (const h of ['کلید اول', '۱ سال', '۲ سال', '۳ سال', '۴ سال', '۵ سال', '۶ سال', '۷ سال']) {
      expect(screen.getAllByRole('columnheader', { name: h }).length).toBeGreaterThan(0);
    }
    fireEvent.click(screen.getByRole('radio', { name: 'قیمت کل' }));
    expect(screen.getAllByText(/میلیارد/).length).toBeGreaterThan(0);
  });

  it('متراژ دقیق: هر متراژ جداگانه در بازه‌ها؛ کلیک → فقط آگهی‌های همان متراژ', async () => {
    const sized = MANY.map((l, i) => ({ ...l, areaSqm: [95, 120, 120, 175, 300, 60, 400][i], totalPriceToman: (l.pricePerSqmToman ?? 0) * [95, 120, 120, 175, 300, 60, 400][i] }));
    usePropertyMarketStore.setState({ listings: sized });
    render(<PropertyMarketPage />);
    fireEvent.click(await screen.findByRole('tab', { name: /متراژ/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'متراژ دقیق' }));
    expect(await screen.findByText(/۹۰ تا ۱۷۰ متر · ۳ آگهی/)).toBeTruthy();
    expect(screen.getByText(/۱۷۱ تا ۳۳۰ متر · ۲ آگهی/)).toBeTruthy();
    expect(screen.getByText(/کمتر از ۹۰ متر/)).toBeTruthy();
    expect(screen.getByText(/بیش از ۳۳۰ متر/)).toBeTruthy();
    fireEvent.click(screen.getByText('۱۲۰ متر'));
    expect(await screen.findByRole('button', { name: 'حذف فیلتر متراژ دقیق' })).toBeTruthy();
    expect(screen.getByText('آگهی k2')).toBeTruthy();
    expect(screen.getByText('آگهی k3')).toBeTruthy();
    expect(screen.queryByText('آگهی k1')).toBeNull();
  });
});
