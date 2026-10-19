// @vitest-environment jsdom
/**
 * دستیار آپشن — چهار قدم با زنجیرهٔ ساختگی Derive؛ اعداد = domain، ترکیب چندبازاری و هشدارها
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { black76, normCdf, type ChainOption } from '@/features/calculators/domain';

vi.mock('react-chartjs-2', () => ({ Line: () => null }));

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
const fx = vi.hoisted(() => ({ calls: [] as unknown[] }));

function chainOf(currency: string, F: number, iv: number, expiry: string) {
  const T = 30 / 365;
  const options: ChainOption[] = [];
  for (let k = 0.6; k <= 1.4 + 1e-9; k += 0.025) {
    const K = Math.round(F * k);
    for (const type of ['C', 'P'] as const) {
      const price = black76(type, F, K, T, iv);
      const s = iv * Math.sqrt(T);
      const d1 = (Math.log(F / K) + (s * s) / 2) / s;
      options.push({ name: `${currency}-${expiry}-${K}-${type}`, strike: K, type, bid: price * 0.98, ask: price * 1.02, mark: price, iv, delta: type === 'C' ? normCdf(d1) : normCdf(d1) - 1, gamma: 0.001, theta: -1, vega: 2, oi: 300, volume: 50 });
    }
  }
  return { currency, expiry, expiries: [expiry], minAmount: 0.01, amountStep: 0.01, makerFeeRate: 0.0001, takerFeeRate: 0.0003, baseFee: 0.5, feeCapRate: 0.125, options, index: F, forward: F, perp: { mark: F, index: F, fundingHourly: 0.00001 }, fetchedAt: 1 };
}
function candles(F: number, amp: number, beta = 1) {
  const out = [];
  let p = F;
  for (let i = 0; i < 45; i++) {
    p *= Math.exp(beta * amp * Math.sin(i * 1.7));
    out.push({ t: Date.UTC(2026, 0, 1) + i * 86_400_000, close: p });
  }
  return out;
}

vi.mock('@/features/calculators/data/deriveOptions', async (orig) => {
  const actual = await orig<typeof import('@/features/calculators/data/deriveOptions')>();
  const exp = ymd(Date.now() + 30 * 86_400_000);
  const chains: Record<string, ReturnType<typeof chainOf>> = { ETH: chainOf('ETH', 2000, 0.8, exp), BTC: chainOf('BTC', 60000, 0.4, exp), SOL: chainOf('SOL', 150, 0.9, exp) };
  const hist: Record<string, ReturnType<typeof candles>> = { ETH: candles(2000, 0.03, 1.2), BTC: candles(60000, 0.03), SOL: candles(150, 0.035, 1.4) };
  const q = <T,>(data: T) => ({ data, isLoading: false, isError: false, dataUpdatedAt: 1 });
  return {
    ...actual,
    useDeriveMarkets: () =>
      q({
        markets: [
          { currency: 'ETH', spot: 2000, spot24h: 1990, optionOi: 50_000 },
          { currency: 'BTC', spot: 60000, spot24h: 59000, optionOi: 2_000 },
          { currency: 'SOL', spot: 150, spot24h: 149, optionOi: 100_000 }
        ]
      }),
    useDeriveChain: (c: string) => q(chains[c]),
    useDeriveChains: () => [],
    useDeriveHistory: (c: string) => q({ currency: c, candles: hist[c] }),
    useComboData: (cs: string[]) => ({ chains: cs.map((c) => q(chains[c])), histories: ['BTC', ...cs.filter((c) => c !== 'BTC')].map((c) => q({ currency: c, candles: hist[c] })) })
  };
});
vi.mock('@/features/markets/pipeline/useMarkets', () => ({
  useMarkets: () => ({
    assets: [
      { id: 'crypto:ETH', symbol: 'ETH', image: null, price: 2012.34, marketCap: 1, change24h: 1.5, change7d: 4, change30d: 9, source: 'crypto', rank: 2 },
      ...Array.from({ length: 30 }, (_, i) => ({ id: `crypto:T${i}`, symbol: `T${i}`, image: null, price: 1, marketCap: 1, change24h: 1, change7d: i < 25 ? 1 : -1, change30d: 1, source: 'crypto', rank: 10 + i }))
    ],
    loading: false,
    lastSyncAt: Date.UTC(2026, 9, 19, 8),
    error: null
  })
}));
vi.mock('@/features/calculators/data/plannerLots', () => ({ usePlannerLots: () => ({ lots: [], source: 'none', unreconciled: false }) }));
vi.mock('@/repositories/remoteClient', async (orig) => ({
  ...(await orig<typeof import('@/repositories/remoteClient')>()),
  fetchJson: vi.fn(async (_url: string, init: unknown) => {
    fx.calls.push(init);
    return { answer: '## ۱. خلاصهٔ وضعیت بازار\n| سناریو | سود |\n|---|---|\n| صعود | ۱۰ |' };
  })
}));

const { OptionsWizard } = await import('./OptionsWizard');

beforeEach(() => {
  localStorage.clear();
  fx.calls = [];
});
afterEach(cleanup);
const next = () => fireEvent.click(screen.getByRole('button', { name: /بعدی/ }));

describe('دستیار آپشن Derive', () => {
  it('قدم ۱: فقط بازارهای Derive؛ افزودن دستی بازار بدون آپشن رد می‌شود', () => {
    render(<OptionsWizard />);
    expect(screen.getByRole('radio', { name: /ETH/ })).toBeTruthy();
    fireEvent.click(screen.getByText('افزودن دستی بازار (نام و لوگوی دلخواه)'));
    fireEvent.change(screen.getByPlaceholderText('ETH'), { target: { value: 'DOGE' } });
    fireEvent.click(screen.getByRole('button', { name: 'افزودن' }));
    expect(screen.getByText('این دارایی در Derive آپشن ندارد.')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('ETH'), { target: { value: 'sol' } });
    fireEvent.change(screen.getByPlaceholderText('اتریوم'), { target: { value: 'سولانا' } });
    fireEvent.click(screen.getByRole('button', { name: 'افزودن' }));
    expect(screen.getAllByText('سولانا').length).toBeGreaterThan(0);
  });

  it('مسیر کامل: خنثی + IV گران → Iron Condor؛ سناریو، خروج، سلب مسئولیت؛ دستیار فقط اعداد را می‌گیرد', async () => {
    render(<OptionsWizard />);
    fireEvent.click(screen.getByRole('radio', { name: /ETH/ }));
    next();
    expect((screen.getByRole('button', { name: /بعدی/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/سرمایهٔ این معاملات/), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('radio', { name: 'خنثی' }));
    next();
    expect(screen.getAllByText(/آیرون کاندور/).length).toBeGreaterThan(0);
    expect(screen.getByText('مراحل اجرا')).toBeTruthy();
    expect(screen.getAllByText(/حدود قیمت میانه/).length).toBe(4);
    // خلاصهٔ پنج‌بخشی از اعداد موتور، بدون دستیار
    expect(screen.getByText('۱. نتیجه به زبان ساده')).toBeTruthy();
    expect(screen.getByText('۵. قدم بعدی')).toBeTruthy();
    expect(screen.getByText(/استراتژی پیشنهادی «آیرون کاندور/)).toBeTruthy();
    // کادر جداگانهٔ هدف سود: مستقل از سرمایه، با هشدار صادقانه
    expect(screen.getByRole('heading', { name: 'برای یک سود مشخص چقدر سرمایه لازم است؟' })).toBeTruthy();
    expect(screen.getByText('هیچ استراتژی‌ای در همهٔ سناریوها سود نمی‌دهد')).toBeTruthy();
    expect((screen.getByLabelText(/سود هدف/) as HTMLInputElement).value).toBe('1000');
    expect(screen.getByText('قدم به قدم چه کنیم؟')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /توضیح دستیار/ }));
    await screen.findByText(/خلاصهٔ وضعیت بازار/);
    expect(screen.getByRole('columnheader', { name: 'سناریو' })).toBeTruthy();
    const body = (fx.calls[0] as { body: { analysis: { strategy: { name: string; maxLoss: number }; missingData: string[] } } }).body.analysis;
    expect(body.strategy.name).toContain('Iron Condor');
    expect(body.strategy.maxLoss).toBeLessThanOrEqual(5000 * 0.035 + 0.01);
    // دادهٔ بخش بازارها فقط به دستیار می‌رود، در صفحه نمایش داده نمی‌شود
    const lm = (body as unknown as { liveMarkets: { selected: { price: number }; breadthTop200: { mood: string }; suggestedViewFromTrend: { view: string } } }).liveMarkets;
    expect(lm.selected.price).toBe(2012.34);
    expect(lm.breadthTop200.mood).toBe('risk_on');
    expect(lm.suggestedViewFromTrend.view).toBe('bull');
    expect((body as unknown as { strategy: { replayScenarios: unknown[] } }).strategy.replayScenarios.length).toBe(3);
    expect(document.body.textContent).not.toMatch(/۲٬?۰۱۲/);
    next();
    expect(screen.getByText('سناریوها (سود/زیان در سررسید)')).toBeTruthy();
    expect(screen.getByText('برنامهٔ خروج (کجا بفروشیم)')).toBeTruthy();
    expect(screen.getByText(/این تحلیل آموزشی است و توصیه مالی قطعی نیست/)).toBeTruthy();
    fireEvent.click(screen.getByText(/تحلیل عمیق/));
    expect(screen.getByText('کجا سود می‌دهد و کجا ضرر (در سررسید)')).toBeTruthy();
    expect(screen.getAllByText(/سود عمدتاً از|ضرر عمدتاً از/).length).toBeGreaterThan(5);
  });

  it('ترکیب چند بازار: فقط بازارهای نقد، با علت انتخاب و سناریوهای واگرایی', () => {
    render(<OptionsWizard />);
    next();
    fireEvent.change(screen.getByLabelText(/سرمایهٔ این معاملات/), { target: { value: '20000' } });
    next();
    next();
    fireEvent.click(screen.getByRole('radio', { name: 'ترکیب پیشنهادی چند بازار' }));
    expect(screen.getByText('چرا این بازارها؟')).toBeTruthy();
    // BTC با Open Interest حدود ۱۲۰ میلیون دلار نقد است؛ همه حاضرند
    expect(screen.getByRole('rowheader', { name: 'BTC' })).toBeTruthy();
    expect(screen.getByText(/سودده می‌ماند وقتی/)).toBeTruthy();
    expect(screen.getAllByText(/واگرایی/).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: /شبیه‌سازی/ })).toBeTruthy();
  });
});
