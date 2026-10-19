// @vitest-environment jsdom
/**
 * تطابق اعداد نمایش‌داده‌شدهٔ ماشین‌حساب پوشش ریسک با domain (calcHedge) — بدون شبکه؛ حساب لایتر mock
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { calcHedge, type HedgeInput } from '@/features/calculators/domain';
import { toFaDigits } from '@/shared/utils/formatters';
import type { HedgeAccountData, LinkedHedgeAccount } from '@/features/calculators/data/hedgeAccounts';

const fx = vi.hoisted(() => ({ accounts: [] as LinkedHedgeAccount[], data: { status: 'idle', snapshots: [], markets: [], fetchedAt: null } as HedgeAccountData }));
vi.mock('@/features/calculators/data/hedgeAccounts', async (orig) => ({
  ...(await orig<typeof import('@/features/calculators/data/hedgeAccounts')>()),
  useLinkedHedgeAccounts: () => fx.accounts,
  useHedgeAccount: (acc: LinkedHedgeAccount | null) => (acc ? fx.data : { status: 'idle', snapshots: [], markets: [], fetchedAt: null })
}));
// Chart.js در jsdom canvas ندارد؛ اعداد نمودار در hedgePayoff و نسخهٔ جدولی آزمون می‌شوند
vi.mock('react-chartjs-2', () => ({ Line: () => null }));
const { HedgeCalculator } = await import('./HedgeCalculator');

afterEach(() => {
  cleanup();
  fx.accounts = [];
});

const usd = (v: number) => toFaDigits(Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
/** متن دو خانهٔ [ریزش، رشد] یک سطر جدول */
function rowCells(table: string, label: string): [string, string] {
  const region = screen.getByRole('region', { name: table });
  const th = within(region).getByText(label, { exact: true }).closest('th')!;
  const tds = th.parentElement!.querySelectorAll('td');
  return [tds[0].textContent ?? '', tds[1].textContent ?? ''];
}
const set = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

// پیش‌فرض‌های فرم
const DEFAULTS: HedgeInput = {
  spot: 1000,
  shortNotional: 300,
  futuresCollateral: 300,
  cash: 0,
  dropPct: 25,
  risePct: 18,
  feePct: 0,
  slippagePct: 0,
  fundingPct8h: 0,
  holdDays: 30,
  otherCosts: 0
};

describe('پوشش ریسک — UI = domain', () => {
  it('پیش‌فرض: سرمایهٔ نهایی و بدون هج همان خروجی calcHedge (۱۱۲۵ در برابر ۱۰۵۰، ۱۴۲۶ در برابر ۱۴۸۰)', () => {
    render(<HedgeCalculator />);
    const r = calcHedge(DEFAULTS);
    const [dropEnd, riseEnd] = rowCells('جزئیات هر سناریو', 'سرمایهٔ نهایی کل');
    expect(dropEnd).toContain(usd(r.drop.totalEnd!));
    expect(riseEnd).toContain(usd(r.rise.totalEnd!));
    const [dropU, riseU] = rowCells('جزئیات هر سناریو', 'ارزش نهایی بدون هج');
    expect(dropU).toContain(usd(1050));
    expect(riseU).toContain(usd(1480));
    const [dropFx, riseFx] = rowCells('جزئیات هر سناریو', 'اختلاف دلاری (اثر خالص هج)');
    expect(dropFx).toContain(usd(75));
    expect(riseFx).toContain(usd(54));
    expect(riseFx).toMatch(/-/);
  });

  it('نمونهٔ مرجع پرامپت با ورودی‌های فرم: ۱۰٬۰۰۰ / ۳٬۰۰۰ / ۳٬۰۰۰', () => {
    render(<HedgeCalculator />);
    set('ارزش دارایی‌ای که دارید (اسپات)', '10000');
    set('اندازهٔ دلاری موقعیت فروش (Short)', '3000');
    set('وثیقهٔ واریزی به حساب معاملات آتی (فیوچرز)', '3000');
    const [dFut, rFut] = rowCells('جزئیات هر سناریو', 'موجودی نهایی حساب فیوچرز');
    expect(dFut).toContain(usd(3750));
    expect(rFut).toContain(usd(2460));
    const [dNet, rNet] = rowCells('جزئیات هر سناریو', 'سود/زیان خالص کل');
    expect(dNet).toContain(usd(1750));
    expect(rNet).toContain(usd(1260));
    const [dRoi, rRoi] = rowCells('جزئیات هر سناریو', 'بازده کل سرمایه');
    expect(dRoi).toContain(toFaDigits('13.46'));
    expect(rRoi).toContain(toFaDigits('9.69'));
    expect(screen.getByRole('region', { name: 'هج با پرتفوی شما چه می‌کند؟' }).textContent).toContain(usd(13000));
  });

  it('وثیقهٔ خالی: سرمایه‌ها «نامشخص»، نه حدس از ارزش اسمی', () => {
    render(<HedgeCalculator />);
    set('وثیقهٔ واریزی به حساب معاملات آتی (فیوچرز)', '');
    expect(screen.getByText('وثیقهٔ حساب فیوچرز نامشخص است')).toBeTruthy();
    const [dEnd] = rowCells('جزئیات هر سناریو', 'سرمایهٔ نهایی کل');
    expect(dEnd).toBe('نامشخص');
    const [dFx] = rowCells('جزئیات هر سناریو', 'اثر هج پیش از هزینه');
    expect(dFx).toContain(usd(75));
  });

  it('نسبت هج: تغییر روش اندازه، ارزش اسمی را حفظ می‌کند', () => {
    render(<HedgeCalculator />);
    fireEvent.click(screen.getByRole('radio', { name: 'درصد از دارایی' }));
    expect((screen.getByLabelText('درصد پوشش (اندازهٔ موقعیت فروش ÷ ارزش دارایی)') as HTMLInputElement).value).toBe('30');
    set('درصد پوشش (اندازهٔ موقعیت فروش ÷ ارزش دارایی)', '50');
    const [dShort] = rowCells('جزئیات هر سناریو', 'سود یا زیان موقعیت فروش، پیش از هزینه');
    expect(dShort).toContain(usd(125));
  });

  it('ورودی نامعتبر: پیام اصلاح، بدون عدد ساختگی', () => {
    render(<HedgeCalculator />);
    set('ارزش دارایی‌ای که دارید (اسپات)', '0');
    expect(screen.getByText('ورودی‌های قرمزشده را اصلاح کنید تا نتیجه محاسبه شود.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'جزئیات هر سناریو' })).toBeNull();
  });
});

describe('پوشش ریسک — اتصال به حساب لایتر', () => {
  const linked: LinkedHedgeAccount = { id: 'l1', venue: 'lighter', label: 'حساب اصلی', address: '0x' + 'ab'.repeat(20) };
  const ready = (): HedgeAccountData => ({
    status: 'ready',
    fetchedAt: Date.now(),
    markets: [
      {
        venue: 'lighter',
        id: '1',
        base: 'BTC',
        display: 'BTC',
        nameFa: 'بیت‌کوین',
        category: 'crypto',
        markPrice: 100_000,
        fundingHourly: 0.0000125,
        maxLeverage: 50,
        maintenanceMarginFraction: 0.012,
        takerFeePct: 0.05,
        makerFeePct: 0,
        volume24hUsd: 1e9,
        change24hPct: 0
      }
    ],
    snapshots: [
      {
        venue: 'lighter',
        subAccount: 0,
        equity: 3_000,
        positionCount: 1,
        longBases: [],
        spot: [{ base: 'BTC', quantity: 0.1 }],
        shorts: [{ base: 'BTC', market: 'BTC', notional: 3_000, entry: 98_000, mark: 100_000, liquidation: 120_000, unrealizedPnl: -60, marginMode: null }]
      }
    ]
  });

  it('بدون حساب ثبت‌شده: راهنمای افزودن حساب، ورود دستی', () => {
    render(<HedgeCalculator />);
    expect(screen.getByText(/هنوز حسابی ثبت نشده است.*لایتر رابین‌هود/)).toBeTruthy();
  });

  it('انتخاب Short واقعی فرم را از حساب پر می‌کند و سناریو از همان اعداد ساخته می‌شود', () => {
    fx.accounts = [linked];
    fx.data = ready();
    render(<HedgeCalculator />);
    fireEvent.change(screen.getByLabelText('حساب'), { target: { value: 'l1' } });
    fireEvent.click(screen.getByRole('button', { name: /استفاده/ }));

    expect((screen.getByLabelText('اندازهٔ دلاری موقعیت فروش (Short)') as HTMLInputElement).value).toBe('3000');
    expect((screen.getByLabelText('وثیقهٔ واریزی به حساب معاملات آتی (فیوچرز)') as HTMLInputElement).value).toBe('3000');
    expect((screen.getByLabelText('ارزش دارایی‌ای که دارید (اسپات)') as HTMLInputElement).value).toBe('10000');
    expect((screen.getByLabelText('کارمزد هر معامله') as HTMLInputElement).value).toBe('0.05');
    expect((screen.getByLabelText('نرخ فاندینگ هر ۸ ساعت') as HTMLInputElement).value).toBe('0.01');
    expect(screen.getByRole('region', { name: /موقعیت فروش واقعی/ })).toBeTruthy();
    expect(screen.getAllByText('زنده از حساب').length).toBeGreaterThan(0);

    // حد لیکویید صرافی ۱۲۰٬۰۰۰ از مارک ۱۰۰٬۰۰۰ = رشد ۲۰٪ → رشد ۱۸٪ لیکویید نمی‌شود
    const r = calcHedge({ ...DEFAULTS, spot: 10_000, shortNotional: 3_000, futuresCollateral: 3_000, feePct: 0.05, fundingPct8h: 0.01, liquidationRisePct: 20 });
    const [dEnd, rEnd] = rowCells('جزئیات هر سناریو', 'سرمایهٔ نهایی کل');
    expect(dEnd).toContain(usd(r.drop.totalEnd!));
    expect(rEnd).toContain(usd(r.rise.totalEnd!));
    expect(r.rise.liquidated).toBe(false);

    set('رشد بازار', '25');
    const [, rFut] = rowCells('جزئیات هر سناریو', 'موجودی نهایی حساب فیوچرز');
    expect(rFut).toContain('لیکویید');
  });

  it('ویرایش دستی اندازه، حد لیکویید صرافی را کنار می‌گذارد', () => {
    fx.accounts = [linked];
    fx.data = ready();
    render(<HedgeCalculator />);
    fireEvent.change(screen.getByLabelText('حساب'), { target: { value: 'l1' } });
    fireEvent.click(screen.getByRole('button', { name: /استفاده/ }));
    set('رشد بازار', '25');
    set('اندازهٔ دلاری موقعیت فروش (Short)', '1000');
    const [, rFut] = rowCells('جزئیات هر سناریو', 'موجودی نهایی حساب فیوچرز');
    expect(rFut).not.toContain('لیکویید');
  });
});

describe('پوشش ریسک — بازطراحی', () => {
  it('کاشی‌های نتیجه: اثر هج و دو نوار با هج/بدون هج از همان domain', () => {
    render(<HedgeCalculator />);
    const r = calcHedge(DEFAULTS);
    const hero = screen.getByRole('region', { name: 'هج با پرتفوی شما چه می‌کند؟' });
    expect(within(hero).getByText('زیان کمتر با هج')).toBeTruthy();
    expect(within(hero).getByText('سود کمتر با هج')).toBeTruthy();
    expect(hero.textContent).toContain(usd(r.drop.hedgeEffectNet));
    expect(hero.textContent).toContain(usd(r.rise.unhedgedEnd!));
  });

  it('دکمهٔ نسبت سریع ۵۰٪: Short = نصف اسپات', () => {
    render(<HedgeCalculator />);
    fireEvent.click(screen.getByRole('button', { name: '۵۰٪' }));
    expect((screen.getByLabelText('اندازهٔ دلاری موقعیت فروش (Short)') as HTMLInputElement).value).toBe('500');
    expect(screen.getByRole('button', { name: '۵۰٪' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('ترکیب پرتفوی: سرمایه و مواجهه جدا', () => {
    render(<HedgeCalculator />);
    const s = screen.getByRole('region', { name: 'پرتفوی از چه ساخته شده؟' });
    expect(within(s).getByText('پوشش‌داده با موقعیت فروش')).toBeTruthy();
    expect(within(s).getByText('بی‌پوشش (هنوز با قیمت بالا و پایین می‌رود)')).toBeTruthy();
    expect(s.textContent).toContain(usd(700));
  });

  it('نسخهٔ جدولی منحنی: سناریوهای کاربر و نقاط شبکه', () => {
    render(<HedgeCalculator />);
    const s = screen.getByRole('region', { name: 'در هر تغییر قیمت، پرتفوی چقدر می‌ارزد؟' });
    const table = within(s).getByRole('table', { name: 'ارزش پرتفوی با هج و بدون هج' });
    // ۱۱ نقطهٔ شبکه + ریزش ۲۵٪ و رشد ۱۸٪
    expect(table.querySelectorAll('tbody tr')).toHaveLength(13);
  });
});
