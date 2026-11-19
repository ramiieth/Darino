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

vi.mock('react-chartjs-2', () => ({ Line: () => null, Bar: () => null }));
// مرور هفتگی سواپ‌های اسپات را از کیف پول‌ها می‌خواند؛ این‌جا بدون کیف پول
vi.mock('../data/useSpot', () => ({ useSpot: () => ({ wallets: [], book: null, loading: false, loadMore: () => undefined, refetch: () => undefined }) }));
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
    const t = render(<MemoryRouter><TradesTab trades={j.all} notes={j.notes} links={j.links} auto={j.auto} settings={DEFAULT_SETTINGS} /></MemoryRouter>);
    expect(screen.getAllByText('چرا وارد شدم؟', { exact: false }).length).toBeGreaterThan(0);
    t.unmount();
    const p = render(withQuery(<MemoryRouter><PlanTab plans={[newPlan(T0, { symbol: 'SOL', entry: 100, stop: 95, target: 110 })]} trades={j.all} links={j.links} auto={j.auto} settings={DEFAULT_SETTINGS} accounts={[HL]} accountSize={5000} prefill={null} onPrefillUsed={() => {}} /></MemoryRouter>));
    expect(screen.getByText('نظم استاپ')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /قبل از ورود/ }));
    fireEvent.click(screen.getByText('برنامهٔ تازه'));
    expect(screen.getByText('ذخیرهٔ برنامه')).toBeTruthy();
    p.unmount();
    render(<MemoryRouter><ReviewTab trades={j.directional.trades} notes={j.notes} links={j.links} reviews={new Map()} settings={DEFAULT_SETTINGS} tz="UTC" accountSize={5000} /></MemoryRouter>);
    expect(screen.getByText('هفتهٔ بعد چطور بهتر شوم؟')).toBeTruthy();
    fireEvent.click(screen.getByText('مقایسهٔ هفته‌ها'));
    expect(screen.getByText('الگوهای شناسایی‌شده')).toBeTruthy();
  });
  it('نرخ پایهٔ استاپ و هدف از کندل‌ها محاسبه و نشان داده می‌شود', async () => {
    // ۳۰۰۰ کندل ۱۵ دقیقه‌ای رفت‌وبرگشتی (بدون روند)
    const raw = Array.from({ length: 3000 }, (_, i) => {
      const c = 100 + Math.sin(i / 9) * 2;
      return { t: i * 900_000, o: String(c), h: String(c * 1.002), l: String(c * 0.998), c: String(c) };
    });
    vi.mocked(fetch).mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify(raw))));
    render(withQuery(<BaseRatePanel symbol="BTC" direction="long" entry={100} stop={98} target={104} />));
    expect(await screen.findByText('اول هدف')).toBeTruthy();
    expect(screen.getByText('اول استاپ')).toBeTruthy();
    expect(screen.getByText(/نمونهٔ مؤثر/)).toBeTruthy();
    expect(screen.getByText(/ساختار و کارمزد/)).toBeTruthy();
    expect(screen.getByText(/روند اخیر بازار/)).toBeTruthy();
  });

  it('نرخ پایه: برنامهٔ نامعتبر → هیچ', () => {
    const b = render(withQuery(<BaseRatePanel symbol="BTC" direction="long" entry={100} stop={101} target={104} />));
    expect(b.container.textContent).toBe('');
  });

  it('وقتی معاملهٔ جهت‌دار نیست، حسابرسی و برنامهٔ معامله خودکار روی پرپ نوترال و اسپات فعال می‌شوند', () => {
    const fills: Fill[] = [
      { id: `${LR.key}|0`, account: LR.key, venue: LR.venue, symbol: 'ETH', side: 'sell', px: 2000, sz: 1, time: T0, fee: 0.2, realized: null, posBefore: null },
      { id: `${LR.key}|1`, account: LR.key, venue: LR.venue, symbol: 'ETH', side: 'buy', px: 1950, sz: 1, time: T0 + 10 * H, fee: 0.2, realized: null, posBefore: null }
    ];
    const trades = buildTrades(fills, [], new Set());
    const j = runJournal({ trades, fills, funding: [], accounts: [LR], notes: new Map(), plans: [], settings: DEFAULT_SETTINGS, accountSize: 5000, platformDaily: new Map(), from: 0, tz: 'UTC', sourceNotes: [], now: T0 + 100 * H });
    const openAsset = { asset: 'ETH', symbol: 'ETH', icon: null, qty: 2, basisQty: 2, unknownQty: 0, cost: 5000, avgCost: 2500, open: true, firstTime: T0, lastTime: T0 + H, value: 5400, realized: 0, unrealized: 400, unknownProceeds: 0, boughtUsd: 5000, soldUsd: 0, buys: 2, sells: 0, buysAll: 2, sellsAll: 0, dust: false };
    const mockSpotBook = {
      assets: [openAsset],
      open: [openAsset],
      closed: [],
      sales: [],
      swaps: [],
      totals: { swaps: 2, volume: 5000, realized: 0, unrealized: 400, gas: 4, swapCost: 5, wins: 0, losses: 0, unknownProceeds: 0, chains: ['Ethereum'], protocols: [{ name: 'Uniswap', n: 2, volume: 5000 }] }
    };

    const a = render(
      withQuery(
        <MemoryRouter>
          <AuditTab a={j.directional} fallbackAudit={j.allPerp} spotBook={mockSpotBook} tz="UTC" empty={<p>خالی</p>} />
        </MemoryRouter>
      )
    );
    expect(screen.queryByText('خالی')).toBeNull();
    expect(screen.getByText('حسابرسی خودکار روی کل معاملات پرپ (شامل دفتر دلتا نوترال)')).toBeTruthy();
    expect(screen.getByText('حسابرسی خودکار معاملات اسپات (کیف پول‌ها)')).toBeTruthy();
    a.unmount();

    render(
      withQuery(
        <MemoryRouter>
          <PlanTab plans={[]} trades={j.all} links={j.links} auto={j.auto} settings={DEFAULT_SETTINGS} accounts={[LR]} accountSize={5000} spotBook={mockSpotBook} prefill={null} onPrefillUsed={() => {}} />
        </MemoryRouter>
      )
    );
    expect(screen.getByText('برنامهٔ خودکار روی همهٔ معاملات پرپ (شامل دفتر نوترال) فعال شد')).toBeTruthy();
    expect(screen.getByText('برنامهٔ خودکار پوزیشن‌های باز اسپات (کیف پول‌ها)')).toBeTruthy();
  });
});
