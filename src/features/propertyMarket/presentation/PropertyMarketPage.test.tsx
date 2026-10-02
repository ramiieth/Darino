// @vitest-environment jsdom
/**
 * PropertyMarketPage — رندر + تعامل (بدون شبکه/دیتابیس)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

vi.mock('@/repositories/remoteClient', () => ({
  fetchJson: vi.fn(async () => {
    throw new Error('offline');
  }),
  isRemoteAllowed: vi.fn(() => false),
  isRemoteReady: vi.fn(async () => false)
}));

import { PropertyMarketPage } from './PropertyMarketPage';
import { usePropertyMarketStore } from '../data/store';
import { useUsdtStore } from '@/shared/store/usdtStore';
import type { PropertyMarketListing, PropertyMarketSnapshot } from '../domain/types';

function listing(token: string, nb: string, nbKey: string, ppm: number, patch: Partial<PropertyMarketListing> = {}): PropertyMarketListing {
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
    source: 'divar',
    ...patch
  };
}

const MANY = [
  listing('k1', 'کیانپارس', 'kianpars-east', 150_000_000),
  listing('k2', 'کیانپارس', 'kianpars-west', 155_000_000),
  listing('k3', 'کیانپارس', 'kianpars-other', 160_000_000),
  listing('g1', 'گلستان', 'golestan', 90_000_000),
  listing('g2', 'گلستان', 'golestan', 92_000_000),
  listing('g3', 'گلستان', 'golestan', 94_000_000),
  listing('z1', 'زرگان', 'raw:زرگان', 40_000_000) // کم‌نمونه
];

const live = (priceToman = 250000) =>
  useUsdtStore.setState({
    quote: { source: 'bitpin', priceToman, tradedAt: null, fetchedAt: Date.now() },
    status: 'live',
    preferred: 'wallex',
    error: null,
    hydrated: true
  });

describe('PropertyMarketPage', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    live();
    usePropertyMarketStore.setState({
      listings: [],
      snapshots: [],
      legacyAssets: [],
      loading: false,
      hydrated: true,
      remoteConnected: false,
      collect: usePropertyMarketStore.getInitialState().collect
    });
  });

  it('حالت خالی — فقط دکمه به‌روزرسانی (بدون «منابع داده»، پل مرورگر یا ورود فایل)', async () => {
    render(<PropertyMarketPage />);
    expect(await screen.findByText(/هنوز داده‌ای از بازار املاک اهواز/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /به‌روزرسانی داده/ })).toBeTruthy();
    expect(screen.queryByText('منابع داده')).toBeNull();
    expect(screen.queryByText(/پل مرورگر|ورود فایل|شیپور/)).toBeNull();
  });

  it('جدول مناطق: بدون «کل اهواز» و «میانه»، محله‌های کیانپارس یکی، اعداد فارسی', async () => {
    usePropertyMarketStore.setState({ listings: MANY });
    render(<PropertyMarketPage />);
    const table = await screen.findByRole('table');
    // کیانپارس شرقی/غربی/نامشخص → یک منطقه
    expect(screen.getAllByText('کیانپارس').length).toBe(1);
    expect(screen.queryByText(/کیانپارس شرقی/)).toBeNull();
    expect(screen.queryByRole('radio', { name: 'محله' })).toBeNull();
    expect(screen.queryByText(/کل اهواز/)).toBeNull();
    expect(screen.queryByText(/میانه/)).toBeNull();
    expect(screen.queryByText(/قیمت هر متر در اهواز/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/کلید اول/);
    // سال ساخت ۱۴۰۰ → ستون «۱۴۰۰ (۵ سال)»: میانگین ۱۵۵ میلیون = ۶۲۰ دلار (تتر ۲۵۰ هزار)
    expect(screen.getByText('۱۵۵ میلیون')).toBeTruthy();
    expect(screen.getByText(/۶۲۰ دلار/)).toBeTruthy();
    // هیچ رقم لاتین در جدول
    expect(table.textContent).not.toMatch(/[0-9$]/);
    // هیچ منطقه‌ای پنهان نمی‌شود — حتی با ۱ آگهی (کم‌رنگ)
    expect(screen.getAllByText('زرگان').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /نمایش همه/ })).toBeNull();
  });

  it('ستون‌ها = سال ساخت (۱۴۰۵ نوساز … ۱۳۹۸، قبل‌تر)؛ فقط بدون سال ساخت بیرون می‌ماند', async () => {
    const withTypes = MANY.map((l, i) => ({ ...l, yearBuilt: i === 2 ? null : i === 1 ? 1380 : 1405 - (i % 4) }));
    usePropertyMarketStore.setState({ listings: withTypes });
    render(<PropertyMarketPage />);
    await screen.findByRole('table');
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'منطقه', '۱۴۰۵نوساز', '۱۴۰۴۱ سال', '۱۴۰۳۲ سال', '۱۴۰۲۳ سال', '۱۴۰۱۴ سال', '۱۴۰۰۵ سال', '۱۳۹۹۶ سال', '۱۳۹۸۷ سال',
      '۱۳۹۷ و قبل‌تر۸ سال به بالا'
    ]);
    // کیانپارس: ۳ آگهی، یکی بدون سال ساخت؛ ۱۳۸۰ در «قبل‌تر» نمایش داده می‌شود (دیگر «۰ از ۳» نیست)
    expect(screen.getByText(/۳ آگهی · ۱ بدون سال ساخت/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'قیمت کل' }));
    expect(screen.getAllByText(/میلیارد/).length).toBeGreaterThan(0);
  });

  it('کلیک روی خانه → آگهی‌های همان منطقه و نوع؛ قیمت‌ها فارسی', async () => {
    usePropertyMarketStore.setState({ listings: MANY });
    render(<PropertyMarketPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'آگهی‌های گلستان · ساخت ۱۴۰۰' }));
    expect(await screen.findByText('آگهی g1')).toBeTruthy();
    expect(screen.queryByText('آگهی k1')).toBeNull();
    expect((screen.getByRole('combobox', { name: 'سال ساخت' }) as HTMLSelectElement).value).toBe('y5');
    // ۹۰ میلیون / ۲۵۰ هزار = ۳۶۰ دلار
    expect(screen.getAllByText('۳۶۰ دلار').length).toBeGreaterThan(0);
  });

  it('کلیک روی نام منطقه → همه آگهی‌های آن منطقه (کیانپارس شرقی و غربی با هم)', async () => {
    usePropertyMarketStore.setState({ listings: MANY });
    render(<PropertyMarketPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'کیانپارس' }));
    for (const t of ['آگهی k1', 'آگهی k2', 'آگهی k3']) expect(await screen.findByText(t)).toBeTruthy();
    expect(screen.queryByText('آگهی g1')).toBeNull();
  });

  it('تب متراژ: بازه‌ها از ۹۰ متر؛ متراژ دقیق → فقط آگهی‌های همان متراژ', async () => {
    const areas = [95, 120, 120, 175, 300, 90, 400];
    usePropertyMarketStore.setState({ listings: MANY.map((l, i) => ({ ...l, areaSqm: areas[i], totalPriceToman: (l.pricePerSqmToman ?? 0) * areas[i] })) });
    render(<PropertyMarketPage />);
    fireEvent.click(await screen.findByRole('tab', { name: /متراژ/ }));
    expect(await screen.findByText('۹۰ تا ۱۰۰ متر')).toBeTruthy();
    expect(screen.queryByText(/کمتر از (۶۰|۹۰) متر/)).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'متراژ دقیق' }));
    expect(await screen.findByText(/۹۰ تا ۱۷۰ متر · ۴ آگهی/)).toBeTruthy();
    fireEvent.click(screen.getByText('۱۲۰ متر'));
    expect(await screen.findByRole('button', { name: 'حذف فیلتر متراژ دقیق' })).toBeTruthy();
    expect(screen.getByText('آگهی k2')).toBeTruthy();
    expect(screen.getByText('آگهی k3')).toBeTruthy();
    expect(screen.queryByText('آگهی k1')).toBeNull();
  });

  it('نرخ دلار = تتر زنده (بیت‌پین) در سربرگ و کارت نرخ', async () => {
    usePropertyMarketStore.setState({ listings: MANY });
    render(<PropertyMarketPage />);
    expect((await screen.findAllByText(/تتر ۲۵۰,۰۰۰ تومان · بیت‌پین/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('زنده').length).toBeGreaterThan(0);
  });

  it('تتر در دسترس نیست → هشدار؛ دلار «—» (نرخ دستی وجود ندارد)', async () => {
    useUsdtStore.setState({ quote: null, status: 'unavailable' });
    usePropertyMarketStore.setState({ listings: MANY });
    render(<PropertyMarketPage />);
    expect(await screen.findByText('نرخ زنده تتر در دسترس نیست')).toBeTruthy();
    expect(screen.queryByText(/دلار/, { selector: 'td span' })).toBeNull();
  });

  it('به‌روزرسانی: سرور در دسترس نیست → هشدار فارسی', async () => {
    usePropertyMarketStore.setState({ listings: MANY });
    render(<PropertyMarketPage />);
    await act(async () => {
      await usePropertyMarketStore.getState().startCollection();
    });
    expect(usePropertyMarketStore.getState().collect.status).toBe('unavailable');
    expect(await screen.findByText('به‌روزرسانی انجام نشد')).toBeTruthy();
    expect(screen.getByText(/سرور جمع‌آوری در دسترس نیست/)).toBeTruthy();
  });

  it('تب تغییرات قیمت: پیش‌فرض پرآگهی‌ترین منطقه؛ رشد دلاری هم‌نوع با اعداد فارسی', async () => {
    const mk = (id: string, dateTs: number, ppm: number, rate: number): PropertyMarketSnapshot => {
      const stats = {
        medianTomanPerM2: ppm, meanTomanPerM2: ppm, p25TomanPerM2: ppm, p75TomanPerM2: ppm, listingCount: 8,
        byType: { b0: { count: 8, medianPpm: ppm, meanPpm: ppm, medianTotal: ppm * 100, meanTotal: ppm * 100 } }
      };
      return {
        id, dateTs, dateLabel: '', city: 'ahvaz', source: 'divar', fxRateAtSnapshotToman: rate, fxSource: 'wallex',
        cityStats: { ...stats, listingCount: 20 },
        neighborhoodStats: [{ neighborhoodKey: 'golestan', displayName: 'گلستان', stats }],
        cleaning: { raw: 0, normalized: 0, valid: 0, deduplicated: 0, outliersRemoved: 0, market: 20, rejectReasons: {} },
        createdAt: dateTs
      };
    };
    const now = Date.now();
    usePropertyMarketStore.setState({ listings: MANY, snapshots: [mk('s-now', now, 80e6, 250000)] });
    render(<PropertyMarketPage />);
    fireEvent.click(await screen.findByRole('tab', { name: /تغییرات قیمت/ }));
    expect(await screen.findByText(/دوره‌های ۱، ۳، ۶، ۹، ۱۲، ۱۶، ۲۴، ۳۲، ۳۶، ۴۸، ۶۰ ماه هنوز داده ندارند/)).toBeTruthy();
    expect(screen.queryByText(/کل اهواز/)).toBeNull();
    cleanup();

    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setUTCMonth(threeMonthsAgo.getUTCMonth() - 3);
    usePropertyMarketStore.setState({ snapshots: [mk('s-old', threeMonthsAgo.getTime(), 60e6, 200000), mk('s-now', now, 80e6, 250000)] });
    render(<PropertyMarketPage />);
    fireEvent.click(await screen.findByRole('tab', { name: /تغییرات قیمت/ }));
    // ۳۰۰ دلار → ۳۲۰ دلار = +۶.۷٪
    expect((await screen.findAllByText('+۶.۷٪')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('۳۰۰ دلار').length).toBeGreaterThan(0);
    expect(screen.getAllByText('۳۲۰ دلار').length).toBeGreaterThan(0);
  });
});
