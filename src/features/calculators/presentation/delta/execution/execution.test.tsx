// @vitest-environment jsdom
/**
 * تب اجرا و پایش دلتا — اعداد نمایش‌داده‌شده = domain؛ انتقال از دلتا نوترال؛ پایش با دادهٔ mock (بدون شبکه)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { calcExecution } from '@/features/calculators/domain';
import { toFaDigits } from '@/shared/utils/formatters';
import type { VenueQuote } from '@/features/calculators/data/deltaMarkets';
import type { LinkedDeltaLegs } from '@/features/calculators/data/deltaPositions';

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
const ONDO = quote('ondo', { fundingHourly: 0.0000063, markPrice: 142.2, makerFeePct: 0.01, volume24hUsd: null });
const LIGHTER_RH = quote('lighterRh', { ref: '7', fundingHourly: -0.00002, markPrice: 142.3, makerFeePct: 0, takerFeePct: 0, volume24hUsd: 2_000_000 });

const fx = vi.hoisted(() => ({ live: null as unknown }));
vi.mock('@/features/calculators/data/deltaMarkets', async (orig) => {
  const actual = await orig<typeof import('@/features/calculators/data/deltaMarkets')>();
  const books = { arcus: { status: 'ready', quotes: [ARCUS] }, ondo: { status: 'ready', quotes: [ONDO] }, lighter: { status: 'ready', quotes: [] }, lighterRh: { status: 'ready', quotes: [LIGHTER_RH] } };
  return { ...actual, useDeltaBooks: () => books };
});
vi.mock('@/features/calculators/data/deltaPositions', async (orig) => ({
  ...(await orig<typeof import('@/features/calculators/data/deltaPositions')>()),
  useLinkedDeltaLegs: () => fx.live
}));

const { ExecutionPlanner } = await import('./ExecutionPlanner');
const { LiveMonitor } = await import('./LiveMonitor');
const { DeltaNeutralCalculator } = await import('../DeltaNeutralCalculator');

afterEach(cleanup);

const usd = (v: number) => toFaDigits(Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const card = (title: string) => screen.getByRole('heading', { name: title }).closest('article')!.textContent ?? '';

// پیش‌فرض فرم: ۲۰۰۰ کل، ۳×، ۲۴ ساعت، حد ضرر ۷۵٪، عقب‌ماندگی ۵٪، حرکت ۵٪؛ Short روی آرکوس (فاندینگ بالاتر)
const expected = () =>
  calcExecution({
    totalNotional: 2000,
    leverage: 3,
    durationHours: 24,
    long: { feePct: 0.01, builderFeePct: 0, fundingHourly: ONDO.fundingHourly!, volume24hUsd: null, maintenanceMarginFraction: 0.05, markPrice: 142.2 },
    short: { feePct: 0, builderFeePct: 0, fundingHourly: ARCUS.fundingHourly!, volume24hUsd: 50_000_000, maintenanceMarginFraction: 0.03, markPrice: 142.5 },
    stopLossPct: 75,
    lagPct: 5,
    stressMovePct: 5
  });

describe('پیش از اجرا — UI = domain', () => {
  it('سه ستون: محاسبهٔ ساده، پر شدن سریع (نامشخص چون اوندو حجم نمی‌دهد)، پر شدن در کل مدت', () => {
    render(<ExecutionPlanner handoff={null} />);
    const r = expected();
    expect(card('محاسبهٔ ساده')).toContain(usd(r.simple.net));
    expect(card('ربات Tread.fi — پر شدن سریع')).toContain('نامشخص');
    expect(card('ربات Tread.fi — پر شدن در کل مدت')).toContain(usd(r.wholeFill.net!));
    expect(screen.getByText(/اوندو پرپس حجم ۲۴ساعته نمی‌دهد/)).toBeTruthy();
  });

  it('عدم توازن و Unbalanced از همان domain؛ تغییر ورودی آزمون فشار عدد را عوض می‌کند', () => {
    render(<ExecutionPlanner handoff={null} />);
    const step = screen.getByRole('region', { name: 'اگر یک طرف دیرتر پر شود چه می‌شود؟' });
    expect(within(step).getByText('Unbalanced')).toBeTruthy();
    expect(step.textContent).toContain(usd(expected().imbalance.worstCaseUsd));
    fireEvent.change(within(step).getByLabelText('طرف کندتر چقدر عقب بماند'), { target: { value: '0.5' } });
    expect(within(step).getByText('متوازن')).toBeTruthy();
  });

  it('انتقال از دلتا نوترال: ارزش هر طرف ۷۵۰ → Notional کل ۱۵۰۰؛ مدت بیش از ۲۴ ساعت به ۲۴ محدود می‌شود', () => {
    render(<ExecutionPlanner handoff={{ nonce: 1, pair: 'arcus-ondo', base: 'MSTR', flipped: false, notionalPerSide: 750, leverage: 2, holdHours: 48 }} />);
    expect((screen.getByLabelText('Notional کل (هر دو طرف با هم)') as HTMLInputElement).value).toBe('1500');
    expect((screen.getByLabelText('اهرم') as HTMLInputElement).value).toBe('2');
    expect((screen.getByLabelText('مدت ربات (Duration)') as HTMLInputElement).value).toBe('24');
  });
});

describe('دلتا نوترال — دکمهٔ مقایسه', () => {
  it('همان انتخاب و اندازه را می‌فرستد؛ اعداد دلتا نوترال دست نمی‌خورد', () => {
    const onOpen = vi.fn();
    render(<DeltaNeutralCalculator onOpenExecution={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /مقایسه با اجرای ربات/ }));
    expect(onOpen).toHaveBeenCalledWith({ pair: 'arcus-ondo', base: 'MSTR', flipped: false, notionalPerSide: 1000, leverage: 3, holdHours: 24 });
  });

  it('بدون prop دکمه نمایش داده نمی‌شود', () => {
    render(<DeltaNeutralCalculator />);
    expect(screen.queryByRole('button', { name: /مقایسه با اجرای ربات/ })).toBeNull();
  });
});

describe('در حال اجرا — پایش', () => {
  const account = { id: 'a', venue: 'arcus' as const, label: 'آرکوس من', address: '0xdef', arcus: { env: 'mainnet' as const, address: '0xdef', accountIndex: 0 } };

  it('بدون حساب ثبت‌شده: راهنما', () => {
    fx.live = { accounts: [], legs: [], pairs: [], fetchedAt: null } satisfies LinkedDeltaLegs;
    render(<LiveMonitor />);
    expect(screen.getByText('هنوز حساب لایتر یا آرکوسی ثبت نشده است')).toBeTruthy();
  });

  it('جفت نامتوازن: Unbalanced و اعداد مواجهه', () => {
    const leg = (side: 'long' | 'short', notional: number) => ({
      accountId: 'a',
      accountLabel: 'آرکوس من',
      venue: 'arcus' as const,
      sub: 0,
      side,
      base: 'ETH',
      market: 'ETH-USD',
      notional,
      unrealizedPnl: 1,
      entry: 3000,
      mark: 3000,
      liquidation: null,
      rawFundingSinceOpen: side === 'short' ? 0.5 : null
    });
    const legs = [leg('long', 1000), leg('short', 900)];
    fx.live = {
      accounts: [{ account, status: 'ready' }],
      legs,
      pairs: [{ base: 'ETH', legs, exposure: { longUsd: 1000, shortUsd: 900, totalUsd: 1900, netUsd: 100, netPct: (100 / 1900) * 100, unbalanced: true, unrealizedPnl: 2, partial: false } }],
      fetchedAt: Date.now()
    } satisfies LinkedDeltaLegs;
    render(<LiveMonitor />);
    expect(screen.getByText(/Unbalanced · ۵٫۲۶٪|Unbalanced · ۵.۲۶٪/)).toBeTruthy();
    const article = screen.getByRole('article');
    expect(article.textContent).toContain(usd(1900));
    expect(article.textContent).toContain('علامت (دریافتی یا پرداختی) در مستندات آرکوس روشن نیست');
  });
});

describe('لایتر رابین‌هود در دلتا نوترال و اجرا', () => {
  it('جفت «آرکوس ↔ لایتر رابین‌هود» از دادهٔ همان صرافی؛ Short روی صرافی با فاندینگ بالاتر', () => {
    render(<DeltaNeutralCalculator />);
    fireEvent.change(screen.getByLabelText('دو صرافی'), { target: { value: 'arcus-lighterRh' } });
    // فاندینگ آرکوس (۰٫۰۰۰۰۹۹۸) > لایتر رابین‌هود (−۰٫۰۰۰۰۲) → Short روی آرکوس، Long روی لایتر رابین‌هود
    const direction = screen.getByRole('button', { name: /جابه‌جایی/ }).parentElement!.textContent ?? '';
    expect(direction).toMatch(/Long\s*روی لایتر رابین‌هود/);
    expect(direction).toMatch(/Short\s*روی آرکوس/);
  });

  it('تب اجرا هم همین جفت را دارد و انتقال از دلتا نوترال آن را حفظ می‌کند', () => {
    render(<ExecutionPlanner handoff={{ nonce: 2, pair: 'arcus-lighterRh', base: 'MSTR', flipped: false, notionalPerSide: 500, leverage: 2, holdHours: 12 }} />);
    expect((screen.getByLabelText('دو صرافی') as HTMLSelectElement).value).toBe('arcus-lighterRh');
    const r = calcExecution({
      totalNotional: 1000,
      leverage: 2,
      durationHours: 12,
      long: { feePct: 0, builderFeePct: 0, fundingHourly: -0.00002, volume24hUsd: 2_000_000, maintenanceMarginFraction: 0.05, markPrice: 142.3 },
      short: { feePct: 0, builderFeePct: 0, fundingHourly: ARCUS.fundingHourly!, volume24hUsd: 50_000_000, maintenanceMarginFraction: 0.03, markPrice: 142.5 },
      stopLossPct: 75,
      lagPct: 5,
      stressMovePct: 5
    });
    // هر دو حجم معلوم‌اند → ستون پر شدن سریع هم عدد دارد
    expect(card('ربات Tread.fi — پر شدن سریع')).toContain(usd(r.quickFill.net!));
    expect(card('محاسبهٔ ساده')).toContain(usd(r.simple.net));
  });
});
