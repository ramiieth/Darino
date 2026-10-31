// @vitest-environment jsdom
/**
 * دود‌آزمایی رابط ژورنال روی دادهٔ ساختگی: هر تب بدون خطا رندر شود و یافته‌های کلیدی دیده شوند
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Fill, JournalAccount } from '../domain/types';
import { accountKey } from '../domain/fills';
import { buildTrades } from '../domain/roundTrips';
import { runJournal } from '../domain/audit';
import { DEFAULT_SETTINGS } from '../domain/defaults';
import { newPlan } from '../domain/plan';
import { AuditTab } from './AuditTab';
import { NeutralTab } from './NeutralTab';
import { TradesTab } from './TradesTab';
import { PlanTab } from './PlanTab';
import { ReviewTab } from './ReviewTab';

vi.mock('react-chartjs-2', () => ({ Line: () => null, Bar: () => null }));
vi.mock('@/features/custody/data/repository', () => ({ savePref: vi.fn(() => Promise.resolve()), useCustodyStore: () => ({ prefs: [], loaded: true }) }));
afterEach(cleanup);
// پنل MAE/MFE کندل می‌خواهد؛ در آزمون شبکه نداریم
vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
const withQuery = (ui: React.ReactNode) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>;

const H = 3_600_000;
const T0 = Date.UTC(2026, 8, 1, 9);
const HL: JournalAccount = { key: accountKey('hyperliquid', '0x' + '1'.repeat(40)), venue: 'hyperliquid', label: 'HL', address: '0x' + '1'.repeat(40) };
const LR: JournalAccount = { key: accountKey('lighter-robinhood', '0x' + '2'.repeat(40), 3), venue: 'lighter-robinhood', label: 'RH', address: '0x' + '2'.repeat(40), sub: 3 };

function journal() {
  const fills: Fill[] = [];
  let i = 0;
  const f = (a: JournalAccount, symbol: string, side: 'buy' | 'sell', px: number, sz: number, time: number): Fill => ({ id: `${a.key}|${i++}`, account: a.key, venue: a.venue, symbol, side, px, sz, time, fee: 0.2, realized: null, posBefore: null });
  // ۴۰ معاملهٔ جهت‌دار با الگوی ضرر بزرگ و برد کوچک
  for (let k = 0; k < 40; k++) {
    const t = T0 + k * 20 * H;
    const win = k % 3 !== 0;
    fills.push(f(HL, k % 2 ? 'BTC' : 'SOL', 'buy', 100, 1, t), f(HL, k % 2 ? 'BTC' : 'SOL', 'sell', win ? 103 : 92, 1, t + (win ? 1 : 6) * H));
  }
  // پوشش نوترال
  fills.push(f(LR, 'ETH', 'sell', 2000, 1, T0), f(LR, 'ETH', 'buy', 1990, 1, T0 + 48 * H));
  const trades = buildTrades(fills, [], new Set());
  return runJournal({ trades, fills, funding: [], accounts: [HL, LR], notes: new Map(), plans: [newPlan(T0 - H, { symbol: 'SOL', entry: 100, stop: 95, target: 110 })], settings: DEFAULT_SETTINGS, accountSize: 5000, platformDaily: new Map(), from: 0, tz: 'UTC', sourceNotes: ['HL: نمونه'], now: T0 + 1000 * H });
}

describe('تب‌های ژورنال', () => {
  it('حسابرسی: حکم، اعتماد داده، کارنامه، «اول این را درست کن» و پیوست', () => {
    const j = journal();
    render(withQuery(<MemoryRouter><AuditTab a={j.directional} tz="UTC" empty={<p>خالی</p>} /></MemoryRouter>));
    expect(screen.getByText('این حسابرسی چه چیزی را می‌تواند بگوید و چه چیزی را نه')).toBeTruthy();
    expect(screen.getByText('آنچه معامله‌گری شما تولید کرد')).toBeTruthy();
    expect(screen.getByText('چطور اجرا کردید')).toBeTruthy();
    expect(screen.getByText('اول این را درست کن')).toBeTruthy();
    expect(screen.getAllByText(/ارزیابی نشد|در حد استاندارد|زیر استاندارد|مرزی/).length).toBeGreaterThan(5);
    // اصطلاح آموزشی باز می‌شود
    fireEvent.click(screen.getAllByRole('button', { name: 'نرخ برد' })[0]);
    expect(screen.getByRole('note').textContent).toContain('عدد شما');
  });

  it('حسابرسی خالی → حالت خالی', () => {
    const j = runJournal({ trades: [], fills: [], funding: [], accounts: [], notes: new Map(), plans: [], settings: DEFAULT_SETTINGS, accountSize: null, platformDaily: new Map(), from: 0, tz: 'UTC', sourceNotes: [] });
    render(withQuery(<MemoryRouter><AuditTab a={j.directional} tz="UTC" empty={<p>خالی</p>} /></MemoryRouter>));
    expect(screen.getByText('خالی')).toBeTruthy();
  });

  it('دلتا نوترال، معاملات، برنامه و مرور بدون خطا رندر می‌شوند', () => {
    const j = journal();
    const { unmount } = render(<MemoryRouter><NeutralTab nb={j.neutral} fillDays={30} accounts={[HL, LR]} settings={DEFAULT_SETTINGS} /></MemoryRouter>);
    expect(screen.getByText('کدام پرپ‌ها در این دفتر باشند')).toBeTruthy();
    expect(screen.getByText('حجم ساخته‌شده')).toBeTruthy();
    unmount();
    const t = render(<MemoryRouter><TradesTab trades={j.all} notes={j.notes} links={j.links} settings={DEFAULT_SETTINGS} manual={[]} /></MemoryRouter>);
    expect(screen.getAllByText('چرا وارد شدم؟', { exact: false }).length).toBeGreaterThan(0);
    t.unmount();
    const p = render(<MemoryRouter><PlanTab plans={[newPlan(T0, { symbol: 'SOL', entry: 100, stop: 95, target: 110 })]} trades={j.all} links={j.links} settings={DEFAULT_SETTINGS} accounts={[HL]} accountSize={5000} prefill={null} onPrefillUsed={() => {}} /></MemoryRouter>);
    fireEvent.click(screen.getByText('برنامهٔ تازه'));
    expect(screen.getByText('ذخیرهٔ برنامه')).toBeTruthy();
    p.unmount();
    render(<MemoryRouter><ReviewTab trades={j.directional.trades} notes={j.notes} links={j.links} reviews={new Map()} settings={DEFAULT_SETTINGS} tz="UTC" accountSize={5000} /></MemoryRouter>);
    expect(screen.getByText('هفتهٔ بعد چطور بهتر شوم؟')).toBeTruthy();
    fireEvent.click(screen.getByText('مقایسهٔ هفته‌ها'));
    expect(screen.getByText('الگوهای شناسایی‌شده')).toBeTruthy();
  });
  it('برنامهٔ متاتریدر: حالت کریپتو می‌ماند و حالت متاتریدر لات و پیپ می‌دهد', () => {
    const j = journal();
    render(withQuery(<MemoryRouter><PlanTab plans={[]} trades={j.all} links={j.links} settings={DEFAULT_SETTINGS} accounts={[HL]} accountSize={5000} prefill={null} onPrefillUsed={() => {}} mt={[]} tz="UTC" /></MemoryRouter>));
    fireEvent.click(screen.getByText('برنامهٔ متاتریدر'));
    expect(screen.getByText('پیشنهاد از تاریخچهٔ خودتان')).toBeTruthy();
    expect(screen.getByText('کریپتو')).toBeTruthy();
    const inputs = screen.getAllByRole('textbox');
    const byLabel = (l: string) => screen.getByLabelText(l) as HTMLInputElement;
    fireEvent.change(byLabel('قیمت ورود'), { target: { value: '3880' } });
    fireEvent.change(byLabel('استاپ'), { target: { value: '3865' } });
    fireEvent.change(byLabel('هدف (FTA)'), { target: { value: '3910' } });
    // ۱٪ از ۵۰۰۰ = ۵۰ دلار ÷ (۱۵ × ۱۰۰) → ۰٫۰۳ لات
    expect(screen.getByText(/۰٫۰۳ لات|0.03 لات|۰.۰۳ لات/)).toBeTruthy();
    expect(inputs.length).toBeGreaterThan(5);
  });
});
