import { describe, expect, it } from 'vitest';
import {
  EXCLUDE, addSignals, isExperimental, mayBeExperimental, regimeOf, settle, sizeFor, summarize, trendOf,
  type CoinTrend, type DayBar, type LogEntry, type Regime
} from './swing';

const DAY = 86_400_000;
/** کندل‌های روزانه با بستهٔ داده‌شده؛ باز = بستهٔ روز قبل */
const bars = (closes: number[], start = 0): DayBar[] =>
  closes.map((c, i) => ({ t: start + i * DAY, o: i ? closes[i - 1] : c, h: c, l: c, c }));
const ramp = (n: number, from: number, to: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
const trend = (coin: string, close: number, sma50: number | null, sma200: number | null = null): CoinTrend => ({ coin, close, sma50, sma200, ret28: null });
const ON: Regime = { state: 'on', btcAbove200: true, breadth: 0.7, counted: 50 };

describe('سوینگ: روند و رژیم', () => {
  it('میانگین‌ها روی آخرین روز بسته‌شده', () => {
    const t = trendOf('BTC', bars(ramp(200, 1, 200)))!;
    expect(t.close).toBe(200);
    expect(t.sma50).toBeCloseTo(175.5, 6);
    expect(t.sma200).toBeCloseTo(100.5, 6);
    expect(t.ret28).toBeCloseTo(200 / 172 - 1, 6);
  });

  it('کمتر از ۵۰ روز: میانگین ۵۰ ندارد و در پهنای بازار شمرده نمی‌شود', () => {
    expect(trendOf('NEW', bars(ramp(30, 1, 2)))!.sma50).toBeNull();
  });

  it('صعودی فقط وقتی BTC بالای ۲۰۰ روزه و دست‌کم نیمی از جهان بالای ۵۰ روزه', () => {
    const up = Array.from({ length: 30 }, (_, i) => trend(`C${i}`, 110, i < 15 ? 100 : 120));
    expect(regimeOf(trend('BTC', 110, 100, 100), up).state).toBe('on');
    expect(regimeOf(trend('BTC', 90, 100, 100), up).state).toBe('off');
    const weak = up.map((t, i) => (i === 0 ? { ...t, sma50: 120 } : t));
    expect(regimeOf(trend('BTC', 110, 100, 100), weak)).toMatchObject({ state: 'off', breadth: 14 / 30 });
  });

  it('BTC بدون ۲۰۰ روز سابقه یا جهان کوچک: نامشخص، نه نزولی', () => {
    const up = Array.from({ length: 30 }, (_, i) => trend(`C${i}`, 110, 100));
    expect(regimeOf(trend('BTC', 110, 100, null), up).state).toBe('unknown');
    expect(regimeOf(trend('BTC', 110, 100, 100), up.slice(0, 10)).state).toBe('unknown');
  });
});

describe('سوینگ: کاندید آزمایشی D+E', () => {
  it('رژیم صعودی + بالای میانگین ۵۰ + فاندینگ ۷۲ ساعت منفی', () => {
    expect(isExperimental(trend('X', 110, 100), -0.0001, ON)).toBe(true);
    expect(isExperimental(trend('X', 110, 100), 0.0001, ON)).toBe(false);
    expect(isExperimental(trend('X', 90, 100), -0.0001, ON)).toBe(false);
    expect(isExperimental(trend('X', 110, 100), -0.0001, { ...ON, state: 'off' })).toBe(false);
    expect(isExperimental(trend('X', 110, 100), null, ON)).toBe(false);
  });

  it('پیش‌فیلتر: نرخ پایه یا بالاتر بررسی نمی‌شود', () => {
    expect(mayBeExperimental(trend('X', 110, 100), 0.0000125, ON)).toBe(false);
    expect(mayBeExperimental(trend('X', 110, 100), 0.000005, ON)).toBe(true);
  });

  it('کوین‌های کنارگذاشتهٔ کاربر در فهرست حذف‌اند', () => {
    expect(EXCLUDE.has('BLUR')).toBe(true);
    expect(EXCLUDE.has('BTC')).toBe(false);
  });
});

describe('سوینگ: اندازهٔ پوزیشن', () => {
  it('اسپات: ریسک ÷ ریزش ۱ از ۲۰؛ پرپ: اهرمی که فتیلهٔ ۱ از ۲۰ را تاب بیاورد', () => {
    const r = sizeFor(10_000, 1, 'crypto', 20, 20)!;
    expect(r.spotMaxUsd).toBeCloseTo(100 / 0.37, 6);
    expect(r.perpMaxLeverage).toBe(1.9);
    expect(r.perpMarginUsd).toBe(100);
  });

  it('حجم اسپات از کل سرمایه بیشتر نمی‌شود', () => {
    expect(sizeFor(1_000, 10, 'tradfi', 5)!.spotMaxUsd).toBe(1_000);
  });

  it('ورودی نامعتبر: بدون نتیجه', () => {
    expect(sizeFor(0, 1, 'crypto', 5)).toBeNull();
    expect(sizeFor(1_000, Number.NaN, 'crypto', 5)).toBeNull();
  });
});

describe('سوینگ: ثبت عملکرد زنده', () => {
  it('ورود با بازشدن روز بعد، خروج با بستهٔ روز +۲۰', () => {
    const b = bars(ramp(30, 100, 129));
    const e = settle({ coin: 'X', day: 2 * DAY, entry: null, exit: null }, b);
    expect(e.entry).toBe(102); // باز روز ۳ = بستهٔ روز ۲
    expect(e.exit).toBe(122); // بستهٔ روز ۲۲
  });

  it('تا روز خروج نرسیده، باز می‌ماند', () => {
    const e = settle({ coin: 'X', day: 20 * DAY, entry: null, exit: null }, bars(ramp(30, 100, 129)));
    expect(e.entry).toBe(120);
    expect(e.exit).toBeNull();
  });

  it('کوینی که معاملهٔ باز دارد دوباره ثبت نمی‌شود (همان قفل آزمون)', () => {
    const log: LogEntry[] = [{ coin: 'X', day: 0, entry: 1, exit: null }];
    expect(addSignals(log, ['X', 'Y'], 5 * DAY).map((e) => e.coin)).toEqual(['X', 'Y']);
    expect(addSignals(log, ['X'], 21 * DAY).map((e) => e.coin)).toEqual(['X', 'X']);
  });

  it('خلاصه فقط از معاملات بسته، با هزینهٔ ۰.۳٪', () => {
    const s = summarize([
      { coin: 'A', day: 0, entry: 100, exit: 110 },
      { coin: 'B', day: 0, entry: 100, exit: 95 },
      { coin: 'C', day: 0, entry: 100, exit: null }
    ]);
    expect(s).toMatchObject({ total: 3, closed: 2, wins: 1 });
    expect(s.meanNet).toBeCloseTo((0.1 - 0.05) / 2 - 0.003, 9);
  });
});
