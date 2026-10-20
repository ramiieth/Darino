// @vitest-environment jsdom
/**
 * تطابق اعداد نمایش‌داده‌شده با domain — دلتا نوترال و سود واقعی دلتا (دادهٔ صرافی mock، بدون شبکه)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { calcDeltaNeutral } from '@/features/calculators/domain';
import { toFaDigits } from '@/shared/utils/formatters';
import type { VenueQuote } from '@/features/calculators/data/deltaMarkets';
import type { Opportunity } from '@/features/calculators/data/fundingHistory';

const quote = (venue: VenueQuote['venue'], o: Partial<VenueQuote>): VenueQuote => ({
  venue,
  ref: 'MSTR-USD',
  base: 'MSTR',
  display: 'MSTR-USD',
  nameFa: 'مایکرواستراتژی',
  category: 'equity',
  markPrice: 142,
  fundingHourly: 0,
  makerFeePct: 0,
  takerFeePct: 0.02,
  maxLeverage: 10,
  maintenanceMarginFraction: 0.05,
  volume24hUsd: 50_000_000,
  ...o
});

const ARCUS = quote('arcus', { fundingHourly: 0.0000998, markPrice: 142.5, makerFeePct: 0, maintenanceMarginFraction: 0.03 });
const ONDO = quote('ondo', { fundingHourly: 0.0000063, markPrice: 142.2, makerFeePct: 0.01, takerFeePct: 0.025 });
const fx = vi.hoisted(() => ({ opportunities: [] as unknown[], shortVenue: 'arcus' }));

vi.mock('@/features/calculators/data/deltaMarkets', async (orig) => {
  const actual = await orig<typeof import('@/features/calculators/data/deltaMarkets')>();
  const books = {
    arcus: { status: 'ready', quotes: [ARCUS] },
    ondo: { status: 'ready', quotes: [ONDO] },
    lighter: { status: 'ready', quotes: [] },
    lighterRh: { status: 'ready', quotes: [] },
    hyperliquid: { status: 'ready', quotes: [] }
  };
  return { ...actual, useDeltaBooks: () => books };
});
// تاریخچهٔ فاندینگ پرداخت‌شده: طرف فروش ۰٫۰۰۰۰۳ در ساعت، طرف خرید ۰ → اختلاف حدود ۲۶٪ سالانه، بدون برعکس شدن
vi.mock('@/features/calculators/data/fundingHistory', () => ({
  useFundingOpportunities: () => fx.opportunities,
  fetchFundingHistory: async (venue: string) => {
    const now = Math.floor(Date.now() / 3_600_000) * 3_600_000;
    return Array.from({ length: 200 }, (_, i) => ({ hour: now - i * 3_600_000, rate: venue === fx.shortVenue ? 0.00003 : 0 }));
  }
}));
vi.mock('@/features/calculators/data/spreadAlerts', () => ({ useReversalAlerts: () => undefined }));

const { DeltaNeutralCalculator } = await import('./DeltaNeutralCalculator');
const { DeltaProfitCalculator } = await import('./DeltaProfitCalculator');
const { evaluateArb } = await import('./arbEval');

afterEach(cleanup);

const usd = (v: number) => toFaDigits(Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
/** متن مقدار یک سطر «مسیر سرمایه» */
function flowValue(label: string): string {
  const flow = screen.getByRole('region', { name: 'مسیر سرمایه' });
  const dt = within(flow).getAllByText(label, { exact: true })[0].closest('dt')!;
  return dt.parentElement!.querySelector('dd')!.textContent ?? '';
}

describe('دلتا نوترال — UI = domain', () => {
  // پیش‌فرض‌های فرم: ۱۰۰۰ دلار، ۳×، ۲۴ ساعت، ۱ دور، میکر؛ Short روی آرکوس (فاندینگ بالاتر)
  const defaults = {
    notional: 1000,
    leverage: 3,
    holdHours: 24,
    cycles: 1,
    long: { feePct: 0.01, fundingHourly: ONDO.fundingHourly!, maintenanceMarginFraction: 0.05, markPrice: 142.2 },
    short: { feePct: 0, fundingHourly: ARCUS.fundingHourly!, maintenanceMarginFraction: 0.03, markPrice: 142.5 },
    slippagePct: 0
  };

  it('کارت «وضعیت امروز»: تصمیم از چک‌لیست با تاریخچهٔ فاندینگ پرداخت‌شده', async () => {
    render(<DeltaNeutralCalculator />);
    expect(screen.getByLabelText('وضعیت امروز')).toBeTruthy();
    expect(await screen.findByText(/میانگین اختلاف فاندینگ ۷ روز اخیر: (۲۶|۲۶٫|26)/)).toBeTruthy();
    expect(screen.getByText(/پوینت در این تصمیم حساب نمی‌شود/)).toBeTruthy();
  });

  it('سود خالص، مارجین و سرمایهٔ نهایی همان خروجی calcDeltaNeutral است', () => {
    render(<DeltaNeutralCalculator />);
    const r = calcDeltaNeutral(defaults);
    expect(flowValue('سود خالص تخمینی')).toContain(usd(r.net));
    expect(flowValue('وثیقهٔ قفل‌شده (مارجین)')).toContain(usd(r.capital));
    expect(flowValue('سرمایهٔ نهایی')).toContain(usd(r.ledger.finalEquity));
    expect(flowValue('فاندینگ خالص دورهٔ نگهداری')).toContain(usd(r.funding));
    expect(flowValue('کارمزد ورود')).toContain(usd(r.entryFees));
    expect(screen.getByText('سود خالص تخمینی پس از بستن')).toBeTruthy();
  });

  it('سناریوی همگرایی و سرمایهٔ کل، اعداد را به‌روز می‌کند', () => {
    render(<DeltaNeutralCalculator />);
    fireEvent.change(screen.getByLabelText('کل سرمایهٔ در دسترس (اختیاری)'), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('radio', { name: 'صفر می‌شود' }));
    const r = calcDeltaNeutral({ ...defaults, availableCapital: 2000, exit: { priceMovePct: 0, basis: 'converge' } });
    expect(r.pricePnl).toBeGreaterThan(0);
    expect(flowValue('سود یا زیان قیمت، پیش از هزینه')).toContain(usd(r.pricePnl));
    expect(flowValue('سرمایهٔ نهایی')).toContain(usd(r.ledger.finalEquity));
    expect(flowValue('سرمایهٔ نهایی')).toContain(usd(2000 + r.net));
  });

  it('ورودی نامعتبر: عدد ساختگی نمایش داده نمی‌شود', () => {
    render(<DeltaNeutralCalculator />);
    fireEvent.change(screen.getByLabelText('ارزش اسمی هر طرف'), { target: { value: '0' } });
    expect(screen.getByText('ورودی‌های قرمزشده را اصلاح کنید تا نتیجه محاسبه شود.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'مسیر سرمایه' })).toBeNull();
  });
});

describe('سود واقعی دلتا — UI = domain', () => {
  const stats = (avgApr: number) => ({ hours: 168, avgApr, profitableShare: 0.9, reversals: 2 });
  const opp: Opportunity = {
    key: 'MSTR:arcus>ondo',
    base: 'MSTR',
    short: ARCUS,
    long: ONDO,
    currentApr: 82,
    stats: { d1: stats(70), d7: stats(60), d30: stats(40) },
    projectedHourly: 60 / 8760 / 100,
    projectedFrom: 'avg7d',
    stability: 'high',
    historyStatus: 'ready',
    longBook: { bids: [{ price: 142.1, size: 1000 }], asks: [{ price: 142.3, size: 1000 }], mid: 142.2 },
    shortBook: { bids: [{ price: 142.4, size: 1000 }], asks: [{ price: 142.6, size: 1000 }], mid: 142.5 },
    bookStatus: 'ready'
  };

  it('سود خالص، هزینه‌ها و سرمایهٔ نهایی همان evaluateArb است', () => {
    fx.opportunities = [opp];
    render(<DeltaProfitCalculator />);
    const r = evaluateArb(opp, { capitalPerSide: 1000, leverage: 2, holdDays: 7, transferCostUsd: 6 });
    expect(r.net).not.toBeNull();
    expect(flowValue('سود خالص تخمینی')).toContain(usd(r.net!));
    expect(flowValue('اسلیپیج ورود و خروج')).toContain(usd(r.slippage!));
    expect(flowValue('انتقال و گس')).toContain(usd(6));
    expect(flowValue('سرمایهٔ نهایی')).toContain(usd(2000 + r.net!));
    expect(screen.getByText('بهترین پیشنهاد الان · سود خالص تخمینی')).toBeTruthy();
  });

  it('جدول حساسیت از تاریخچهٔ همان جفت ساخته می‌شود', () => {
    fx.opportunities = [opp];
    render(<DeltaProfitCalculator />);
    const table = screen.getByRole('table', { name: 'سود خالص بر اساس مبنای اسپرد و مدت نگهداری' });
    const d30 = evaluateArb(opp, { capitalPerSide: 1000, leverage: 2, holdDays: 30, transferCostUsd: 6 }, 40 / 8760 / 100);
    expect(table.textContent).toContain(usd(d30.net!));
  });

  it('سرمایهٔ نامعتبر: پیام اصلاح، بدون نتیجه', () => {
    fx.opportunities = [opp];
    render(<DeltaProfitCalculator />);
    fireEvent.change(screen.getByLabelText('سرمایهٔ هر طرف (مارجین)'), { target: { value: '-5' } });
    expect(screen.getByText('ورودی‌های قرمزشده را اصلاح کنید تا پیشنهادها محاسبه شوند.')).toBeTruthy();
  });
});
