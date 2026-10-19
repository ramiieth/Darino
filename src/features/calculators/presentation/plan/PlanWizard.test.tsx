// @vitest-environment jsdom
/**
 * برنامهٔ من — مسیر پنج‌قدمی: فقط سه عدد تایپ می‌شود؛ اعداد = domain (بدون شبکه)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { holdingOf, ladderLots, ladderPlan, LADDER_STYLES, sellAs, type Lot } from '@/features/calculators/domain';
import { toFaDigits } from '@/shared/utils/formatters';
import type { VenueQuote } from '@/features/calculators/data/deltaMarkets';

const quote = (venue: VenueQuote['venue'], o: Partial<VenueQuote>): VenueQuote => ({
  venue,
  ref: 'ETH',
  base: 'ETH',
  display: 'ETH-USD',
  nameFa: 'اتریوم',
  category: 'crypto',
  markPrice: 2500,
  fundingHourly: 0,
  makerFeePct: 0.01,
  takerFeePct: 0.02,
  maxLeverage: 20,
  maintenanceMarginFraction: 0.03,
  volume24hUsd: 50_000_000,
  ...o
});
const fx = vi.hoisted(() => ({ prior: [] as Lot[] }));

vi.mock('@/features/calculators/data/deltaMarkets', async (orig) => {
  const actual = await orig<typeof import('@/features/calculators/data/deltaMarkets')>();
  const books = {
    arcus: {
      status: 'ready',
      quotes: [
        quote('arcus', { fundingHourly: 0.00002 }),
        quote('arcus', { base: 'COIN', ref: 'COIN', nameFa: 'کوین‌بیس', category: 'equity', markPrice: 250 }),
        quote('arcus', { base: 'USDC', ref: 'USDC', nameFa: 'یو‌اس‌دی‌سی', markPrice: 1 })
      ]
    },
    lighterRh: { status: 'ready', quotes: [quote('lighterRh', { fundingHourly: 0, makerFeePct: 0 })] },
    lighter: { status: 'ready', quotes: [] },
    ondo: { status: 'ready', quotes: [] }
  };
  return { ...actual, useDeltaBooks: () => books };
});
vi.mock('@/features/calculators/data/plannerLots', () => ({
  usePlannerLots: () => ({ lots: fx.prior, source: fx.prior.length ? 'lots' : 'none', unreconciled: false })
}));

const { PlanWizard } = await import('./PlanWizard');

beforeEach(() => {
  localStorage.clear();
  fx.prior = [{ qty: 3.3, unitCost: 2830, at: 1, source: 'existing' }];
});
afterEach(cleanup);

const usd0 = (v: number) => toFaDigits(Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }));
const next = () => fireEvent.click(screen.getByRole('button', { name: /بعدی/ }));

describe('برنامهٔ من', () => {
  it('قدم ۱: دارایی‌های صرافی‌ها، قیمت زنده و خرید قبلی از «بهای تمام‌شده»', () => {
    render(<PlanWizard />);
    expect(screen.getByRole('heading', { name: 'برای کدام دارایی برنامه می‌ریزید؟' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /اتریوم \(ETH\)/ })).toBeTruthy();
    expect(screen.getByText(/از «بهای تمام‌شده»/)).toBeTruthy();
  });

  it('قدم ۲: بدون سرمایه «بعدی» غیرفعال؛ فقط سه فیلد تایپی', () => {
    render(<PlanWizard />);
    next();
    expect(screen.getAllByRole('textbox')).toHaveLength(3);
    expect((screen.getByRole('button', { name: /بعدی/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('سرمایهٔ دلتا نوترال (پوینت)'), { target: { value: '2000' } });
    expect((screen.getByRole('button', { name: /بعدی/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('مسیر کامل: دلتا پیشنهادی، پله‌ها، FIFO < میانگین < LIFO، و برنامهٔ نهایی', () => {
    render(<PlanWizard />);
    next();
    fireEvent.change(screen.getByLabelText('ذخیرهٔ زندگی، بدهی و هزینه‌ها'), { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText('سرمایهٔ سرمایه‌گذاری (خرید ارز)'), { target: { value: '12000' } });
    fireEvent.change(screen.getByLabelText('سرمایهٔ دلتا نوترال (پوینت)'), { target: { value: '2000' } });
    next();

    // قدم ۳: یک جفت (آرکوس ↔ لایتر رابین‌هود)، Short روی آرکوس (فاندینگ بالاتر)
    const step3 = screen.getByRole('region', { name: 'دلتا نوترال را روی کدام ارز و کدام دو صرافی اجرا کنید؟' });
    expect(within(step3).getByText('پیشنهادی')).toBeTruthy();
    expect(within(step3).getAllByRole('radio', { checked: true }).some((r) => r.textContent?.includes('Short آرکوس'))).toBe(true);
    next();

    // قدم ۴: متعادل (۱۵/۲۵/۳۵٪) با ۷۵٪ از ۱۲٬۰۰۰ = ۹٬۰۰۰
    const plan = ladderPlan(2500, 9000, LADDER_STYLES.balanced);
    const step4 = screen.getByRole('region', { name: 'اگر قیمت ریخت، چطور بخرید؟' });
    const ladder = within(step4).getByRole('table', { name: 'سفارش‌های خرید پله‌ای' });
    expect(ladder.textContent).toContain(usd0(plan.steps[0].price));
    expect(ladder.textContent).toContain(usd0(3000));
    const lots = [...fx.prior, ...ladderLots(plan, 3, 1)];
    const half = holdingOf(lots).qty / 2;
    const fifo = sellAs(lots, half, 2500, 'fifo').realized;
    const lifo = sellAs(lots, half, 2500, 'lifo').realized;
    expect(fifo).toBeLessThan(lifo);
    expect(step4.textContent).toContain(usd0(fifo));
    expect(step4.textContent).toContain(usd0(lifo));
    next();

    // قدم ۵: میانگین قبلی ۲۸۳۰ به میانگین بعد از همهٔ پله‌ها
    const summary = screen.getByRole('region', { name: /برنامهٔ شما برای اتریوم/ });
    expect(summary.textContent).toContain(usd0(5000));
    expect(summary.textContent).toContain(usd0(holdingOf(lots).avgCost!));
    expect(within(summary).getByText('ذخیرهٔ زندگی در برنامه نیست')).toBeTruthy();
    expect(within(summary).getByText(/لیکویید نمی‌شود/)).toBeTruthy();
  });

  it('برنامه در همین مرورگر می‌ماند', () => {
    const { unmount } = render(<PlanWizard />);
    next();
    fireEvent.change(screen.getByLabelText('سرمایهٔ دلتا نوترال (پوینت)'), { target: { value: '2000' } });
    unmount();
    render(<PlanWizard />);
    expect((screen.getByLabelText('سرمایهٔ دلتا نوترال (پوینت)') as HTMLInputElement).value).toBe('2000');
  });
});

describe('برنامهٔ من — هر دارایی', () => {
  it('سهام توکنی تک‌صرافی: خرید پله‌ای روی همان، دلتا نوترال روی ارز دیگری که سود خوبی دارد', () => {
    render(<PlanWizard />);
    expect(screen.getByRole('radio', { name: /همه \(۲\)/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /سهام توکنی و سایر/ }));
    expect(screen.queryByRole('button', { name: /USDC/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /کوین‌بیس \(COIN\)/ }));
    expect(screen.getByText(/روی ۱ صرافی پرپ بازار دارد — برای دلتا نوترال در قدم ۳ ارزهای دیگر پیشنهاد می‌شود/)).toBeTruthy();
    next();
    fireEvent.change(screen.getByLabelText('سرمایهٔ سرمایه‌گذاری (خرید ارز)'), { target: { value: '3000' } });
    fireEvent.change(screen.getByLabelText('سرمایهٔ دلتا نوترال (پوینت)'), { target: { value: '1000' } });
    next();
    // لازم نیست همان ارز باشد: ETH (دو صرافی) پیشنهاد و انتخاب می‌شود
    const step3 = screen.getByRole('region', { name: 'دلتا نوترال را روی کدام ارز و کدام دو صرافی اجرا کنید؟' });
    const picked = within(step3).getAllByRole('radio', { checked: true });
    expect(picked.some((r) => r.textContent?.includes('ETH'))).toBe(true);
    next();
    const ladder = screen.getByRole('table', { name: 'سفارش‌های خرید پله‌ای' });
    const plan = ladderPlan(250, 2250, LADDER_STYLES.balanced);
    expect(ladder.textContent).toContain(toFaDigits(plan.steps[0].price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
  });
});
