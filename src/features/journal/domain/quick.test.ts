import { describe, expect, it } from 'vitest';
import { crossOf, exitFromPnl, pipFractions, toPips, kindOf, priceAt, recentSymbols, roundPx, stopFractions, stopFrom, targetFrom, unitsFrom } from './quick';
import { loginFromFileName } from './metatrader';

const H = 3_600_000;

describe('ورود سریع ژورنال', () => {
  it('نوع نماد: ارز و طلا متاتریدر، بقیه کریپتو', () => {
    expect(kindOf('XAUUSD')).toBe('mt');
    expect(kindOf('eurusd')).toBe('mt');
    expect(kindOf('BTC')).toBe('crypto');
    expect(kindOf('HYPE')).toBe('crypto');
  });

  it('نمادهای پرکاربرد کاربر اول، بعد رایج‌ها، بدون تکرار', () => {
    expect(recentSymbols(['SOL', 'sol', 'ETH', 'SOL', 'XAUUSD'], 'crypto').slice(0, 3)).toEqual(['SOL', 'ETH', 'BTC']);
    expect(recentSymbols(['XAUUSD'], 'mt')[0]).toBe('XAUUSD');
    expect(new Set(recentSymbols(['BTC', 'BTC'], 'crypto')).size).toBe(recentSymbols(['BTC'], 'crypto').length);
  });

  it('قیمت یک لحظهٔ گذشته از کندل همان لحظه', () => {
    const candles = [0, 1, 2].map((i) => ({ t: i * H, o: 100 + i * 10, h: 0, l: 0, c: 105 + i * 10 }));
    expect(priceAt(candles, 1 * H + 60_000, H)).toBe(110); // اول کندل → باز
    expect(priceAt(candles, 1 * H + 50 * 60_000, H)).toBe(115); // آخر کندل → بسته
    expect(priceAt(candles, -H, H)).toBeNull();
    expect(priceAt(candles, 10 * H, H)).toBeNull();
  });

  it('استاپ از نوسان یک ساعت و هدف به مضرب R', () => {
    const candles = Array.from({ length: 48 }, (_, i) => ({ t: i * H, o: 100, h: 101, l: 99, c: 100 }));
    const f = stopFractions(candles, H)!;
    expect(f.tight).toBeCloseTo(0.02);
    expect(f.normal).toBeCloseTo(0.04);
    const st = stopFrom(100, f.normal, 'long');
    expect(st).toBeCloseTo(96);
    expect(targetFrom(100, st, 2, 'long')).toBeCloseTo(108);
    expect(stopFrom(100, 0.04, 'short')).toBeCloseTo(104);
    expect(targetFrom(100, 104, 2, 'short')).toBeCloseTo(92);
  });

  it('اندازه از دلار، واحد یا لات؛ خروج از سود/زیان', () => {
    expect(unitsFrom('usd', 1000, 50, null)).toBe(20);
    expect(unitsFrom('units', 2, 50, null)).toBe(2);
    expect(unitsFrom('lots', 0.1, 2000, 100)).toBeCloseTo(10);
    expect(unitsFrom('lots', 0.1, 2000, null)).toBeNull();
    expect(unitsFrom('usd', 0, 50, null)).toBeNull();
    expect(exitFromPnl(100, 2, 10, 'long')).toBe(105);
    expect(exitFromPnl(100, 2, 10, 'short')).toBe(95);
    expect(exitFromPnl(100, 1, -200, 'long')).toBeNull();
  });

  it('گرد کردن قیمت و شمارهٔ حساب از نام فایل MT5', () => {
    expect(roundPx(1.0845678)).toBe(1.08457);
    expect(roundPx(64321.987)).toBe(64322);
    expect(roundPx(3412.3456)).toBe(3412.35);
    expect(loginFromFileName('ReportHistory-51234567.html')).toBe('51234567');
    expect(loginFromFileName('Statement.htm')).toBeNull();
  });

  it('فارکس: استاپ رایج به پیپ و جفت‌ارز متقاطع از دو قیمت', () => {
    const f = pipFractions('EURUSD', 1.1)!;
    expect(toPips('EURUSD', f.normal, 1.1)).toBeCloseTo(25);
    const g = pipFractions('XAUUSD', 3900)!;
    expect(g.normal * 3900).toBeCloseTo(10); // ۱۰۰ پیپ طلا = ۱۰ دلار
    expect(toPips('USDJPY', pipFractions('USDJPY', 157)!.tight, 157)).toBeCloseTo(15);
    expect(crossOf('gbpjpy')).toEqual({ a: 'xyz:GBP', b: 'xyz:JPY', op: 'mul' });
    expect(crossOf('EURGBP')?.op).toBe('div');
    expect(crossOf('EURUSD')).toBeNull();
  });
});
