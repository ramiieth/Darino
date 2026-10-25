import { describe, expect, it } from 'vitest';
import { exitLiquidity, exitPlan, lotteryPlan, parseMarketChart, parseRugReport, regimeOf, screenCoin, type CoinInput, type DailyBar, type SafetyInfo } from './memeScreen';
import { sanitizeWatch, watchEvents, watchMessage } from './memeWatch';

const DAY = 86_400_000;
const bars = (prices: number[], vol = 500_000): DailyBar[] => prices.map((px, i) => ({ t: i * DAY, px, vol }));
/** n روز با رشد/افت ثابت روزانه */
const series = (n: number, daily: number, start = 1) => Array.from({ length: n }, (_, i) => start * (1 + daily) ** i);
const SAFE: SafetyInfo = { mintRevoked: true, freezeRevoked: true, rugged: false, dangers: [], top10Pct: 18, lpLockedPct: 100, insiders: 12, holders: 50_000 };
const coin = (over: Partial<CoinInput> = {}): CoinInput => ({
  id: 'zcat', symbol: 'ZCAT', name: 'Z Cat', image: null, mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  marketCap: 40_000_000, volume24h: 1e6, athChangePct: -70, bars: bars(series(90, 0.01)), safety: SAFE, ...over
});

describe('غربال محافظ سرمایه', () => {
  it('کوین زنده، امن، در روند صعودی آرام: همهٔ فیلترها', () => {
    const s = screenCoin(coin());
    expect(s).toMatchObject({ gate: true, trend: true, exitLiq: { ok: true, reasons: [] }, safety: { ok: true }, passes: true, watchWorthy: false, days: 90 });
    expect(s.ret30Pct).toBeCloseTo((1.01 ** 30 - 1) * 100, 5);
  });

  it('امن ولی در روند نزولی: فهرست انتظار، نه آماده', () => {
    const s = screenCoin(coin({ bars: bars(series(90, -0.01)) }));
    expect(s).toMatchObject({ gate: true, trend: false, passes: false, watchWorthy: true });
  });

  it('پامپ ۷ روزه و فاصلهٔ زیاد از میانگین ۲۰: نشانهٔ نقدینگی خروج', () => {
    const s = screenCoin(coin({ bars: bars([...series(83, 0), ...series(7, 0.2)]) }));
    expect(s.trend).toBe(true);
    expect(s.exitLiq.reasons).toEqual(['extended', 'pumped']);
    expect(s.passes).toBe(false);
  });

  it('توزیع: حجم هفته ۱.۵ برابر ماه در حالی که قیمت درجاست؛ حجم بیشتر از ارزش بازار = ساختگی', () => {
    const px = series(60, 0);
    const vol = px.map((_, i) => (i >= 53 ? 3e6 : 1e6));
    expect(exitLiquidity(px, vol, px.map(() => 50e6), 59).reasons).toEqual(['distribution']);
    expect(exitLiquidity(px, px.map(() => 2e6), px.map(() => 1e6), 59).reasons).toEqual(['churn']);
  });

  it('امنیت: مینت باز، تمرکز بالا و خطرهای RugCheck دلیل جدا دارند؛ بدون گزارش «نامشخص»', () => {
    const s = screenCoin(coin({ safety: { ...SAFE, mintRevoked: false, top10Pct: 82, dangers: ['Single holder ownership'] } }));
    expect(s.safety.ok).toBe(false);
    expect(s.safety.reasons).toEqual(['مینت باز است', '۱۰ هولدر بزرگ 82٪', 'Single holder ownership']);
    const unknown = screenCoin(coin({ safety: null }));
    expect(unknown.safety.ok).toBeNull();
    expect(unknown.passes).toBe(false);
    expect(unknown.watchWorthy).toBe(false);
  });

  it('بقا: کمتر از ۳۰ روز، ارزش بازار زیر ۵ میلیون یا حجم کم رد می‌شود', () => {
    expect(screenCoin(coin({ bars: bars(series(20, 0.01)) })).gate).toBe(false);
    expect(screenCoin(coin({ marketCap: 4e6 })).gate).toBe(false);
    expect(screenCoin(coin({ bars: bars(series(90, 0.01), 50_000) })).gate).toBe(false);
  });

  it('رژیم بازار: دست‌کم ۷۰٪ بالای میانگین ۵۰ روزه؛ کمتر از ۱۰ کوین «نامشخص»', () => {
    const up = { bars: bars(series(60, 0.01)) }, down = { bars: bars(series(60, -0.01)) };
    expect(regimeOf([...Array(7).fill(up), ...Array(3).fill(down)])).toEqual({ state: 'on', breadth: 0.7, counted: 10 });
    expect(regimeOf([...Array(6).fill(up), ...Array(4).fill(down)]).state).toBe('off');
    expect(regimeOf(Array(9).fill(up)).state).toBe('unknown');
    // کوین با کمتر از ۵۰ روز شمرده نمی‌شود
    expect(regimeOf([...Array(10).fill(up), { bars: bars(series(20, -0.01)) }]).counted).toBe(10);
  });

  it('برنامهٔ خروج و بلیت بخت‌آزمایی', () => {
    expect(exitPlan(2)).toEqual({ stop: 1.4, takeHalf: 4 });
    expect(lotteryPlan(1000, 25)).toEqual({ tickets: 25, budget: 50, perTicket: 2, perTicketPct: 0.2 });
    expect(lotteryPlan(1000, 3).tickets).toBe(20);
    expect(lotteryPlan(1000, 500).tickets).toBe(50);
  });
});

describe('خواندن منابع', () => {
  it('RugCheck: حساب‌های شناخته‌شده (استخر، قفل) از سهم ۱۰ هولدر کنار می‌روند', () => {
    const s = parseRugReport({
      mint: 'x', mintAuthority: null, freezeAuthority: 'F', rugged: false, graphInsidersDetected: 821, totalHolders: 77830,
      knownAccounts: { POOL: { name: 'Raydium', type: 'AMM' } },
      topHolders: [{ owner: 'POOL', pct: 40 }, { owner: 'a', pct: 10 }, { owner: 'b', pct: 7 }],
      markets: [{ lp: { lpLockedPct: 20 } }, { lp: { lpLockedPct: 100 } }],
      risks: [{ name: 'Freeze Authority still enabled', level: 'danger' }, { name: 'Low liquidity', level: 'warn' }]
    });
    expect(s).toEqual({ mintRevoked: true, freezeRevoked: false, rugged: false, dangers: ['Freeze Authority still enabled'], top10Pct: 17, lpLockedPct: 100, insiders: 821, holders: 77830 });
    expect(parseRugReport({ error: 'not found' })).toBeNull();
    expect(parseRugReport(null)).toBeNull();
  });

  it('CoinGecko market_chart: یک ردیف در روز (آخرین مقدار)، حجم همان روز', () => {
    const b = parseMarketChart({
      prices: [[0, 1], [DAY, 2], [DAY + 3_600_000, 2.5], [2 * DAY, -1]],
      total_volumes: [[0, 10], [DAY, 20], [DAY + 3_600_000, 30]]
    });
    expect(b).toEqual([{ t: 0, px: 1, vol: 10 }, { t: DAY, px: 2.5, vol: 30 }]);
    expect(parseMarketChart({ error: 'x' })).toEqual([]);
  });
});

describe('فهرست انتظار', () => {
  const ready = screenCoin(coin());
  const notReady = screenCoin(coin({ id: 'troll', bars: bars(series(90, -0.01)) }));
  const on = { state: 'on' as const, breadth: 0.8, counted: 20 }, off = { state: 'off' as const, breadth: 0.3, counted: 20 };

  it('فقط شناسهٔ معتبر، بدون تکرار، حداکثر ۳۰', () => {
    expect(sanitizeWatch(['zcat', 'zcat', 'BAD ID', 3, 'troll'])).toEqual(['zcat', 'troll']);
    expect(sanitizeWatch(Array.from({ length: 40 }, (_, i) => `c${i}`))).toHaveLength(30);
    expect(sanitizeWatch('zcat')).toEqual([]);
  });

  it('اعلان فقط در گذر از «نه» به «بله» و فقط با رژیم روشن', () => {
    const first = watchEvents(['zcat', 'troll'], { regime: on, coins: [ready, notReady] }, {});
    expect(first.alerts.map((c) => c.id)).toEqual(['zcat']);
    expect(first.next).toEqual({ zcat: true, troll: false });
    expect(watchEvents(['zcat'], { regime: on, coins: [ready] }, first.next).alerts).toEqual([]);
    expect(watchEvents(['zcat'], { regime: off, coins: [ready] }, {}).alerts).toEqual([]);
  });

  it('کوینی که موقتاً داده ندارد وضعیتش را نگه می‌دارد (اعلان کاذب بعد از برگشت نمی‌رود)', () => {
    const gone = watchEvents(['zcat'], { regime: on, coins: [] }, { zcat: true });
    expect(gone.next).toEqual({ zcat: true });
    expect(watchEvents(['zcat'], { regime: on, coins: [ready] }, gone.next).alerts).toEqual([]);
    expect(watchMessage(ready).title).toBe('ZCAT: همهٔ فیلترها رد شد');
  });
});
