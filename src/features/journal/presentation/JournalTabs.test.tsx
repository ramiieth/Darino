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
import { BaseRatePanel } from './BaseRatePanel';
import { ManualTradeSheet } from './ManualTradeSheet';
import { MetaTraderImport } from './MetaTraderImport';
import type { ManualTrade } from '../data/journalStore';

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
    const p = render(withQuery(<MemoryRouter><PlanTab plans={[newPlan(T0, { symbol: 'SOL', entry: 100, stop: 95, target: 110 })]} trades={j.all} links={j.links} settings={DEFAULT_SETTINGS} accounts={[HL]} accountSize={5000} prefill={null} onPrefillUsed={() => {}} /></MemoryRouter>));
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
    fireEvent.change(byLabel('هدف'), { target: { value: '3910' } });
    // ۱٪ از ۵۰۰۰ = ۵۰ دلار ÷ (۱۵ × ۱۰۰) → ۰٫۰۳ لات
    expect(screen.getByText(/۰٫۰۳ لات|0.03 لات|۰.۰۳ لات/)).toBeTruthy();
    expect(inputs.length).toBeGreaterThan(5);
  });

  it('نرخ پایهٔ استاپ و هدف از کندل‌ها محاسبه و نشان داده می‌شود', async () => {
    // ۳۰۰۰ کندل ۱۵ دقیقه‌ای رفت‌وبرگشتی (بدون روند)
    const raw = Array.from({ length: 3000 }, (_, i) => {
      const c = 100 + Math.sin(i / 9) * 2;
      return { t: i * 900_000, o: String(c), h: String(c * 1.002), l: String(c * 0.998), c: String(c) };
    });
    vi.mocked(fetch).mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify(raw))));
    render(withQuery(<BaseRatePanel symbol="BTC" kind="crypto" direction="long" entry={100} stop={98} target={104} />));
    expect(await screen.findByText('اول هدف')).toBeTruthy();
    expect(screen.getByText('اول استاپ')).toBeTruthy();
    expect(screen.getByText(/نمونهٔ مؤثر/)).toBeTruthy();
    expect(screen.getByText(/ساختار و کارمزد/)).toBeTruthy();
    expect(screen.getByText(/روند اخیر بازار/)).toBeTruthy();
  });

  it('نرخ پایه: نماد متاتریدر بدون کندل → توضیح، و برنامهٔ نامعتبر → هیچ', () => {
    const a = render(withQuery(<BaseRatePanel symbol="GBPJPY" kind="mt" direction="long" entry={190} stop={189} target={192} />));
    expect(screen.getByText(/کندل هم‌نامی در هایپرلیکوئید نداریم/)).toBeTruthy();
    a.unmount();
    const b = render(withQuery(<BaseRatePanel symbol="BTC" kind="crypto" direction="long" entry={100} stop={101} target={104} />));
    expect(b.container.textContent).toBe('');
  });
});

describe('ورود سریع: معاملهٔ دستی و استیتمنت', () => {
  it('معاملهٔ دستی با چند لمس: نماد، اندازهٔ آماده، بسته‌شده با «ضرر کردم»', async () => {
    const { savePref } = await import('@/features/custody/data/repository');
    vi.mocked(savePref).mockClear();
    render(withQuery(<MemoryRouter><ManualTradeSheet open onClose={() => {}} manual={[]} mt={[]} usedSymbols={['SOL', 'SOL', 'BTC']} /></MemoryRouter>));
    fireEvent.click(screen.getByRole('button', { name: 'SOL' }));
    fireEvent.click(screen.getByRole('radio', { name: /شورت/ }));
    fireEvent.change(screen.getByLabelText('قیمت ورود'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: '$۱K' }));
    fireEvent.click(screen.getByRole('button', { name: 'بسته شد' }));
    fireEvent.click(screen.getByRole('button', { name: 'فقط سود/زیان را می‌دانم' }));
    fireEvent.click(screen.getByRole('button', { name: 'ضرر کردم' }));
    fireEvent.change(screen.getByLabelText('چند دلار؟'), { target: { value: '50' } });
    fireEvent.click(screen.getByText('ثبت معامله'));
    await vi.waitFor(() => expect(savePref).toHaveBeenCalled());
    const m = vi.mocked(savePref).mock.calls[0][1] as ManualTrade;
    // ۱۰۰۰ دلار ÷ ۲۰۰ = ۵ واحد؛ شورت با ۵۰ دلار ضرر → خروج ۲۱۰
    expect(m).toMatchObject({ symbol: 'SOL', direction: 'short', entryPx: 200, size: 5, exitPx: 210, fees: null });
    expect(m.closeTime).not.toBeNull();
  });

  it('معاملهٔ دستی بدون قیمت → پیام روشن، ذخیره نمی‌شود', async () => {
    const { savePref } = await import('@/features/custody/data/repository');
    vi.mocked(savePref).mockClear();
    render(withQuery(<MemoryRouter><ManualTradeSheet open onClose={() => {}} manual={[]} mt={[]} usedSymbols={[]} /></MemoryRouter>));
    fireEvent.click(screen.getByText('ثبت معامله'));
    expect(screen.getByText(/قیمت ورود معلوم نیست/)).toBeTruthy();
    expect(savePref).not.toHaveBeenCalled();
  });

  it('استیتمنت: شمارهٔ حساب از نام فایل، بدون تایپ', async () => {
    const html = `<table><tr><td>Time</td><td>Position</td><td>Symbol</td><td>Type</td><td>Volume</td><td>Price</td><td>S / L</td><td>T / P</td><td>Time</td><td>Price</td><td>Commission</td><td>Swap</td><td>Profit</td></tr>
      <tr><td>2026.09.01 10:00:00</td><td>111</td><td>XAUUSD</td><td>buy</td><td>0.10</td><td>2500.00</td><td></td><td></td><td>2026.09.01 12:00:00</td><td>2510.00</td><td>-0.70</td><td>0</td><td>100.00</td></tr></table>`;
    render(<MetaTraderImport open onClose={() => {}} existing={[]} />);
    const file = new File([html], 'ReportHistory-51234567.html', { type: 'text/html' });
    fireEvent.change(screen.getByLabelText('فایل استیتمنت'), { target: { files: [file] } });
    expect(await screen.findByText(/حساب ۵۱۲۳۴۵۶۷|حساب 51234567/)).toBeTruthy();
    expect(screen.getByText(/افزودن .* پوزیشن تازه/)).toBeTruthy();
  });

  it('فارکس بدون تایپ نماد: بازار «فارکس» و فهرست کامل، لات آماده', async () => {
    const { savePref } = await import('@/features/custody/data/repository');
    vi.mocked(savePref).mockClear();
    render(withQuery(<MemoryRouter><ManualTradeSheet open onClose={() => {}} manual={[]} mt={[]} usedSymbols={[]} /></MemoryRouter>));
    fireEvent.click(screen.getByRole('radio', { name: 'فارکس، طلا، نفت' }));
    fireEvent.click(screen.getByRole('button', { name: 'همه…' }));
    fireEvent.click(screen.getByText('GBPJPY'));
    expect(screen.getByText(/پوند\/ین/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('قیمت ورود'), { target: { value: '210.5' } });
    fireEvent.click(screen.getByRole('radio', { name: 'دلار' }));
    fireEvent.click(screen.getByRole('button', { name: '$۵۰۰' }));
    fireEvent.click(screen.getByText('ثبت معامله'));
    await vi.waitFor(() => expect(savePref).toHaveBeenCalled());
    expect(vi.mocked(savePref).mock.calls[0][1]).toMatchObject({ symbol: 'GBPJPY', entryPx: 210.5, closeTime: null });
  });
});
